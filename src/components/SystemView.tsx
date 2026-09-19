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
import type { Snapshot } from "../engine/types";
import { timeLabel } from "../engine/geometry";

/** Live value row inside a stage's expanded panel */
function LiveRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`sv-live-row ${tone ? `sv-live-row--${tone}` : ""}`}>
      <span className="sv-live-label">{label}</span>
      <span className="sv-live-value">{value}</span>
    </div>
  );
}

/** Connection line between pipeline blocks. Shows active, degraded or inactive. */
function ConnLine({ state }: { state: "active" | "degraded" | "inactive" }) {
  return (
    <div className={`sv-conn sv-conn--${state}`} aria-hidden>
      <div className="sv-conn-line" />
      <div className="sv-conn-arrow" />
    </div>
  );
}

type Stage = {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number }>;
  tone: string;
  description: string;
  contract: string;
  file: string;
  production: string;
  connState: (s: Snapshot) => "active" | "degraded" | "inactive";
  liveValues: (s: Snapshot) => { label: string; value: string; tone?: string }[];
};

const stages: Stage[] = [
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
      "Replace the planar propagation with a strapdown INS validated for its frame, plus Android sensor timestamps.",
    connState: () => "active",
    liveValues: (s) => [
      { label: "Update rate", value: "10 Hz", tone: "ok" },
      { label: "Heading", value: `${Math.round(s.heading)}°` },
      { label: "Sigma", value: `${s.sigma.toFixed(2)} m/s²` },
      { label: "Shock", value: s.shock ? "DETECTED" : "None", tone: s.shock ? "warn" : undefined },
    ],
  },
  {
    title: "GNSS observation",
    subtitle: "Quality, outage, and innovation gate",
    icon: Satellite,
    tone: "gnss",
    description:
      "GNSS fixes are displayed as individual observations. The outage band removes fixes, degraded fixes carry less weight, and large innovations are rejected before fusion.",
    contract: "GNSS packet → fix · quality · residual · accepted/rejected",
    file: "engine/simulation.ts · GNSS gate",
    production:
      "Use receiver accuracy, multipath indicators, clock state, and validated coordinate transforms from real logs.",
    connState: (s) =>
      s.state === "DENIED"
        ? "inactive"
        : s.state === "DEGRADED" || s.state === "REACQUIRING"
          ? "degraded"
          : "active",
    liveValues: (s) => [
      {
        label: "State",
        value: s.state,
        tone: s.state === "TRUSTED" ? "ok" : s.state === "DENIED" ? "bad" : "warn",
      },
      { label: "Fix", value: s.gnss ? (s.gnssAccepted ? "Accepted" : "Rejected") : "No fix" },
      {
        label: "Innovation",
        value: s.gnssResidual != null ? `${s.gnssResidual.toFixed(1)} m` : "n/a",
      },
      { label: "Outage", value: s.outage > 0 ? timeLabel(s.outage) : "n/a" },
    ],
  },
  {
    title: "ML virtual odometer",
    subtitle: "Learned speed aiding with OOD guard",
    icon: BrainCircuit,
    tone: "ml",
    description:
      "The model branch emits a virtual speed observation and confidence. A mount shift, pothole, or out of distribution speed makes the measurement suspend, allowing the filter to fall back to INS.",
    contract: "IMU window → virtual speed · confidence · OOD score",
    file: "engine/simulation.ts · ML observation",
    production:
      "Train on trip disjoint data, calibrate uncertainty, and validate the model on held out phones and roads.",
    connState: (s) =>
      s.mlQuality === "READY"
        ? "active"
        : s.mlQuality === "DISABLED"
          ? "inactive"
          : "degraded",
    liveValues: (s) => [
      {
        label: "Quality",
        value: s.mlQuality,
        tone: s.mlQuality === "READY" ? "ok" : s.mlQuality === "DISABLED" ? "off" : "warn",
      },
      { label: "Speed", value: `${(s.mlSpeed * 3.6).toFixed(1)} km/h` },
      { label: "Confidence", value: `${(s.mlConfidence * 100).toFixed(0)}%` },
      { label: "OOD score", value: s.mlOod.toFixed(3) },
    ],
  },
  {
    title: "ES-EKF fusion",
    subtitle: "Error state filter with 15 states (live in the browser)",
    icon: ShieldCheck,
    tone: "ekf",
    description:
      "A real error state EKF with 15 states (position, velocity, attitude, accel and gyro biases) runs live in the browser on recorded IMU channels: quaternion mechanisation, NIS gated GNSS updates, NHC, ZUPT and ZARU gated on stop duration, and ML speed aiding. In synthetic mode the reduced order demonstration filter is shown instead.",
    contract: "IMU + GNSS + ML + constraints → 15 state estimate · covariance",
    file: "engine/esekf.ts · engine/liveeskf.ts",
    production:
      "The same 15 state model is the production core. On device it would consume raw phone IMU at full rate with speed aiding from an ONNX model.",
    connState: (s) =>
      s.state === "TRUSTED" ? "active" : s.state === "DENIED" ? "degraded" : "degraded",
    liveValues: (s) => [
      { label: "Speed", value: `${(s.speed * 3.6).toFixed(1)} km/h` },
      { label: "95% bound", value: `${s.bound.toFixed(1)} m` },
      {
        label: "GNSS used",
        value: s.gnssAccepted ? "Yes" : "No",
        tone: s.gnssAccepted ? "ok" : "warn",
      },
      { label: "ML used", value: s.mlUsed ? "Yes" : "No", tone: s.mlUsed ? "ok" : undefined },
      ...(s.filterMs != null
        ? [{ label: "Step time", value: `${s.filterMs.toFixed(2)} ms` }]
        : []),
    ],
  },
  {
    title: "Map assisted output",
    subtitle: "Viterbi HMM route/road matching",
    icon: MapPinned,
    tone: "map",
    description:
      "A Viterbi HMM matcher (tested: emission likelihood × transitions consistent in heading, max path over the trajectory) constrains the estimate to the route topology in replay mode; the synthetic engine uses the original road graph gate. Feedback never overwrites the INS and ES-EKF traces.",
    contract: "ES-EKF pose + route topology → Viterbi path · output constrained to the map",
    file: "engine/mapmatch.ts · engine/iovnbd.ts",
    production:
      "Use a connected OSM graph with temporal matching, topology constraints, and a safe fallback when roads are ambiguous.",
    connState: (s) => (s.mapUsed ? "active" : "degraded"),
    liveValues: (s) => [
      {
        label: "Gate",
        value: s.mapUsed ? "Open" : "Closed",
        tone: s.mapUsed ? "ok" : "warn",
      },
      {
        label: "Top candidate",
        value: s.candidates[0]
          ? `${s.candidates[0].name} (${(s.candidates[0].probability * 100).toFixed(0)}%)`
          : "n/a",
      },
      { label: "Alignment", value: `${(s.alignment * 100).toFixed(0)}%` },
    ],
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
      "Keep this contract when a native recorder or realtime Android engine replaces the synthetic source.",
    connState: () => "active",
    liveValues: (s) => [
      { label: "Time", value: timeLabel(s.t) },
      { label: "Health", value: `${s.health}/100`, tone: s.health >= 75 ? "ok" : s.health >= 40 ? "warn" : "bad" },
      { label: "Correction", value: `${s.correction.toFixed(2)} m` },
      { label: "Distance", value: `${s.distance.toFixed(0)} m` },
    ],
  },
];

export function SystemView({ snapshot }: { snapshot?: Snapshot }) {
  const [selected, setSelected] = useState(0);
  const stage = stages[selected];

  return (
    <div className="system-page">
      <span className="section-label">HOW ASTRANAV WORKS</span>
      <h2>From sensors to a trusted route.</h2>
      <p className="system-intro">
        The layers are separate on purpose: INS shows drift, GNSS shows when
        fixes disappear, ES-EKF is the primary fused state, ML is an aiding
        measurement, and map matching is a confidence-gated output.
      </p>

      {/* Pipeline blocks with connection lines */}
      <div className="sv-pipeline-wrap">
        <div className="pipeline">
          {stages.map((current, index) => {
            const connState = snapshot ? current.connState(snapshot) : "active";
            return (
              <div key={current.title} className="sv-stage-cell">
                <button
                  className={`${index === selected ? "chosen " : ""}${current.tone}`}
                  onClick={() => setSelected(index)}
                  aria-pressed={index === selected}
                >
                  <span className="stage-number">0{index + 1}</span>
                  <current.icon size={25} />
                  <strong>{current.title}</strong>
                  <small>{current.subtitle}</small>
                  {snapshot && (
                    <span className={`sv-stage-badge sv-stage-badge--${connState}`}>
                      {connState === "active" ? "●" : connState === "degraded" ? "◑" : "○"}
                    </span>
                  )}
                  <ArrowRight className="stage-next" size={16} />
                </button>
                {index < stages.length - 1 && snapshot && (
                  <ConnLine state={stages[index + 1].connState(snapshot)} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage detail: static info + live panel side-by-side */}
      <div className="sv-detail-wrap">
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

        {/* Live values panel */}
        {snapshot && (
          <div className="sv-live-panel">
            <div className="panel-title" style={{ marginBottom: 12 }}>
              <span>LIVE VALUES</span>
              <span className="live-light" />
            </div>
            {stage.liveValues(snapshot).map((row) => (
              <LiveRow key={row.label} label={row.label} value={row.value} tone={row.tone} />
            ))}
          </div>
        )}
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
