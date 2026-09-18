# Final Presentation Outline (SIH26168)
**Target:** 10-14 slides

## Slide 1: Title & Problem Statement
*   **Content:** "AstraNav-IDR: Self-Calibrating, Integrity-Aware Dead Reckoning for GNSS-Denied Navigation"
*   **Visuals:** Team Recalibrate logo, SIH logo.
*   **Asset Reuse:** Slide 1 from Idea Presentation.

## Slide 2: Why Dead Reckoning is Hard
*   **Content:** Explain the problem with standalone smartphone INS. A bad GPS fix before loss corrupts the starting state. Accelerometer integration explodes rapidly due to vibration and attitude error.
*   **Visuals:** Diagram showing "TRUSTED GNSS → DEGRADED → DENIED → DRIFT".
*   **Asset Reuse:** Slide 2 from Idea Presentation.

## Slide 3: Our Solution: AI-Aided Virtual Odometer
*   **Content:** Instead of directly guessing lat/long, we use a learned motion-mode classifier. It extracts stop/motion states to anchor a physics-based filter (ZUPT-anchored fusion).
*   **Visuals:** High-level conceptual flow (Sensors → Classifier → Fusion → Position).

## Slide 4: Architecture
*   **Content:** Python/PyTorch for training, C++ for mechanization (ES-EKF), TS/React for the current replay prototype.
*   **Visuals:** The 4-block architecture diagram.
*   **Asset Reuse:** Slide 3 from Idea Presentation (Architecture block).

## Slide 5: What's Implemented (Synthetic)
*   **Content:** Our browser-based prototype features a synthetic engine that perfectly simulates GNSS degradation, blackout, and reacquisition to demonstrate core filter behavior.
*   **Visuals:** Screenshot of the CityMap replay mode with a synthetic track.

## Slide 6: Fault Injection & Replay Lab
*   **Content:** We can inject "Pothole" / vibration faults to test robustness. Our system responds via covariance inflation to avoid destroying the heading.
*   **Visuals:** Screenshot of the Replay Lab and Evidence metrics.

## Slide 7: What's Implemented (Real Data: IO-VNBD)
*   **Content:** Beyond synthetic, we implemented a full replay of real-world smartphone data using the IO-VNBD benchmark. We run a learned motion-mode classifier over real CSV inputs.
*   **Visuals:** The "Data Source" switcher in the UI showing "IO-VNBD" selected.

## Slide 8: Evaluation Protocol
*   **Content:** We use a self-referenced DR error metric inside the blackout window. Error is measured vs a jump-filtered GPS reference to isolate dead-reckoning performance without pre-window bias.
*   **Visuals:** Simple diagram showing position anchoring at the start of a blackout.

## Slide 9: Measured Results (Evidence)
*   **Content:** Results from a 60-second real-world GNSS outage (Trip S1).
    *   **Raw INS Final Error:** 624.62 m (~85% drift)
    *   **Classical ZUPT Final Error:** 611.36 m (~83% drift)
    *   **Ours (AI-EKF) Final Error:** 442.17 m (~60% drift)
*   **Visuals:** The real-data Evidence table from the application.

## Slide 10: Honest Limitations
*   **Content:** We explicitly acknowledge constraints: Centimeter-level speed from a phone in a random mount is unreliable (cross-mount regression transfer is poor). Therefore, we rely on quantized stop/motion states. The current implementation is a browser-based replay to validate the pipeline.
*   **Visuals:** Honest limits summary.

## Slide 11: Roadmap & Future Work
*   **Content:** The path forward to a live system:
    *   Android live app (Kotlin UI + Sensors)
    *   ONNX on-device inference
    *   15-state ES-EKF integration
    *   C++ native core
*   **Visuals:** Bullet points or a timeline.
*   **Asset Reuse:** Slide 4 (Risks/Mitigation) and Slide 3 (Android/ONNX parts).

## Slide 12: Impact and Benefits
*   **Content:** Seamless relative navigation through tunnels, urban canyons, and parking structures. No OBD-II or wheel-speed hardware needed.
*   **Asset Reuse:** Slide 5 from Idea Presentation.

## Slide 13: References
*   **Content:** Academic papers and datasets cited.
*   **Asset Reuse:** Slide 6 from Idea Presentation.
