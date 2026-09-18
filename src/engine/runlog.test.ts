import { describe, it, expect, beforeEach, vi } from "vitest";
import { saveRun, loadRuns, deleteRun, clearRuns, toSavedRun } from "./runlog";
import type { Run, Config } from "./types";

// Mock localStorage using a simple approach - we'll use a module-level mock
const mockStore = new Map<string, string>();

// Create mock storage with vi.fn
const mockGetItem = vi.fn((key: string) => mockStore.get(key) ?? null);
const mockSetItem = vi.fn((key: string, value: string) => mockStore.set(key, value));
const mockRemoveItem = vi.fn((key: string) => mockStore.delete(key));
const mockClear = vi.fn(() => mockStore.clear());

// Use vi.stubGlobal to mock localStorage
vi.stubGlobal("localStorage", {
  getItem: mockGetItem,
  setItem: mockSetItem,
  removeItem: mockRemoveItem,
  clear: mockClear,
});

function makeRun(overrides: Partial<Run> = {}): Run {
  const baseConfig: Config = {
    scenario: "test-scenario",
    blackout: 60,
    learned: true,
    map: false,
    seed: 42,
    faults: [],
    useNHC: true,
    useZUPT: true,
    useML: true,
    useGNSSGate: true,
    faultDurations: { shock: 3, mount: 8, speed: 10, gnss: 3 },
  };
  return {
    config: baseConfig,
    scenario: { id: "test-scenario", name: "Test", subtitle: "", description: "", start: 0, route: [], faults: [] },
    snapshots: [],
    events: [],
    duration: 120,
    source: "synthetic",
    ...overrides,
  };
}

describe("runlog persistence", () => {
  beforeEach(() => {
    mockStore.clear();
    mockGetItem.mockClear();
    mockSetItem.mockClear();
    mockRemoveItem.mockClear();
    mockClear.mockClear();
  });

  it("toSavedRun extracts summary fields and generates run_id", () => {
    const run = makeRun({ source: "iovnbd", iovnbd: {
      segmentId: "S1-B60-A",
      trip: "S1",
      calib: { gyroBias: 0.01, headingOffset: 5, initialHeading: 90, initialSpeed: 10 },
      finalErrors: { ekf: { final: 5.2, drift: 2.1, rmse: 3.5, p95: 8.9 } },
      blackoutDist: 600,
      route: [],
      modelInfo: { version: "1.0", holdout: {}, loto: {}, note: "test" },
      live: { final: 4.8, drift: 1.9, gyroTrusted: true, wzSign: 1 },
    }});
    const saved = toSavedRun(run);
    expect(saved.run_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.source).toBe("iovnbd");
    expect(saved.trip).toBe("S1-B60-A");
    expect(saved.blackout).toBe(60);
    expect(saved.config).toEqual(run.config);
    expect(saved.finalErrors).toEqual(run.iovnbd!.finalErrors);
    expect(saved.live).toEqual(run.iovnbd!.live);
    expect(saved.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("toSavedRun works for synthetic runs (no iovnbd)", () => {
    const run = makeRun({ source: "synthetic" });
    const saved = toSavedRun(run);
    expect(saved.source).toBe("synthetic");
    expect(saved.trip).toBe("test-scenario");
    expect(saved.finalErrors).toEqual({});
    expect(saved.live).toBeUndefined();
  });

  it("saveRun persists to localStorage and loadRuns retrieves it", () => {
    const run = makeRun({ source: "iovnbd", iovnbd: {
      segmentId: "S3A-B60", trip: "S3a",
      calib: { gyroBias: 0.02, headingOffset: 3, initialHeading: 45, initialSpeed: 15 },
      finalErrors: { ekf: { final: 3.1, drift: 1.2, rmse: 2.0, p95: 5.5 } },
      blackoutDist: 450, route: [],
      modelInfo: { version: "1.0", holdout: {}, loto: {}, note: "" },
      live: { final: 2.9, drift: 1.1, gyroTrusted: false, wzSign: -1 },
    }});
    const saved = saveRun(run);
    expect(mockSetItem).toHaveBeenCalled();
    const loaded = loadRuns();
    expect(loaded.length).toBe(1);
    expect(loaded[0].run_id).toBe(saved.run_id);
    expect(loaded[0].trip).toBe("S3A-B60");
    expect(loaded[0].live?.gyroTrusted).toBe(false);
  });

  it("saveRun enforces 20-run cap (newest first)", () => {
    // Save 25 runs
    for (let i = 0; i < 25; i++) {
      saveRun(makeRun({ config: { ...makeRun().config, seed: i } }));
    }
    const loaded = loadRuns();
    expect(loaded.length).toBe(20);
    // Newest (seed 24) should be first
    expect(loaded[0].config.seed).toBe(24);
    // Oldest (seed 0) should be evicted
    const seeds = loaded.map(r => r.config.seed);
    expect(seeds).not.toContain(0);
    expect(seeds).toContain(24);
    expect(seeds).toContain(5); // 25-20 = 5, so seed 5 is the oldest retained
  });

  it("loadRuns returns empty array when storage is empty", () => {
    expect(loadRuns()).toEqual([]);
  });

  it("loadRuns handles corrupted JSON gracefully", () => {
    mockStore.set("astranav.runs.v1", "not valid json");
    expect(loadRuns()).toEqual([]);
  });

  it("loadRuns handles non-array values gracefully", () => {
    mockStore.set("astranav.runs.v1", '{"not": "an array"}');
    expect(loadRuns()).toEqual([]);
  });

  it("loadRuns filters out invalid entries", () => {
    mockStore.set("astranav.runs.v1", JSON.stringify([
      { run_id: "valid-1", source: "synthetic", trip: "t1", blackout: 10, config: {}, finalErrors: {}, timestamp: "2024-01-01T00:00:00Z" },
      "not an object",
      { run_id: "valid-2", source: "iovnbd", trip: "t2", blackout: 20, config: {}, finalErrors: {}, timestamp: "2024-01-02T00:00:00Z" },
      null,
      { missing: "fields" },
    ]));
    const loaded = loadRuns();
    expect(loaded.length).toBe(2);
    expect(loaded[0].run_id).toBe("valid-1");
    expect(loaded[1].run_id).toBe("valid-2");
  });

  it("deleteRun removes a specific run by ID", () => {
    const r1 = saveRun(makeRun({ config: { ...makeRun().config, seed: 1 } }));
    const r2 = saveRun(makeRun({ config: { ...makeRun().config, seed: 2 } }));
    expect(loadRuns().length).toBe(2);
    deleteRun(r1.run_id);
    const loaded = loadRuns();
    expect(loaded.length).toBe(1);
    expect(loaded[0].run_id).toBe(r2.run_id);
  });

  it("clearRuns removes all runs", () => {
    saveRun(makeRun());
    saveRun(makeRun());
    expect(loadRuns().length).toBe(2);
    clearRuns();
    expect(loadRuns()).toEqual([]);
    expect(mockRemoveItem).toHaveBeenCalledWith("astranav.runs.v1");
  });

  it("saveRun handles quota exceeded gracefully (no throw)", () => {
    // Simulate quota exceeded by making setItem throw
    mockSetItem.mockImplementationOnce(() => { throw new Error("QuotaExceededError"); });
    expect(() => saveRun(makeRun())).not.toThrow();
  });
});