export type Point = { x: number; y: number };
export type GnssState = "TRUSTED" | "DEGRADED" | "DENIED" | "REACQUIRING";
export type FaultKind = "gnss" | "shock" | "mount" | "speed";
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
  raw: Point;
  assisted: Point;
  baseline: Point;
  speed: number;
  virtualSpeed: number;
  heading: number;
  sigma: number;
  bound: number;
  gnss: Point | null;
  rejected: boolean;
  state: GnssState;
  outage: number;
  distance: number;
  alignment: number;
  ood: number;
  learnedUsed: boolean;
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
  name: string;
  error: number;
  rmse: number;
  drift: number | null;
  coverage: number;
};
export type Layers = {
  reference: boolean;
  raw: boolean;
  assisted: boolean;
  baseline: boolean;
  gnss: boolean;
  bound: boolean;
};
