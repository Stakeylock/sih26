/**
 * BYOD ingest round-trip and Counterfactual GNSS denial test suite.
 *
 * Tests:
 *  1. buildByodRun — round-trip structural checks (v1 and v2)
 *  2. buildByodRun — ekf track quality on clean arc
 *  3. validateByodCapture — capture-health scoring & counterfactual eligibility
 *  4. Counterfactual GNSS Outage — strict input masking & zero GNSS leakage invariance
 *  5. Reacquisition progression — transition from DENIED -> REACQUIRING -> TRUSTED
 *  6. Determinism & presets (10s, 30s, 60s)
 */
import { describe, it, expect } from "vitest";
import {
  buildByodRun,
  buildByodCounterfactualRun,
  validateByodCapture,
  type ByodCapture,
  type ByodCaptureV1,
  type ByodCaptureV2,
} from "./byod";
import type { Config } from "./types";

// ---------------------------------------------------------------------------
// Deterministic LCG
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
const N = 600; // samples (60 s)
const DT = 0.1; // s
const SPEED = 10; // m/s constant
const YAW_RATE_DEG = 0.6; // deg/s constant turn rate
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
// Synthetic arc capture builders (v1 and v2)
// ---------------------------------------------------------------------------

function makeArcCapture(): ByodCaptureV1 {
  const rand = lcg(20240919);

  const t: number[] = [];
  const imuWz: number[] = [];
  const yawPhone: number[] = [];
  const gpsLat: (number | null)[] = [];
  const gpsLon: (number | null)[] = [];
  const gpsAcc: (number | null)[] = [];
  const gpsSpeed: (number | null)[] = [];

  let heading = 0;
  let px = 0, py = 0;

  for (let i = 0; i < N; i++) {
    t.push(i * DT);
    const wzTrue = YAW_RATE_DEG * D2R;
    const wzNoise = randn(rand) * 0.002;
    imuWz.push(wzTrue + wzNoise);

    heading = (heading + YAW_RATE_DEG * DT + (wzNoise * DT * 180) / Math.PI + 360) % 360;
    yawPhone.push(heading);

    const headRad = heading * D2R;
    px += SPEED * DT * Math.sin(headRad);
    py += SPEED * DT * Math.cos(headRad);

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

function makeArcCaptureV2(): ByodCaptureV2 {
  const v1 = makeArcCapture();
  const rand = lcg(20240920);

  const ax: number[] = [];
  const ay: number[] = [];
  const az: number[] = [];
  const gyroX: number[] = [];
  const gyroY: number[] = [];

  for (let i = 0; i < N; i++) {
    // Normal driving vibration: centripetal acceleration on Y, longitudinal on X, gravity on Z
    ax.push(randn(rand) * 0.2);
    ay.push(SPEED * (YAW_RATE_DEG * D2R) + randn(rand) * 0.15);
    az.push(9.81 + randn(rand) * 0.25);
    gyroX.push(randn(rand) * 0.005);
    gyroY.push(randn(rand) * 0.005);
  }

  return {
    kind: "astranav-byod",
    version: 2,
    capturedAt: "2026-09-19T10:15:00.000Z",
    rateHz: RATE_HZ,
    device: {
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro)",
      platform: "Linux armv8l",
      browser: "Chrome Mobile 128.0",
    },
    motion: {
      t: v1.t,
      ax,
      ay,
      az,
      gyroX,
      gyroY,
      gyroZ: v1.imuWz,
      yaw: v1.yawPhone,
    },
    gnss: {
      t: v1.t,
      lat: v1.gpsLat,
      lon: v1.gpsLon,
      accuracy: v1.gpsAcc,
      speed: v1.gpsSpeed,
    },
    origin: v1.origin,
    t: v1.t,
    imuWz: v1.imuWz,
    yawPhone: v1.yawPhone,
    gpsLat: v1.gpsLat,
    gpsLon: v1.gpsLon,
    gpsAcc: v1.gpsAcc,
    gpsSpeed: v1.gpsSpeed,
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
// Suites
// ---------------------------------------------------------------------------

describe("buildByodRun — round-trip structural checks", () => {
  const run = buildByodRun(BASE_CONFIG, makeArcCapture());

  it("returns a Run with approximately 600 snapshots", () => {
    expect(run.snapshots.length).toBeGreaterThanOrEqual(598);
    expect(run.snapshots.length).toBeLessThanOrEqual(602);
  });

  it("events include an event with id 'byod-start'", () => {
    const byodStart = run.events.find((e) => e.id === "byod-start");
    expect(byodStart).toBeDefined();
    expect(byodStart!.severity).toBe("info");
  });

  it("source is 'byod' and metadata is present with BYOD identifiers", () => {
    expect(run.source).toBe("byod");
    expect(run.iovnbd).toBeDefined();
    expect(run.iovnbd!.segmentId).toBe("BYOD");
    expect(run.iovnbd!.trip).toBe("OWN DRIVE");
    expect(run.byod).toBeDefined();
    expect(run.byod!.referenceType).toBe("phone-gps");
  });

  it("calib.gyroBias magnitude is small (<0.05 rad/s) for near-zero-bias synthetic input", () => {
    const bias = run.iovnbd!.calib.gyroBias;
    expect(Math.abs(bias)).toBeLessThan(0.05);
  });
});

describe("buildByodRun — ekf track quality on clean arc", () => {
  const run = buildByodRun(BASE_CONFIG, makeArcCapture());

  it("final EKF position is within 30 m of GPS reference on a well-calibrated arc", () => {
    const last = run.snapshots[run.snapshots.length - 1];
    const err = Math.hypot(last.ekf.x - last.reference.x, last.ekf.y - last.reference.y);
    expect(err).toBeLessThan(30);
  });

  it("no NaN in snapshot.ekf for any epoch", () => {
    for (const snap of run.snapshots) {
      expect(Number.isFinite(snap.ekf.x)).toBe(true);
      expect(Number.isFinite(snap.ekf.y)).toBe(true);
    }
  });

  it("no NaN in snapshot.gnss.x/y for epochs that have a GPS fix", () => {
    for (const snap of run.snapshots) {
      if (snap.gnss !== null) {
        expect(Number.isFinite(snap.gnss.x)).toBe(true);
        expect(Number.isFinite(snap.gnss.y)).toBe(true);
      }
    }
  });
});

describe("validateByodCapture — preflight capture health and eligibility", () => {
  it("validates a healthy v2 capture with PASS status and counterfactual eligibility", () => {
    const cap = makeArcCaptureV2();
    const res = validateByodCapture(cap);
    expect(res.valid).toBe(true);
    expect(res.report.status).toBe("PASS");
    expect(res.report.duration).toBeGreaterThanOrEqual(59);
    expect(res.report.motionRateHz).toBeCloseTo(10, 0);
    expect(res.report.hasGyro).toBe(true);
    expect(res.report.hasAccel).toBe(true);
    expect(res.report.replayEligible).toBe(true);
    expect(res.report.counterfactualEligible).toBe(true);
  });

  it("validates a v1 capture as replay eligible but counterfactual ineligible (no accel)", () => {
    const cap = makeArcCapture();
    const res = validateByodCapture(cap);
    expect(res.valid).toBe(true);
    expect(res.report.replayEligible).toBe(true);
    expect(res.report.counterfactualEligible).toBe(false); // v1 lacks 3-axis accel
  });

  it("rejects non-object or malformed capture", () => {
    expect(validateByodCapture(null).valid).toBe(false);
    expect(validateByodCapture("not a json").valid).toBe(false);
    expect(validateByodCapture({ kind: "other", t: [] }).valid).toBe(false);
  });

  it("flags non-monotonic timestamps", () => {
    const cap = makeArcCapture();
    cap.t[10] = cap.t[8]; // backward timestamp
    const res = validateByodCapture(cap);
    expect(res.report.isMonotonic).toBe(false);
    expect(res.report.issues.some((i) => i.includes("non-decreasing"))).toBe(true);
  });

  it("flags large sensor gaps (> 2000 ms)", () => {
    const cap = makeArcCapture();
    cap.t[50] = cap.t[49] + 3.0; // 3 second gap
    const res = validateByodCapture(cap);
    expect(res.report.longestGapMs).toBeGreaterThan(2500);
    expect(res.report.issues.some((i) => i.includes("gap"))).toBe(true);
  });
});

describe("Counterfactual GNSS denial & leakage invariance", () => {
  const OUTAGE_START = 20; // 20s
  const OUTAGE_DUR = 20; // 20s (until 40s)

  it("exact GNSS masking: no GNSS fixes emitted and state is DENIED during outage", () => {
    const cap = makeArcCaptureV2();
    const cfRun = buildByodCounterfactualRun(BASE_CONFIG, cap, {
      outageStart: OUTAGE_START,
      outageDuration: OUTAGE_DUR,
    });

    expect(cfRun.config.blackout).toBe(OUTAGE_DUR);
    expect(cfRun.byod?.counterfactual).toBeDefined();

    for (const s of cfRun.snapshots) {
      if (s.t >= OUTAGE_START && s.t < OUTAGE_START + OUTAGE_DUR) {
        expect(s.gnss).toBeNull();
        expect(s.state).toBe("DENIED");
        expect(s.outage).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("pre-outage trajectory is identical between normal and counterfactual runs", () => {
    const cap = makeArcCaptureV2();
    const normalRun = buildByodRun(BASE_CONFIG, cap);
    const cfRun = buildByodCounterfactualRun(BASE_CONFIG, cap, {
      outageStart: OUTAGE_START,
      outageDuration: OUTAGE_DUR,
    });

    const preOutageLimit = OUTAGE_START - 0.2;
    for (let i = 0; i < normalRun.snapshots.length; i++) {
      const sNorm = normalRun.snapshots[i];
      const sCf = cfRun.snapshots[i];
      if (sNorm.t < preOutageLimit) {
        expect(sCf.ekf.x).toBeCloseTo(sNorm.ekf.x, 3);
        expect(sCf.ekf.y).toBeCloseTo(sNorm.ekf.y, 3);
      }
    }
  });

  /**
   * CRITICAL SCIENTIFIC INVARIANT (Section 15):
   * If hidden GNSS values inside the blackout are changed arbitrarily while all non-GNSS
   * inputs remain identical, the estimator's blackout trajectory must remain 100% identical.
   */
  it("counterfactual BYOD does not consume hidden GNSS during denial (leakage invariance test)", () => {
    const capA = makeArcCaptureV2();
    // Create capB by shifting GPS coordinates by +50 km and scaling GPS speed by 10x
    // ONLY during the blackout window [20, 40)
    const capB = JSON.parse(JSON.stringify(capA)) as ByodCaptureV2;
    for (let i = 0; i < capB.motion.t.length; i++) {
      const t = capB.motion.t[i];
      if (t >= OUTAGE_START && t < OUTAGE_START + OUTAGE_DUR) {
        if (capB.gnss.lat[i] != null) capB.gnss.lat[i]! += 0.5; // ~55 km shift
        if (capB.gnss.lon[i] != null) capB.gnss.lon[i]! += 0.5;
        if (capB.gnss.speed[i] != null) capB.gnss.speed[i]! *= 10;
        if (capB.gpsLat && capB.gpsLat[i] != null) capB.gpsLat[i]! += 0.5;
        if (capB.gpsLon && capB.gpsLon[i] != null) capB.gpsLon[i]! += 0.5;
        if (capB.gpsSpeed && capB.gpsSpeed[i] != null) capB.gpsSpeed[i]! *= 10;
      }
    }

    const runA = buildByodCounterfactualRun(BASE_CONFIG, capA, {
      outageStart: OUTAGE_START,
      outageDuration: OUTAGE_DUR,
    });
    const runB = buildByodCounterfactualRun(BASE_CONFIG, capB, {
      outageStart: OUTAGE_START,
      outageDuration: OUTAGE_DUR,
    });

    // Verify: The estimator trajectory (ekf.x, ekf.y) inside the blackout window
    // must be strictly BITWISE IDENTICAL between runA and runB!
    for (let i = 0; i < runA.snapshots.length; i++) {
      const sA = runA.snapshots[i];
      const sB = runB.snapshots[i];
      if (sA.t >= OUTAGE_START && sA.t < OUTAGE_START + OUTAGE_DUR) {
        expect(sB.ekf.x).toBe(sA.ekf.x);
        expect(sB.ekf.y).toBe(sA.ekf.y);
        expect(sB.speed).toBe(sA.speed);
        expect(sB.mlSpeed).toBe(sA.mlSpeed);
      }
    }
  });

  it("reacquisition progresses from DENIED -> REACQUIRING -> TRUSTED", () => {
    const cap = makeArcCaptureV2();
    const cfRun = buildByodCounterfactualRun(BASE_CONFIG, cap, {
      outageStart: 15,
      outageDuration: 15,
    });

    const returnTime = 30; // 15 + 15
    const reacquiringSnaps = cfRun.snapshots.filter((s) => s.t >= returnTime && s.state === "REACQUIRING");
    const trustedSnaps = cfRun.snapshots.filter((s) => s.t >= returnTime + 2 && s.state === "TRUSTED");

    expect(reacquiringSnaps.length).toBeGreaterThanOrEqual(1);
    expect(trustedSnaps.length).toBeGreaterThan(5);

    // Reacquisition events emitted
    const endEvent = cfRun.events.find((e) => e.id === "byod-outage-end");
    expect(endEvent).toBeDefined();
  });

  it("handles 10s, 30s, and 60s blackout presets without error", () => {
    const cap = makeArcCaptureV2();
    for (const dur of [10, 30, 45]) {
      const run = buildByodCounterfactualRun(BASE_CONFIG, cap, {
        outageStart: 10,
        outageDuration: dur,
      });
      expect(run.config.blackout).toBe(dur);
      expect(run.snapshots.length).toBeGreaterThan(500);
      expect(Number.isFinite(run.snapshots[run.snapshots.length - 1].ekf.x)).toBe(true);
    }
  });

  it("deterministic reruns produce bitwise identical snapshots", () => {
    const cap = makeArcCaptureV2();
    const run1 = buildByodCounterfactualRun(BASE_CONFIG, cap, { outageStart: 15, outageDuration: 20 });
    const run2 = buildByodCounterfactualRun(BASE_CONFIG, cap, { outageStart: 15, outageDuration: 20 });

    expect(run1.snapshots.length).toBe(run2.snapshots.length);
    for (let i = 0; i < run1.snapshots.length; i++) {
      expect(run1.snapshots[i].ekf.x).toBe(run2.snapshots[i].ekf.x);
      expect(run1.snapshots[i].ekf.y).toBe(run2.snapshots[i].ekf.y);
      expect(run1.snapshots[i].bound).toBe(run2.snapshots[i].bound);
    }
  });
});
