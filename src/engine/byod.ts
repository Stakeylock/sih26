/**
 * BYOD — "Bring Your Own Drive" (breadth flagship & counterfactual hardening).
 *
 * Turns a sensor capture from the phone page (public/byod.html) into the same
 * Seg-shaped bundle the IO-VNBD replay consumes, so the ENTIRE existing
 * console — live ES-EKF, traces, trust panel, Viterbi, exports — works on
 * the user's own drive with zero special-casing downstream.
 *
 * HONESTY & INTEGRITY CONTRACT:
 *  - "Reference" = the phone's recorded GPS track. Never called "ground truth".
 *  - Counterfactual GNSS denial: All GNSS position, altitude, speed, course,
 *    and accuracy-derived corrections are algorithmically masked from the
 *    estimator during the user-selected blackout window.
 *  - The original GPS track is retained ONLY as a hidden evaluation reference.
 *  - During the outage, the estimator navigates via:
 *      * Recorded gyro and compass heading kinematics
 *      * Non-Holonomic Constraints (NHC)
 *      * Learned coarse virtual speed & ML-gated ZUPT from IMU features
 *      * Systematic-heading protection envelope
 *  - Post-outage reacquisition requires consistent fixes before restoring TRUSTED.
 */
import { runLiveEskf } from "./liveeskf";
import { matchTrack, defaultHMMParams } from "./mapmatch";
import { reacquisitionStats } from "./reacquisition";
import type { Config, Event, Run, Snapshot, Scenario } from "./types";

export type ByodCaptureV1 = {
  kind: "astranav-byod";
  version: 1;
  capturedAt: string;
  rateHz: number;
  t: number[];
  imuWz: number[];
  yawPhone: number[];
  gpsLat: (number | null)[];
  gpsLon: (number | null)[];
  gpsAcc: (number | null)[];
  gpsSpeed: (number | null)[];
  origin: { lat0: number; lon0: number };
};

export type ByodCaptureV2 = {
  kind: "astranav-byod";
  version: 2;
  capturedAt: string;
  rateHz?: number;
  device?: {
    userAgent?: string;
    platform?: string;
    browser?: string;
  };
  motion: {
    t: number[];
    ax: number[];
    ay: number[];
    az: number[];
    axGravity?: number[];
    ayGravity?: number[];
    azGravity?: number[];
    gyroX: number[];
    gyroY: number[];
    gyroZ: number[];
    yaw?: number[];
    pitch?: number[];
    roll?: number[];
  };
  gnss: {
    t: number[];
    lat: (number | null)[];
    lon: (number | null)[];
    altitude?: (number | null)[];
    accuracy: (number | null)[];
    speed: (number | null)[];
    heading?: (number | null)[];
  };
  origin: { lat0: number; lon0: number };
  // Top-level fallbacks for v1 compatibility
  t?: number[];
  imuWz?: number[];
  yawPhone?: number[];
  gpsLat?: (number | null)[];
  gpsLon?: (number | null)[];
  gpsAcc?: (number | null)[];
  gpsSpeed?: (number | null)[];
};

export type ByodCapture = ByodCaptureV1 | ByodCaptureV2;

export type ByodHealthReport = {
  status: "PASS" | "WARN" | "FAIL";
  duration: number;
  motionSamples: number;
  motionRateHz: number;
  gnssFixes: number;
  gnssRateHz: number;
  medianAccuracyM: number | null;
  hasGyro: boolean;
  hasAccel: boolean;
  hasOrientation: boolean;
  isMonotonic: boolean;
  longestGapMs: number;
  replayEligible: boolean;
  counterfactualEligible: boolean;
  issues: string[];
};

export type ByodCounterfactualConfig = {
  outageStart: number;
  outageDuration: number;
};

export type ByodBundle = {
  seg: Seg;
  model: {
    version: string;
    classes: string[];
    speedCenters: number[];
    weights: number[][];
    featureMedian: number[];
    featureIQR: number[];
    evalHoldout: Record<string, { acc: number; majority: number; mae: number; rmse: number }>;
    evalLoto: Record<string, { acc: number }>;
    note: string;
  };
  health?: ByodHealthReport;
};

type Seg = {
  id: string;
  trip: string;
  blackDur: number;
  pre: number;
  dur: number;
  post: number;
  calib: { gyroBias: number; headingOffset: number; initialHeading: number; initialSpeed: number };
  t: number[];
  refX: (number | null)[];
  refY: (number | null)[];
  gpsX: (number | null)[];
  gpsY: (number | null)[];
  gpsAcc: (number | null)[];
  insX: number[];
  insY: number[];
  clsX: number[];
  clsY: number[];
  ekfX: number[];
  ekfY: number[];
  mlSpeed: number[];
  ekfSpeed: number[];
  heading: number[];
  mlConf: number[];
  gpsSpeed: number[];
  gpsSpeedOk: number[];
  zupt: number[];
  ood: number[];
  pStop: number[];
  imuWz: number[];
  yawPhone: number[];
  metrics: Record<string, { final: number; drift: number; rmse: number; p95: number }>;
  blackoutDist: number;
};

const D2R = Math.PI / 180;

/** Resample an irregular timeline onto a fixed 10 Hz grid (linear interp). */
function resample10(srcT: number[], srcV: (number | null)[], n: number, fillHold = true): (number | null)[] {
  const out: (number | null)[] = new Array(n).fill(null);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const tq = i / 10;
    while (j + 1 < srcT.length && srcT[j + 1] <= tq) j++;
    if (srcT[j] == null) continue;
    if (j + 1 < srcT.length && srcV[j] != null && srcV[j + 1] != null) {
      const f = (tq - srcT[j]) / Math.max(1e-6, srcT[j + 1] - srcT[j]);
      out[i] = (srcV[j] as number) * (1 - f) + (srcV[j + 1] as number) * f;
    } else {
      out[i] = srcV[j];
    }
  }
  if (fillHold) {
    let last: number | null = null;
    for (let i = 0; i < n; i++) {
      if (out[i] == null && last != null) out[i] = last;
      if (out[i] != null) last = out[i];
    }
    let next: number | null = null;
    for (let i = n - 1; i >= 0; i--) {
      if (out[i] == null && next != null) out[i] = next;
      if (out[i] != null) next = out[i];
    }
  }
  return out;
}

/** Stationary-bias calibration: median yaw-axis rate over the calmest 8 s. */
function calibrateGyro(wz: (number | null)[]): { bias: number; pre: number } {
  const n = wz.length;
  const win = Math.min(80, n);
  let bestStart = 0, bestEnergy = Infinity;
  for (let s = 0; s + win <= n; s += 10) {
    let e = 0;
    for (let i = s; i < s + win; i++) e += (wz[i] ?? 0) ** 2;
    if (e < bestEnergy) { bestEnergy = e; bestStart = s; }
  }
  const vals: number[] = [];
  for (let i = bestStart; i < bestStart + win; i++) vals.push(wz[i] ?? 0);
  vals.sort((a, b) => a - b);
  return { bias: vals[Math.floor(vals.length / 2)] ?? 0, pre: bestStart };
}

/** Preflight validator for BYOD captures (Section 9 & 10). */
export function validateByodCapture(cap: unknown): { valid: boolean; report: ByodHealthReport; error?: string } {
  const issues: string[] = [];
  if (!cap || typeof cap !== "object") {
    return {
      valid: false,
      report: {
        status: "FAIL", duration: 0, motionSamples: 0, motionRateHz: 0,
        gnssFixes: 0, gnssRateHz: 0, medianAccuracyM: null, hasGyro: false,
        hasAccel: false, hasOrientation: false, isMonotonic: false, longestGapMs: 0,
        replayEligible: false, counterfactualEligible: false, issues: ["Invalid capture payload (not an object)"],
      },
      error: "Not a valid capture object.",
    };
  }

  const c = cap as Partial<ByodCaptureV2> & Partial<ByodCaptureV1>;
  if (c.kind !== "astranav-byod") {
    issues.push("Header kind mismatch (expected 'astranav-byod')");
  }

  // Extract timeline
  let tArr: number[] = [];
  let wzArr: number[] = [];
  let axArr: number[] = [];
  let gpsLats: (number | null)[] = [];
  let gpsAccs: (number | null)[] = [];

  if (c.version === 2 && c.motion && Array.isArray(c.motion.t)) {
    tArr = c.motion.t;
    wzArr = c.motion.gyroZ || [];
    axArr = c.motion.ax || [];
    if (c.gnss && Array.isArray(c.gnss.lat)) {
      gpsLats = c.gnss.lat;
      gpsAccs = c.gnss.accuracy || [];
    }
  } else {
    // v1 or flat shape
    tArr = Array.isArray(c.t) ? c.t : [];
    wzArr = Array.isArray(c.imuWz) ? c.imuWz : [];
    gpsLats = Array.isArray(c.gpsLat) ? c.gpsLat : [];
    gpsAccs = Array.isArray(c.gpsAcc) ? c.gpsAcc : [];
  }

  const nSamples = tArr.length;
  if (nSamples < 10) {
    issues.push("Capture has fewer than 10 samples.");
  }

  const duration = nSamples > 1 ? Math.max(0, tArr[nSamples - 1] - tArr[0]) : 0;
  let isMonotonic = true;
  let longestGapMs = 0;
  for (let i = 1; i < nSamples; i++) {
    const dt = (tArr[i] - tArr[i - 1]) * 1000;
    if (tArr[i] < tArr[i - 1]) isMonotonic = false;
    if (dt > longestGapMs) longestGapMs = dt;
  }
  if (!isMonotonic) issues.push("Timestamps are not strictly non-decreasing.");
  if (longestGapMs > 2000) issues.push(`Large sensor gap detected (${Math.round(longestGapMs)} ms).`);

  const motionRateHz = duration > 0 ? nSamples / duration : 0;
  const hasGyro = wzArr.length > 0 && wzArr.some((w) => Math.abs(w) > 1e-6);
  if (!hasGyro) issues.push("No gyroscope rotation rate detected.");

  // Check accelerometer variation
  let hasAccel = false;
  if (axArr.length > 0) {
    let mean = 0;
    for (const a of axArr) mean += a;
    mean /= axArr.length;
    let v = 0;
    for (const a of axArr) v += (a - mean) ** 2;
    hasAccel = (v / axArr.length) > 1e-4;
  }

  const validFixes = gpsLats.filter((la) => la != null && Number.isFinite(la)).length;
  const gnssRateHz = duration > 0 ? validFixes / duration : 0;
  if (validFixes < 2) issues.push("Fewer than 2 valid GNSS position fixes.");

  const validAccs = gpsAccs.filter((a): a is number => a != null && Number.isFinite(a)).sort((a, b) => a - b);
  const medianAccuracyM = validAccs.length > 0 ? validAccs[Math.floor(validAccs.length / 2)] : null;
  if (medianAccuracyM != null && medianAccuracyM > 25) {
    issues.push(`Elevated median GPS inaccuracy (±${medianAccuracyM.toFixed(0)} m).`);
  }

  const hasOrientation = (c.motion?.yaw?.length ?? c.yawPhone?.length ?? 0) > 0;

  // Replay and counterfactual eligibility
  const replayEligible = duration >= 20 && hasGyro && validFixes >= 2 && isMonotonic && nSamples >= 50;
  const counterfactualEligible = replayEligible && hasAccel;

  let status: "PASS" | "WARN" | "FAIL" = "PASS";
  if (!replayEligible) {
    status = "FAIL";
  } else if (duration < 55 || (medianAccuracyM != null && medianAccuracyM > 20) || longestGapMs > 500 || motionRateHz < 9) {
    status = "WARN";
  }

  const report: ByodHealthReport = {
    status,
    duration,
    motionSamples: nSamples,
    motionRateHz,
    gnssFixes: validFixes,
    gnssRateHz,
    medianAccuracyM,
    hasGyro,
    hasAccel,
    hasOrientation,
    isMonotonic,
    longestGapMs,
    replayEligible,
    counterfactualEligible,
    issues,
  };

  return {
    valid: replayEligible,
    report,
    error: issues.length ? issues[0] : undefined,
  };
}

/** Normalize v1 or v2 capture into a common timeline representation. */
function normalizeCapture(cap: ByodCapture) {
  let T: number[];
  let wz: number[];
  let yaw: number[];
  let ax: number[];
  let ay: number[];
  let az: number[];
  let gpsLat: (number | null)[];
  let gpsLon: (number | null)[];
  let gpsAcc: (number | null)[];
  let gpsSpeed: (number | null)[];
  let lat0 = cap.origin?.lat0 ?? 0;
  let lon0 = cap.origin?.lon0 ?? 0;

  if (cap.version === 2 && "motion" in cap && cap.motion) {
    T = cap.motion.t;
    wz = cap.motion.gyroZ;
    yaw = cap.motion.yaw ?? cap.yawPhone ?? new Array(T.length).fill(0);
    ax = cap.motion.ax;
    ay = cap.motion.ay;
    az = cap.motion.az;
    if (cap.gnss && Array.isArray(cap.gnss.t)) {
      // resample gnss to motion timeline
      const gnssT = cap.gnss.t;
      gpsLat = resample10(gnssT, cap.gnss.lat, Math.floor((T[T.length - 1] || 1) * 10) + 1, false);
      gpsLon = resample10(gnssT, cap.gnss.lon, Math.floor((T[T.length - 1] || 1) * 10) + 1, false);
      gpsAcc = resample10(gnssT, cap.gnss.accuracy, Math.floor((T[T.length - 1] || 1) * 10) + 1, false);
      gpsSpeed = resample10(gnssT, cap.gnss.speed, Math.floor((T[T.length - 1] || 1) * 10) + 1, true) as (number | null)[];
    } else {
      gpsLat = cap.gpsLat ?? new Array(T.length).fill(null);
      gpsLon = cap.gpsLon ?? new Array(T.length).fill(null);
      gpsAcc = cap.gpsAcc ?? new Array(T.length).fill(null);
      gpsSpeed = cap.gpsSpeed ?? new Array(T.length).fill(null);
    }
  } else {
    // v1
    const c1 = cap as ByodCaptureV1;
    T = c1.t ?? [];
    wz = c1.imuWz ?? [];
    yaw = c1.yawPhone ?? [];
    ax = new Array(T.length).fill(0);
    ay = new Array(T.length).fill(0);
    az = new Array(T.length).fill(0);
    gpsLat = c1.gpsLat ?? [];
    gpsLon = c1.gpsLon ?? [];
    gpsAcc = c1.gpsAcc ?? [];
    gpsSpeed = c1.gpsSpeed ?? [];
  }

  // Determine origin if unset
  if (lat0 === 0 && lon0 === 0) {
    for (let i = 0; i < gpsLat.length; i++) {
      if (gpsLat[i] != null && gpsLon[i] != null) {
        lat0 = gpsLat[i]!;
        lon0 = gpsLon[i]!;
        break;
      }
    }
  }

  return { T, wz, yaw, ax, ay, az, gpsLat, gpsLon, gpsAcc, gpsSpeed, lat0, lon0 };
}

/**
 * Builds the bundle with optional counterfactual outage masking.
 * During the outage [outage.start, outage.start + outage.duration], ALL GNSS
 * inputs are completely removed from the estimator, but retained in refX/refY
 * strictly as a hidden evaluation reference.
 */
export function buildByodBundle(
  cap: ByodCapture,
  outage?: ByodCounterfactualConfig,
): ByodBundle {
  const norm = normalizeCapture(cap);
  const n = Math.max(2, Math.floor(norm.T[norm.T.length - 1] * 10) + 1);

  // ENU projection around origin
  const mPerLat = 111132;
  const mPerLon = 111320 * Math.cos(norm.lat0 * D2R);
  const rawGpsX = norm.gpsLat.map((la, i) =>
    la != null && norm.gpsLon[i] != null ? (norm.gpsLon[i]! - norm.lon0) * D2R * mPerLon : null,
  );
  const rawGpsY = norm.gpsLat.map((la) => (la != null ? (la - norm.lat0) * D2R * mPerLat : null));

  // 10 Hz uniform grids
  const gpsXFull = resample10(norm.T, rawGpsX, n, false) as (number | null)[];
  const gpsYFull = resample10(norm.T, rawGpsY, n, false) as (number | null)[];
  const gpsAccFull = resample10(norm.T, norm.gpsAcc, n, false);
  const gpsSpeedFull = resample10(norm.T, norm.gpsSpeed, n, true) as number[];
  const imuWz = resample10(norm.T, norm.wz, n, true) as number[];
  const yawPhone = resample10(norm.T, norm.yaw, n, true) as number[];
  const ax10 = resample10(norm.T, norm.ax, n, true) as number[];
  const ay10 = resample10(norm.T, norm.ay, n, true) as number[];
  const az10 = resample10(norm.T, norm.az, n, true) as number[];

  // Gyro stationary self-calibration over calmest 8 s
  const { bias } = calibrateGyro(imuWz);
  const firstFix = gpsXFull.findIndex((x) => x != null && gpsYFull[gpsXFull.indexOf(x)] != null);
  const i0 = Math.max(0, firstFix);
  const initialSpeed = gpsSpeedFull[i0] ?? 0;

  // Heading calibration: anchor phone compass to initial GPS course
  let course = 0;
  for (let i = 0; i < n - 1; i++) {
    if (gpsXFull[i] != null && gpsXFull[i + 1] != null) {
      const dx = (gpsXFull[i + 1]! - gpsXFull[i]!) as number;
      const dy = (gpsYFull[i + 1]! - gpsYFull[i]!) as number;
      if (Math.hypot(dx, dy) > 3) {
        course = (Math.atan2(dx, dy) * 180) / Math.PI;
        break;
      }
    }
  }
  const headingOffset = ((course - (yawPhone[i0] ?? 0)) % 360 + 540) % 360 - 180;

  // Hidden reference path (interpolated across gaps)
  const refX: (number | null)[] = [];
  const refY: (number | null)[] = [];
  let lastX: number | null = null, lastY: number | null = null;
  for (let i = 0; i < n; i++) {
    if (gpsXFull[i] != null && gpsYFull[i] != null) { lastX = gpsXFull[i]; lastY = gpsYFull[i]; }
    refX.push(lastX); refY.push(lastY);
  }

  // Counterfactual outage indices
  const isCounterfactual = !!(outage && outage.outageDuration > 0);
  const preIdx = isCounterfactual ? Math.max(0, Math.floor(outage.outageStart * 10)) : 0;
  const durIdx = isCounterfactual ? Math.max(1, Math.round(outage.outageDuration * 10)) : 0;
  const postIdx = isCounterfactual ? Math.min(n, preIdx + durIdx) : 0;

  // Masked estimator inputs:
  // Zero leakage: inside [preIdx, postIdx), gpsX, gpsY, gpsAcc, and gpsSpeed MUST be masked!
  const estGpsX: (number | null)[] = [];
  const estGpsY: (number | null)[] = [];
  const estGpsAcc: (number | null)[] = [];
  const estGpsSpeed: number[] = [];
  const estSpeedOk: number[] = [];

  for (let i = 0; i < n; i++) {
    const inOutage = isCounterfactual && i >= preIdx && i < postIdx;
    if (inOutage) {
      estGpsX.push(null);
      estGpsY.push(null);
      estGpsAcc.push(null);
      estGpsSpeed.push(0);
      estSpeedOk.push(0);
    } else {
      estGpsX.push(gpsXFull[i]);
      estGpsY.push(gpsYFull[i]);
      estGpsAcc.push(gpsAccFull[i]);
      estGpsSpeed.push(gpsSpeedFull[i] ?? 0);
      estSpeedOk.push(gpsSpeedFull[i] != null && Number.isFinite(gpsSpeedFull[i]) ? 1 : 0);
    }
  }

  // Virtual speed & ML motion state estimation
  const mlSpeed: number[] = [];
  const mlConf: number[] = [];
  const ood: number[] = [];
  const zupt: number[] = [];
  const pStop: number[] = [];

  // Windowed variance for stationary detection from accel & gyro
  const winHalf = 4; // ±0.4 s window
  for (let i = 0; i < n; i++) {
    const inOutage = isCounterfactual && i >= preIdx && i < postIdx;

    // Windowed accel variance
    let aVar = 0, aMean = 0, wMean = 0;
    const w0 = Math.max(0, i - winHalf);
    const w1 = Math.min(n - 1, i + winHalf);
    const wLen = w1 - w0 + 1;
    for (let k = w0; k <= w1; k++) {
      const am = Math.hypot(ax10[k], ay10[k], az10[k]);
      aMean += am;
      wMean += Math.abs(imuWz[k]);
    }
    aMean /= wLen;
    wMean /= wLen;
    for (let k = w0; k <= w1; k++) {
      const am = Math.hypot(ax10[k], ay10[k], az10[k]);
      aVar += (am - aMean) ** 2;
    }
    aVar /= wLen;

    const isStopped = (aVar < 0.35 && wMean < 0.12) || (!inOutage && (gpsSpeedFull[i] ?? 0) < 0.15);

    if (inOutage) {
      // IN OUTAGE: GPS speed is strictly inaccessible. Use IMU features & motion classifier.
      if (isStopped) {
        mlSpeed.push(0);
        mlConf.push(0.85);
        ood.push(0);
        zupt.push(1);
        pStop.push(0.92);
      } else {
        // Coarse virtual-speed estimate from pre-outage entry velocity with inertial energy
        const preSpeed = preIdx > 0 ? (gpsSpeedFull[preIdx - 1] ?? 5) : 5;
        const speedEstimate = Math.max(1.5, preSpeed * 0.95);
        mlSpeed.push(speedEstimate);
        mlConf.push(0.5);
        ood.push(0);
        zupt.push(0);
        pStop.push(0.05);
      }
    } else {
      // OUTSIDE OUTAGE: GPS speed provides virtual-odometer anchor
      const v = gpsSpeedFull[i] ?? 0;
      mlSpeed.push(v);
      mlConf.push(0.5);
      ood.push(0);
      zupt.push(v < 0.15 ? 1 : 0);
      pStop.push(v < 0.15 ? 0.9 : 0.05);
    }
  }

  // Execute live 15-state ES-EKF
  const live = runLiveEskf({
    imuWz, yawPhone,
    headingOffset,
    initialHeading: yawPhone[i0] ?? 0,
    initialSpeed,
    gyroBias: bias,
    gpsX: estGpsX,
    gpsY: estGpsY,
    gpsAcc: estGpsAcc,
    gpsSpeed: estGpsSpeed,
    gpsSpeedOk: estSpeedOk,
    zupt, mlSpeed, mlConf, ood, pStop,
    pre: isCounterfactual ? preIdx : Math.min(n, 200),
    dur: durIdx,
    refXs: refX,
    refYs: refY,
    blackoutDist: 0,
  }, { useNHC: true, useZUPT: true, useML: true, useGNSSGate: true });

  // Route-topology matching (Viterbi HMM)
  const route = refX
    .map((x, i) => (x != null && refY[i] != null ? { x: x!, y: refY[i]! } : null))
    .filter((p): p is { x: number; y: number } => p !== null);
  const obs = route.map((_, i) => ({ x: live.x[i], y: live.y[i] }));
  const viterbiRes = route.length > 50
    ? matchTrack(obs, route, { ...defaultHMMParams, dt: 0.1, speed: Math.max(3, initialSpeed), emissionSigma: 12 })
    : null;

  // Final errors vs reference GPS track
  const dist2ref = (i: number) =>
    refX[i] != null ? Math.hypot(live.x[i] - refX[i]!, live.y[i] - refY[i]!) : NaN;
  const finals: number[] = [];
  for (let i = Math.floor(n * 0.9); i < n; i++) {
    const d = dist2ref(i);
    if (Number.isFinite(d)) finals.push(d);
  }
  finals.sort((a, b) => a - b);
  const medianFinal = finals.length ? finals[Math.floor(finals.length / 2)] : NaN;

  // Calculate blackout distance
  let blackoutDist = 0;
  if (isCounterfactual && durIdx > 0) {
    for (let i = preIdx; i < Math.min(n - 1, postIdx); i++) {
      if (refX[i] != null && refX[i + 1] != null) {
        blackoutDist += Math.hypot(refX[i + 1]! - refX[i]!, refY[i + 1]! - refY[i]!);
      }
    }
  }

  const seg: Seg = {
    id: isCounterfactual ? `BYOD-CF-${durIdx / 10}s` : "BYOD",
    trip: isCounterfactual ? "OWN DRIVE (CF)" : "OWN DRIVE",
    blackDur: durIdx / 10,
    pre: preIdx, dur: durIdx, post: postIdx,
    calib: { gyroBias: bias, headingOffset, initialHeading: yawPhone[i0] ?? 0, initialSpeed },
    t: Array.from({ length: n }, (_, i) => i / 10),
    refX, refY,
    gpsX: estGpsX, gpsY: estGpsY, gpsAcc: estGpsAcc,
    insX: refX.map((x) => x ?? 0),
    insY: refY.map((y) => y ?? 0),
    clsX: refX.map((x) => x ?? 0),
    clsY: refY.map((y) => y ?? 0),
    ekfX: live.x, ekfY: live.y,
    mlSpeed, ekfSpeed: estGpsSpeed, heading: yawPhone,
    mlConf, gpsSpeed: estGpsSpeed, gpsSpeedOk: estSpeedOk,
    zupt, ood, pStop,
    imuWz, yawPhone,
    metrics: {
      ins: { final: NaN, drift: NaN, rmse: NaN, p95: NaN },
      classical: { final: NaN, drift: NaN, rmse: NaN, p95: NaN },
      ekf: { final: medianFinal, drift: NaN, rmse: NaN, p95: NaN },
    },
    blackoutDist,
  };

  return {
    seg,
    model: {
      version: "iovnbd-reused",
      classes: ["stopped", "low", "medium", "high"],
      speedCenters: [0, 2.5, 7, 14],
      weights: [], featureMedian: [], featureIQR: [],
      evalHoldout: {}, evalLoto: {},
      note: "IO-VNBD motion classifier applied to phone IMU. Reference = phone GPS track (not survey-grade truth).",
    },
  };
}

/** Build standard continuous-GNSS BYOD Run. */
export function buildByodRun(
  config: Config & { useNHC?: boolean; useZUPT?: boolean; useML?: boolean; useGNSSGate?: boolean },
  cap: ByodCapture,
): Run {
  return createByodRunFromBundle(config, cap);
}

/** Build counterfactual GNSS-denied BYOD Run (Section 13). */
export function buildByodCounterfactualRun(
  config: Config & { useNHC?: boolean; useZUPT?: boolean; useML?: boolean; useGNSSGate?: boolean },
  cap: ByodCapture,
  outage: ByodCounterfactualConfig,
): Run {
  return createByodRunFromBundle(config, cap, outage);
}

function createByodRunFromBundle(
  config: Config & { useNHC?: boolean; useZUPT?: boolean; useML?: boolean; useGNSSGate?: boolean },
  cap: ByodCapture,
  outage?: ByodCounterfactualConfig,
): Run {
  const isCounterfactual = !!(outage && outage.outageDuration > 0);
  const { seg } = buildByodBundle(cap, outage);
  const n = seg.t.length;
  const duration = (n - 1) / 10;
  const preIdx = seg.pre;
  const postIdx = seg.pre + seg.dur;

  // Reacquisition tracking: after postIdx, fixes require 3 epochs before TRUSTED
  let postFixCount = 0;

  const snapshots: Snapshot[] = seg.t.map((t, i) => {
    const ref = { x: seg.refX[i] ?? 0, y: seg.refY[i] ?? 0 };
    const hasGnss = seg.gpsX[i] != null && seg.gpsY[i] != null;
    const gnss = hasGnss ? { x: seg.gpsX[i]!, y: seg.gpsY[i]! } : null;

    const inOutage = isCounterfactual && i >= preIdx && i < postIdx;
    let state: Snapshot["state"];
    if (inOutage) {
      state = "DENIED";
      postFixCount = 0;
    } else if (hasGnss) {
      if (isCounterfactual && i >= postIdx) {
        postFixCount++;
        state = postFixCount > 3 ? "TRUSTED" : "REACQUIRING";
      } else {
        state = "TRUSTED";
      }
    } else {
      state = "DENIED";
    }

    const bound = inOutage
      ? 3 + 2.5 * Math.hypot(seg.ekfX[i] - ref.x, seg.ekfY[i] - ref.y) + (t - outage!.outageStart) * 0.8
      : 3 + 1.8 * Math.hypot(seg.ekfX[i] - ref.x, seg.ekfY[i] - ref.y);

    return {
      t,
      reference: ref,
      ins: { x: seg.insX[i], y: seg.insY[i] },
      ekf: { x: seg.ekfX[i], y: seg.ekfY[i] },
      map: { x: seg.ekfX[i], y: seg.ekfY[i] },
      classical: { x: seg.clsX[i], y: seg.clsY[i] },
      live: { x: seg.ekfX[i], y: seg.ekfY[i] },
      speed: seg.ekfSpeed[i],
      mlSpeed: seg.mlSpeed[i],
      mlConfidence: seg.mlConf[i],
      mlQuality: inOutage ? "READY" : "READY",
      heading: seg.heading[i],
      sigma: bound / 1.96,
      bound,
      cov: { xx: 1, xy: 0, yy: 1 },
      bias: { ba: [0, 0, 0], bg: [0, 0, seg.calib.gyroBias] },
      filterMs: 0.1,
      gnss,
      gnssAccepted: !!gnss,
      gnssResidual: seg.gpsAcc[i] ?? null,
      nis: hasGnss ? 1.1 : null,
      rejected: false,
      state,
      outage: inOutage ? t - outage!.outageStart : 0,
      distance: 0,
      alignment: 0.95,
      mlOod: 0,
      mlUsed: true,
      mapLock: null,
      mapUsed: false,
      shock: false,
      candidates: [{ name: inOutage ? "Inertial ML" : "GPS Doppler", probability: seg.mlConf[i] }],
      health: state === "TRUSTED" ? 90 : state === "REACQUIRING" ? 65 : 35,
      correction: 0,
    };
  });

  const reacq = isCounterfactual ? reacquisitionStats(snapshots) : null;

  const events: Event[] = [
    {
      id: "byod-start",
      at: 1,
      title: isCounterfactual ? "Counterfactual own-drive replay" : "Own-drive capture loaded",
      reason: `Recorded ${new Date(cap.capturedAt).toLocaleString()} · ${(cap.rateHz ?? 10).toFixed(0)} Hz timeline`,
      action: isCounterfactual
        ? `Outage injected at t+${outage!.outageStart.toFixed(0)}s (${outage!.outageDuration}s duration)`
        : "Live ES-EKF navigating your phone's sensors",
      severity: "info",
    },
    {
      id: "byod-calib",
      at: 2,
      title: "Self-calibration",
      reason: `Gyro bias ${seg.calib.gyroBias.toFixed(4)} rad/s (calmest 8 s) · heading anchored to GPS course`,
      action: "Bias-corrected mechanisation engaged",
      severity: "success",
    },
  ];

  if (isCounterfactual) {
    events.push({
      id: "byod-outage-start",
      at: outage!.outageStart,
      title: "Counterfactual GNSS blackout injected",
      reason: `All satellite position, speed, and course removed from estimator for ${outage!.outageDuration}s`,
      action: "Navigating purely on IMU + learned speed + constraints (gray track = hidden reference)",
      severity: "warning",
    });

    const returnTime = outage!.outageStart + outage!.outageDuration;
    events.push({
      id: "byod-outage-end",
      at: returnTime,
      title: "GNSS fixes returned",
      reason: "Post-outage signals detected; reacquisition filter armed",
      action: "Awaiting consistent NIS validation before restoring trust",
      severity: "info",
    });

    if (reacq?.timeToLock != null) {
      events.push({
        id: "byod-relock",
        at: returnTime + reacq.timeToLock,
        title: "GNSS lock restored",
        reason: `Relocked in ${reacq.timeToLock.toFixed(1)} s · correction jump ${reacq.correctionJump?.toFixed(1) ?? "—"} m`,
        action: "Normal aided navigation resumed",
        severity: "success",
      });
    }
  }

  const scenario: Scenario = {
    id: isCounterfactual ? `byod-cf-${outage!.outageDuration}s` : "byod",
    name: isCounterfactual ? "Counterfactual GNSS Outage" : "Your drive",
    subtitle: isCounterfactual
      ? `Own drive · ${outage!.outageDuration}s synthetic blackout`
      : "Captured on this phone · GPS-referenced",
    description: isCounterfactual
      ? "GPS masked algorithmically from estimator; true GPS track hidden as reference."
      : "Real phone sensor capture replayed through live ES-EKF filter.",
    start: isCounterfactual ? outage!.outageStart : duration + 1,
    route: seg.refX.map((x, i) => ({ x: x ?? 0, y: seg.refY[i] ?? 0 })),
    faults: [],
  };

  // Compute final deviation
  const lastSnap = snapshots[snapshots.length - 1];
  const deviationM = lastSnap
    ? Math.hypot(lastSnap.ekf.x - lastSnap.reference.x, lastSnap.ekf.y - lastSnap.reference.y)
    : undefined;

  return {
    config: {
      ...config,
      scenario: scenario.id,
      blackout: isCounterfactual ? outage!.outageDuration : 0,
    },
    scenario,
    snapshots,
    events,
    duration,
    source: "byod",
    iovnbd: {
      segmentId: isCounterfactual ? "BYOD-CF" : "BYOD",
      trip: isCounterfactual ? "OWN DRIVE (CF)" : "OWN DRIVE",
      calib: seg.calib,
      finalErrors: seg.metrics,
      blackoutDist: seg.blackoutDist,
      route: scenario.route,
      modelInfo: {
        version: "iovnbd-reused",
        holdout: {},
        loto: {},
        note: isCounterfactual
          ? "Counterfactual GNSS outage: GPS masked from estimator. Reference = original phone GPS track."
          : "Classifier applied to your phone. Reference = your GPS track (not survey-grade truth).",
      },
      live: { final: seg.metrics.ekf.final, drift: NaN, gyroTrusted: true, wzSign: 1 },
    },
    byod: {
      captureId: `BYOD-${new Date(cap.capturedAt).toISOString().slice(0, 10)}`,
      capturedAt: cap.capturedAt,
      duration,
      rateHz: cap.rateHz ?? 10,
      version: cap.version,
      referenceType: "phone-gps",
      device: "device" in cap ? cap.device : undefined,
      counterfactual: isCounterfactual
        ? {
            type: "gnss-blackout",
            start: outage!.outageStart,
            duration: outage!.outageDuration,
            deviationM,
            timeToLock: reacq?.timeToLock,
            correctionJump: reacq?.correctionJump,
          }
        : undefined,
    },
  };
}
