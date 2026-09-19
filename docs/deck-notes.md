# Deck Notes: Idea Presentation (AstraNav-IDR)

## Slide 1: Title
*   **Terminology:** "AI-ML based Intelligent Dead Reckoning system for seamless navigation", "AstraNav-IDR", "Self-Calibrating, Integrity-Aware Dead Reckoning for GNSS-Denied Navigation"
*   **Key Claims:** "Turns a standalone smartphone into a virtual vehicle navigation unit when GNSS becomes unreliable or disappears."

## Slide 2: Problem Statement & Proposed Solution
*   **Terminology:** "TRUSTED GNSS", "DEGRADED", "DENIED", "DRIFT / WRONG EXIT"
*   **Key Claims:** "A Phone That Knows When GPS Is Wrong and Keeps Navigating"
*   **Key Claims:** "AI creates trustworthy virtual vehicle measurements; physics keeps the navigation state consistent."
*   **Key Claims:** "A bad fix can enter before total signal loss → INS starts from a corrupted state → bias accumulates → heading error grows → wrong road or flyover gets selected."
*   **Key Claims:** "AstraNav-IDR does not guess lat/long directly — it extracts physically useful signals cheap phone sensors can't provide reliably."

## Slide 3: Technical Approach
*   **Terminology:** "Error state $\delta \mathbf{x} = [\delta \mathbf{p}, \delta \mathbf{v}, \delta \boldsymbol{\theta}, \delta \mathbf{b}_a, \delta \mathbf{b}_g]^T$", "Learned velocity pseudo-measurement $z_v = \hat{v}_x^b - v_x^b, R_v = \sigma_v^2$"
*   **Architecture Components (Submission vs. Production):**
    *   **Python + NumPy/Pandas (Active Submission):** Feature extraction, multinomial motion-mode classifier, temporal holdout & LOTO evaluation, dataset bundling (`prep_iovnbd.py`).
    *   **TypeScript / Web (Active Submission):** Live in-browser 15-state ES-EKF with quaternion attitude, Viterbi HMM route-topology matcher, 2D $\chi^2$ NIS gating, 10 views, and offline replay console.
    *   **Android / Kotlin (Production Target):** Native sensor daemon, background lifecycle, UI.
    *   **C++ Edge Core (Production Target):** 100–200 Hz mechanization core, ONNX Runtime.

## Slide 4: Feasibility and Viability
*   **Key Claims:** "Feasible Because Every Claim Has a Dataset, Baseline, and Acceptance Gate"
*   **Dataset:** "Mandatory Proof: IO-VNBD", "~58 h / ~4,400 km smartphone data", "~10 Hz smartphone IMU", "Real driving scenarios", "GPS + IMU + vehicle-motion references".
*   **Evaluation Protocol (Accurate):**
    *   **Device-adapted temporal holdout:** Train on the first 60% of each trip, holdout evaluation on the remaining 40%. Blackout test windows occur strictly in the unseen holdout region.
    *   **Cross-mount transfer:** Separate Leave-One-Trip-Out (LOTO) cross-trip/mount evaluation.
*   **Measured Classifier Results (4 classes: Stopped, Low, Medium, High):**
    *   **Temporal Holdout (beats majority baseline on every trip):**
        *   S1: **60.5%** accuracy vs. 53.5% majority baseline (MAE: 4.39 m/s)
        *   S3a: **53.7%** accuracy vs. 48.4% majority baseline (MAE: 4.16 m/s)
        *   S4: **63.6%** accuracy vs. 54.2% majority baseline (MAE: 3.85 m/s)
    *   **LOTO Cross-Mount Transfer (honest reporting):** S1: 62.2%, S3a: 43.7%, S4: 68.3%. Acknowledges that cross-mount transfer remains challenging for unconstrained regression, validating our choice of quantized motion modes.
*   **Live Mechanization:** "15-state ES-EKF core with recorded gyro/compass/GNSS and pseudo-measurement aiding; horizontal phone-accelerometer propagation is intentionally suppressed in this replay adapter."
*   **Integrity Envelopes:** $2\sigma$-style covariance envelope + systematic-heading protection bound ($\bar{v} \cdot \psi_{\text{sys}} \cdot \tau$).
*   **Map Matching:** Viterbi HMM route-topology replay matcher with cumulative distance $s$ progression; route-lock score based on HMM emission distance; full OSM graph is future work.

## Slide 5: Impact and Benefits
*   **Key Claims:** "A software upgrade that turns sensors already present in a phone into a resilient navigation layer."
*   **Scenarios:**
    *   **Tunnels & Valleys:** Relative navigation continues seamlessly through GNSS-denied stretches with an honest, growing integrity envelope.
    *   **Urban Canyons & Interference:** GNSS quality is continuously monitored via 2D $\chi^2$ NIS gating (9.21 gate at 99% confidence), so corrupted fixes are rejected before contaminating filter states.
    *   **Parking Structures:** Vehicle motion continues through total GNSS denial. Gradual reacquisition on exit prevents snapping or teleporting when GPS returns.
*   **Scalability Claims:** Requires no OBD-II or wheel-speed installation. Operates entirely offline with a clean migration path to fleet-grade external IMUs.
*   **Output Definition:** "Where am I, how certain am I, and which navigation sources are currently trustworthy?"

## Slide 6: Research and References
*   Cites IO-VNBD dataset, AI-IMU dead-reckoning, and stationary detection/map matching literature.

---

## Consistency Check & Verification Matrix

### (a) Demonstrated in the Live Prototype
*   **Live 15-State ES-EKF**: Implemented in TypeScript (`src/engine/esekf.ts`, `src/engine/liveeskf.ts`) with quaternion attitude, position, velocity, and 3-axis bias states. Runs live at 10 Hz.
*   **Aiding Channels**: 2D GNSS updates with 9.21 NIS gate, compass yaw, NHC, ML-gated ZUPT ($P(\text{stopped}) > 0.45$), ZARU, and learned speed.
*   **Real IO-VNBD Benchmark**: Real smartphone IMU/GNSS recordings replayed live (Trips S1, S3a, S4).
*   **Viterbi HMM Route Matcher**: Implemented in `src/engine/mapmatch.ts` with monotonic cumulative distance $s$.
*   **Test Suite & CI**: 41 Vitest tests green across 4 test suites; automated GitHub Actions CI workflow.
*   **Console UI**: 10 views (including ComparatorView and Run Library), Model Inspector, Explainability Panel, and Command Palette (`Ctrl/Cmd+K`).
*   **Offline Operation**: Zero external API dependencies; all bundles and weights stored locally.

### (b) Future Production Roadmap
*   **Android / Kotlin**: Native background sensor collection service and lifecycle management.
*   **C++ Navigation Core**: Compiled 100–200 Hz mechanization core with JNI bindings.
*   **ONNX Runtime / LiteRT**: Embedded neural/linear inference on-device.
*   **OpenStreetMap (OSM) Graph**: Full street graph network matcher replacing prototype route-topology matcher.
