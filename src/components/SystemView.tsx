import { useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  BrainCircuit,
  GitBranch,
  Radio,
  ShieldCheck,
} from "lucide-react";
const stages = [
  {
    title: "Sensor source",
    subtitle: "Synthetic observation packets",
    icon: Radio,
    description:
      "A seeded generator derives acceleration, yaw rate, virtual speed, and GNSS observations from a reference route. Faults corrupt these observations before they reach the estimator.",
    contract:
      "Observation → acceleration · yawRate · virtualSpeed · fix · quality",
    file: "engine/simulation.ts",
    production: "Replace with recorded packets or Android SensorManager data.",
  },
  {
    title: "Motion estimator",
    subtitle: "Causal planar propagation",
    icon: Activity,
    description:
      "The estimate integrates acceleration and yaw rate at 10 Hz. Optional virtual-speed aiding corrects velocity. It never reads the hidden reference position.",
    contract: "Estimator → position · speed · yaw · variance",
    file: "engine/simulation.ts",
    production:
      "Replace the planar approximation with a validated native ES-EKF.",
  },
  {
    title: "Integrity gates",
    subtitle: "Accept, suspend, recover",
    icon: ShieldCheck,
    description:
      "GNSS residuals are gated. Rejected observations do not correct position. Returning GNSS needs three consecutive consistent fixes. Faults suspend virtual-speed aiding.",
    contract: "TRUSTED → DEGRADED → DENIED → REACQUIRING",
    file: "engine/simulation.ts",
    production:
      "Validate thresholds, detection delays, and uncertainty calibration on held-out trips.",
  },
  {
    title: "Road hypotheses",
    subtitle: "Independent map-assisted display",
    icon: GitBranch,
    description:
      "Static road geometry and the estimated position define candidate likelihoods. Map assistance requires a probability above 0.8 and a margin above 0.2. Raw estimates remain unchanged.",
    contract: "Candidates → probability · projection · feedback gate",
    file: "engine/geometry.ts",
    production: "Use a connected OSM graph and a temporal HMM/Viterbi matcher.",
  },
  {
    title: "Replay & evidence",
    subtitle: "One clock, traceable outputs",
    icon: BrainCircuit,
    description:
      "One replay clock publishes snapshots. Seeking reads the same deterministic run. Charts, metrics, and exports use only samples already observed by the selected timestamp.",
    contract: "Run → snapshots · events · config · provenance",
    file: "hooks/useReplay.ts",
    production:
      "Implement the same snapshot contract in the real navigation source.",
  },
];
export function SystemView() {
  const [selected, setSelected] = useState(0),
    stage = stages[selected];
  return (
    <div className="system-page">
      <span className="section-label">HOW ASTRANAV WORKS</span>
      <h2>One estimate. Every decision traceable.</h2>
      <p className="system-intro">
        A working simulation pipeline, with explicit boundaries for the future
        navigation engine.
      </p>
      <div className="pipeline">
        {stages.map((s, i) => (
          <button
            key={s.title}
            className={i === selected ? "chosen" : ""}
            onClick={() => setSelected(i)}
          >
            <span className="stage-number">0{i + 1}</span>
            <s.icon size={25} />
            <strong>{s.title}</strong>
            <small>{s.subtitle}</small>
            <ArrowRight className="stage-next" size={16} />
          </button>
        ))}
      </div>
      <div className="stage-detail">
        <div className="stage-illustration">
          <stage.icon size={54} />
          <span>0{selected + 1}</span>
          <ArrowDown size={22} />
        </div>
        <div>
          <span className="section-label">{stage.file}</span>
          <h3>{stage.title}</h3>
          <p>{stage.description}</p>
          <code>{stage.contract}</code>
          <div className="production-note">
            <strong>Production path</strong>
            <p>{stage.production}</p>
          </div>
        </div>
      </div>
      <div className="architecture-notes">
        <section>
          <h3>Deterministic by design</h3>
          <p>
            Seed 26168, fixed 100 ms steps, and a recorded fault schedule make
            runs repeatable across play, pause, and seek.
          </p>
        </section>
        <section>
          <h3>Honest by design</h3>
          <p>
            This is a reduced-order simulation. It does not claim a trained
            neural model, a full ES-EKF, or validated real-world accuracy.
          </p>
        </section>
        <section>
          <h3>Local by design</h3>
          <p>
            Map geometry, observations, and exports stay in the browser. No map
            keys, cloud requests, or device permissions are needed.
          </p>
        </section>
      </div>
    </div>
  );
}
