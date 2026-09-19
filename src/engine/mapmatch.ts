/**
 * Viterbi HMM Map Matcher for dead-reckoning trajectory correction.
 *
 * The filter's position estimate is the observation sequence. The hidden states
 * are candidate road segments (or anchor points along the reference route).
 * Emission probability = Gaussian likelihood of the observed position given
 * the candidate's coordinates. Transition probability = heading consistency
 * between consecutive candidates (vehicles don't make sharp turns at speed).
 *
 * This runs offline on the full trajectory (not causal) to produce a
 * map-constrained trace for the "map" output in the UI and for evidence.
 */
import type { Point } from "./types";

export type CandidatePoint = Point & {
  /** Index along the reference route (for ordering). */
  idx: number;
  /** Cumulative distance along route from start (m). */
  s: number;
  /** Heading of the route at this point (deg, ENU: 0=E, CCW). */
  heading: number;
};

export type HMMParams = {
  /** Emission std dev (m) — how tightly the filter position matches the road. */
  emissionSigma: number;
  /** Transition heading tolerance (deg) — max plausible turn angle. */
  turnTolDeg: number;
  /** Transition speed (m/s) — used to convert heading diff to probability. */
  speed: number;
  /** Time step between observations (s). */
  dt: number;
};

export const defaultHMMParams: HMMParams = {
  emissionSigma: 8.0,     // filter 2σ bound is typically 5-20 m in outage
  turnTolDeg: 45,         // 45° per step max at typical urban speeds
  speed: 10,              // 10 m/s ≈ 36 km/h
  dt: 1.0,                // 1 Hz observations
};

/** Gaussian log-likelihood (up to additive constants). */
function gaussLogLik(d2: number, sigma: number): number {
  // -0.5 * (d^2 / sigma^2) - log(sigma) - 0.5*log(2π)
  return -0.5 * (d2 / (sigma * sigma)) - Math.log(sigma) - 0.5 * Math.log(2 * Math.PI);
}

/** Heading difference in [-180, 180]. */
function headingDiff(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * Build candidate points from a reference route at regular intervals.
 * The route is the ground-truth GNSS track (or a road network in production).
 * Cumulative distance s monotonically increases from 0 along the route.
 */
export function buildCandidates(route: Point[], spacing = 5): CandidatePoint[] {
  if (route.length < 2) return [];
  const cands: CandidatePoint[] = [];
  let totalDist = 0;
  let distSinceCand = 0;

  // Initial heading from the first segment
  const h0 = (Math.atan2(route[1].y - route[0].y, route[1].x - route[0].x) * 180) / Math.PI;
  cands.push({ x: route[0].x, y: route[0].y, idx: 0, s: 0, heading: h0 });

  for (let i = 1; i < route.length; i++) {
    const prev = route[i - 1];
    const cur = route[i];
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const segLen = Math.hypot(dx, dy);
    totalDist += segLen;
    distSinceCand += segLen;
    const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (distSinceCand >= spacing || i === route.length - 1) {
      cands.push({ x: cur.x, y: cur.y, idx: i, s: totalDist, heading });
      distSinceCand = 0;
    }
  }
  return cands;
}

/**
 * Viterbi algorithm: find the most likely state sequence given observations.
 *
 * @param obs Observed positions from the filter (EKF/Live ES-EKF)
 * @param cands Candidate road points (from buildCandidates)
 * @param params HMM parameters
 * @returns Array of matched candidate indices (same length as obs)
 */
export function viterbi(
  obs: Point[],
  cands: CandidatePoint[],
  params: HMMParams = defaultHMMParams
): number[] {
  const T = obs.length;
  const N = cands.length;
  if (T === 0 || N === 0) return [];

  // dp[t][j] = max log-prob of path ending at candidate j at time t
  const dp: number[][] = Array.from({ length: T }, () => new Array(N).fill(-Infinity));
  // back[t][j] = previous candidate index for best path to j at t
  const back: number[][] = Array.from({ length: T }, () => new Array(N).fill(-1));

  // --- Initialization (t = 0): emission only ---
  for (let j = 0; j < N; j++) {
    const dx = obs[0].x - cands[j].x;
    const dy = obs[0].y - cands[j].y;
    const d2 = dx * dx + dy * dy;
    dp[0][j] = gaussLogLik(d2, params.emissionSigma);
    back[0][j] = -1;
  }

  // --- Transition kernel precomputation ---
  // For each pair (i, j), log transition probability
  // Transition: p(j|i) ∝ exp(-0.5 * (heading_diff / turnTol)^2) * exp(-|s_j - s_i - v*dt| / tol)
  // We use a simplified model: heading consistency + forward progress
  const vStep = params.speed * params.dt;
  const turnTolRad = params.turnTolDeg * Math.PI / 180;

  const transLog = new Array(N * N).fill(-Infinity);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      // Heading consistency
      const hd = Math.abs(headingDiff(cands[i].heading, cands[j].heading));
      const hdRad = hd * Math.PI / 180;
      // Forward progress: prefer candidates ahead along the route
      const ds = cands[j].s - cands[i].s;
      // Penalize backward jumps and excessive forward jumps
      const progPenalty = ds < 0 ? 10 : Math.max(0, (ds - vStep * 2) / vStep);
      const headPenalty = (hdRad / turnTolRad) * (hdRad / turnTolRad);
      transLog[i * N + j] = -0.5 * headPenalty - progPenalty;
    }
  }

  // --- Recursion ---
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      const dx = obs[t].x - cands[j].x;
      const dy = obs[t].y - cands[j].y;
      const d2 = dx * dx + dy * dy;
      const emit = gaussLogLik(d2, params.emissionSigma);

      let best = -Infinity;
      let bestIdx = -1;
      for (let i = 0; i < N; i++) {
        const val = dp[t - 1][i] + transLog[i * N + j];
        if (val > best) {
          best = val;
          bestIdx = i;
        }
      }
      dp[t][j] = best + emit;
      back[t][j] = bestIdx;
    }
  }

  // --- Termination: find best end state ---
  let bestEnd = -Infinity;
  let bestIdx = -1;
  for (let j = 0; j < N; j++) {
    if (dp[T - 1][j] > bestEnd) {
      bestEnd = dp[T - 1][j];
      bestIdx = j;
    }
  }

  // --- Backtrack ---
  const path = new Array(T).fill(-1);
  path[T - 1] = bestIdx;
  for (let t = T - 1; t > 0; t--) {
    path[t - 1] = back[t][path[t]];
  }

  return path;
}

/**
 * Match a filter trajectory to the reference route using Viterbi HMM.
 *
 * @param obs Filter positions (x, y) per epoch
 * @param route Reference route (ground-truth GNSS or road network)
 * @param params Optional HMM parameters
 * @returns Matched positions (same length as obs) + metadata
 */
export function matchTrack(
  obs: Point[],
  route: Point[],
  params: HMMParams = defaultHMMParams
): { matched: Point[]; path: number[]; candidates: CandidatePoint[] } {
  const cands = buildCandidates(route);
  const path = viterbi(obs, cands, params);
  const matched: Point[] = path.map((j, t) =>
    j >= 0 ? { x: cands[j].x, y: cands[j].y } : obs[t]
  );
  return { matched, path, candidates: cands };
}