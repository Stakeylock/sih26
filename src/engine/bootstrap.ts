/**
 * Paired block-bootstrap confidence interval for the headline claim.
 *
 * The question: "29% improvement — significant or noise?" We resample the
 * run's epochs in contiguous blocks (time correlation means naive i.i.d.
 * bootstrap would overstate confidence), recompute the paired per-branch
 * final-error ratio per resample, and take the 2.5/97.5 percentiles.
 *
 * Honest scope: this is a resampling CI over the observed outage window of
 * ONE segment — it says the reduction is stable to epoch reweighting within
 * this drive, not that it generalizes across India. Generalization evidence
 * is the 5-segment table + LOTO, which we show separately.
 */
import type { Snapshot } from "./types";

export type BootstrapResult = {
  /** Point estimate: 1 - ours/ins over the window (%). */
  pointPct: number;
  loPct: number;
  hiPct: number;
  nBlocks: number;
  blockLen: number;
  ms: number;
};

function finalDistBranch(
  snapshots: Snapshot[],
  idx: number[],
  pick: (s: Snapshot) => { x: number; y: number },
): number {
  const s = snapshots[idx[idx.length - 1]];
  const p = pick(s);
  return Math.hypot(s.reference.x - p.x, s.reference.y - p.y);
}

/** Circularity-safe: plain deterministic resample via LCG so results are
 *  reproducible (same run → same CI, matching our determinism story). */
function lcg(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

export function pairedBootstrapReduction(
  snapshots: Snapshot[],
  opts?: { b?: number; blockSec?: number; seed?: number },
): BootstrapResult | null {
  const t0 = performance.now();
  const B = opts?.b ?? 500;
  const blockSec = opts?.blockSec ?? 10;

  // outage-window epochs only (the claim is about the DR window)
  const win = snapshots.filter(
    (s) => s.state === "DENIED" || s.outage > 0,
  );
  if (win.length < 20) return null;

  const n = win.length;
  const medianDt =
    (win[n - 1].t - win[0].t) / Math.max(1, n - 1) || 0.1;
  const blockLen = Math.max(2, Math.round(blockSec / medianDt));
  const nBlocks = Math.ceil(n / blockLen);

  const ratio = (idx: number[], pick: (s: Snapshot) => { x: number; y: number }) =>
    finalDistBranch(win, idx, pick);

  const pointIns = ratio(
    win.map((_, i) => i),
    (s) => s.ins,
  );
  const pointOurs = ratio(
    win.map((_, i) => i),
    (s) => s.ekf,
  );
  if (!(pointIns > 0)) return null;
  const pointPct = (1 - pointOurs / pointIns) * 100;

  const rnd = lcg(opts?.seed ?? 26168);
  const reds: number[] = [];
  const idx: number[] = new Array(n);
  for (let b = 0; b < B; b++) {
    let k = 0;
    for (let j = 0; j < nBlocks && k < n; j++) {
      const start = Math.floor(rnd() * n);
      for (let u = 0; u < blockLen && k < n; u++) {
        idx[k++] = (start + u) % n; // circular blocks
      }
    }
    const ins = ratio(idx, (s) => s.ins);
    const ours = ratio(idx, (s) => s.ekf);
    if (ins > 0) reds.push((1 - ours / ins) * 100);
  }
  reds.sort((a, b2) => a - b2);
  const q = (p: number) => reds[Math.min(reds.length - 1, Math.max(0, Math.floor(p * reds.length)))];

  return {
    pointPct,
    loPct: q(0.025),
    hiPct: q(0.975),
    nBlocks,
    blockLen,
    ms: performance.now() - t0,
  };
}
