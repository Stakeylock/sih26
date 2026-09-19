/**
 * Monte-Carlo robustness mini-lab (plan P3 "Monte Carlo fault campaigns",
 * scoped to what the frozen engine already supports: seed sweeps over the
 * deterministic synthetic simulator).
 *
 * Question it answers for judges: "your demo run looks good — is it luck?"
 * We re-run the SAME configuration across n seeds and report the
 * distribution of final INS vs fused (ekf) errors plus the win rate.
 * Every number comes from the existing `simulate()` — no new physics,
 * no invented statistics.
 */
import { simulate } from "./simulation";
import type { Run } from "./types";

export type MonteCarloResult = {
  n: number;
  /** Final INS error per seed (m), aligned by index with ekfFinal. */
  insFinal: number[];
  /** Final fused/ekf error per seed (m). */
  ekfFinal: number[];
  /** Fraction of seeds where the fused estimate beat raw INS. */
  winRate: number;
  medianIns: number;
  medianOurs: number;
  /** Paired reduction per seed, averaged (positive = fused wins on average). */
  meanReductionPct: number;
  /** Wall-clock cost so the UI can label honestly if it was cheap/deep. */
  ms: number;
};

function median(a: number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Sweep `n` seeds starting from `baseSeed`, cloning `config` with the seed
 * patched. Synthetic-only by construction (the deterministic simulator is
 * the thing being sampled); callers must not pass iovnbd configs here.
 */
export function runMonteCarlo(
  config: { scenario: string; blackout: number; learned: boolean; map: boolean; faults: [] },
  opts?: { n?: number; baseSeed?: number },
): MonteCarloResult {
  const n = Math.max(2, Math.min(24, opts?.n ?? 12));
  const baseSeed = opts?.baseSeed ?? 26168;
  const t0 = performance.now();

  const insFinal: number[] = [];
  const ekfFinal: number[] = [];
  for (let i = 0; i < n; i++) {
    const run: Run = simulate({
      ...config,
      seed: baseSeed + i * 7919, // prime stride → decorrelated noise streams
    });
    const ins = run.snapshots[run.snapshots.length - 1];
    // terminal error per branch, self-referenced the same way as Evidence:
    // distance from reference at the final epoch of the run.
    const last = run.snapshots[run.snapshots.length - 1];
    const d = (p: { x: number; y: number } | null, r: { x: number; y: number }) =>
      p ? Math.hypot(p.x - r.x, p.y - r.y) : NaN;
    insFinal.push(d(ins.ins, ins.reference));
    ekfFinal.push(d(last.ekf, last.reference));
  }

  let wins = 0;
  let redSum = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(insFinal[i]) && ekfFinal[i] < insFinal[i]) wins++;
    if (Number.isFinite(insFinal[i]) && insFinal[i] > 0)
      redSum += ((insFinal[i] - ekfFinal[i]) / insFinal[i]) * 100;
  }

  return {
    n,
    insFinal,
    ekfFinal,
    winRate: wins / n,
    medianIns: median(insFinal),
    medianOurs: median(ekfFinal),
    meanReductionPct: redSum / n,
    ms: performance.now() - t0,
  };
}
