# AstraNav-IDR

An offline, deterministic, and live-filter browser replay instrument for Team Recalibrate's **SIH 2026 Problem Statement 26168**: *AI-ML based intelligent dead reckoning for seamless navigation*.

AstraNav-IDR demonstrates robust dead reckoning when GNSS becomes degraded or denied (e.g., in urban canyons, tunnels, or under jamming). The system combines a live **15-state Error-State Extended Kalman Filter (ES-EKF)**, a **learned motion-mode virtual odometer**, **Non-Holonomic Constraints (NHC)**, **ML-gated ZUPT/ZARU**, **NIS GNSS integrity gating**, an **SBAS-inspired systematic-heading protection bound**, and a **Viterbi HMM route-topology matcher**.

---

## Quick Start

```bash
# Install dependencies
npm install

# Run Vitest test suite (41 unit & integration tests)
npm test

# Build production bundle and run TypeScript typecheck
npm run build

# Start local development server
npm run dev
```

Open the local URL printed by Vite. The application runs **100% offline**: all benchmark datasets, model weights, and scenario geometries are bundled locally. No external APIs, cloud services, or network connections are required.

---

## Verified System Architecture

| Subsystem | Submission Implementation | Production Target |
| :--- | :--- | :--- |
| **Motion Mode Classifier** | Python + NumPy/Pandas: multinomial logistic regression / softmax classifier (`iovnbd-model.json`), 4 classes, rotation-invariant multi-scale window features | ONNX Runtime / LiteRT on-device inference |
| **Navigation Core** | Live in-browser 15-state ES-EKF with quaternion attitude representation (`src/engine/esekf.ts`, `src/engine/liveeskf.ts`) | C++ 100–200 Hz edge engine with native Android bindings |
| **Aiding Channels** | 2D GNSS fixes (2-DOF $\chi^2$ NIS gate at 9.21), GNSS speed, compass yaw, NHC, ML-gated ZUPT, ZARU, learned speed | Same + dual-antenna / RTK / wheel-tick interface if available |
| **Integrity Envelope** | $2\sigma$-style covariance envelope + SBAS-inspired systematic-heading protection bound ($\bar{v} \cdot \psi_{\text{sys}} \cdot \tau$) | Formal SBAS / ARAIM multi-hypothesis protection level |
| **Map Matching** | Viterbi HMM route-topology matcher (`src/engine/mapmatch.ts`) with cumulative route progression and emission-distance route-lock scoring | Full OpenStreetMap (OSM) graph topology matcher |
| **User Interface** | 10 dedicated views in TypeScript/React with Command Palette (`Ctrl/Cmd+K`), offline run persistence, and explainability cards | Android Kotlin native navigation UI |

> **Mechanization Note:** The live replay runner executes a 15-state ES-EKF core with recorded gyro, compass, GNSS, and pseudo-measurement aiding; horizontal phone-accelerometer propagation is intentionally suppressed in this replay adapter to reflect real smartphone IMU noise limits identified during research.

---

## Dataset and Evaluation Protocol

AstraNav-IDR is evaluated on the open-access **IO-VNBD** (Input-Output Vehicle Navigation Benchmark Dataset) recorded across diverse urban driving trips using commercial smartphones.

### Evaluation Protocol
- **Primary evaluation:** **Device-adapted temporal holdout** (first 60% of each trip for training, remaining 40% reserved for holdout evaluation and blackout segments). Blackout test segments occur strictly within the unseen temporal holdout window.
- **Cross-mount transfer:** **Leave-One-Trip-Out (LOTO)** cross-mount evaluation is reported separately to assess generalizability across distinct physical phone mounts.

### Motion Classifier Accuracy (4 classes: Stopped, Low, Medium, High)
- **Temporal Holdout (Beats majority baseline on every trip):**
  - **Trip S1:** **60.5%** accuracy vs. 53.5% majority baseline (MAE: 4.39 m/s)
  - **Trip S3a:** **53.7%** accuracy vs. 48.4% majority baseline (MAE: 4.16 m/s)
  - **Trip S4:** **63.6%** accuracy vs. 54.2% majority baseline (MAE: 3.85 m/s)
- **LOTO Cross-Mount Transfer:**
  - **S1:** 62.2%
  - **S3a:** 43.7%
  - **S4:** 68.3%
  *(Reported transparently in the Model Inspector: arbitrary phone mount orientation transfer remains an open challenge for end-to-end regression; our architecture uses robust quantized motion states and physical constraints rather than unconstrained raw acceleration).*

---

## Core Algorithmic Features

1. **Live 15-State ES-EKF (`src/engine/esekf.ts`, `src/engine/liveeskf.ts`):**
   - Error state: $\delta \mathbf{x} = [\delta \mathbf{p}_{3\times 1}, \delta \mathbf{v}_{3\times 1}, \delta \boldsymbol{\theta}_{3\times 1}, \delta \mathbf{b}_a, \delta \mathbf{b}_g]^T$.
   - True quaternion orientation kinematics $\mathbf{q} \leftarrow \mathbf{q} \otimes \delta \mathbf{q}$.
   - Live execution on every replay tick in-browser.

2. **Dimensionally Consistent 2D GNSS NIS Gating:**
   - 2D planar position update: $\mathbf{H}_{2\times 15}$, $\mathbf{z} = [x - p_x, y - p_y]^T$.
   - Normalized Innovation Squared ($\text{NIS} = \mathbf{z}^T \mathbf{S}^{-1} \mathbf{z}$) evaluated against $\chi^2(2, 0.99) = 9.21$. Fixes exceeding the gate are rejected before corrupting filter states.

3. **ML-Gated ZUPT & ZARU:**
   - Zero-Velocity Updates (ZUPT) require both the physical stationary detector ($\text{accel variance} < 0.35$, $\text{gyro} < 0.12$) **and** learned motion-mode $P(\text{stopped}) > 0.45$.
   - 2-second duration gating prevents false stops during smooth highway cruising.
   - Zero Angular Rate Updates (ZARU) simultaneously observe z-axis gyro bias when stopped.

4. **Viterbi HMM Route-Topology Matcher (`src/engine/mapmatch.ts`):**
   - Hidden states: road anchor points with strictly monotonic cumulative distance $s$ along the route.
   - Transition model enforces forward vehicle progression and penalizes backward jumps.
   - Route-lock score: exponential emission-distance likelihood $\exp(-d^2 / 2\sigma^2)$.

5. **Dual Integrity Envelope:**
   - Combines $2\sigma$-style covariance envelope with an SBAS-inspired systematic-heading protection bound ($\bar{v} \cdot \psi_{\text{sys}} \cdot \tau$).
   - Provides an honest, growing uncertainty boundary throughout the blackout window.

---

## Application Navigation & Features

The web console provides **10 dedicated views**:
- **Navigate:** Real-time map replay (2σ covariance ellipse, INS/Classical/EKF/Route-match trails, GNSS fix status).
- **Replay Lab:** Interactive fault injection (GNSS jumps, potholes, mount rotation, bad speed) and live ablation toggles (NHC, ZUPT, ML speed, GNSS gate).
- **Evidence:** Quantitative blackout benchmarks, drift percentages, and run export (JSON/CSV).
- **Architecture:** Interactive pipeline diagram detailing stage responsibilities.
- **Calibration:** Live gyro bias and magnetometer alignment gauges.
- **Experiments:** Segment-by-segment comparison across estimators.
- **Compare:** Direct head-to-head comparator between Classical EKF and AstraNav full system with SVG error bar charts and metric delta bars.
- **Data & Model Inspector:** Dataset provenance, segment inventory, and real learned weights heatmap (28 feature rows $\times$ 4 classes).
- **Runs Library:** Searchable, sortable library of runs with pinned run persistence via localStorage.
- **Diagnostics:** Comprehensive sensor channel health, filter step timing, and rejection diagnostics.

Keyboard shortcuts:
- `Space`: Play / Pause
- `←` / `→`: Scrub $\pm 5$ seconds
- `Ctrl+K` / `Cmd+K`: Instant Command Palette jump to any view or scenario

---

## Verification & Test Suite

The repository includes **41 automated Vitest tests** covering:
- `src/esekf.test.ts` (10 tests): ES-EKF propagation, quaternion kinematics, 2D GNSS update, NIS outlier rejection, NHC lateral suppression, ZUPT covariance collapse, and ZARU gyro bias observability.
- `src/simulation.test.ts` (13 tests): Deterministic replay, 10s/30s/60s blackout parameterized scenarios, fault injection, reacquisition hysteresis, and zero-distance handling.
- `src/engine/mapmatch.test.ts` (7 tests): Monotonic cumulative distance $s$, candidate generation, Viterbi path recovery, lateral error correction, outlier robustness, and turn tolerance.
- `src/engine/runlog.test.ts` (11 tests): Run serialization, persistence cap, schema validation, and deletion.

Continuous Integration is enforced via GitHub Actions on every push and PR (`.github/workflows/ci.yml`).
