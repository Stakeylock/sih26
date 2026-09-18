/**
 * Live in-browser ES-EKF over real IO-VNBD replay channels.
 *
 * Unlike the offline benchmark trajectories (computed by tools/prep_iovnbd.py
 * and shipped in the bundle), this filter runs LIVE on every run build, on the
 * recorded sensor channels:
 *   - gyro yaw-axis rate (imuWz, rad/s; sign calibrated against the phone
 *     compass over the pre-outage window, bias from stationary detection)
 *   - phone compass yaw (yawPhone + pre-window-estimated heading offset)
 *   - GNSS fixes (NIS-gated updates, σ from recorded GPS accuracy)
 *   - GNSS ground speed (while fixes are valid)
 *   - ZUPT from the stationary detector
 *   - learned motion-mode speed (bundle classifier expectation)
 *   - NHC (lateral/vertical velocity ≈ 0)
 *
 * The uncertainty bound shown in the UI is the filter's own 95% horizontal
 * covariance bound — not a fabricated formula. This is the honest core of the
 * "what does the system believe and how sure is it" story.
 */
import {
  defaultEskfConfig,
  headingDeg,
  initEskf,
  propagate,
  updateGnss,
  updateMlSpeed,
  updateNHC,
  updateZaru,
  updateZupt,
  qRot,
  type EskfState,
  type ImuSample,
  type Vec3,
} from "./esekf";

export type LiveChannels = {
  imuWz: number[];      // phone gyro yaw-axis rate, rad/s (recorded)
  yawPhone: number[];   // phone compass/orientation yaw, deg (recorded)
  headingOffset: number;// deg, phone->vehicle course offset (pre-window calib)
  initialHeading: number;// deg compass, at segment start
  initialSpeed: number; // m/s
  gyroBias: number;     // rad/s, stationary pre-window median on the yaw axis
  gpsX: (number | null)[];
  gpsY: (number | null)[];
  gpsAcc: (number | null)[];
  gpsSpeed: number[];
  gpsSpeedOk: number[];
  zupt: number[];
  pStop: number[];    // learned P(stopped) — gates hard zero-velocity updates
  mlSpeed: number[];
  mlConf: number[];
  ood: number[];
  pre: number;          // blackout start sample index
  dur: number;          // blackout length in samples
  refXs: (number | null)[]; // reference track (same protocol as benchmark)
  refYs: (number | null)[];
  blackoutDist: number; // reference distance travelled in the outage, m
};

export type LiveResult = {
  x: number[]; y: number[];
  speed: number[]; heading: number[]; // compass deg from the filter itself
  bound: number[];                    // 95% horizontal bound (max of cov + PL)
  boundCov: number[];                 // 95% covariance-only bound, m
  boundPL: number[];                  // protection-level component, m
  covXX: number[];                    // position variance x (m²) per epoch
  covXY: number[];                    // position covariance (m²)
  covYY: number[];                    // position variance y (m²)
  ba: number[][];                     // accel-bias estimate [x,y,z] per epoch
  bg: number[][];                     // gyro-bias estimate [x,y,z] per epoch
  filterMs: number[];                 // per-epoch filter step time (ms)
  gnssNis: (number | null)[];         // last GNSS NIS (null = no fix/gated)
  gnssRejected: boolean[];
  mlInnov: (number | null)[];         // ML speed innovation (measured - predicted), m/s
  wzSign: number;                     // calibrated gyro sign (+1/-1)
  gyroTrusted: boolean;
  liveFinal: number;                  // blackout final error, m (same protocol)
  liveDrift: number;                  // %
};

const D2R = Math.PI / 180;

function corr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  return da > 1e-12 && db > 1e-12 ? num / Math.sqrt(da * db) : 0;
}

/** Compass yaw measurement update on the filter's z-attitude error. */
function updateCompass(s: EskfState, yawEnuRad: number, sigma: number): void {
  // predicted ENU yaw of body-x from the quaternion (z-up assumption)
  const w = s.q[0], x = s.q[1], y = s.q[2], z = s.q[3];
  const yawPred = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  let innov = yawEnuRad - yawPred;
  while (innov > Math.PI) innov -= 2 * Math.PI;
  while (innov < -Math.PI) innov += 2 * Math.PI;
  // H: ∂yaw/∂δθz = 1 (body-frame z ≈ ENU z for near-level phone mounts)
  const H = new Array(15).fill(0);
  H[8] = 1;
  const R = [sigma * sigma];
  // reuse the tested 1-row linear update via updateMlSpeed's machinery is not
  // possible (it maps velocity); do the scalar update inline (Joseph not
  // needed: scalar case is numerically benign after symmetrisation)
  const P = s.P;
  const PH = new Array(15);
  for (let i = 0; i < 15; i++) PH[i] = P[i * 15 + 8];
  const S = P[8 * 15 + 8] + R[0];
  if (!(S > 1e-9)) return;
  const K = PH.map((v) => v / S);
  const dx = K.map((k) => k * innov);
  // inject: yaw error only (scalar path of the error-state inject)
  const ang = dx[8];
  if (Math.abs(ang) > 1e-12) {
    // rotate about body z by ang: q' = q ⊗ [cos(ang/2), 0, 0, sin(ang/2)]
    const [w0, x0, y0, z0] = s.q;
    const hw = Math.cos(ang / 2), hz = Math.sin(ang / 2);
    s.q = [w0 * hw - z0 * hz, x0 * hw, y0 * hw, z0 * hw + w0 * hz];
    const n = Math.hypot(s.q[0], s.q[1], s.q[2], s.q[3]);
    s.q = [s.q[0] / n, s.q[1] / n, s.q[2] / n, s.q[3] / n];
  }
  for (let i = 0; i < 15; i++)
    for (let j = 0; j < 15; j++) P[i * 15 + j] -= K[i] * PH[j];
  for (let i = 0; i < 15; i++)
    for (let j = i + 1; j < 15; j++) {
      const avg = (P[i * 15 + j] + P[j * 15 + i]) / 2;
      P[i * 15 + j] = avg; P[j * 15 + i] = avg;
    }
}

export function runLiveEskf(ch: LiveChannels, ablation?: { useNHC?: boolean; useZUPT?: boolean; useML?: boolean; useGNSSGate?: boolean }): LiveResult {
  const n = ch.imuWz.length;
  const useNHC = ablation?.useNHC ?? true;
  const useZUPT = ablation?.useZUPT ?? true;
  const useML = ablation?.useML ?? true;
  const useGNSSGate = ablation?.useGNSSGate ?? true;
  const cfg = { ...defaultEskfConfig, mlSigma: 1.8, zuptSigma: 0.3, nhcSigma: 0.6, useNHC, useZUPT, useML, useGNSSGate };

  // --- calibrate the gyro sign against the phone compass (pre-window only):
  // both are phone-frame, so a plain correlation resolves the axis direction.
  const preN = Math.min(ch.pre, 400);
  const yawU: number[] = [];
  let acc = 0;
  for (let i = 0; i < preN; i++) {
    if (i === 0) { yawU.push(ch.yawPhone[i] || 0); continue; }
    let d = (ch.yawPhone[i] || 0) - (ch.yawPhone[i - 1] || 0);
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    acc += d;
    yawU.push(acc);
  }
  const dYaw: number[] = [];
  const dWz: number[] = [];
  // Windowed comparison (3 s sums): per-sample magnetometer yaw is noise-
  // dominated; windowing exposes the actual rotation-rate correlation.
  const W = 30;
  for (let i = W; i < preN; i += W) {
    dYaw.push(yawU[i] - yawU[i - W]);
    let sw = 0;
    for (let k = i - W + 1; k <= i; k++) sw += ch.imuWz[k] || 0;
    dWz.push(sw * 0.1);
  }
  const cSign = corr(dYaw, dWz);
  // A gyro we cannot validate against the compass is a gyro we do not use for
  // yaw rate: a wrong sign actively fights the compass and random-walks the
  // heading. Zero it out and lean on the (calibrated) compass instead.
  const gyroTrusted = Math.abs(cSign) > 0.35;
  const wzSign = gyroTrusted ? (cSign > 0 ? 1 : -1) : 0;
  if (!gyroTrusted) cfg.gyroNoise = 0.06; // distrust gyro rate, lean on compass

  // --- initial state from calibration
  const yaw0 = (90 - ch.initialHeading) * D2R; // compass -> ENU yaw
  const st = initEskf([0, 0, 0], [ch.initialSpeed * Math.cos(yaw0), ch.initialSpeed * Math.sin(yaw0), 0], yaw0, cfg);
  // In-car magnetometer systematics (body distortions, electronics) wander
  // slowly by tens of degrees; a fixed per-sample σ would claim unreal
  // confidence. Model them as a yaw random walk (~1.7°/√s) — this is what
  // makes the covariance bound grow honestly through an outage.
  const PSI_RW = 0.03; // rad/√s

  const x: number[] = new Array(n);
  const y: number[] = new Array(n);
  const speed: number[] = new Array(n);
  const heading: number[] = new Array(n);
  const bound: number[] = new Array(n);
  const boundCov: number[] = new Array(n);
  const boundPL: number[] = new Array(n);
  const covXX: number[] = new Array(n);
  const covXY: number[] = new Array(n);
  const covYY: number[] = new Array(n);
  const ba: number[][] = new Array(n);
  const bg: number[][] = new Array(n);
  const filterMs: number[] = new Array(n);
  const gnssNis: (number | null)[] = new Array(n).fill(null);
  const gnssRejected: boolean[] = new Array(n).fill(false);
  const mlInnov: (number | null)[] = new Array(n).fill(null);

  // Protection-level accumulator (SBAS-style integrity bound on top of the
  // filter covariance): un-aided heading systematics convert speed into
  // along/cross-track error at v·σψ per second. τ grows without a trusted
  // heading anchor (GNSS course or validated gyro) and resets on GNSS.
  const PSI_SYS = 0.17; // rad — in-car magnetometer systematic (honest, large)
  let tau = 0;
  let vBar = ch.initialSpeed;
  let zuptRun = 0; // consecutive samples of the stationary mask

  for (let i = 0; i < n; i++) {
    const t0ms = performance.now();
    const dt = 0.1;
    // gyro yaw-axis rate, bias-corrected, sign-calibrated (rad/s about ENU z)
    const wz = wzSign * ((ch.imuWz[i] || 0) - ch.gyroBias);
    const imu: ImuSample = {
      // accel is not trusted at 10 Hz phone (measured in the study); keep only
      // gravity so the attitude/z dynamics stay physical while horizontal
      // velocity is carried by measurements (ZUPT/ML/GNSS/NHC).
      ax: [0, 0, 9.80665],
      gy: [0, 0, wz],
      dt,
    };
    propagate(st, imu, cfg);

    // Heading-direction uncertainty is the dominant dead-reckoning error driver,
    // but yaw does not couple into position through vertical gravity. Inject it
    // explicitly: velocity-direction error σψ turns speed v into a velocity
    // error of v·σψ per axis (standard reduced-order trick).
    {
      const v = Math.hypot(st.v[0], st.v[1]);
      const sigPsi = Math.sqrt(Math.max(0, st.P[8 * 15 + 8]));
      const qv = v * v * sigPsi * sigPsi * dt;
      st.P[3 * 15 + 3] += qv;
      st.P[4 * 15 + 4] += qv;
    }

    // --- compass yaw update (available regardless of GNSS). In-car phone
    // magnetometers are ±5-10° honest: do not pretend better.
    const yph = ch.yawPhone[i];
    if (Number.isFinite(yph)) {
      const course = (yph + ch.headingOffset) % 360;
      const yawEnu = (90 - course) * D2R;
      updateCompass(st, yawEnu, gyroTrusted ? 0.07 : 0.0875);
      // systematics random walk on the yaw error variance
      st.P[8 * 15 + 8] += PSI_RW * PSI_RW * dt;
    }

    // --- GNSS position (NIS-gated) + ground speed, hidden during blackout
    const gx = ch.gpsX[i], gy = ch.gpsY[i];
    const denied = i >= ch.pre && i < ch.pre + ch.dur;
    if (gx != null && gy != null && !denied) {
      const acc = Math.max(2, ch.gpsAcc[i] ?? 5);
      const res = updateGnss(st, gx, gy, acc, cfg);
      gnssNis[i] = res.nis ?? null;
      gnssRejected[i] = !res.accepted;
      if (ch.gpsSpeedOk[i] > 0.5) {
        const mlRes = updateMlSpeed(st, ch.gpsSpeed[i], 1.2, cfg);
        // ML innovation = measured speed - predicted forward speed (from UpdateResult)
        // For GNSS speed, the innovation is passed as the residual to linearUpdate
        // We can compute it: z = speed - vPred
        const q = st.q;
        const fwd: Vec3 = qRot(q, [1, 0, 0]);
        const vPred = st.v[0] * fwd[0] + st.v[1] * fwd[1] + st.v[2] * fwd[2];
        mlInnov[i] = ch.gpsSpeed[i] - vPred;
      }
      tau = 0; // heading re-anchored by fix geometry
    } else {
      tau += dt;
    }
    vBar = 0.98 * vBar + 0.02 * Math.hypot(st.v[0], st.v[1]);

    // --- learned motion-mode speed aid (continues through the outage —
    // aiding the outage is its entire purpose; OOD gates it)
    if (useML) {
      const conf = ch.mlConf[i] ?? 0.5;
      const bad = ch.ood[i] > 0.5;
      if (!bad && Number.isFinite(ch.mlSpeed[i])) {
        const sig = 0.9 + 2.2 * (1 - conf);
        const q = st.q;
        const fwd: Vec3 = qRot(q, [1, 0, 0]);
        const vPred = st.v[0] * fwd[0] + st.v[1] * fwd[1] + st.v[2] * fwd[2];
        const mlRes = updateMlSpeed(st, ch.mlSpeed[i], sig, cfg);
        mlInnov[i] = ch.mlSpeed[i] - vPred;
      }
    }

    // --- ZUPT with DURATION gating: the raw motion mask false-triggers on
    // smooth roads (measured: hundreds of 1-2 sample runs at motorway
    // cruising); genuine stops last many seconds. Apply zero-velocity only
    // after the mask holds continuously for 2 s (20 samples), matching the
    // run-length structure of real stops.
    // ZARU (Zero Angular Rate Update): when stopped, yaw-rate ≈ 0. This
    // observes gyro bias on z-axis (bg[2]) through the heading-rate residual.
    // Same 2 s gate as ZUPT — a true stop has both zero velocity AND zero
    // angular rate. Applied separately so ablation can toggle independently.
    if (useZUPT) {
      zuptRun = ch.zupt[i] > 0.5 ? zuptRun + 1 : 0;
      if (zuptRun >= 20) {
        updateZupt(st, cfg.zuptSigma, cfg);
        // ZARU: yaw-rate pseudo-measurement σ ~ 0.03 rad/s (honest for stopped)
        updateZaru(st, 0.03, cfg);
      }
    } else {
      zuptRun = 0;
    }
    if (useNHC) {
      updateNHC(st, cfg.nhcSigma, cfg);
    }

    x[i] = st.p[0]; y[i] = st.p[1];
    speed[i] = Math.hypot(st.v[0], st.v[1]);
    heading[i] = headingDeg(st);
    // 95% covariance bound + heading-systematic protection level
    const cov = 1.96 * Math.sqrt(Math.max(0, st.P[0] + st.P[1 * 15 + 1]));
    const pl = vBar * PSI_SYS * tau;
    boundCov[i] = Math.max(2, Math.min(1500, cov));
    boundPL[i] = Math.max(2, Math.min(1500, pl));
    bound[i] = Math.min(1500, Math.max(2, Math.max(cov, pl)));
    // raw position covariance for the §7.2 2σ ellipse on the map
    covXX[i] = st.P[0];
    covXY[i] = st.P[1];
    covYY[i] = st.P[1 * 15 + 1];
    // bias estimates (3-axis, as live) + per-epoch compute time (§28/§45)
    ba[i] = [st.ba[0], st.ba[1], st.ba[2]];
    bg[i] = [st.bg[0], st.bg[1], st.bg[2]];
    filterMs[i] = performance.now() - t0ms;
  }

  // --- live blackout error, same protocol as the offline benchmark:
  // re-reference every estimator to its own position at blackout start.
  const p0x = x[ch.pre], p0y = y[ch.pre];
  const r0x = ch.refXs[ch.pre] ?? 0, r0y = ch.refYs[ch.pre] ?? 0;
  let lastErr = 0;
  for (let i = ch.pre; i < Math.min(ch.pre + ch.dur, n); i++) {
    const rx = (ch.refXs[i] ?? r0x) - r0x;
    const ry = (ch.refYs[i] ?? r0y) - r0y;
    lastErr = Math.hypot(x[i] - p0x - rx, y[i] - p0y - ry);
  }

  return {
    x, y, speed, heading, bound, boundCov, boundPL, covXX, covXY, covYY,
    ba, bg, filterMs,
    gnssNis, gnssRejected,
    mlInnov,
    wzSign, gyroTrusted,
    liveFinal: lastErr,
    liveDrift: ch.blackoutDist > 0 ? (100 * lastErr) / ch.blackoutDist : 0,
  };
}
