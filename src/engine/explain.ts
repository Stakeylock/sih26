/**
 * Explainability helper: "WHY IS THE VEHICLE HERE?"
 *
 * Computes a contribution breakdown from the current snapshot for the
 * Explainability Panel. All values are derived from real signals in the
 * live ES-EKF (IO-VNBD) or the reduced-order simulation (synthetic).
 */
import type { Snapshot, Run } from "./types";

export type Contribution = {
  label: string;
  active: boolean;
  magnitude?: number;    // e.g., NIS value, speed correction (m/s), bound component (m)
  threshold?: number;    // e.g., NIS gate threshold
  unit?: string;
  detail?: string;       // human-readable one-liner
};

export type Explainability = {
  contributions: Contribution[];
  dominantSource: "ins" | "ml" | "gnss" | "zupt" | "nhc";
  liveErrorDelta?: number;  // m — ablation delta vs full system (when available)
};

/** Estimate the INS propagation contribution (position drift since last update). */
function insContribution(snap: Snapshot): Contribution {
  const hasLive = snap.live != null;
  // Distance between INS and EKF positions — proxy for uncorrected INS drift
  const dx = (snap.ins?.x ?? 0) - (snap.ekf?.x ?? 0);
  const dy = (snap.ins?.y ?? 0) - (snap.ekf?.y ?? 0);
  const drift = Math.hypot(dx, dy);
  return {
    label: "INS propagation",
    active: true,
    magnitude: drift,
    unit: "m",
    detail: hasLive
      ? `IMU-only dead reckoning has drifted ${drift.toFixed(1)} m from the fused estimate`
      : `INS-only trajectory diverges from EKF by ${drift.toFixed(1)} m`,
  };
}

/** ML speed pseudo-measurement contribution. */
function mlContribution(snap: Snapshot): Contribution {
  const active = snap.mlUsed && snap.mlQuality === "READY";
  const correction = active ? Math.abs(snap.mlSpeed - snap.speed) : 0;
  return {
    label: "ML speed correction",
    active,
    magnitude: correction,
    unit: "m/s",
    detail: active
      ? `Learned motion-mode speed (${snap.mlSpeed.toFixed(1)} m/s) corrected fused speed by ${correction.toFixed(2)} m/s`
      : snap.mlQuality === "OOD"
        ? "ML speed suspended: out-of-distribution input"
        : snap.mlQuality === "SUSPENDED"
          ? "ML speed suspended: mount/shock fault"
          : "ML speed disabled or not ready",
  };
}

/** NHC (non-holonomic constraint) contribution. */
function nhcContribution(snap: Snapshot, ablationNHC: boolean): Contribution {
  return {
    label: "NHC (lateral/vertical velocity ≈ 0)",
    active: ablationNHC,
    detail: ablationNHC
      ? "Non-holonomic constraint suppresses lateral/vertical velocity in body frame"
      : "Disabled via ablation toggle",
  };
}

/** GNSS availability and NIS gate. */
function gnssContribution(snap: Snapshot): Contribution {
  const hasFix = snap.gnss != null;
  const nis = snap.nis ?? null;
  const gate = 9.21; // chi-square 99% (2 DOF)
  if (!hasFix) {
    return {
      label: "GNSS position update",
      active: false,
      detail: snap.state === "DENIED" ? "Blackout: no GNSS fixes available" : "No fix at this epoch",
    };
  }
  const accepted = snap.gnssAccepted && !snap.rejected;
  return {
    label: "GNSS position update",
    active: true,
    magnitude: nis ?? undefined,
    threshold: gate,
    unit: "NIS",
    detail: accepted
      ? `Fix accepted (NIS=${nis?.toFixed(2) ?? "—"} < ${gate}). Innovation: ${snap.gnssResidual?.toFixed(1) ?? "—"} m`
      : `Fix REJECTED (NIS=${nis?.toFixed(2) ?? "—"} ≥ ${gate}). Innovation: ${snap.gnssResidual?.toFixed(1) ?? "—"} m`,
  };
}

/** ZUPT (zero-velocity update) contribution. */
function zuptContribution(snap: Snapshot, ablationZUPT: boolean): Contribution {
  // In the live filter, ZUPT fires when zuptRun >= 20 (2 s stationary).
  // We infer from speed and state: near-zero speed during DENIED suggests ZUPT.
  const likelyFired = ablationZUPT && snap.speed < 0.5 && snap.state === "DENIED";
  return {
    label: "ZUPT (zero-velocity when stopped)",
    active: likelyFired,
    magnitude: snap.speed,
    unit: "m/s",
    detail: likelyFired
      ? `Stationary detected (speed ${snap.speed.toFixed(2)} m/s) — velocity reset to zero`
      : ablationZUPT
        ? `No stop detected (speed ${snap.speed.toFixed(2)} m/s)`
        : "Disabled via ablation toggle",
  };
}

/** Integrity bound source breakdown. */
function boundContribution(snap: Snapshot, ablationNHC: boolean, ablationZUPT: boolean): Contribution {
  // The live filter bound = max(covariance_bound, protection_level).
  // When the split is available (iovnbd runs), name the actual dominant term;
  // otherwise fall back to describing the combined bound (no fake precision).
  const hasSplit = snap.boundCov != null && snap.boundPL != null;
  const plDominant = hasSplit && snap.boundPL! >= snap.boundCov!;
  return {
    label: "Integrity bound source",
    active: true,
    magnitude: snap.bound,
    unit: "m",
    detail: !hasSplit
      ? `Combined 95% bound ${snap.bound.toFixed(1)} m (filter uncertainty)`
      : plDominant
        ? `Protection level dominates: ${snap.boundPL!.toFixed(1)} m heading-systematic growth vs ${snap.boundCov!.toFixed(1)} m covariance`
        : `Covariance dominates: ${snap.boundCov!.toFixed(1)} m filter uncertainty vs ${snap.boundPL!.toFixed(1)} m protection level`,
  };
}

/**
 * Compute the full explainability breakdown for the current snapshot.
 * `ablation` flags reflect the current ablation toggles (NHC, ZUPT, ML, GNSS gate).
 */
export function computeExplainability(
  snap: Snapshot,
  run: Run,
  ablation: { useNHC: boolean; useZUPT: boolean; useML: boolean; useGNSSGate: boolean }
): Explainability {
  const contributions: Contribution[] = [
    insContribution(snap),
    mlContribution(snap),
    nhcContribution(snap, ablation.useNHC),
    gnssContribution(snap),
    zuptContribution(snap, ablation.useZUPT),
    boundContribution(snap, ablation.useNHC, ablation.useZUPT),
  ];

  // Determine dominant source: which correction is largest?
  let dominant: Explainability["dominantSource"] = "ins";
  let maxMag = -1;
  for (const c of contributions) {
    if (c.active && c.magnitude != null && c.magnitude > maxMag) {
      maxMag = c.magnitude;
      switch (c.label) {
        case "ML speed correction":
          dominant = "ml";
          break;
        case "GNSS position update":
          dominant = "gnss";
          break;
        case "ZUPT (zero-velocity when stopped)":
          dominant = "zupt";
          break;
        case "NHC (lateral/vertical velocity ≈ 0)":
          dominant = "nhc";
          break;
      }
    }
  }

  // Live error delta vs full system (only for IO-VNBD with iovnbd metadata)
  let liveErrorDelta: number | undefined;
  if (run.source === "iovnbd" && run.iovnbd && snap.live) {
    const liveFinal = run.iovnbd.live.final;
    // The offline "ours" (ekf) final error is in run.iovnbd.finalErrors.ekf?.final
    const offlineFinal = run.iovnbd.finalErrors.ekf?.final;
    if (offlineFinal != null && liveFinal != null) {
      liveErrorDelta = liveFinal - offlineFinal;
    }
  }

  return { contributions, dominantSource: dominant, liveErrorDelta };
}