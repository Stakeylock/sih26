/**
 * Reacquisition quality (the PS word "seamless", made measurable).
 *
 * After a GNSS outage the fused estimate must (a) snap back toward truth with
 * a bounded, explained correction jump and (b) reach a tight lock quickly.
 * Both numbers come straight from the run's snapshots — no new physics:
 *
 *  - correctionJump : |fused − reference| at the first post-fix epoch minus
 *                     |fused − reference| just before fixes return (how much
 *                     visible "snap" the reacquisition causes).
 *  - timeToLock     : seconds from fixes-returning until the 95% bound is
 *                     back under its pre-outage median (filter confidence
 *                     recovered).
 *  - residualError  : final post-relock distance from reference (how right
 *                     we ended up).
 */
import type { Snapshot } from "./types";

export type ReacquisitionStats = {
  /** Seconds from GNSS return to bound back under pre-outage median. */
  timeToLock: number | null;
  /** Visible position correction at relock (m). */
  correctionJump: number | null;
  /** Error at the end of the record (m). */
  residualError: number | null;
  /** Bound value just before the outage began, for context. */
  preBoundMedian: number | null;
};

const dist = (s: Snapshot) =>
  Math.hypot(s.ekf.x - s.reference.x, s.ekf.y - s.reference.y);

function median(a: number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function reacquisitionStats(snapshots: Snapshot[]): ReacquisitionStats | null {
  if (snapshots.length < 30) return null;

  const denied = snapshots.filter((s) => s.state === "DENIED");
  if (!denied.length) return null; // no outage in this run — nothing to measure

  const pre = snapshots.filter((s) => s.t < denied[0].t && s.gnss);
  const preBoundMedian = pre.length ? median(pre.map((s) => s.bound)) : null;

  const firstFix = snapshots.find((s) => s.t > denied[denied.length - 1].t && s.gnss);
  if (!firstFix) {
    return { timeToLock: null, correctionJump: null, residualError: dist(snapshots[snapshots.length - 1]), preBoundMedian };
  }

  const lastDenied = snapshots
    .filter((s) => s.state === "DENIED")
    .pop()!;
  const before = snapshots.filter((s) => s.t <= lastDenied.t).pop()!;
  const correctionJump = Math.abs(dist(firstFix) - dist(before));

  let timeToLock: number | null = null;
  if (preBoundMedian != null && Number.isFinite(preBoundMedian)) {
    const recovered = snapshots.find(
      (s) => s.t >= firstFix.t && s.bound <= preBoundMedian,
    );
    timeToLock = recovered ? recovered.t - firstFix.t : null;
  }

  return {
    timeToLock,
    correctionJump,
    residualError: dist(snapshots[snapshots.length - 1]),
    preBoundMedian,
  };
}
