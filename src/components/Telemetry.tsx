import {
  ArrowUpRight,
  BrainCircuit,
  Radio,
  Satellite,
  ShieldCheck,
  Waves,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Replay } from "../hooks/useReplay";
import { Status } from "./ui";
import { timeLabel } from "../engine/geometry";

export function Telemetry({
  replay,
  basic,
  onExplain,
}: {
  replay: Replay;
  basic: boolean;
  onExplain: () => void;
}) {
  const s = replay.snapshot;
  const explanation =
    s.state === "DENIED"
      ? "GNSS has no usable fix. The ES-EKF propagates INS and guarded ML speed."
      : s.state === "DEGRADED"
        ? "GNSS accuracy is falling. The fusion gate reduces its influence."
        : s.state === "REACQUIRING"
          ? "Returning fixes are checked before ES-EKF trust is restored."
          : "GNSS observations agree with the fused navigation estimate.";
  const gnssLabel = !s.gnss
    ? s.state === "DENIED"
      ? "No fix available"
      : "Waiting for fix"
    : s.gnssAccepted
      ? "Fix accepted"
      : "Fix rejected";
  const mlLabel =
    s.mlQuality === "READY"
      ? "Aiding ES-EKF"
      : s.mlQuality === "DISABLED"
        ? "Disabled"
        : s.mlQuality === "OOD"
          ? "Out-of-distribution"
          : "Temporarily suspended";
  const modelSamples = replay.run.snapshots
      .filter((snapshot) => snapshot.t <= replay.t)
      .filter((_, index) => index % 8 === 0),
    modelMax = Math.max(1, ...modelSamples.map((snapshot) => snapshot.mlSpeed)),
    modelPath = modelSamples
      .map(
        (snapshot, index) =>
          `${index ? "L" : "M"}${index * (280 / Math.max(1, modelSamples.length - 1))},${52 - (snapshot.mlSpeed / modelMax) * 40}`,
      )
      .join(" ");
  return (
    <aside className="telemetry">
      <div className="panel-title">
        <span>
          <Radio size={14} /> LIVE TELEMETRY
        </span>
        <span className="live-light" />
      </div>
      <div className="trust-heading">
        <div>
          <h2>ES-EKF navigation integrity</h2>
          <p>Primary fused estimate, at every turn.</p>
        </div>
        <button
          className="icon"
          onClick={onExplain}
          aria-label="Explain navigation integrity"
        >
          <ArrowUpRight size={18} />
        </button>
      </div>
      <div className={`trust-block ${s.state.toLowerCase()}`}>
        <div>
          <ShieldCheck size={18} />
          <Status state={s.state} />
        </div>
        <h3>
          {s.state === "DENIED"
            ? "Navigating without GNSS"
            : s.state === "REACQUIRING"
              ? "Rebuilding satellite trust"
              : s.state === "DEGRADED"
                ? "Signal quality falling"
                : "Position is supported"}
        </h3>
        <p>{explanation}</p>
      </div>
      <div className="speed-display">
        <div>
          <span>ES-EKF VEHICLE SPEED</span>
          <strong>
            {(s.speed * 3.6).toFixed(1)}
            <small>km/h</small>
          </strong>
        </div>
        <div className="heading-dial">
          <div style={{ transform: `rotate(${s.heading}deg)` }}>↑</div>
          <span>{Math.round(s.heading)}°</span>
        </div>
      </div>
      <div className="telemetry-pair">
        <div>
          <span>Simulated 95% bound</span>
          <strong>
            {s.bound.toFixed(1)} <small>m</small>
          </strong>
        </div>
        <div>
          <span>Time without GNSS</span>
          <strong>{timeLabel(s.outage)}</strong>
        </div>
      </div>
      <div className={`gnss-card ${s.state.toLowerCase()}`}>
        <div className="gnss-card-heading">
          <span>
            <Satellite size={14} /> GNSS OBSERVATION
          </span>
          <b>{gnssLabel}</b>
        </div>
        <p>
          {s.gnssResidual == null
            ? s.state === "DENIED"
              ? "Outage band active · no position measurement"
              : "No position measurement at this sample"
            : `Innovation ${s.gnssResidual.toFixed(1)} m · ${s.gnssAccepted ? "passed" : "outside"} ES-EKF gate`}
        </p>
      </div>
      {!basic && (
        <div className={`ml-card ${s.mlQuality.toLowerCase()}`}>
          <div className="ml-card-heading">
            <span>
              <BrainCircuit size={14} /> ML VIRTUAL ODOMETER
            </span>
            <b>{mlLabel}</b>
          </div>
          <svg
            className="ml-sparkline"
            viewBox="0 0 280 60"
            role="img"
            aria-label="Virtual odometer model output over observed replay"
          >
            <line x1="0" y1="52" x2="280" y2="52" />
            <path d={modelPath} />
          </svg>
          <div className="ml-card-meta">
            <span>
              <small>INPUT</small>
              accel · yaw · context
            </span>
            <span>
              <small>OUTPUT</small>
              {(s.mlSpeed * 3.6).toFixed(1)} km/h
            </span>
            <span>
              <small>CONFIDENCE</small>
              {(s.mlConfidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
      {!basic && (
        <>
          <div className="panel-title secondary">
            <span>ESTIMATION PIPELINE</span>
            <Waves size={14} />
          </div>
          <div className="estimator-stack">
            <PipelineRow
              number="01"
              tone="ins"
              label="INS / dead reckoning"
              detail="IMU mechanisation · never corrected"
              state="Propagating"
            />
            <PipelineRow
              number="02"
              tone="ml"
              label="ML virtual odometer"
              detail={`${(s.mlSpeed * 3.6).toFixed(1)} km/h · ${(s.mlConfidence * 100).toFixed(0)}% confidence`}
              state={mlLabel}
              icon={<BrainCircuit size={13} />}
            />
            <PipelineRow
              number="03"
              tone="ekf"
              label="ES-EKF primary"
              detail={
                s.gnssAccepted
                  ? "INS + GNSS innovation accepted"
                  : "INS + available observations"
              }
              state="Fused"
            />
            <PipelineRow
              number="04"
              tone="map"
              label="Map-assisted output"
              detail={`${(s.candidates[0].probability * 100).toFixed(0)}% top road candidate`}
              state={s.mapUsed ? "Applied" : "Paused"}
            />
          </div>
          <div className="candidate-section">
            <div className="panel-title">
              <span>ROAD CANDIDATES</span>
              <small>{s.mapUsed ? "FEEDBACK ON" : "FEEDBACK PAUSED"}</small>
            </div>
            {s.candidates.map((candidate, index) => (
              <div className="candidate-row" key={candidate.name}>
                <span
                  className={`candidate-index ${index === 0 ? "first" : ""}`}
                >
                  0{index + 1}
                </span>
                <span>{candidate.name}</span>
                <strong>{(candidate.probability * 100).toFixed(0)}%</strong>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="telemetry-note">
        <i />
        <span>
          {replay.run.source === "iovnbd"
            ? "Real IO-VNBD benchmark replay: estimator outputs computed from recorded sensors; reference is the GNSS track."
            : "All values are simulated. Real-world validation is pending."}
        </span>
      </div>
    </aside>
  );
}

function PipelineRow({
  number,
  tone,
  label,
  detail,
  state,
  icon,
}: {
  number: string;
  tone: "ins" | "ml" | "ekf" | "map";
  label: string;
  detail: string;
  state: string;
  icon?: ReactNode;
}) {
  return (
    <div className={`pipeline-row ${tone}`}>
      <span className="pipeline-row-number">{number}</span>
      <div className="pipeline-row-icon">{icon ?? <i />}</div>
      <div className="pipeline-row-copy">
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <b>{state}</b>
    </div>
  );
}
