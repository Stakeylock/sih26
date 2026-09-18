import { describe, it, expect } from "vitest";
import {
  initEskf,
  propagate,
  updateGnss,
  updateNHC,
  updateZaru,
  updateZupt,
  updateMlSpeed,
  defaultEskfConfig,
  yawDeg,
  headingDeg,
  posBound,
  qRot,
  type ImuSample,
} from "../src/engine/esekf";

const cfg = { ...defaultEskfConfig };

/** Build a synthetic IMU stream: constant forward accel then cruise, straight line. */
function straightRun(seconds: number, accel: number, cruiseV: number, yaw = 0) {
  const s = initEskf([0, 0, 0], [0, 0, 0], yaw, cfg);
  const dt = 0.1;
  const samples: ImuSample[] = [];
  // body frame: x forward; at yaw=0 body x = East. Gravity -z compensated by az=+g.
  for (let i = 0; i < seconds * 10; i++) {
    const a = i < 3 * 10 ? accel : 0; // accelerate 3 s, then cruise
    samples.push({ ax: [a, 0, 9.80665], gy: [0, 0, 0], dt });
  }
  for (const im of samples) propagate(s, im, cfg);
  // After accel phase: v should be ~accel*3 (clipped at cruiseV conceptually;
  // here we just verify integration), position along +x.
  return { s, samples };
}

describe("ES-EKF core", () => {
  it("propagates straight-line motion with correct heading frame", () => {
    const { s } = straightRun(6, 1.0, 0, 0); // accelerates 3s at 1 m/s² → v≈3 m/s East
    expect(s.p[0]).toBeGreaterThan(4); // integrated ~4.5 m
    expect(Math.abs(s.p[1])).toBeLessThan(1e-6);
    expect(Math.abs(s.v[1])).toBeLessThan(1e-6);
    expect(Math.abs(s.v[2])).toBeLessThan(0.2); // gravity compensated in z
    expect(yawDeg(s)).toBeCloseTo(0, 1); // body x = East at yaw 0
    expect(headingDeg(s)).toBeCloseTo(90, 1); // East = 90° compass
  });

  it("qRot rotates body vectors into ENU correctly", () => {
    const s = initEskf([0, 0, 0], [0, 0, 0], 0, cfg);
    const up = qRot(s.q, [0, 0, 1]);
    expect(up[2]).toBeCloseTo(1, 6);
    expect(Math.hypot(up[0], up[1])).toBeLessThan(1e-9);
  });

  it("GNSS update pulls position toward the measurement and passes consistency", () => {
    const { s } = straightRun(6, 1.0, 0, 0);
    const px = s.p[0];
    const res = updateGnss(s, px + 2, 0, 5, cfg); // 2 m off, σ=5 → must accept
    expect(res.accepted).toBe(true);
    expect(res.kind).toBe("gnss");
    expect(s.p[0]).toBeGreaterThan(px); // moved toward +2
    expect(s.p[0]).toBeLessThan(px + 2); // but not overshot
    expect(Number.isFinite(s.P[0])).toBe(true);
  });

  it("GNSS NIS gate rejects inconsistent fixes without corrupting state", () => {
    const { s } = straightRun(6, 1.0, 0, 0);
    const px = s.p[0];
    // Two consistent fixes precondition σ to ≈5 m; only then is a 90 m outlier
    // genuinely inconsistent (un-aided σ would be ~100 m and the fix valid).
    updateGnss(s, px + 2, 0, 5, cfg);
    updateGnss(s, px + 4, 0, 5, cfg);
    const res = updateGnss(s, px + 90, 0, 5, cfg); // 90 m off with σ≈5 → reject
    expect(res.accepted).toBe(false);
    expect(res.nis!).toBeGreaterThan(cfg.nisGate);
    expect(s.p[0]).toBeLessThan(px + 10); // unchanged by the rejected fix
  });

  it("NHC drives lateral velocity toward zero", () => {
    const s = initEskf([0, 0, 0], [0.5, 2.0, 0], 0, cfg); // moving north = lateral
    for (let i = 0; i < 10; i++) updateNHC(s, cfg.nhcSigma, cfg);
    expect(Math.abs(s.v[1])).toBeLessThan(0.4); // lateral component suppressed
    expect(s.v[0]).toBeGreaterThan(0.3); // forward kept
  });

  it("ZUPT drives velocity to zero and collapses velocity covariance", () => {
    const s = initEskf([0, 0, 0], [3, -1, 0], 0, cfg);
    const vVarBefore = s.P[3 * 15 + 3];
    for (let i = 0; i < 8; i++) updateZupt(s, cfg.zuptSigma, cfg);
    expect(Math.hypot(s.v[0], s.v[1])).toBeLessThan(0.15);
    // Zero-velocity constrains velocity, not position — position bound must
    // stay untouched (that is correct filter behaviour, not a bug).
    expect(s.P[3 * 15 + 3]).toBeLessThan(vVarBefore * 0.2);
    expect(Number.isFinite(posBound(s))).toBe(true);
  });

  it("ML speed update matches forward speed without touching lateral via NHC", () => {
    const s = initEskf([0, 0, 0], [2, 0, 0], 0, cfg);
    const res = updateMlSpeed(s, 5, cfg.mlSigma, cfg); // says 5, filter thinks 2
    expect(res.accepted).toBe(true);
    expect(s.v[0]).toBeGreaterThan(2.5); // pulled toward 5
    expect(s.v[0]).toBeLessThan(5); // conservative step
  });

  it("covariance stays finite and positive over a long propagation", () => {
    const { s } = straightRun(120, 0.4, 0, 0); // 120 s of propagation
    for (let i = 0; i < 15; i++) {
      expect(Number.isFinite(s.P[i * 15 + i])).toBe(true);
      expect(s.P[i * 15 + i]).toBeGreaterThan(0);
    }
    expect(Number.isFinite(s.p[0])).toBe(true);
    expect(Number.isFinite(s.q[0])).toBe(true);
  });

  it("ZARU converges gyro bias z-axis when stopped", () => {
    // Simulate a filter with significant initial gyro bias on z-axis
    const s = initEskf(
      [0, 0, 0],
      [0, 0, 0],
      0,
      { ...cfg, gyroBiasRW: 0 } // no bias random walk so we see pure ZARU effect
    );
    // Inject a known gyro bias error (simulate the filter is 0.1 rad/s off)
    s.bg[2] = 0.1; // 0.1 rad/s ≈ 5.7 °/s — a realistic misalignment
    const bgBefore = s.bg[2];
    const bgVarBefore = s.P[14 * 15 + 14]; // δbg_z variance

    // Apply ZARU multiple times (simulating 2+ seconds stopped)
    for (let i = 0; i < 30; i++) {
      updateZaru(s, 0.03, cfg);
    }

    // Bias should converge toward 0 (true value)
    expect(Math.abs(s.bg[2])).toBeLessThan(Math.abs(bgBefore) * 0.3);
    // Bias variance should collapse
    expect(s.P[14 * 15 + 14]).toBeLessThan(bgVarBefore * 0.2);
  });

  it("ZARU + ZUPT together converge bg_z faster than ZUPT alone", () => {
    const s1 = initEskf([0, 0, 0], [0, 0, 0], 0, { ...cfg, gyroBiasRW: 0 });
    s1.bg[2] = 0.1;
    const s2 = initEskf([0, 0, 0], [0, 0, 0], 0, { ...cfg, gyroBiasRW: 0 });
    s2.bg[2] = 0.1;

    // s1: ZUPT only (velocity updates don't directly observe bg_z)
    for (let i = 0; i < 30; i++) updateZupt(s1, cfg.zuptSigma, cfg);

    // s2: ZUPT + ZARU (ZARU directly observes bg_z through yaw-rate)
    for (let i = 0; i < 30; i++) {
      updateZupt(s2, cfg.zuptSigma, cfg);
      updateZaru(s2, 0.03, cfg);
    }

    // With ZARU, bg_z should converge significantly more
    expect(Math.abs(s2.bg[2])).toBeLessThan(Math.abs(s1.bg[2]) * 0.5);
    expect(s2.P[14 * 15 + 14]).toBeLessThan(s1.P[14 * 15 + 14] * 0.3);
  });
});
