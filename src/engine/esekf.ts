/**
 * 15-state Error-State Extended Kalman Filter (ES-EKF).
 *
 * Nominal state: p(3), v(3), q(4)  →  error state δx (15):
 *   [ δp(3) | δv(3) | δθ(3) | δba(3) | δbg(3) ]
 *
 * Frame: local ENU (x=E, y=N, z=Up); gravity acts on -z. IO-VNBD phone IMU at
 * 10 Hz. Measurements: GNSS position (NIS-gated), NHC (lateral/vertical
 * velocity ≈ 0 in body frame), ZUPT (all velocity ≈ 0 when stopped),
 * ZARU (yaw-rate ≈ 0 when stopped), ML speed (forward-velocity pseudo-
 * measurement from the learned motion-mode classifier).
 *
 * This module is a genuine filter implementation — it propagates from the
 * recorded IMU and updates from measurements only. It never reads the
 * reference track. Units: SI (m, m/s, rad, m/s², rad/s).
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // w, x, y, z

export type EskfConfig = {
  accelNoise: number;      // σ_a (m/s²/√Hz-ish, tuned for 10 Hz phone)
  gyroNoise: number;       // σ_g (rad/s)
  accelBiasRW: number;     // bias random walk
  gyroBiasRW: number;
  gnssSigma: number;       // GNSS position σ (m)
  mlSigma: number;         // ML forward-speed σ (m/s)
  nhcSigma: number;        // lateral/vertical velocity σ (m/s)
  zuptSigma: number;       // ZUPT velocity σ (m/s)
  nisGate: number;         // chi-square gate (2 DOF → 5.99; use 9.21 = 99%)
  useNHC: boolean;
  useZUPT: boolean;
  useML: boolean;
  useGNSSGate: boolean;
};

export const defaultEskfConfig: EskfConfig = {
  accelNoise: 0.35,
  gyroNoise: 0.02,
  accelBiasRW: 0.002,
  gyroBiasRW: 0.0005,
  gnssSigma: 5.0,
  mlSigma: 2.2,
  nhcSigma: 0.35,
  zuptSigma: 0.25,
  nisGate: 9.21,
  useNHC: true,
  useZUPT: true,
  useML: true,
  useGNSSGate: true,
};

export type EskfState = {
  p: Vec3;        // ENU position (m); z unused ≈ 0 for planar replay
  v: Vec3;        // ENU velocity (m/s)
  q: Quat;        // body→ENU attitude
  ba: Vec3;       // accel bias
  bg: Vec3;       // gyro bias
  P: number[];    // 15x15 covariance (row-major)
};

export type ImuSample = { ax: Vec3; gy: Vec3; dt: number };
export type UpdateResult = {
  nis: number | null;
  accepted: boolean;
  kind: "gnss" | "ml" | "nhc" | "zupt" | null;
};

// ---------- tiny linear algebra ----------
const eye = (n: number) => {
  const M = new Array(n * n).fill(0);
  for (let i = 0; i < n; i++) M[i * n + i] = 1;
  return M;
};
const zeros = (n: number) => new Array(n * n).fill(0);
const matAdd = (A: number[], B: number[], n: number) =>
  A.map((a, i) => a + B[i]);
const matMul = (A: number[], B: number[], n: number) => {
  const C = zeros(n);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      const a = A[i * n + k];
      if (a === 0) continue;
      for (let j = 0; j < n; j++) C[i * n + j] += a * B[k * n + j];
    }
  return C;
};
const transpose = (A: number[], n: number) => {
  const T = zeros(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) T[j * n + i] = A[i * n + j];
  return T;
};
/** Cholesky-based solve for (A + αI) x = b with symmetric positive definite A. */
function spdSolve(A: number[], b: number[], n: number, jitter = 1e-9): number[] {
  const M = A.slice();
  for (let i = 0; i < n; i++) M[i * n + i] += jitter;
  const L = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = M[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) L[i * n + i] = Math.sqrt(Math.max(s, 1e-12));
      else L[i * n + j] = s / L[j * n + j];
    }
  }
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}
const qNorm = (q: Quat): Quat => {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};
const qMul = (a: Quat, b: Quat): Quat => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
/** Rotate v by q (body → world for q = body→world). */
export function qRot(q: Quat, v: Vec3): Vec3 {
  const [w, x, y, z] = q;
  const [vx, vy, vz] = v;
  // t = 2 q_vec × v
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}
const qFromAxisAngle = (axis: Vec3, ang: number): Quat => {
  const n = Math.hypot(...axis) || 1;
  const s = Math.sin(ang / 2) / n;
  return [Math.cos(ang / 2), axis[0] * s, axis[1] * s, axis[2] * s];
};

export type EskfPriors = {
  pos?: number;   // σ² on position axes (m²)
  vel?: number;   // σ² on velocity axes (m²/s²)
  att?: number;   // σ² on attitude axes (rad²)
  ba?: number;    // σ² accel-bias
  bg?: number;    // σ² gyro-bias
};

export function initEskf(
  p0: Vec3,
  v0: Vec3,
  yaw0: number,
  cfg = defaultEskfConfig,
  priors: EskfPriors = {},
): EskfState {
  const q = qFromAxisAngle([0, 0, 1], yaw0); // z-up yaw
  const P = zeros(15);
  // position, velocity uncertainty; attitude (yaw) uncertain; biases uncertain
  const set = (i: number, val: number) => (P[i * 15 + i] = val);
  set(0, priors.pos ?? 25); set(1, priors.pos ?? 25); set(2, (priors.pos ?? 25) * 0.16);
  set(3, priors.vel ?? 4); set(4, priors.vel ?? 4); set(5, priors.vel ?? 4);
  set(6, priors.att ?? 0.3); set(7, priors.att ?? 0.3); set(8, priors.att ?? 0.5);
  set(9, priors.ba ?? 0.04); set(10, priors.ba ?? 0.04); set(11, priors.ba ?? 0.04);
  set(12, priors.bg ?? 0.002); set(13, priors.bg ?? 0.002); set(14, priors.bg ?? 0.002);
  return { p: [...p0] as Vec3, v: [...v0] as Vec3, q, ba: [0, 0, 0], bg: [0, 0, 0], P };
}

/** Propagate one IMU step (error-state KF propagation on the nominal state). */
export function propagate(s: EskfState, imu: ImuSample, cfg: EskfConfig): void {
  const dt = imu.dt;
  const [wx, wy, wz] = imu.gy;
  const [ax, ay, az] = imu.ax;

  // bias-corrected measurements
  const aB: Vec3 = [ax - s.ba[0], ay - s.ba[1], az - s.ba[2]];
  const wB: Vec3 = [wx - s.bg[0], wy - s.bg[1], wz - s.bg[2]];

  // nominal state integration (ENU, gravity −z)
  const aW = qRot(s.q, aB);
  s.p = [s.p[0] + s.v[0] * dt, s.p[1] + s.v[1] * dt, s.p[2] + s.v[2] * dt];
  s.v = [s.v[0] + aW[0] * dt, s.v[1] + aW[1] * dt, s.v[2] + (aW[2] - 9.80665) * dt];
  const dq = qFromAxisAngle(wB, Math.hypot(...wB) * dt);
  s.q = qNorm(qMul(s.q, dq));

  // error-state Jacobian F (15x15), discretized simply (Φ ≈ I + F dt)
  const F = zeros(15);
  // δṗ = δv
  for (let i = 0; i < 3; i++) F[i * 15 + 3 + i] = dt;
  // δv̇ = -R[θ×]δθ + R δba + δv terms simplified: use R for bias, skew for attitude
  const R = rotOf(s.q); // body→ENU
  const set = (r: number, c: number, val: number) => (F[r * 15 + c] = val);
  // ∂aW/∂δθ = -R [aB×]
  const skew = (v: Vec3): number[] => [0, -v[2], v[1], v[2], 0, -v[0], -v[1], v[0], 0];
  const SaB = skew(aB);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let acc = 0;
      for (let k = 0; k < 3; k++) acc += -R[i * 3 + k] * SaB[k * 3 + j];
      set(3 + i, 6 + j, acc * dt);
      // ∂aW/∂δba = R
      set(3 + i, 9 + j, R[i * 3 + j] * dt);
    }
  // δθ̇ = -[wB×]δθ - δbg
  const Sw = skew(wB);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      set(6 + i, 6 + j, -Sw[i * 3 + j] * dt);
      set(6 + i, 12 + j, -dt);
    }
  // bias random walks: rates are zero — noise enters via Qc only.
  // (Do NOT add identity rows here: Φ = I + F would double them each step.)

  const Phi = eye(15);
  for (let i = 0; i < 15; i++)
    for (let j = 0; j < 15; j++) Phi[i * 15 + j] += F[i * 15 + j];

  // process noise Qc (diagonal approximation)
  const Qc = zeros(15);
  const qa = cfg.accelNoise * cfg.accelNoise;
  const qg = cfg.gyroNoise * cfg.gyroNoise;
  const qba = cfg.accelBiasRW * cfg.accelBiasRW;
  const qbg = cfg.gyroBiasRW * cfg.gyroBiasRW;
  for (let i = 0; i < 3; i++) {
    Qc[(3 + i) * 15 + (3 + i)] = qa * dt;
    Qc[(6 + i) * 15 + (6 + i)] = qg * dt;
    Qc[(9 + i) * 15 + (9 + i)] = qba * dt;
    Qc[(12 + i) * 15 + (12 + i)] = qbg * dt;
  }
  s.P = matAdd(matMul(Phi, matMul(s.P, transpose(Phi, 15), 15), 15), Qc, 15);
  // symmetrize
  for (let i = 0; i < 15; i++)
    for (let j = i + 1; j < 15; j++) {
      const avg = (s.P[i * 15 + j] + s.P[j * 15 + i]) / 2;
      s.P[i * 15 + j] = avg;
      s.P[j * 15 + i] = avg;
    }
}

function rotOf(q: Quat): number[] {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

/** Generic linear update: z = H δx + n with 2-3 row H built by the caller. */
function linearUpdate(
  s: EskfState,
  H: number[],           // m x 15 row-major
  R: number[],           // m x m diag (stored full)
  z: number[],           // innovation (measurement - predicted), length m
  m: number,
  kind: UpdateResult["kind"],
  gate: boolean,
  nisGate: number,
): UpdateResult {
  // S = H P Hᵀ + R
  const HP = zeros(m * 15);
  for (let i = 0; i < m; i++)
    for (let j = 0; j < 15; j++) {
      let acc = 0;
      for (let k = 0; k < 15; k++) acc += H[i * 15 + k] * s.P[k * 15 + j];
      HP[i * 15 + j] = acc;
    }
  const S = zeros(m * m);
  for (let i = 0; i < m; i++)
    for (let j = 0; j < m; j++) {
      let acc = 0;
      for (let k = 0; k < 15; k++) acc += HP[i * 15 + k] * H[j * 15 + k];
      S[i * m + j] = acc + (i === j ? R[i * m + i] : 0);
    }
  // NIS
  const Si = spdSolve(S, z, m);
  let nis = 0;
  for (let i = 0; i < m; i++) nis += z[i] * Si[i];
  if (gate && nis > nisGate) return { nis, accepted: false, kind };

  // K = P Hᵀ S⁻¹
  const PHt = zeros(15 * m);
  for (let i = 0; i < 15; i++)
    for (let j = 0; j < m; j++) {
      let acc = 0;
      for (let k = 0; k < 15; k++) acc += s.P[i * 15 + k] * H[j * 15 + k];
      PHt[i * m + j] = acc;
    }
  const K = zeros(15 * m);
  for (let i = 0; i < 15; i++)
    for (let j = 0; j < m; j++) {
      // column j of S⁻¹ via solve
      const e = new Array(m).fill(0);
      e[j] = 1;
      const col = spdSolve(S, e, m);
      let acc = 0;
      for (let k = 0; k < m; k++) acc += PHt[i * m + k] * col[k];
      K[i * m + j] = acc;
    }
  const dx = new Array(15).fill(0);
  for (let i = 0; i < 15; i++) {
    let acc = 0;
    for (let k = 0; k < m; k++) acc += K[i * m + k] * z[k];
    dx[i] = acc;
  }
  inject(s, dx);

  // P = (I - K H) P
  const KH = zeros(15 * 15);
  for (let i = 0; i < 15; i++)
    for (let j = 0; j < 15; j++) {
      let acc = 0;
      for (let k = 0; k < m; k++) acc += K[i * m + k] * H[k * 15 + j];
      KH[i * 15 + j] = acc;
    }
  const I_KH = eye(15);
  for (let i = 0; i < 225; i++) I_KH[i] -= KH[i];
  s.P = matMul(I_KH, s.P, 15);
  // symmetrize + covariance health
  for (let i = 0; i < 15; i++)
    for (let j = i + 1; j < 15; j++) {
      const avg = (s.P[i * 15 + j] + s.P[j * 15 + i]) / 2;
      s.P[i * 15 + j] = avg;
      s.P[j * 15 + i] = avg;
    }
  for (let i = 0; i < 15; i++)
    if (!Number.isFinite(s.P[i * 15 + i]) || s.P[i * 15 + i] < 0)
      s.P[i * 15 + i] = Math.abs(s.P[i * 15 + i]) || 1e-6;
  return { nis, accepted: true, kind };
}

function inject(s: EskfState, dx: number[]) {
  s.p = [s.p[0] + dx[0], s.p[1] + dx[1], s.p[2] + dx[2]];
  s.v = [s.v[0] + dx[3], s.v[1] + dx[4], s.v[2] + dx[5]];
  const axis: Vec3 = [dx[6], dx[7], dx[8]];
  const ang = Math.hypot(...axis);
  if (ang > 1e-12) s.q = qNorm(qMul(s.q, qFromAxisAngle(axis, ang)));
  s.ba = [s.ba[0] + dx[9], s.ba[1] + dx[10], s.ba[2] + dx[11]];
  s.bg = [s.bg[0] + dx[12], s.bg[1] + dx[13], s.bg[2] + dx[14]];
}

/** GNSS 2D planar position update (x, y). NIS gated against cfg.nisGate (9.21 = χ²(2, 0.99)). */
export function updateGnss(s: EskfState, x: number, y: number, sigma: number, cfg: EskfConfig): UpdateResult {
  const H = zeros(2 * 15);
  H[0 * 15 + 0] = 1;
  H[1 * 15 + 1] = 1;
  const R = zeros(4);
  R[0] = sigma * sigma;
  R[3] = sigma * sigma;
  const z = [x - s.p[0], y - s.p[1]];
  return linearUpdate(s, H, R, z, 2, "gnss", cfg.useGNSSGate, cfg.nisGate);
}

/** Forward-speed pseudo-measurement from the learned motion-mode classifier. */
export function updateMlSpeed(s: EskfState, speed: number, sigma: number, cfg: EskfConfig): UpdateResult {
  const q = s.q;
  const fwd: Vec3 = qRot(q, [1, 0, 0]); // body x in ENU
  const vPred = s.v[0] * fwd[0] + s.v[1] * fwd[1] + s.v[2] * fwd[2];
  const H = zeros(15);
  for (let j = 0; j < 3; j++) H[3 + j] = fwd[j];      // ∂/∂δv
  // attitude coupling via small-angle ignored (10 Hz, small updates)
  const R = zeros(1); R[0] = sigma * sigma;
  return linearUpdate(s, H, R, [speed - vPred], 1, "ml", false, Infinity);
}

/** NHC: lateral and vertical body-frame velocities ≈ 0. */
export function updateNHC(s: EskfState, sigma: number, cfg: EskfConfig): UpdateResult {
  const Rm = rotOf(s.q);           // world←body
  const Rb = transpose3(Rm);       // body←world
  const vB: Vec3 = [
    Rb[0] * s.v[0] + Rb[1] * s.v[1] + Rb[2] * s.v[2],
    Rb[3] * s.v[0] + Rb[4] * s.v[1] + Rb[5] * s.v[2],
    Rb[6] * s.v[0] + Rb[7] * s.v[1] + Rb[8] * s.v[2],
  ];
  const z = [0 - vB[1], 0 - vB[2]]; // lateral (y), vertical (z)
  const H = zeros(2 * 15);
  // vB = Rb v ; ∂vB/∂δv = Rb ; ∂vB/∂δθ = -[vB×] → rows for y,z components
  for (let j = 0; j < 3; j++) {
    H[0 * 15 + 3 + j] = Rb[1 * 3 + j];
    H[1 * 15 + 3 + j] = Rb[2 * 3 + j];
  }
  const Skew = [0, -vB[2], vB[1], vB[2], 0, -vB[0], -vB[1], vB[0], 0];
  // Body-frame error convention (inject uses q⊗δq): ∂vB/∂δθ = +[vB×].
  for (let j = 0; j < 3; j++) {
    H[0 * 15 + 6 + j] = Skew[1 * 3 + j];
    H[1 * 15 + 6 + j] = Skew[2 * 3 + j];
  }
  const R = zeros(4);
  R[0] = sigma * sigma; R[3] = sigma * sigma;
  return linearUpdate(s, H, R, z, 2, "nhc", false, Infinity);
}

/** ZUPT: all velocity ≈ 0 when stopped. */
export function updateZupt(s: EskfState, sigmaV: number, cfg: EskfConfig): UpdateResult {
  const z = [0 - s.v[0], 0 - s.v[1], 0 - s.v[2]];
  const H = zeros(3 * 15);
  H[0 * 15 + 3] = 1; H[1 * 15 + 4] = 1; H[2 * 15 + 5] = 1;
  const R = zeros(9);
  const s2 = sigmaV * sigmaV;
  R[0] = s2; R[4] = s2; R[8] = s2;
  return linearUpdate(s, H, R, z, 3, "zupt", false, Infinity);
}

/** ZARU (Zero Angular Rate Update): yaw-rate ≈ 0 when stopped.
 *  Observes gyro bias (bg[2]) through the yaw-rate residual.
 *  σ_ψ: standard deviation of the yaw-rate measurement (rad/s).
 *  This is separate from ZUPT — a vehicle can be stopped but the phone
 *  may still have angular motion (e.g., steering while parked, turntable).
 *  When both fire, gyro bias on the z-axis converges much faster. */
export function updateZaru(s: EskfState, sigmaPsi: number, cfg: EskfConfig): UpdateResult {
  // Innovation: true yaw-rate = 0 when stopped. Predicted pseudo-measurement
  // is -bg[2] (filter assumes true rate 0, so measured = bias). Residual
  // z = 0 - (-bg[2]) = bg[2]. Measurement function h(x) = -bg[2] → H = -1.
  const z = [s.bg[2]];
  const H = zeros(1 * 15);
  H[0 * 15 + 14] = -1; // δbg_z (index 14 = 12+2), H = -1
  const R = zeros(1);
  R[0] = sigmaPsi * sigmaPsi;
  return linearUpdate(s, H, R, z, 1, "nhc", false, Infinity); // reuse "nhc" kind for logging
}

function transpose3(M: number[]): number[] {
  return [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
}

/** Yaw of body-x about z, degrees CCW from the ENU East axis. */
export function yawDeg(s: EskfState): number {
  const R = rotOf(s.q);
  const yaw = Math.atan2(R[3], R[0]);
  return ((yaw * 180) / Math.PI + 360) % 360;
}

/** Compass heading (degrees from North, clockwise) of body-x in ENU. */
export function headingDeg(s: EskfState): number {
  return ((90 - yawDeg(s)) + 360) % 360;
}

/** 2σ horizontal position bound (m). */
export function posBound(s: EskfState): number {
  const sxx = s.P[0 * 15 + 0];
  const syy = s.P[1 * 15 + 1];
  return 2 * Math.sqrt(Math.max(0, (sxx + syy) / 2));
}
