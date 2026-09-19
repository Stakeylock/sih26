/**
 * BYOD ingest round-trip tests (task prompt 10:05).
 *
 * Generates a 600-sample @10 Hz synthetic ByodCapture on a smooth arc
 * trajectory, feeds it through buildByodRun, and asserts the output is
 * structurally sound and numerically sane — without importing the real
 * simulator.
 *
 * Arc geometry: vehicle starts heading north (0°), turns at constant
 * yaw-rate 0.6 °/s over 60 s, constant speed 10 m/s.
 * GPS noise is kept very small (0.1 m) so the heading-calibration step in
 * buildByodBundle (which uses incremental GPS displacement > 3 m threshold
 * to anchor the compass heading) doesn't fire prematurely on pure noise.
 * This is intentional: the test validates the round-trip pipeline, not GPS
 * noise robustness (which requires a real or much longer capture).
 *
 * Null GPS: every 7th epoch (i > 0 && i % 7 === 0) simulates brief fixes.
 */
import { describe, it, expect } from "vitest";
import { buildByodRun, type ByodCapture } from "./byod";
import type { Config } from "./types";

// ---------------------------------------------------------------------------
// Deterministic LCG — keeps the test reproducible with no external import
// ---------------------------------------------------------------------------
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function randn(rand: () => number): number {
  const u = rand() || 1e-9;
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RATE_HZ = 10;
const N = 600;   // samples (60 s)
const DT = 0.1;  // s
const SPEED = 10; // m/s constant
const YAW_RATE_DEG = 0.6; // deg/s constant turn rate
// GPS noise < step size (1 m/step) so buildByodBundle can calibrate heading
// from the true displacement rather than noise. Real-world threshold requires
// > 3 m displacement; at 10 Hz / 10 m/s each step is 1 m, so we keep noise
// well below that here and test noise-robustness separately.
const GPS_NOISE_M = 0.1;

const LAT0 = 12.9716;
const LON0 = 77.5946;
const M_PER_LAT = 111132;
const D2R = Math.PI / 180;
const M_PER_LON = 111320 * Math.cos(LAT0 * D2R);

function enuToLatLon(ex: number, ey: number) {
  return {
    lat: LAT0 + ey / (M_PER_LAT * D2R),
    lon: LON0 + ex / (M_PER_LON * D2R),
  };
}

// ---------------------------------------------------------------------------
// Synthetic arc capture builder
// ---------------------------------------------------------------------------

function makeArcCapture(): ByodCapture {
  const rand = lcg(20240919);

  const t: number[] = [];
  const imuWz: number[] = [];
  const yawPhone: number[] = [];
  const gpsLat: (number | null)[] = [];
  const gpsLon: (number | null)[] = [];
  const gpsAcc: (number | null)[] = [];
  const gpsSpeed: (number | null)[] = [];

  let heading = 0; // degrees, 0 = north, CW+
  let px = 0, py = 0; // ENU position

  for (let i = 0; i < N; i++) {
    t.push(i * DT);

    // True yaw rate + tiny noise
    const wzTrue = (YAW_RATE_DEG * D2R);
    const wzNoise = randn(rand) * 0.002; // ~2 mrad/s
    imuWz.push(wzTrue + wzNoise);

    // Integrate heading
    heading = (heading + YAW_RATE_DEG * DT + (wzNoise * DT * 180) / Math.PI + 360) % 360;
    yawPhone.push(heading);

    // Advance ENU position
    const headRad = heading * D2R;
    px += SPEED * DT * Math.sin(headRad);
    py += SPEED * DT * Math.cos(headRad);

    // GPS: null every 7th epoch after i=0; very small noise otherwise
    if (i > 0 && i % 7 === 0) {
      gpsLat.push(null);
      gpsLon.push(null);
      gpsAcc.push(null);
      gpsSpeed.push(null);
    } else {
      const noiseX = randn(rand) * GPS_NOISE_M;
      const noiseY = randn(rand) * GPS_NOISE_M;
      const { lat, lon } = enuToLatLon(px + noiseX, py + noiseY);
      gpsLat.push(lat);
      gpsLon.push(lon);
      gpsAcc.push(2.0);
      gpsSpeed.push(SPEED + randn(rand) * 0.1);
    }
  }

  return {
    kind: "astranav-byod",
    version: 1,
    capturedAt: "2026-09-19T10:00:00.000Z",
    rateHz: RATE_HZ,
    t, imuWz, yawPhone, gpsLat, gpsLon, gpsAcc, gpsSpeed,
    origin: { lat0: LAT0, lon0: LON0 },
  };
}

const BASE_CONFIG: Config = {
  scenario: "byod",
  blackout: 0,
  learned: true,
  map: false,
  seed: 1,
  faults: [],
  useNHC: true,
  useZUPT: true,
  useML: true,
  useGNSSGate: true,
};

// ---------------------------------------------------------------------------
// Tests (lazy-cached run; all tests share one build)
// ---------------------------------------------------------------------------

// Build once at describe scope (not in beforeAll to stay compatible with
// the project's vitest config, which doesn't need beforeAll here).
let cachedRun: ReturnType<typeof buildByodRun> | null = null;
function getResult() {
  if (!cachedRun) cachedRun = buildByodRun(BASE_CONFIG, makeArcCapture());
  return cachedRun;
}

describe("buildByodRun — round-trip structural checks", () => {
  it("returns a Run with approximately 600 snapshots", () => {
    const run = getResult();
    // n = Math.floor(lastT * 10) + 1; lastT = 59.9 → n = 600
    expect(run.snapshots.length).toBeGreaterThanOrEqual(598);
    expect(run.snapshots.length).toBeLessThanOrEqual(602);
  });

  it("events include an event with id 'byod-start'", () => {
    const run = getResult();
    const byodStart = run.events.find((e) => e.id === "byod-start");
    expect(byodStart).toBeDefined();
    expect(byodStart!.severity).toBe("info");
  });

  it("source is 'iovnbd' and iovnbd metadata is present with BYOD identifiers", () => {
    const run = getResult();
    expect(run.source).toBe("iovnbd");
    expect(run.iovnbd).toBeDefined();
    expect(run.iovnbd!.segmentId).toBe("BYOD");
    expect(run.iovnbd!.trip).toBe("OWN DRIVE");
  });

  it("calib.gyroBias magnitude is small (<0.05 rad/s) for near-zero-bias synthetic input", () => {
    // True gyro bias = 0 in synthetic data; small noise only → bias should be tiny.
    const run = getResult();
    const bias = run.iovnbd!.calib.gyroBias;
    expect(Math.abs(bias)).toBeLessThan(0.05);
  });
});

describe("buildByodRun — ekf track quality on clean arc", () => {
  it("final EKF position is within 30 m of GPS reference on a well-calibrated arc", () => {
    const run = getResult();
    const last = run.snapshots[run.snapshots.length - 1];
    const err = Math.hypot(last.ekf.x - last.reference.x, last.ekf.y - last.reference.y);
    expect(err).toBeLessThan(30);
  });

  it("no NaN in snapshot.ekf for any epoch", () => {
    const run = getResult();
    for (const snap of run.snapshots) {
      expect(Number.isFinite(snap.ekf.x)).toBe(true);
      expect(Number.isFinite(snap.ekf.y)).toBe(true);
    }
  });

  it("no NaN in snapshot.gnss.x/y for epochs that have a GPS fix", () => {
    const run = getResult();
    for (const snap of run.snapshots) {
      if (snap.gnss !== null) {
        expect(Number.isFinite(snap.gnss.x)).toBe(true);
        expect(Number.isFinite(snap.gnss.y)).toBe(true);
      }
    }
  });
});
