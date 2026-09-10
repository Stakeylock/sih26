import type { Config, Event, Point, Run, Snapshot, Metric } from "./types";
import {
  along,
  angle,
  clamp,
  dist,
  length,
  mix,
  project,
  wrap,
} from "./geometry";
import { mainRoad, northRoad, scenarios, serviceRoad } from "./scenarios";

// Reduced-order planar demonstration. Only the sensor generator reads truth.
// Estimator updates consume observation packets, never the reference trajectory.
type Observation = {
  t: number;
  acceleration: number;
  yawRate: number;
  virtualSpeed: number;
  fix: Point | null;
  poor: boolean;
  mount: boolean;
  shock: boolean;
  ood: boolean;
};
type Estimator = {
  position: Point;
  speed: number;
  yaw: number;
  variance: number;
};
const DT = 0.1;
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}
function predict(state: Estimator, o: Observation, learned: boolean) {
  state.yaw = wrap(state.yaw + o.yawRate * DT);
  state.speed = clamp(state.speed + o.acceleration * DT, 0, 35);
  if (learned && !o.mount && !o.ood && !o.shock)
    state.speed += 0.23 * (o.virtualSpeed - state.speed);
  state.position = {
    x: state.position.x + Math.cos(state.yaw) * state.speed * DT,
    y: state.position.y + Math.sin(state.yaw) * state.speed * DT,
  };
  state.variance +=
    DT * (learned ? 0.24 : 0.55) + (o.shock ? 0.38 : 0) + (o.mount ? 0.28 : 0);
}
function correct(state: Estimator, fix: Point, gain: number) {
  const before = state.position;
  state.position = mix(before, fix, gain);
  state.variance = Math.max(0.7, state.variance * (1 - gain));
  return dist(before, state.position);
}

export function simulate(config: Config): Run {
  const scenario =
      scenarios.find((s) => s.id === config.scenario) ?? scenarios[0],
    rng = random(config.seed);
  const end = scenario.start + config.blackout,
    faults = [...scenario.faults, ...config.faults];
  const events: Event[] = [],
    snapshots: Snapshot[] = [];
  const event = (
    id: string,
    at: number,
    title: string,
    reason: string,
    action: string,
    severity: Event["severity"] = "info",
  ) => {
    if (!events.some((e) => e.id === id))
      events.push({ id, at, title, reason, action, severity });
  };
  const routeLength = length(scenario.route),
    duration = 120;
  let truthDistance = 0,
    previousSpeed = routeLength / duration,
    previousYaw = angle(scenario.route[0], scenario.route[1]);
  let raw: Estimator = {
    position: { ...scenario.route[0] },
    speed: previousSpeed,
    yaw: previousYaw,
    variance: 1.4,
  };
  let baseline: Estimator = { ...raw, position: { ...raw.position } };
  let state: Snapshot["state"] = "TRUSTED",
    consistent = 0,
    outageDistance = 0,
    previousReference = { ...scenario.route[0] },
    returnAt: number | null = null;
  event(
    "start",
    0,
    "Navigation initialized",
    "Synthetic sensor stream ready.",
    "GNSS and inertial observations are fused.",
    "success",
  );
  for (let index = 0; index <= duration / DT; index++) {
    const t = Number((index * DT).toFixed(1)),
      truthSpeed = (routeLength / duration) * (1 + 0.08 * Math.sin(t / 9));
    if (index) truthDistance += truthSpeed * DT;
    const reference = along(scenario.route, truthDistance),
      truthYaw = angle(
        along(scenario.route, Math.max(0, truthDistance - 0.08)),
        along(scenario.route, truthDistance + 0.08),
      );
    const active = (kind: string, seconds: number) =>
      faults.some((f) => f.kind === kind && t >= f.at && t < f.at + seconds);
    const shock = active("shock", 3),
      mount = active("mount", 8),
      ood = active("speed", 10);
    const denied = t >= scenario.start && t < end,
      poor = t >= scenario.start - 10 && t < scenario.start;
    const fixDue = index % 10 === 0,
      jump = active("gnss", 3) || (t >= end && t < end + 3);
    const fix =
      fixDue && !denied
        ? {
            x: reference.x + rng() * 3 + (jump ? 130 : poor ? 12 : 0),
            y: reference.y + rng() * 3 + (jump ? -100 : poor ? -8 : 0),
          }
        : null;
    const yawRate =
      wrap(truthYaw - previousYaw) / DT +
      0.00065 +
      rng() * 0.001 +
      (shock ? rng() * 0.11 : 0) +
      (mount ? 0.012 : 0);
    const o: Observation = {
      t,
      acceleration:
        (truthSpeed - previousSpeed) / DT +
        0.018 +
        rng() * 0.012 +
        (shock ? rng() * 2 : 0),
      yawRate,
      virtualSpeed: truthSpeed + rng() * 0.25 + (ood ? 14 : 0),
      fix,
      poor,
      mount,
      shock,
      ood,
    };
    previousYaw = truthYaw;
    previousSpeed = truthSpeed;
    if (index) {
      predict(raw, o, config.learned);
      predict(baseline, o, false);
    }
    let rejected = false,
      correction = 0;
    const previousState: Snapshot["state"] = state;
    if (denied) {
      state = "DENIED";
      consistent = 0;
    } else if (poor) {
      state = "DEGRADED";
    } else if ((t >= end && state !== "TRUSTED") || state === "DEGRADED")
      state = "REACQUIRING";
    if (fix) {
      const residual = dist(fix, raw.position);
      rejected = residual > Math.max(35, Math.sqrt(raw.variance) * 6);
      if (rejected) {
        consistent = 0;
        if (state === "TRUSTED") state = "DEGRADED";
        event(
          `reject-${Math.floor(t)}`,
          t,
          "GNSS observation rejected",
          `Position innovation ${residual.toFixed(1)} m exceeds the gate.`,
          "No correction applied. Await consistent observations.",
          "warning",
        );
      } else {
        if (state === "REACQUIRING") {
          consistent++;
          if (consistent >= 3) {
            state = "TRUSTED";
            returnAt = t;
          }
        }
        const gain = poor
          ? 0.035
          : state === "REACQUIRING"
            ? 0.06
            : t >= end && t < end + 12
              ? 0.12
              : 0.3;
        correction = correct(raw, fix, gain);
        correct(baseline, fix, gain);
      }
    }
    if (previousState !== state)
      event(
        `state-${t}`,
        t,
        `GNSS ${state.toLowerCase()}`,
        state === "DENIED"
          ? "Satellite observations unavailable."
          : state === "DEGRADED"
            ? "Reported accuracy is falling."
            : state === "REACQUIRING"
              ? "Satellite observations have returned."
              : "Three consistent fixes passed the gate.",
        state === "DENIED"
          ? "Continue dead reckoning with growing uncertainty."
          : state === "DEGRADED"
            ? "Reduce the influence of GNSS."
            : state === "REACQUIRING"
              ? "Validate observations before restoring trust."
              : "Restore GNSS aiding gradually.",
        state === "TRUSTED"
          ? "success"
          : state === "REACQUIRING"
            ? "info"
            : "warning",
      );
    for (const f of faults)
      if (t >= f.at) {
        const copy = {
          shock: [
            "Pothole impulse detected",
            "Motion window contains a vibration impulse.",
            "Suspend learned aiding for 3 s and increase covariance.",
          ],
          mount: [
            "Mount shift detected",
            "Phone alignment is temporarily uncertain.",
            "Suspend learned aiding during 8 s alignment recovery.",
          ],
          speed: [
            "Learned speed rejected",
            "Speed observation is outside the expected motion range.",
            "Use inertial propagation for 10 s.",
          ],
          gnss: [
            "GNSS jump injected",
            "Synthetic position observations shifted.",
            "Innovation gate checks each observation.",
          ],
        }[f.kind];
        event(f.id, f.at, copy[0], copy[1], copy[2], "warning");
        const delay = { shock: 3, mount: 8, speed: 10, gnss: 3 }[f.kind];
        if (t >= f.at + delay)
          event(
            `${f.id}-clear`,
            f.at + delay,
            "Fault interval ended",
            `${f.kind} observations returned to normal.`,
            "Normal gating resumes.",
            "success",
          );
      }
    // Candidate likelihoods use the estimate and static road geometry, not truth.
    const roadScores = [
      ["Aster Avenue", mainRoad],
      ["North Ramp", northRoad],
      ["Service Road", serviceRoad],
    ] as const;
    const projections = roadScores.map(([name, road]) => {
      const p = project(raw.position, road);
      return {
        name,
        ...p,
        weight: Math.exp(
          -Math.min(
            60,
            (p.error * p.error) / (2 * (raw.variance + 12)) +
              Math.abs(wrap(p.heading - raw.yaw)) * 2,
          ),
        ),
      };
    });
    const sum = projections.reduce((v, p) => v + p.weight, 0);
    const ranked = projections
      .map((p) => ({ ...p, probability: p.weight / sum }))
      .sort((a, b) => b.probability - a.probability);
    const mapUsed =
      config.map &&
      ranked[0].probability > 0.8 &&
      ranked[0].probability - ranked[1].probability > 0.2;
    const assisted = mapUsed
      ? mix(raw.position, ranked[0].point, 0.75)
      : { ...raw.position };
    if (t > scenario.start && t <= end && index)
      outageDistance += dist(reference, previousReference);
    previousReference = reference;
    const bound = Math.sqrt(raw.variance) * 2.448;
    snapshots.push({
      t,
      reference: { ...reference },
      raw: { ...raw.position },
      assisted,
      baseline: { ...baseline.position },
      speed: raw.speed,
      virtualSpeed: o.virtualSpeed,
      heading: ((raw.yaw * 180) / Math.PI + 450) % 360,
      sigma: Math.sqrt(raw.variance),
      bound,
      gnss: fix,
      rejected,
      state,
      outage: clamp(t - scenario.start, 0, config.blackout),
      distance: outageDistance,
      alignment: mount ? 0.42 : 1,
      ood: ood ? 0.91 : shock ? 0.36 : 0.04,
      learnedUsed: config.learned && !mount && !ood && !shock,
      mapUsed,
      shock,
      candidates: ranked.map((p) => ({
        name: p.name,
        probability: p.probability,
      })),
      health: clamp(
        98 - bound * 1.5 - (mount ? 22 : 0) - (ood ? 16 : 0) - (poor ? 10 : 0),
        0,
        100,
      ),
      correction,
    });
  }
  if (returnAt === null)
    event(
      "not-recovered",
      duration,
      "Trust not restored",
      "No consistent recovery was established.",
      "Review the fault ledger.",
      "warning",
    );
  return {
    config,
    scenario,
    snapshots,
    events: events.sort((a, b) => a.at - b.at),
    duration,
  };
}

export function metrics(run: Run, until = 120): Metric[] {
  const samples = run.snapshots.filter(
    (s) =>
      s.t >= run.scenario.start &&
      s.t <= run.scenario.start + run.config.blackout &&
      s.t <= until,
  );
  if (!samples.length) return [];
  const last = samples[samples.length - 1];
  return (["raw", "assisted", "baseline"] as const).map((key) => {
    const errors = samples.map((s) => dist(s[key], s.reference));
    const error = errors[errors.length - 1];
    return {
      name: key,
      error,
      rmse: Math.sqrt(
        errors.reduce((sum, e) => sum + e * e, 0) / errors.length,
      ),
      drift: last.distance > 0.01 ? (100 * error) / last.distance : null,
      coverage:
        (100 * samples.filter((s, i) => errors[i] <= s.bound).length) /
        samples.length,
    };
  });
}
