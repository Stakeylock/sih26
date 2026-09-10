# AstraNav-IDR prototype

An offline, deterministic browser prototype for Team Recalibrate's SIH 2026 Problem Statement 26168: AI-ML based intelligent dead reckoning for seamless navigation.

The prototype turns the AstraNav-IDR story into a judge-ready replay instrument. Start with a stable GNSS fix, play through a degradation and blackout, inspect the simulated uncertainty bound, inject faults, compare the hybrid estimate with a classical baseline, and watch guarded reacquisition restore trust.

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
4. During the blackout, show the cyan AstraNav trajectory, the red classical drift, the growing simulated 95% bound, and the outage timer.
5. At the pothole marker, show the shock event and softened constraints.
6. Open a timeline event to pause and seek to the exact state transition.
7. Use Evidence to show the calculated comparison and the validation roadmap.
8. Use System to explain the path from sensors to navigation trust.

## What is simulated versus implemented

Implemented in this prototype:

- deterministic planar replay with repeatable scenarios;
- GNSS `TRUSTED`, `DEGRADED`, `DENIED`, and `REACQUIRING` states;
- reference, classical, hybrid, map-assisted, GNSS, and uncertainty layers;
- controlled GNSS jumps, potholes, mount rotations, and bad learned-speed faults;
- road-candidate display with ambiguity gating;
- synchronized event ledger, charts, metrics, and JSON/CSV export;
- responsive desktop and mobile layouts;
- a typed navigation snapshot contract that a future replay or native engine can implement.

Represented as a transparent simulation boundary:

- the learned virtual odometer and its uncertainty;
- physical fusion and error-state behavior;
- the 95% horizontal confidence bound;
- road candidate scoring;
- the navigation health score.

The browser prototype does not claim a trained model, a validated 15-state ES-EKF, real Android sensor collection, IO-VNBD benchmark results, or measured drift performance. Those are production and research follow-ups described in the handbook.

## Integration path

The UI consumes immutable `NavigationSnapshot` values from a deterministic source. A future native bridge or replay engine can replace the source while preserving the view contracts. The next research milestone is the handbook's recommended chain: IO-VNBD audit, leakage-safe trip split, ES-EKF + NHC, virtual speed, then 30/60 second blackout evaluation.
