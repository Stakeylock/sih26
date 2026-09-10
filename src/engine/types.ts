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
  speed: number;
  mlSpeed: number;
  mlConfidence: number;
  mlQuality: MlQuality;
  heading: number;
  sigma: number;
  bound: number;
  gnss: Point | null;
  gnssAccepted: boolean;
  gnssResidual: number | null;
  rejected: boolean;
  state: GnssState;
  outage: number;
  distance: number;
  alignment: number;
  mlOod: number;
  mlUsed: boolean;
  mapUsed: boolean;
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
