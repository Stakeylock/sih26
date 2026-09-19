import { describe, it, expect } from "vitest";
import { runMonteCarlo } from "./monte-carlo";

/**
 * Monte-Carlo sweep sanity: the fused branch must beat raw INS on the
 * synthetic core-blackout family across independent seeds, and the sweep
 * must be deterministic (same baseSeed → identical result).
 */
describe("runMonteCarlo", () => {
  const cfg = {
    scenario: "core-blackout",
    blackout: 60,
    learned: true,
    map: true,
    faults: [] as [],
  };

  it("fused branch wins on every seed and reports a positive mean reduction", () => {
    const r = runMonteCarlo(cfg, { n: 4, baseSeed: 26168 });
    expect(r.n).toBe(4);
    expect(r.insFinal).toHaveLength(4);
    expect(r.ekfFinal).toHaveLength(4);
    for (let i = 0; i < r.n; i++) {
      expect(r.ekfFinal[i]).toBeLessThan(r.insFinal[i]);
      expect(Number.isFinite(r.insFinal[i])).toBe(true);
    }
    expect(r.winRate).toBe(1);
    expect(r.meanReductionPct).toBeGreaterThan(0);
    expect(r.medianOurs).toBeLessThan(r.medianIns);
  }, 30000);

  it("is deterministic for a fixed base seed", () => {
    const a = runMonteCarlo(cfg, { n: 2, baseSeed: 26168 });
    const b = runMonteCarlo(cfg, { n: 2, baseSeed: 26168 });
    expect(a.insFinal).toEqual(b.insFinal);
    expect(a.ekfFinal).toEqual(b.ekfFinal);
  }, 30000);

  it("different base seeds produce different samples (real sweep, not a copy)", () => {
    const a = runMonteCarlo(cfg, { n: 2, baseSeed: 26168 });
    const b = runMonteCarlo(cfg, { n: 2, baseSeed: 999 });
    expect(a.insFinal).not.toEqual(b.insFinal);
  }, 30000);
});
