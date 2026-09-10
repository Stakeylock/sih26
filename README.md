# AstraNav-IDR prototype

An offline, deterministic browser prototype for Team Recalibrate's SIH 2026 Problem Statement 26168: AI-ML based intelligent dead reckoning for seamless navigation.

The prototype turns the AstraNav-IDR story into a judge-ready replay instrument. Start with a stable GNSS fix, play through a degradation and blackout, inspect the INS drift, the primary ES-EKF, guarded ML virtual-odometer aiding, map matching, and a classical comparator, then watch guarded reacquisition restore trust.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The app uses bundled synthetic map geometry and simulation data, so the demonstration does not require an API key or internet connection.

To create a production build:

```bash
npm run build
```

## Judge demonstration

1. Start on Navigate with **Expert** mode enabled.
2. Select **Play 2-minute demo**.
3. At GNSS degradation, point out that the system changes trust before the fix disappears.
4. During the blackout, show the amber INS drift, cyan ES-EKF + ML trajectory, lime map-assisted output, rose classical comparator, visible GNSS outage band, simulated uncertainty bound, and outage timer.
5. At the pothole marker, show the shock event and softened constraints.
6. Open a timeline event to pause and seek to the exact state transition.
7. Use Evidence to show the calculated comparison and the validation roadmap.
8. Use Architecture to inspect the responsibilities of each pipeline stage.

## What is simulated versus implemented

Implemented in this prototype:

- deterministic planar replay with repeatable scenarios;
- GNSS `TRUSTED`, `DEGRADED`, `DENIED`, and `REACQUIRING` states;
- reference, INS, ES-EKF + ML, map-assisted, classical comparator, GNSS, and uncertainty layers;
- controlled GNSS jumps, potholes, mount rotations, and bad learned-speed faults;
- road-candidate display with ambiguity gating;
- synchronized event ledger, charts, metrics, and JSON/CSV export;
- responsive desktop and mobile layouts;
- a typed navigation snapshot contract that a future replay or native engine can implement.

Represented as a transparent simulation boundary:

- the ML virtual odometer and its confidence/OOD guard;
- reduced-order ES-EKF-like fusion and innovation gating;
- the 95% horizontal confidence bound;
- road candidate scoring;
- the navigation health score.

The browser prototype does not claim a trained model, a validated 15-state ES-EKF, real Android sensor collection, IO-VNBD benchmark results, or measured drift performance. Those are production and research follow-ups described in the handbook.

## Integration path

The UI consumes typed `Snapshot` values through one shared replay controller. The snapshot separates `ins`, `ekf`, `map`, `classical`, and `gnss` observations, plus ML quality and gate decisions. A future native bridge or replay adapter can replace the synthetic source, with coordinate-frame and timestamp validation. The next research milestone is the handbook's recommended chain: IO-VNBD audit, leakage-safe trip split, ES-EKF + NHC, virtual speed, then 30/60 second blackout evaluation.

## Source architecture

| Module                     | Responsibility                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/engine/types.ts`      | Configuration, snapshot, event, and run contracts                                                      |
| `src/engine/scenarios.ts`  | Offline district geometry and scenario schedules                                                       |
| `src/engine/simulation.ts` | Seeded sensor generation, planar estimation, GNSS gating, fault recovery, road hypotheses, and metrics |
| `src/engine/geometry.ts`   | Projection, interpolation, distance, and angle helpers                                                 |
| `src/hooks/useReplay.ts`   | Shared clock, seeking, speed, configuration, and causal fault injection                                |
| `src/components/`          | Map, telemetry, playback, replay lab, evidence, architecture, and dialogs                              |
| `src/App.tsx`              | Workspace composition and navigation                                                                   |

The sensor generator reads the reference route; INS, ES-EKF, and classical branches integrate measurements instead of reading reference positions directly. ML virtual speed is an observation into the primary ES-EKF, not a hidden correction. Road assistance changes a separate output, never INS or ES-EKF. Ambiguous road candidates suspend assistance. Rejected GNSS observations produce zero position correction; reacquisition requires three consecutive consistent fixes.

Runs contain 1,201 snapshots at 10 Hz over 120 seconds. Playback speed changes wall-clock progression, not results. Injected faults take effect at the current replay timestamp without altering earlier snapshots. Changing scenario configuration starts a fresh run. Evidence and exports exclude future observations; drift is unavailable until positive outage distance is observed.

## Verification

```bash
npm test
npm run build
```

The 13-test suite covers deterministic runs, outage and reacquisition, rejected-fix correction, INS/ES-EKF/map separation, ambiguity gating, causal injection and recovery, bad-speed handling, observed-only metrics, zero-distance drift, and finite outputs across scenarios and blackout durations. Browser checks cover desktop/mobile layout, map layers and zoom, event seeking, fault injection, and JSON export.

No backend, API key, live map service, or trained model is required. The synthetic uncertainty bound is illustrative, not a calibrated statistical guarantee. Real-world performance remains unvalidated.
