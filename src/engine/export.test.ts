/**
 * Export integrity tests (plan §16.2 / task prompt 09:20).
 *
 * Tests:
 *  1. buildJudgeReportHtml — every finalErrors branch value appears in the HTML
 *  2. buildJudgeReportHtml — scenario name is HTML-escaped (XSS injection guard)
 *  3. buildJudgeReportHtml — honest-limitations block is present
 *  4. buildJudgeReportHtml — live row included when run.iovnbd.live is set
 *  5. exportRun CSV — header line includes live_x_m, live_y_m, gnss_nis columns
 *  6. exportRun CSV — data rows use "iovnbd-replay" provenance for iovnbd runs
 *
 * No imports from simulation.ts — fake Run objects only, <50 ms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildJudgeReportHtml } from "../components/judgeReport";
import { exportRun } from "../components/Evidence";
import type { Run, Snapshot, Config, Scenario } from "./types";

// ---------------------------------------------------------------------------
// Minimal fake Run helpers — no real simulator involved
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    scenario: "test-scenario",
    blackout: 60,
    learned: true,
    map: false,
    seed: 1,
    faults: [],
    ...overrides,
  };
}

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "test-scenario",
    name: "Test Scenario",
    subtitle: "",
    description: "",
    start: 40,
    route: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    faults: [],
    ...overrides,
  };
}

function makeSnapshot(t: number, withLive = false): Snapshot {
  return {
    t,
    reference: { x: t * 2, y: 0 },
    ins: { x: t * 2 + 5, y: 3 },
    ekf: { x: t * 2 + 1, y: 0.5 },
    map: { x: t * 2 + 1, y: 0 },
    classical: { x: t * 2 + 2, y: 1 },
    ...(withLive ? { live: { x: t * 2 + 0.8, y: 0.2 } } : {}),
    speed: 12,
    mlSpeed: 11.5,
    mlConfidence: 0.82,
    mlQuality: "READY",
    heading: 90,
    sigma: 5,
    bound: 12,
    gnss: t < 40 || t > 100 ? { x: t * 2, y: 0 } : null,
    gnssAccepted: t < 40,
    gnssResidual: null,
    nis: t < 40 ? 1.2 : null,
    rejected: false,
    state: t >= 40 && t <= 100 ? "DENIED" : "TRUSTED",
    outage: t >= 40 && t <= 100 ? t - 40 : 0,
    distance: t * 12,
    alignment: 0.98,
    mlOod: 0.05,
    mlUsed: true,
    mapUsed: false,
    mapLock: null,
    shock: false,
    candidates: [],
    health: 82,
    correction: 0.3,
  };
}

function makeIovnbdRun(): Run {
  return {
    config: makeConfig(),
    scenario: makeScenario(),
    snapshots: [makeSnapshot(20, true), makeSnapshot(60, true), makeSnapshot(110, true)],
    events: [],
    duration: 120,
    source: "iovnbd",
    iovnbd: {
      segmentId: "S1-B60-A",
      trip: "S1",
      calib: { gyroBias: 0.005, headingOffset: 8.2, initialHeading: 92, initialSpeed: 11 },
      finalErrors: {
        ins:       { final: 624.62, drift: 51.1, rmse: 310.4, p95: 591.3 },
        classical: { final: 388.70, drift: 31.9, rmse: 195.1, p95: 367.2 },
        ekf:       { final: 442.17, drift: 36.3, rmse: 221.5, p95: 419.8 },
      },
      blackoutDist: 743,
      route: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      modelInfo: { version: "v2.1", holdout: {}, loto: {}, note: "test" },
      live: { final: 381.0, drift: 31.3, gyroTrusted: true, wzSign: 1 },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers for CSV test — stub the browser surface exportRun touches
// ---------------------------------------------------------------------------

/** Capture the string handed to the Blob constructor and return it. */
function captureExportCsv(run: Run, t: number): string {
  let captured = "";
  vi.stubGlobal("Blob", class {
    constructor(parts: BlobPart[]) { captured = parts[0] as string; }
  });
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:test",
    revokeObjectURL: () => {},
  });
  const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
  vi.stubGlobal("document", {
    createElement: () => anchor,
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
  });
  exportRun(run, t, "csv");
  return captured;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("buildJudgeReportHtml — estimator rows match finalErrors", () => {
  it("includes every finalErrors branch final value in the HTML", () => {
    const run = makeIovnbdRun();
    const html = buildJudgeReportHtml(run);
    const fe = run.iovnbd!.finalErrors;
    expect(html).toContain(`${fe.ins.final.toFixed(1)} m`);       // 624.6 m
    expect(html).toContain(`${fe.classical.final.toFixed(1)} m`); // 388.7 m
    expect(html).toContain(`${fe.ekf.final.toFixed(1)} m`);       // 442.2 m
  });

  it("includes the live row when run.iovnbd.live is present", () => {
    const run = makeIovnbdRun();
    const html = buildJudgeReportHtml(run);
    expect(html).toContain("Live in-browser");
    expect(html).toContain(`${run.iovnbd!.live.final.toFixed(1)} m`); // 381.0 m
  });
});

describe("buildJudgeReportHtml — HTML escaping", () => {
  it("escapes <script> injected into the scenario name", () => {
    const run = makeIovnbdRun();
    run.config = makeConfig({ scenario: 'test<script>alert(1)</script>' });
    const html = buildJudgeReportHtml(run);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("buildJudgeReportHtml — honest limitations block", () => {
  it("contains the Honest limitations heading and replay-adapter copy", () => {
    const run = makeIovnbdRun();
    const html = buildJudgeReportHtml(run);
    expect(html).toContain("Honest limitations");
    // The key phrase from the limitations <div>
    expect(html).toContain("intentionally suppressed");
  });
});

describe("exportRun CSV — live columns present", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("header line includes live_x_m, live_y_m, and gnss_nis", () => {
    const csv = captureExportCsv(makeIovnbdRun(), 120);
    const header = csv.split("\n")[0];
    expect(header).toContain("live_x_m");
    expect(header).toContain("live_y_m");
    expect(header).toContain("gnss_nis");
  });

  it("data rows use 'iovnbd-replay' as the provenance token", () => {
    const csv = captureExportCsv(makeIovnbdRun(), 120);
    const rows = csv.split("\n").slice(1).filter(Boolean);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.startsWith("iovnbd-replay,")).toBe(true);
    }
  });
});
