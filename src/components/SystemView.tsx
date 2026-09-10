import { useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  BrainCircuit,
  GitBranch,
  MapPinned,
  Radio,
  Satellite,
  ShieldCheck,
} from "lucide-react";

const stages = [
  {
    title: "INS mechanisation",
    subtitle: "Accelerometer + gyro propagation",
    icon: Activity,
    tone: "ins",
    description:
      "The inertial navigation branch integrates calibrated acceleration and yaw rate at 10 Hz. Its position is intentionally allowed to drift during a GNSS outage so the value of aiding remains visible.",
    contract: "IMU packet → Δposition · speed · yaw · covariance",
    file: "engine/simulation.ts · propagate(ins)",
    production:
      "Replace the planar propagation with a frame-validated strapdown INS and Android sensor timestamps.",
  },
  {
    title: "GNSS observation",
    subtitle: "Quality, outage, and innovation gate",
    icon: Satellite,
    tone: "gnss",
    description:
      "GNSS fixes are displayed as individual observations. The outage band removes fixes, degraded fixes are down-weighted, and large innovations are rejected before fusion.",
    contract: "GNSS packet → fix · quality · residual · accepted/rejected",
    file: "engine/simulation.ts · GNSS gate",
    production:
      "Use receiver accuracy, multipath indicators, clock state, and validated coordinate transforms from real logs.",
  },
  {
    title: "ML virtual odometer",
    subtitle: "Learned speed aiding with OOD guard",
    icon: BrainCircuit,
    tone: "ml",
    description:
      "The model branch emits a virtual speed observation and confidence. A mount shift, pothole, or out-of-distribution speed makes the measurement suspend, allowing the filter to fall back to INS.",
    contract: "IMU window → virtual speed · confidence · OOD score",
    file: "engine/simulation.ts · ML observation",
    production:
      "Train on trip-disjoint data, calibrate uncertainty, and validate the model on held-out phones and roads.",
  },
  {
    title: "ES-EKF fusion",
    subtitle: "Primary INS + GNSS + ML estimate",
    icon: ShieldCheck,
    tone: "ekf",
    description:
      "The primary estimate fuses inertial propagation with accepted GNSS innovations and guarded virtual-speed aiding. This browser implementation is a reduced-order ES-EKF-shaped demonstration, not a production 15-state filter.",
    contract:
      "Nominal state + error innovation → position · velocity · covariance",
    file: "engine/simulation.ts · applyGnssInnovation",
    production:
      "Implement and test the handbook’s full error-state model, NHC constraints, observability checks, and covariance tuning.",
  },
  {
    title: "Map-assisted output",
    subtitle: "Road candidates and confidence gate",
    icon: MapPinned,
    tone: "map",
    description:
      "The map matcher projects the ES-EKF estimate onto candidate roads and computes likelihoods from distance and heading. Feedback is applied only when the top candidate is unambiguous; the INS and ES-EKF traces remain untouched.",
    contract: "ES-EKF pose + road graph → candidates · match · feedback gate",
    file: "engine/simulation.ts · project/map gate",
    production:
      "Use a connected OSM graph with temporal matching, topology constraints, and a safe fallback when roads are ambiguous.",
  },
  {
    title: "Replay & evidence",
    subtitle: "One clock, traceable outputs",
    icon: GitBranch,
    tone: "evidence",
    description:
      "One deterministic replay publishes all branches at 10 Hz. Seeking, fault injection, charts, metrics, and exports use the same snapshot contract and never leak future samples.",
    contract: "Run → snapshots · events · layers · metrics · provenance",
    file: "hooks/useReplay.ts · components/Evidence.tsx",
    production:
      "Keep this contract when a native recorder or real-time Android engine replaces the synthetic source.",
  },
];

export function SystemView() {
  const [selected, setSelected] = useState(0),
    stage = stages[selected];
  return (
    <div className="system-page">
      <span className="section-label">HOW ASTRANAV WORKS</span>
      <h2>From sensors to a trusted route.</h2>
      <p className="system-intro">
        The layers are separate on purpose: INS shows drift, GNSS shows when
        fixes disappear, ES-EKF is the primary fused state, ML is an aiding
        measurement, and map matching is a confidence-gated output.
      </p>
      <div className="pipeline">
        {stages.map((current, index) => (
          <button
            key={current.title}
            className={`${index === selected ? "chosen " : ""}${current.tone}`}
            onClick={() => setSelected(index)}
          >
            <span className="stage-number">0{index + 1}</span>
            <current.icon size={25} />
            <strong>{current.title}</strong>
            <small>{current.subtitle}</small>
            <ArrowRight className="stage-next" size={16} />
          </button>
        ))}
      </div>
      <div className="stage-detail">
        <div className={`stage-illustration ${stage.tone}`}>
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
          <Radio size={16} />
          <h3>Observation boundary</h3>
          <p>
            Only the synthetic sensor source sees the hidden reference route.
            Estimators consume packets, not truth.
          </p>
        </section>
        <section>
          <ShieldCheck size={16} />
          <h3>Integrity boundary</h3>
          <p>
            Rejected GNSS fixes produce zero correction. ML and map aiding can
            suspend independently when their confidence is low.
          </p>
        </section>
        <section>
          <GitBranch size={16} />
          <h3>Research boundary</h3>
          <p>
            The ES-EKF and ML branches are reduced-order, functional stand-ins
            until real sensor logs, training, calibration, and validation land.
          </p>
        </section>
      </div>
    </div>
  );
}
