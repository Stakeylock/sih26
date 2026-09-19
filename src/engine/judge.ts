/**
 * Judge Mode — deterministic narrative scripting over any replay run.
 *
 * A judge demo is normal playback plus choreographed callouts: each stage owns
 * a time window and explains what the system is doing at that moment. Works
 * for both data sources because it only depends on run.scenario.start
 * (blackout begin) and run.duration.
 */
import type { JudgeCallout, Run } from "./types";

export type { JudgeCallout };

export type JudgeStage = {
  index: number;
  total: number;
  at: number;
  until: number;
  title: string;
  body: string;
  /** Playback speed suggestion while this stage is active. */
  rate: number;
};

export function judgeStages(run: Run): JudgeStage[] {
  const b = run.scenario.start; // blackout begins
  const e = b + run.config.blackout; // blackout ends
  const iov = run.source === "iovnbd";
  const byod = run.source === "byod";
  const stages: JudgeStage[] = [
    {
      index: 1,
      total: 6,
      at: Math.max(2, b - 22),
      until: Math.max(6, b - 12),
      title: iov ? "REAL GNSS DATA · IO-VNBD" : byod ? "YOUR OWN DRIVE · LIVE" : "STABLE FIX",
      body: iov
        ? `Replaying a real drive (trip ${run.iovnbd?.trip}) recorded at 10 Hz. GNSS is healthy — the fused estimate tracks the reference.`
        : byod
          ? "This is YOUR phone: gyro, compass and GPS recorded on this device minutes ago, navigating through the same 15-state filter. GNSS is healthy — the fused estimate tracks your GPS track."
          : "The vehicle begins with a healthy GNSS fix. Watch the fused estimate track the reference route.",
      rate: 1,
    },
    {
      index: 2,
      total: 6,
      at: Math.max(4, b - 12),
      until: b,
      title: "GNSS IS DEGRADING",
      body: "Accuracy is falling. The integrity manager reduces satellite trust before the signal is lost — covariance inflation starts now.",
      rate: 1,
    },
    {
      index: 3,
      total: 6,
      at: b,
      until: Math.min(b + 18, e),
      title: "GNSS DENIED",
      body: "Dead reckoning only: inertial propagation plus the learned motion-mode aid, constrained by zero-motion detection and the road-topology lock (dashed lime).",
      rate: 1,
    },
    {
      index: 4,
      total: 6,
      at: Math.min(b + 18, e - 10 > b ? e - 10 : b + 18),
      until: e,
      title: "ERRORS SEPARATE",
      body: "Uncorrupted INS drifts with heading error; the aided fusion stays on the true corridor. The ellipse is the filter's own covariance — watch it grow honestly instead of lying. This gap is the value of aiding.",
      rate: 1,
    },
    {
      index: 5,
      total: 6,
      at: e,
      until: e + 10,
      title: "REACQUISITION — GUARDED",
      body: "Fixes return, but the filter re-locks only after several consistent updates. A wrong first fix is never blindly trusted.",
      rate: 1,
    },
    {
      index: 6,
      total: 6,
      at: e + 10,
      until: e + 24,
      title: "VERIFY IN EVIDENCE",
      body: iov
        ? "Final errors, drift and calibration for this real blackout are in the Evidence view — measured, not claimed."
        : byod
          ? "Your drive's calibration, route lock and self-referenced accuracy are in Evidence — and the Judge report button exports it all as a document."
          : "Final errors and drift for this run are in the Evidence view — measured within the simulation, not claimed.",
      rate: 1,
    },
  ];
  return stages;
}

export function judgeCalloutAt(stages: JudgeStage[], t: number): JudgeCallout {
  const s = stages.find((st) => t >= st.at && t < st.until);
  if (!s) return null;
  return { index: s.index, total: s.total, title: s.title, body: s.body };
}
