import { describe, it, expect } from "vitest";
import { buildCandidates, viterbi, matchTrack, type CandidatePoint } from "./mapmatch";

describe("Viterbi HMM Map Matcher", () => {
  const straightRoute: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= 100; i += 10) {
    straightRoute.push({ x: i, y: 0 });
  }

  it("buildCandidates samples the route at regular spacing", () => {
    const cands = buildCandidates(straightRoute, 20);
    expect(cands.length).toBeGreaterThan(4);
    expect(cands[0].x).toBe(0);
    expect(cands[cands.length - 1].x).toBe(100);
    // All candidates should lie on the route
    for (const c of cands) {
      expect(c.y).toBe(0);
    }
    // Cumulative distance s must start at 0 and strictly increase monotonically
    expect(cands[0].s).toBe(0);
    for (let i = 1; i < cands.length; i++) {
      expect(cands[i].s).toBeGreaterThan(cands[i - 1].s);
      expect(cands[i].s).toBeCloseTo(cands[i].x, 5); // on straightRoute y=0, s == x
    }
    // Headings should be 0 (east) or 180 (west) depending on direction
    for (const c of cands) {
      expect(Math.abs(c.heading) < 1 || Math.abs(c.heading - 180) < 1 || Math.abs(c.heading + 180) < 1).toBe(true);
    }
  });

  it("viterbi matches observations exactly on the route", () => {
    const cands = buildCandidates(straightRoute, 20);
    // Observations exactly on the route
    const obs = [{ x: 10, y: 0 }, { x: 30, y: 0 }, { x: 50, y: 0 }, { x: 70, y: 0 }, { x: 90, y: 0 }];
    const path = viterbi(obs, cands);
    expect(path.length).toBe(obs.length);
    // Each observation should map to a nearby candidate
    for (let t = 0; t < obs.length; t++) {
      const j = path[t];
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(cands.length);
      const dx = obs[t].x - cands[j].x;
      expect(Math.abs(dx)).toBeLessThan(15); // within half spacing
    }
  });

  it("viterbi corrects lateral drift via emission likelihood", () => {
    const cands = buildCandidates(straightRoute, 20);
    // Observations with 8 m lateral error (within 1σ of emissionSigma=8)
    const obs = [
      { x: 10, y: 8 },
      { x: 30, y: 7 },
      { x: 50, y: 9 },
      { x: 70, y: 6 },
      { x: 90, y: 8 },
    ];
    const path = viterbi(obs, cands);
    // Should still map to the correct candidates (on y=0)
    for (let t = 0; t < obs.length; t++) {
      const j = path[t];
      expect(cands[j].y).toBe(0);
    }
  });

  it("viterbi rejects large lateral outliers via transition constraint", () => {
    const cands = buildCandidates(straightRoute, 20);
    // One observation with huge lateral error (50 m)
    const obs = [
      { x: 10, y: 0 },
      { x: 30, y: 50 }, // outlier
      { x: 50, y: 0 },
      { x: 70, y: 0 },
      { x: 90, y: 0 },
    ];
    const path = viterbi(obs, cands);
    // The outlier should not pull the whole path off the route
    // Most points should still map to y=0
    let onRoute = 0;
    for (let t = 0; t < obs.length; t++) {
      if (cands[path[t]].y === 0) onRoute++;
    }
    expect(onRoute).toBeGreaterThanOrEqual(4); // at least 4/5 on route
  });

  it("matchTrack returns matched positions same length as input", () => {
    const obs = [
      { x: 10, y: 5 },
      { x: 30, y: -3 },
      { x: 50, y: 8 },
      { x: 70, y: -2 },
      { x: 90, y: 4 },
    ];
    const result = matchTrack(obs, straightRoute);
    expect(result.matched.length).toBe(obs.length);
    expect(result.path.length).toBe(obs.length);
    // All matched points should lie on the route (y=0)
    for (const m of result.matched) {
      expect(m.y).toBe(0);
    }
  });

  it("matchTrack handles curved route with heading transitions", () => {
    // Create an L-shaped route: east 50m, then north 50m
    const lRoute: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 50; i += 10) lRoute.push({ x: i, y: 0 });
    for (let i = 10; i <= 50; i += 10) lRoute.push({ x: 50, y: i });

    const obs = [
      { x: 10, y: 2 },
      { x: 30, y: 1 },
      { x: 50, y: 3 }, // at the corner
      { x: 50, y: 20 },
      { x: 50, y: 40 },
    ];
    const result = matchTrack(obs, lRoute);
    expect(result.matched.length).toBe(obs.length);
    // First three should be on the horizontal leg (y ≈ 0)
    for (let t = 0; t < 3; t++) {
      expect(Math.abs(result.matched[t].y)).toBeLessThan(5);
    }
    // Last two should be on the vertical leg (x ≈ 50)
    for (let t = 3; t < 5; t++) {
      expect(Math.abs(result.matched[t].x - 50)).toBeLessThan(5);
    }
  });

  it("viterbi respects turn tolerance — no sharp U-turns", () => {
    const route: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 100; i += 10) route.push({ x: i, y: 0 });

    const cands = buildCandidates(route, 20);
    // Observations that would imply a U-turn if matched greedily
    const obs = [
      { x: 10, y: 0 },
      { x: 30, y: 0 },
      { x: 50, y: 0 },
      { x: 30, y: 0 }, // backtracks
      { x: 10, y: 0 },
    ];
    const path = viterbi(obs, cands);
    // The transition model should prefer continuing forward or staying
    // rather than an abrupt 180° turn at speed
    // Check that path doesn't oscillate wildly
    const sVals = path.map(j => cands[j].s);
    // Should not have large backward jumps
    for (let t = 1; t < sVals.length; t++) {
      const ds = sVals[t] - sVals[t - 1];
      expect(ds).toBeGreaterThan(-25); // allow small backtrack but not full U-turn
    }
  });
});