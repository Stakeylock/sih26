export type Point = { x: number; y: number };
export type GnssState = "TRUSTED" | "DEGRADED" | "DENIED" | "REACQUIRING";
export type FaultKind = "gnss" | "shock" | "mount" | "speed";
export type EstimateKey = "ins" | "ekf" | "map" | "classical";
export type MlQuality = "READY" | "SUSPENDED" | "OOD" | "DISABLED";
export type Fault = { id: string; kind: FaultKind; at: number };
export type Config = {
  scenario: string;
  blackout: number;
  learned: boolean;
  map: boolean;
  seed: number;
  faults: Fault[];
  // Ablation toggles (T1) — default true for full system
  useNHC?: boolean;
  useZUPT?: boolean;
  useML?: boolean;
  useGNSSGate?: boolean;
  // Fault-lab params (T3) — reproducible fault injection
  faultDurations?: {
    shock?: number;   // default 3 s
    mount?: number;   // default 8 s
    speed?: number;   // default 10 s
    gnss?: number;    // default 3 s
  };
};
export type Scenario = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  start: number;
  route: Point[];
  faults: Fault[];
};
export type Event = {
  id: string;
  at: number;
  title: string;
  reason: string;
  action: string;
  severity: "info" | "warning" | "success";
};
export type Candidate = { name: string; probability: number };
export type Snapshot = {
  t: number;
  reference: Point;
  /** IMU-only inertial mechanisation. Never corrected by GNSS or map feedback. */
  ins: Point;
  /** Primary reduced-order ES-EKF estimate, optionally aided by ML virtual speed. */
  ekf: Point;
  /** Independent road-constrained output derived from the ES-EKF estimate. */
  map: Point;
  /** Ablation comparator: conventional GNSS + inertial fusion without ML aiding. */
  classical: Point;
  /** Live in-browser ES-EKF over recorded channels (IO-VNBD replay only). */
  live?: Point;
  speed: number;
  mlSpeed: number;
  mlConfidence: number;
  mlQuality: MlQuality;
  heading: number;
  sigma: number;
  bound: number;
  /** 95% covariance-only bound (live filter). */
  boundCov?: number;
  /** Protection-level component (live filter). */
  boundPL?: number;
  /** Covariance diagonals Pxx, Pxy, Pyy (live filter). */
  cov?: { xx: number; xy: number; yy: number };
  /** Innovations for explainability: gnss NIS, ml speed residual. */
  innov?: { gnss: number | null; ml: number | null };
  /** Bias estimates (live filter): ba, bg. */
  bias?: { ba: number[]; bg: number[] };
  /** Filter compute time per step, ms (live filter). */
  filterMs?: number;
  /** Latest GNSS fix in the local frame (null during outage / no fix). */
  gnss: Point | null;
  /** Whether the current fix passed the integrity gate and was fused. */
  gnssAccepted: boolean;
  /** Horizontal GNSS residual/accuracy (m), null without a fix. */
  gnssResidual: number | null;
  /** Normalized innovation square of the latest GNSS update (live filter). */
  nis?: number | null;
  rejected: boolean;
  state: GnssState;
  outage: number;
  distance: number;
  alignment: number;
  mlOod: number;
  mlUsed: boolean;
  mapUsed: boolean;
  /** §7.3 route-lock confidence 0..1 from the real HMM emission distance
   *  (live filter pos → snapped point); null when matching is off. Drives
   *  the map trace's opacity and the TrustPanel MAP MATCH %. */
  mapLock: number | null;
  shock: boolean;
  candidates: Candidate[];
  health: number;
  correction: number;
};
export type Run = {
  config: Config;
  scenario: Scenario;
  snapshots: Snapshot[];
  events: Event[];
  duration: number;
  /** Data provenance for mode badges and evidence labels. */
  source?: "synthetic" | "iovnbd" | "byod";
  /** Present only when source === "iovnbd": benchmark metadata for this run. */
  iovnbd?: {
    segmentId: string;
    trip: string;
    calib: { gyroBias: number; headingOffset: number; initialHeading: number; initialSpeed: number };
    finalErrors: Record<string, { final: number; drift: number; rmse: number; p95: number }>;
    blackoutDist: number;
    /** Full-resolution reference path for map rendering. */
    route: Point[];
    modelInfo: { version: string; holdout: unknown; loto: unknown; note: string };
    /** Live in-browser ES-EKF result (runs on every build, real covariance). */
    live: { final: number; drift: number; gyroTrusted: boolean; wzSign: number };
  };
};

/** A replay data source: produces complete runs from a configuration. */
export type ReplaySource = {
  id: "synthetic" | "iovnbd";
  isAvailable: () => Promise<boolean> | boolean;
  /** List selectable runs (scenarios for synthetic, segments for iovnbd). */
  listRuns: () => Promise<{ id: string; name: string; subtitle: string }[]>;
  /** Build the full run synchronously (config.scenario selects which one). */
  buildRun: (config: Config) => Run;
};
export type Metric = {
  name: EstimateKey;
  error: number;
  rmse: number;
  drift: number | null;
  coverage: number;
};
export type Layers = {
  reference: boolean;
  ins: boolean;
  ekf: boolean;
  map: boolean;
  classical: boolean;
  gnss: boolean;
  bound: boolean;
};

/** Judge-mode narrative callout; null when no stage is active. */
export type JudgeCallout = {
  index: number;
  total: number;
  title: string;
  body: string;
} | null;
