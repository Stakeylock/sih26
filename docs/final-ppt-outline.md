# Final Presentation Outline (SIH26168)
**Target:** 10-14 slides

## Slide 1: Title & Problem Statement
*   **Content:** "AstraNav-IDR: Self-Calibrating, Integrity-Aware Dead Reckoning for GNSS-Denied Navigation"
*   **Visuals:** Team Recalibrate logo, SIH logo.
*   **Asset Reuse:** Slide 1 from Idea Presentation.

## Slide 2: Why Dead Reckoning on Phones is Hard
*   **Content:** Explain the challenge of standalone smartphone inertial navigation. Accelerometer double-integration explodes exponentially. In-car vibrations and arbitrary phone mounts create massive bias. Un-gated corrupted GPS fixes entering right before a blackout corrupt initial filter states.
*   **Visuals:** Diagram showing "TRUSTED GNSS → DEGRADED → DENIED → DRIFT".
*   **Asset Reuse:** Slide 2 from Idea Presentation.

## Slide 3: Our Solution: AI-Aided Virtual Odometer + Live 15-State ES-EKF
*   **Content:** Instead of unconstrained position guessing, AstraNav-IDR uses a learned 4-class motion-mode classifier to extract discrete vehicle motion states (Stopped, Low, Medium, High). These feed a live 15-state Error-State EKF alongside Non-Holonomic Constraints (NHC), ML-gated ZUPT, and ZARU.
*   **Visuals:** High-level conceptual flow (Phone Sensors → Motion Classifier → ES-EKF with NHC/ZUPT → Position & Integrity Envelope).

## Slide 4: System Architecture & Implementation Stack
*   **Content:**
    *   **Active Submission:** Python + NumPy/Pandas feature extraction and multinomial classifier training (`prep_iovnbd.py`); live TypeScript/React in-browser 15-state ES-EKF with quaternion attitude and Viterbi HMM route matching.
    *   **Production Deployment Roadmap:** Android Kotlin native sensor service, compiled C++ mechanization core (100–200 Hz), ONNX Runtime / LiteRT, and full OSM graph matcher.
*   **Visuals:** Modular architecture diagram separating offline training from live navigation and edge targets.

## Slide 5: What's Implemented (Deterministic Simulation & Fault Lab)
*   **Content:** Browser prototype provides repeatable deterministic scenarios with controlled fault injection (potholes/vibration, mount rotation, GNSS jumps, bad ML speed). Demonstrates covariance inflation and integrity bounding under severe disturbances.
*   **Visuals:** Screenshot of the Replay Lab and Navigate map with 2σ covariance ellipse.

## Slide 6: Real-World Benchmark (IO-VNBD Dataset)
*   **Content:** Replays real driving trips from the IO-VNBD dataset (~58 hours, ~4,400 km smartphone IMU and GNSS data). Runs the live 15-state filter directly over real 10 Hz recorded gyro yaw rate, compass yaw, and GPS channels.
*   **Visuals:** Replay selector showing real trips (S1, S3a, S4) and blackout durations.

## Slide 7: Evaluation Protocol: Honest & Leakage-Free
*   **Content:**
    *   **Device-adapted temporal holdout:** Models are trained on the first 60% of each trip; all blackout test segments and holdout metrics occur strictly in the unseen later 40%.
    *   **Leave-One-Trip-Out (LOTO):** Cross-trip/mount transfer evaluated and reported separately.
    *   **Self-referenced DR error:** Position error is anchored at blackout start to isolate dead-reckoning performance from pre-window drift.
*   **Visuals:** Timeline diagram showing the 60% train / 40% holdout split and blackout evaluation window.

## Slide 8: Measured Machine Learning Results
*   **Content:**
    *   **Temporal Holdout (Beats majority baseline on every trip):**
        *   Trip S1: **60.5%** accuracy vs. 53.5% majority baseline (MAE: 4.39 m/s)
        *   Trip S3a: **53.7%** accuracy vs. 48.4% majority baseline (MAE: 4.16 m/s)
        *   Trip S4: **63.6%** accuracy vs. 54.2% majority baseline (MAE: 3.85 m/s)
    *   **LOTO Cross-Mount Transfer:** S1: 62.2%, S3a: 43.7%, S4: 68.3%.
    *   **Interpretation:** Proves why discrete motion-mode classification + physical constraint anchoring is superior to direct end-to-end regression across arbitrary phone mounts.
*   **Visuals:** Bar chart comparing temporal holdout accuracy against majority class baseline; Model Inspector weight heatmap.

## Slide 9: Navigation Evidence & Outage Benchmarks
*   **Content:** 60-Second Real-World Blackout (Trip S1):
    *   **Raw INS Final Error:** 624.62 m (~85% drift)
    *   **Classical Complementary + ZUPT:** 611.36 m (~83% drift)
    *   **AstraNav Full System (Live ES-EKF + ML):** **442.17 m** (~60% drift)
    *   Significant, consistent error reduction across all blackout scenarios.
*   **Visuals:** Head-to-head bar comparison from the Compare view.

## Slide 10: Integrity & Gating Highlights
*   **Content:**
    *   **2D $\chi^2$ NIS GNSS Gate:** 9.21 threshold (99% confidence for 2 DOF) rejects corrupted fixes.
    *   **ML-Gated ZUPT:** Requires physical stationary detection AND $P(\text{stopped}) > 0.45$ for 2 contiguous seconds.
    *   **Dual Integrity Envelope:** $2\sigma$-style covariance envelope + systematic-heading protection bound ($\bar{v} \cdot \psi_{\text{sys}} \cdot \tau$).
    *   **Viterbi Route-Topology Matcher:** Monotonic cumulative distance $s$ progression and emission-distance route-lock scoring.
*   **Visuals:** Trust Panel and Explainability Panel breakdown cards.

## Slide 11: Honest Limitations
*   **Content:**
    *   **Mechanization Adapter:** Live replay filter executes a 15-state ES-EKF core with recorded gyro, compass, GNSS, and pseudo-measurement aiding; horizontal phone-accelerometer propagation is intentionally suppressed in this replay adapter due to high commercial phone noise.
    *   **Mount Generalization:** Cross-mount speed regression is fundamentally challenging; discrete motion modes provide resilience.
    *   **Map Topology:** Current matcher uses recorded route topology; full OpenStreetMap (OSM) graph integration is planned.
    *   **Protection Bound:** Systematic-heading envelope is inspired by SBAS concepts, not formal multi-constellation aviation RAIM.
*   **Visuals:** "Honest Engineering" summary matrix.

## Slide 12: Production Roadmap
*   **Content:**
    1. Android Kotlin service: background sensor collection and real-time lifecycle daemon.
    2. Compiled C++ edge mechanization core running at 100–200 Hz.
    3. ONNX Runtime / LiteRT mobile deployment of motion classifiers.
    4. Full OpenStreetMap road network graph matching.
*   **Visuals:** Development roadmap milestone timeline.

## Slide 13: Impact & Applications
*   **Content:**
    *   Seamless navigation for rideshare, logistics, and emergency services in tunnels, multi-level parking garages, and high-density urban canyons.
    *   Zero hardware cost: 100% software solution requiring no OBD-II dongles or wheel sensors.
    *   Self-calibrating and integrity-aware: explicitly informs user and applications when to trust navigation outputs.
*   **Asset Reuse:** Slide 5 from Idea Presentation.

## Slide 14: Conclusion & Verification
*   **Content:**
    *   41 automated Vitest tests passing with GitHub Actions CI.
    *   Fully offline-capable web navigation console with 10 dedicated views.
    *   Demonstrated accuracy improvement on real-world IO-VNBD benchmark data.
