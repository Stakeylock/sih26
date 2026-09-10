import type {
  Config,
  EstimateKey,
  Event,
  Metric,
  Point,
  Run,
  Snapshot,
} from "./types";
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

/**
 * This is a deliberately small, deterministic stand-in for the runtime
 * sensor contract. Only this generator reads the hidden reference route.
 * Every estimator below consumes observations, never the reference position.
 */
type Observation = {
  t: number;
  acceleration: number;
  yawRate: number;
  mlSpeed: number;
  fix: Point | null;
  poor: boolean;
  mount: boolean;
  shock: boolean;
  ood: boolean;
};

type NominalState = {
  position: Point;
  speed: number;
  yaw: number;
  variance: number;
};

const DT = 0.1;
const DURATION = 120;

function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296 - 0.5;
  };
}

/** Propagate a nominal state with IMU observations and optional ML speed aiding. */
function propagate(
  state: NominalState,
  observation: Observation,
  useMlSpeed: boolean,
  processNoise: number,
) {
  state.yaw = wrap(state.yaw + observation.yawRate * DT);
  state.speed = clamp(state.speed + observation.acceleration * DT, 0, 35);
  if (
    useMlSpeed &&
    !observation.mount &&
    !observation.ood &&
    !observation.shock
  ) {
    state.speed += 0.23 * (observation.mlSpeed - state.speed);
  }
  state.position = {
    x: state.position.x + Math.cos(state.yaw) * state.speed * DT,
    y: state.position.y + Math.sin(state.yaw) * state.speed * DT,
  };
  state.variance +=
    DT * processNoise +
    (observation.shock ? 0.38 : 0) +
    (observation.mount ? 0.28 : 0);
}

/**
 * Apply a GNSS innovation with a scalar position covariance. This is the
 * reduced-order equivalent of an ES-EKF measurement update: the innovation
 * is formed from the nominal state, a Kalman gain is computed from predicted
 * and measurement covariance, then the error is injected into the nominal
 * position. A full production filter would carry the complete error-state
 * covariance and cross terms.
 */
function applyGnssInnovation(
  state: NominalState,
  fix: Point,
  measurementVariance: number,
) {
  const before = state.position,
    innovation = { x: fix.x - before.x, y: fix.y - before.y },
    gain = clamp(
      state.variance / (state.variance + measurementVariance),
      0.02,
      0.6,
    );
  state.position = {
    x: before.x + innovation.x * gain,
    y: before.y + innovation.y * gain,
  };
  state.variance = Math.max(0.7, state.variance * (1 - gain));
  return dist(before, state.position);
}

function stateEvent(
  id: string,
  at: number,
  title: string,
  reason: string,
  action: string,
  severity: Event["severity"],
): Event {
  return { id, at, title, reason, action, severity };
}

export function simulate(config: Config): Run {
  const scenario =
      scenarios.find((candidate) => candidate.id === config.scenario) ??
      scenarios[0],
    rng = random(config.seed),
    end = scenario.start + config.blackout,
    faults = [...scenario.faults, ...config.faults],
    events: Event[] = [],
    snapshots: Snapshot[] = [];

  const addEvent = (event: Event) => {
    if (!events.some((existing) => existing.id === event.id))
      events.push(event);
  };

  const routeLength = length(scenario.route),
    initialSpeed = routeLength / DURATION,
    initialYaw = angle(scenario.route[0], scenario.route[1]);

  // INS is intentionally never corrected. The reduced-order ES-EKF state is
  // the main output and can consume the ML virtual-odometer measurement.
  let ins: NominalState = {
    position: { ...scenario.route[0] },
    speed: initialSpeed,
    yaw: initialYaw,
    variance: 1.8,
  };
  let ekf: NominalState = {
    ...ins,
    position: { ...ins.position },
    variance: 1.4,
  };
  let classical: NominalState = {
    ...ins,
    position: { ...ins.position },
    variance: 1.6,
  };

  let truthDistance = 0,
    previousSpeed = initialSpeed,
    previousYaw = initialYaw,
    state: Snapshot["state"] = "TRUSTED",
    consistent = 0,
    outageDistance = 0,
    previousReference = { ...scenario.route[0] },
    returnAt: number | null = null;

  addEvent(
    stateEvent(
      "start",
      0,
      "Navigation initialized",
      "Synthetic sensor stream ready.",
      "INS mechanization and reduced-order ES-EKF fusion are online.",
      "success",
    ),
  );

  for (let index = 0; index <= DURATION / DT; index++) {
    const t = Number((index * DT).toFixed(1)),
      truthSpeed = (routeLength / DURATION) * (1 + 0.08 * Math.sin(t / 9));
    if (index) truthDistance += truthSpeed * DT;

    const reference = along(scenario.route, truthDistance),
      truthYaw = angle(
        along(scenario.route, Math.max(0, truthDistance - 0.08)),
        along(scenario.route, truthDistance + 0.08),
      );
    const active = (kind: string, seconds: number) =>
      faults.some(
        (fault) =>
          fault.kind === kind && t >= fault.at && t < fault.at + seconds,
      );
    const shock = active("shock", 3),
      mount = active("mount", 8),
      ood = active("speed", 10),
      denied = t >= scenario.start && t < end,
      poor = t >= scenario.start - 10 && t < scenario.start,
      fixDue = index % 10 === 0,
      jump = active("gnss", 3) || (t >= end && t < end + 3);

    const fix =
      fixDue && !denied
        ? {
            x: reference.x + rng() * 3 + (jump ? 130 : poor ? 12 : 0),
            y: reference.y + rng() * 3 + (jump ? -100 : poor ? -8 : 0),
          }
        : null;
    const observation: Observation = {
      t,
      acceleration:
        (truthSpeed - previousSpeed) / DT +
        0.018 +
        rng() * 0.012 +
        (shock ? rng() * 2 : 0),
      yawRate:
        wrap(truthYaw - previousYaw) / DT +
        0.00065 +
        rng() * 0.001 +
        (shock ? rng() * 0.11 : 0) +
        (mount ? 0.012 : 0),
      mlSpeed: truthSpeed + rng() * 0.25 + (ood ? 14 : 0),
      fix,
      poor,
      mount,
      shock,
      ood,
    };
    previousYaw = truthYaw;
    previousSpeed = truthSpeed;

    if (index) {
      propagate(ins, observation, false, 0.7);
      propagate(ekf, observation, config.learned, config.learned ? 0.24 : 0.55);
      propagate(classical, observation, false, 0.55);
    }

    let rejected = false,
      gnssAccepted = false,
      gnssResidual: number | null = null,
      correction = 0;
    const previousState: Snapshot["state"] = state;
    if (denied) {
      state = "DENIED";
      consistent = 0;
    } else if (poor) {
      state = "DEGRADED";
    } else if ((t >= end && state !== "TRUSTED") || state === "DEGRADED") {
      state = "REACQUIRING";
    }

    if (fix) {
      gnssResidual = dist(fix, ekf.position);
      rejected = gnssResidual > Math.max(35, Math.sqrt(ekf.variance) * 6);
      if (rejected) {
        consistent = 0;
        if (state === "TRUSTED") state = "DEGRADED";
        addEvent(
          stateEvent(
            `reject-${Math.floor(t)}`,
            t,
            "GNSS observation rejected",
            `ES-EKF innovation ${gnssResidual.toFixed(1)} m exceeds the gate.`,
            "No correction applied. Await consistent observations.",
            "warning",
          ),
        );
      } else {
        gnssAccepted = true;
        if (state === "REACQUIRING") {
          consistent++;
          if (consistent >= 3) {
            state = "TRUSTED";
            returnAt = t;
          }
        }
        const measurementVariance = poor
          ? 105
          : state === "REACQUIRING"
            ? 55
            : t >= end && t < end + 12
              ? 25
              : 5;
        correction = applyGnssInnovation(ekf, fix, measurementVariance);
        applyGnssInnovation(classical, fix, measurementVariance);
      }
    }

    if (previousState !== state) {
      addEvent(
        stateEvent(
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
            ? "Continue INS propagation with growing uncertainty."
            : state === "DEGRADED"
              ? "Reduce the influence of GNSS."
              : state === "REACQUIRING"
                ? "Validate observations before restoring trust."
                : "Restore ES-EKF GNSS aiding gradually.",
          state === "TRUSTED"
            ? "success"
            : state === "REACQUIRING"
              ? "info"
              : "warning",
        ),
      );
    }

    for (const fault of faults) {
      if (t < fault.at) continue;
      const copy = {
        shock: [
          "Pothole impulse detected",
          "Motion window contains a vibration impulse.",
          "Suspend ML virtual-odometer aiding for 3 s and increase covariance.",
        ],
        mount: [
          "Mount shift detected",
          "Phone alignment is temporarily uncertain.",
          "Suspend ML virtual-odometer aiding during 8 s alignment recovery.",
        ],
        speed: [
          "ML speed observation rejected",
          "Virtual-odometer speed is outside the expected motion range.",
          "The ES-EKF falls back to INS propagation for 10 s.",
        ],
        gnss: [
          "GNSS jump injected",
          "Synthetic position observations shifted.",
          "The ES-EKF innovation gate checks each observation.",
        ],
      }[fault.kind];
      addEvent(
        stateEvent(fault.id, fault.at, copy[0], copy[1], copy[2], "warning"),
      );
      const delay = { shock: 3, mount: 8, speed: 10, gnss: 3 }[fault.kind];
      if (t >= fault.at + delay) {
        addEvent(
          stateEvent(
            `${fault.id}-clear`,
            fault.at + delay,
            "Fault interval ended",
            `${fault.kind} observations returned to normal.`,
            "Normal gating resumes.",
            "success",
          ),
        );
      }
    }

    // Map matching is a separate, confidence-gated output. It cannot mutate
    // either INS or the ES-EKF state.
    const roadScores = [
      ["Aster Avenue", mainRoad],
      ["North Ramp", northRoad],
      ["Service Road", serviceRoad],
    ] as const;
    const projections = roadScores.map(([name, road]) => {
      const projection = project(ekf.position, road);
      return {
        name,
        ...projection,
        weight: Math.exp(
          -Math.min(
            60,
            (projection.error * projection.error) / (2 * (ekf.variance + 12)) +
              Math.abs(wrap(projection.heading - ekf.yaw)) * 2,
          ),
        ),
      };
    });
    const weightSum = projections.reduce(
        (sum, projection) => sum + projection.weight,
        0,
      ),
      ranked = projections
        .map((projection) => ({
          ...projection,
          probability: projection.weight / weightSum,
        }))
        .sort((a, b) => b.probability - a.probability),
      mapUsed =
        config.map &&
        ranked[0].probability > 0.8 &&
        ranked[0].probability - ranked[1].probability > 0.2,
      mapPosition = mapUsed
        ? mix(ekf.position, ranked[0].point, 0.75)
        : { ...ekf.position };

    if (t > scenario.start && t <= end && index)
      outageDistance += dist(reference, previousReference);
    previousReference = reference;

    const mlQuality = !config.learned
        ? "DISABLED"
        : mount || shock
          ? "SUSPENDED"
          : ood
            ? "OOD"
            : "READY",
      mlUsed = config.learned && mlQuality === "READY",
      mlConfidence = !config.learned
        ? 0
        : clamp(
            1 - (ood ? 0.9 : 0) - (mount ? 0.45 : 0) - (shock ? 0.3 : 0),
            0,
            1,
          ),
      bound = Math.sqrt(ekf.variance) * 2.448;

    snapshots.push({
      t,
      reference: { ...reference },
      ins: { ...ins.position },
      ekf: { ...ekf.position },
      map: mapPosition,
      classical: { ...classical.position },
      speed: ekf.speed,
      mlSpeed: observation.mlSpeed,
      mlConfidence,
      mlQuality,
      heading: ((ekf.yaw * 180) / Math.PI + 450) % 360,
      sigma: Math.sqrt(ekf.variance),
      bound,
      gnss: fix,
      gnssAccepted,
      gnssResidual,
      rejected,
      state,
      outage: clamp(t - scenario.start, 0, config.blackout),
      distance: outageDistance,
      alignment: mount ? 0.42 : 1,
      mlOod: ood ? 0.91 : shock ? 0.36 : 0.04,
      mlUsed,
      mapUsed,
      shock,
      candidates: ranked.map((projection) => ({
        name: projection.name,
        probability: projection.probability,
      })),
      health: clamp(
        98 - bound * 1.5 - (mount ? 22 : 0) - (ood ? 16 : 0) - (poor ? 10 : 0),
        0,
        100,
      ),
      correction,
    });
  }

  if (returnAt === null) {
    addEvent(
      stateEvent(
        "not-recovered",
        DURATION,
        "Trust not restored",
        "No consistent recovery was established.",
        "Review the fault ledger.",
        "warning",
      ),
    );
  }
  return {
    config,
    scenario,
    snapshots,
    events: events.sort((a, b) => a.at - b.at),
    duration: DURATION,
  };
}

export function metrics(run: Run, until = DURATION): Metric[] {
  const samples = run.snapshots.filter(
    (snapshot) =>
      snapshot.t >= run.scenario.start &&
      snapshot.t <= run.scenario.start + run.config.blackout &&
      snapshot.t <= until,
  );
  if (!samples.length) return [];
  const last = samples[samples.length - 1];
  return (["ins", "ekf", "map", "classical"] as EstimateKey[]).map((key) => {
    const errors = samples.map((snapshot) =>
        dist(snapshot[key], snapshot.reference),
      ),
      error = errors[errors.length - 1];
    return {
      name: key,
      error,
      rmse: Math.sqrt(
        errors.reduce((sum, current) => sum + current * current, 0) /
          errors.length,
      ),
      drift: last.distance > 0.01 ? (100 * error) / last.distance : null,
      coverage:
        (100 *
          samples.filter((snapshot, index) => errors[index] <= snapshot.bound)
            .length) /
        samples.length,
    };
  });
}
