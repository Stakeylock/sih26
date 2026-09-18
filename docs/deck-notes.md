# Deck Notes: Idea Presentation

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
*   **Terminology:** "Error state δx = [δp, δv, δθ, δbₐ, δb_g]ᵀ", "Learned velocity zᵥ = v̂ₓᵛ − vₓᵛ , Rᵥ = σᵥ²"
*   **Architecture Components:**
    *   "Python / PyTorch: Training • dataset • evaluation"
    *   "C++: Mechanization • ES-EKF • edge • replay"
    *   "Android / Kotlin: Sensors • lifecycle • UI • offline map"
    *   "ONNX Runtime: On-device inference"

## Slide 4: Feasibility and Viability
*   **Key Claims:** "Feasible Because Every Claim Has a Dataset, Baseline and Acceptance Gate"
*   **Dataset:** "Mandatory Proof: IO-VNBD", "~58 h / ~4,400 km smartphone data", "~10 Hz smartphone IMU", "Real driving scenarios", "GPS + IMU + vehicle-motion references"
*   **Workflow:** "Schema audit → Trip-disjoint split → Virtual odometer → ES-EKF + NHC → 10/30/60s blackout → Trajectory + drift"
*   **Implementation Targets:** "10 Hz phone navigation output target", "High-rate external-IMU compatibility will be claimed only after measured validation."
*   **Validation Questions & Metrics:** "Survives blackout?", "AI improves DR?", "Heading remains bounded?", "Confidence is meaningful?", "Works on unseen trip?", "Works on unseen phone?", "Runs live?"
*   **Risks/Mitigation:** "Heading drift: Bias state + road heading + alignment", "Pothole / vibration: Context detector + covariance inflation", "Wrong road match: HMM + confidence gate + innovation cap", "Unseen phone: Rotation/noise augmentation + small adapter", "Bad returning GNSS: Reacquisition consistency state"
*   **Tech Stack:** "Python / PyTorch: train + benchmark", "ONNX / LiteRT: export + optimize", "C++ navigation core: 100—200 Hz-capable architecture", "Android / Kotlin: sensor collection + Ul + offline map"

## Slide 5: Impact and Benefits
*   **Key Claims:** "A software upgrade that turns sensors already present in a phone into a resilient navigation layer."
*   **Scenarios:**
    *   **Tunnels & Valleys:** "Relative navigation continues seamlessly through GNSS-denied stretches... with a mathematically sound, growing confidence bound."
    *   **Urban Canyons & Interference:** "GNSS quality is continuously monitored rather than blindly trusted, so degraded or jammed signals lose influence instead of corrupting the fix."
    *   **Parking Structures:** "Vehicle motion continues through total GNSS denial. Gradual reacquisition on exit prevents aggressive snapping or teleporting when GPS returns."
*   **Scalability Claims:** "Requires no OBD-II or wheel-speed installation. Operates entirely offline on a reusable C++ edge engine, with a clean migration path from smartphone to fleet-grade external IMUs."
*   **Output Definition:** "The output is not only 'where am I?' — it is 'where am I, how certain am I, and which navigation sources are currently trustworthy?'"

## Slide 6: Research and References
*   Cites IO-VNBD dataset, AI-IMU dead-reckoning, and various stationary detection/map matching papers.

---

## Consistency Check

### (a) Claims already demonstrated by the app
*   **"Survives blackout?" / "Tunnels & Valleys"**: Demonstrated via synthetic replay engine, GNSS degradation/blackout/reacquisition scenarios, and realistic trajectory evaluation.
*   **"Pothole / vibration" / "Bad returning GNSS"**: Demonstrated in the fault injection Replay lab.
*   **"Confidence is meaningful?"**: Evaluated and exported via evidence metrics + exports.
*   **"Requires no OBD-II or wheel-speed installation. Operates entirely offline"**: The prototype runs fully offline.
*   **Architecture view**: Shown via the SystemView/architecture view.

### (b) Newly demonstrated tonight (REAL IO-VNBD benchmark replay)
*   **"Mandatory Proof: IO-VNBD" / "Real driving scenarios"**: We have added real IO-VNBD benchmark replay using real phone IMU/GNSS CSVs.
*   **"Virtual odometer"**: Implemented as a learned motion-mode classifier + ZUPT-anchored fusion.
*   **"Works on unseen trip?"**: Verified via trip-disjoint split / trip-disjoint evaluation.
*   **Self-referenced DR error**: Re-referencing to position at blackout start to measure real blackout error metrics without pre-window propagation drift.

### (c) Still future work
*   **"Android / Kotlin: Sensors • lifecycle • UI • offline map"**: An Android live app is not implemented yet; tonight's prototype is browser-based replay.
*   **"ONNX Runtime: On-device inference"**: ONNX on-device is not yet implemented (no Android app tonight).
*   **"Error state δx = [δp, δv, δθ, δbₐ, δb_g]ᵀ"**: The full 15-state ES-EKF is future work.
*   **"C++ navigation core: 100—200 Hz-capable architecture"**: The C++ core is future work; currently implemented in TS/JS for browser replay.
