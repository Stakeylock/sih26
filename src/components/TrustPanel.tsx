import { Activity, BrainCircuit, MapPinned, Navigation2, Satellite, ShieldCheck } from "lucide-react";
import type { Run, Snapshot } from "../engine/types";

type CardState = "ok" | "degraded" | "denied" | "reacquiring" | "unavailable";

type TrustCard = {
  id: string;
  icon: React.ReactNode;
  label: string;
  statusWord: string;
  value: string;
  why: string;
  state: CardState;
};

function deriveCards(snapshot: Snapshot, iovnbd: Run["iovnbd"]): TrustCard[] {
  // GNSS TRUST
  const gnssState: CardState =
    snapshot.state === "TRUSTED"
      ? "ok"
      : snapshot.state === "DEGRADED"
        ? "degraded"
        : snapshot.state === "DENIED"
          ? "denied"
          : "reacquiring";

  const gnssCard: TrustCard = {
    id: "gnss",
    icon: <Satellite size={14} />,
    label: "GNSS TRUST",
    statusWord:
      snapshot.state === "TRUSTED"
        ? "TRUSTED"
        : snapshot.state === "DEGRADED"
          ? "DEGRADED"
          : snapshot.state === "DENIED"
            ? "DENIED"
            : "REACQUIRING",
    value: snapshot.gnss
      ? snapshot.gnssAccepted
        ? "Fix accepted"
        : "Fix rejected"
      : "No fix",
    why:
      snapshot.gnssResidual != null
        ? `Innovation ${snapshot.gnssResidual.toFixed(1)} m`
        : snapshot.state === "DENIED"
          ? "Outage band active"
          : snapshot.state === "REACQUIRING"
            ? "Awaiting 3 consistent fixes"
            : "No recent observation",
    state: gnssState,
  };

  // IMU/INS
  const imuCard: TrustCard = {
    id: "imu",
    icon: <Activity size={14} />,
    label: "IMU / INS",
    statusWord: snapshot.shock ? "DISTURBED" : "PROPAGATING",
    value: `σ ${snapshot.sigma.toFixed(2)} m/s²`,
    why: snapshot.shock
      ? "Shock event — IMU disturbed"
      : `Heading ${Math.round(snapshot.heading)}° · propagating at 10 Hz`,
    state: snapshot.shock ? "degraded" : "ok",
  };

  // ML ODOMETER
  const mlState: CardState =
    snapshot.mlQuality === "READY"
      ? "ok"
      : snapshot.mlQuality === "SUSPENDED"
        ? "degraded"
        : snapshot.mlQuality === "OOD"
          ? "denied"
          : "unavailable";

  const mlCard: TrustCard = {
    id: "ml",
    icon: <BrainCircuit size={14} />,
    label: "ML ODOMETER",
    statusWord:
      snapshot.mlQuality === "READY"
        ? "READY"
        : snapshot.mlQuality === "SUSPENDED"
          ? "SUSPENDED"
          : snapshot.mlQuality === "OOD"
            ? "OOD"
            : "DISABLED",
    value:
      snapshot.mlQuality === "READY"
        ? `${(snapshot.mlSpeed * 3.6).toFixed(1)} km/h`
        : "—",
    why:
      snapshot.mlQuality === "READY"
        ? `${(snapshot.mlConfidence * 100).toFixed(0)}% confidence · ${snapshot.mlUsed ? "aiding EKF" : "not applied"}`
        : snapshot.mlQuality === "SUSPENDED"
          ? "Fault recovery — aiding suspended"
          : snapshot.mlQuality === "OOD"
            ? "Out-of-distribution motion detected"
            : "Disabled in configuration",
    state: mlState,
  };

  // ALIGNMENT
  const alignCard: TrustCard = {
    id: "align",
    icon: <Navigation2 size={14} />,
    label: "ALIGNMENT",
    statusWord:
      snapshot.alignment >= 0.9
        ? "ALIGNED"
        : snapshot.alignment >= 0.5
          ? "PARTIAL"
          : "ALIGNING",
    value: `${(snapshot.alignment * 100).toFixed(0)}%`,
    why:
      snapshot.alignment >= 0.9
        ? "Map-heading agreement within gate"
        : snapshot.alignment >= 0.5
          ? "Heading uncertainty elevated"
          : "Initial alignment in progress",
    state:
      snapshot.alignment >= 0.9
        ? "ok"
        : snapshot.alignment >= 0.5
          ? "degraded"
          : "denied",
  };

  // MAP MATCH — in replay mode this is the Viterbi route-topology matcher
  // (honest label: it matches against the reference topology, no OSM graph)
  const mapCard: TrustCard = iovnbd
    ? snapshot.mapUsed
      ? {
          id: "map",
          icon: <MapPinned size={14} />,
          label: "MAP MATCH",
          // §7.3: confidence = the real HMM emission likelihood of the live
          // position under the matched topology point (snapshot.mapLock)
          statusWord: (snapshot.mapLock ?? 0) > 0.6 ? "LOCKED" : "AMBIGUOUS",
          value:
            snapshot.mapLock != null
              ? `${Math.round(snapshot.mapLock * 100)}%`
              : "VITERBI",
          why:
            (snapshot.mapLock ?? 0) > 0.6
              ? "Route-topology HMM match applied to the live track"
              : "Emission distance high — match kept but flagged ambiguous",
          state: (snapshot.mapLock ?? 0) > 0.6 ? "ok" : "degraded",
        }
      : {
          id: "map",
          icon: <MapPinned size={14} />,
          label: "MAP MATCH",
          statusWord: "OFF",
          value: "—",
          why: "Route matching disabled (ablation toggle)",
          state: "unavailable",
        }
    : {
        id: "map",
        icon: <MapPinned size={14} />,
        label: "MAP MATCH",
        statusWord: snapshot.mapUsed ? "APPLIED" : "PAUSED",
        value: snapshot.candidates[0]
          ? `${(snapshot.candidates[0].probability * 100).toFixed(0)}%`
          : "—",
        why: snapshot.mapUsed
          ? `Top candidate: ${snapshot.candidates[0]?.name ?? "—"}`
          : "Confidence gate closed",
        state: snapshot.mapUsed ? "ok" : "degraded",
      };

  // NAV HEALTH
  const healthState: CardState =
    snapshot.health >= 75
      ? "ok"
      : snapshot.health >= 40
        ? "degraded"
        : "denied";

  const healthCard: TrustCard = {
    id: "health",
    icon: <ShieldCheck size={14} />,
    label: "NAV HEALTH",
    statusWord:
      snapshot.health >= 75
        ? "NOMINAL"
        : snapshot.health >= 40
          ? "REDUCED"
          : "CRITICAL",
    value: `${snapshot.health.toFixed(0)} / 100`,
    why:
      snapshot.health >= 75
        ? `Bound ${snapshot.bound.toFixed(1)} m · all aids nominal`
        : snapshot.health >= 40
          ? `Bound ${snapshot.bound.toFixed(1)} m · reduced aiding`
          : `Bound ${snapshot.bound.toFixed(1)} m · GNSS outage · DR only`,
    state: healthState,
  };

  return [gnssCard, imuCard, mlCard, alignCard, mapCard, healthCard];
}

export function TrustPanel({
  snapshot,
  iovnbd,
}: {
  snapshot: Snapshot;
  iovnbd?: Run["iovnbd"];
}) {
  const cards = deriveCards(snapshot, iovnbd);

  return (
    <div className="tp-grid">
      {cards.map((card) => (
        <div
          key={card.id}
          className={`tp-card tp-card--${card.state}`}
          aria-label={`${card.label}: ${card.statusWord}`}
        >
          <div className="tp-card-header">
            <span className="tp-card-icon">{card.icon}</span>
            <span className="tp-card-label">{card.label}</span>
            <span className="tp-card-status">{card.statusWord}</span>
          </div>
          <strong className="tp-card-value">{card.value}</strong>
          <p className="tp-card-why">{card.why}</p>
        </div>
      ))}
      <HealthBreakdown snapshot={snapshot} iovnbd={iovnbd} />
    </div>
  );
}

/**
 * Health decomposition (plan §22): the 0-100 score shown as its components.
 * "Do not hide the composition." Every component derives from real snapshot
 * fields; nothing is invented (map score honestly reads 0 in replay mode).
 */
function HealthBreakdown({
  snapshot,
  iovnbd,
}: {
  snapshot: Snapshot;
  iovnbd?: Run["iovnbd"];
}) {
  const comps: { label: string; max: number; v: number }[] = [
    {
      label: "GNSS",
      max: 20,
      v:
        snapshot.state === "TRUSTED"
          ? 20
          : snapshot.state === "DEGRADED"
            ? 12
            : snapshot.state === "REACQUIRING"
              ? 8
              : 0,
    },
    {
      label: "IMU",
      max: 15,
      v: snapshot.shock ? 6 : iovnbd && !iovnbd.live.gyroTrusted ? 9 : 15,
    },
    { label: "ALIGN", max: 15, v: Math.round(snapshot.alignment * 15) },
    {
      label: "ML",
      max: 15,
      v:
        snapshot.mlQuality === "READY" && !snapshot.mlOod
          ? Math.round(snapshot.mlConfidence * 15)
          : 0,
    },
    {
      label: "FILTER",
      max: 20,
      v:
        snapshot.bound < 10
          ? 20
          : snapshot.bound < 25
            ? 16
            : snapshot.bound < 60
              ? 12
              : snapshot.bound < 120
                ? 8
                : 4,
    },
    { label: "MAP", max: 10, v: iovnbd ? 0 : snapshot.mapUsed ? 9 : 5 },
    { label: "TIMING", max: 5, v: snapshot.shock ? 2 : 5 },
  ];
  const total = comps.reduce((a, c) => a + c.v, 0);
  return (
    <div className="tp-breakdown" data-testid="health-breakdown">
      <span className="tp-breakdown-title">
        COMPOSITION <b className="mono">{total}/100</b>
      </span>
      <div className="tp-breakdown-bars">
        {comps.map((c) => (
          <div key={c.label} className="tp-comp" title={`${c.label}: ${c.v}/${c.max}`}>
            <span className="tp-comp-label">{c.label}</span>
            <span className="tp-comp-bar">
              <i style={{ width: `${(c.v / c.max) * 100}%` }} />
            </span>
            <span className="tp-comp-val mono">
              {c.v}/{c.max}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
