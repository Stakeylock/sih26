import { describe, expect, it } from "vitest";
import { defaultConfig } from "./engine/scenarios";
import { metrics, simulate } from "./engine/simulation";
import { dist } from "./engine/geometry";

describe("causal replay engine", () => {
  it("reports undefined drift at the exact blackout start", () => {
    const run = simulate(defaultConfig);
    expect(run.snapshots[250].distance).toBe(0);
    expect(metrics(run, 25).every((m) => m.drift === null)).toBe(true);
  });
  it("reproduces complete runs with an identical seed and fault schedule", () => {
    const config = {
      ...defaultConfig,
      faults: [{ id: "test", kind: "mount" as const, at: 50 }],
    };
    expect(simulate(config)).toEqual(simulate(config));
  });
  it("removes GNSS during blackout and requires three consistent returning fixes", () => {
    const run = simulate(defaultConfig);
    expect(
      run.snapshots
        .filter((s) => s.t >= 25 && s.t < 85)
        .every((s) => s.gnss === null && s.state === "DENIED"),
    ).toBe(true);
    expect(run.snapshots[850].state).toBe("REACQUIRING");
    expect(run.snapshots[880].state).toBe("REACQUIRING");
    expect(run.snapshots[890].state).toBe("REACQUIRING");
    expect(run.snapshots[900].state).toBe("TRUSTED");
  });
  it("rejects position jumps without applying a correction", () => {
    const run = simulate({
      ...defaultConfig,
      faults: [{ id: "jump", kind: "gnss", at: 10 }],
    });
    const rejected = run.snapshots.filter((s) => s.rejected);
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.every((s) => s.correction === 0)).toBe(true);
  });
  it("preserves the raw trajectory when toggling map assistance", () => {
    const aided = simulate(defaultConfig),
      off = simulate({ ...defaultConfig, map: false });
    expect(aided.snapshots.map((s) => s.raw)).toEqual(
      off.snapshots.map((s) => s.raw),
    );
    expect(aided.snapshots.some((s) => dist(s.raw, s.assisted) > 0.01)).toBe(
      true,
    );
    expect(off.snapshots.every((s) => dist(s.raw, s.assisted) === 0)).toBe(
      true,
    );
  });
  it("withholds ambiguous map feedback", () => {
    const run = simulate(defaultConfig);
    expect(run.snapshots.some((s) => !s.mapUsed)).toBe(true);
    expect(
      run.snapshots
        .filter((s) => s.mapUsed)
        .every(
          (s) =>
            s.candidates[0].probability > 0.8 &&
            s.candidates[0].probability - s.candidates[1].probability > 0.2,
        ),
    ).toBe(true);
  });
  it("applies a newly injected fault causally and records its recovery", () => {
    const plain = simulate(defaultConfig),
      fault = simulate({
        ...defaultConfig,
        faults: [{ id: "mount-test", kind: "mount", at: 50 }],
      });
    expect(fault.snapshots.slice(0, 500)).toEqual(
      plain.snapshots.slice(0, 500),
    );
    expect(fault.snapshots[510].alignment).toBeLessThan(1);
    expect(fault.snapshots[510].learnedUsed).toBe(false);
    expect(
      fault.events.some((e) => e.id === "mount-test-clear" && e.at === 58),
    ).toBe(true);
    expect(fault.snapshots[590].alignment).toBe(1);
  });
  it("suspends anomalous learned speed and changes inertial behavior", () => {
    const a = simulate(defaultConfig),
      b = simulate({
        ...defaultConfig,
        faults: [{ id: "speed-test", kind: "speed", at: 50 }],
      });
    expect(b.snapshots[510].learnedUsed).toBe(false);
    expect(b.snapshots[510].ood).toBeGreaterThan(0.8);
    expect(dist(a.snapshots[590].raw, b.snapshots[590].raw)).toBeGreaterThan(
      0.01,
    );
  });
  it("computes metrics only from observed blackout samples", () => {
    const run = simulate(defaultConfig);
    expect(metrics(run, 12)).toEqual([]);
    const m = metrics(run, 50)[0],
      s = run.snapshots[500];
    expect(m.error).toBeCloseTo(dist(s.raw, s.reference));
    expect(m.drift).toBeCloseTo((100 * m.error) / s.distance);
  });
  it.each([10, 30, 60])(
    "supports a %i second blackout without invalid values",
    (blackout) => {
      const run = simulate({ ...defaultConfig, blackout });
      expect(run.snapshots).toHaveLength(1201);
      expect(run.snapshots.filter((s) => s.state === "DENIED")).toHaveLength(
        blackout * 10,
      );
      expect(
        run.snapshots.every(
          (s) =>
            Number.isFinite(s.raw.x) &&
            s.bound > 0 &&
            s.heading >= 0 &&
            s.heading < 360,
        ),
      ).toBe(true);
    },
  );
});
