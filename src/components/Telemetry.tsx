import { ArrowUpRight, Radio, ShieldCheck, Waves } from "lucide-react";
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
      ? "Satellite fixes are unavailable. Motion estimates carry the vehicle forward."
      : s.state === "DEGRADED"
        ? "Satellite accuracy is falling. GNSS receives less influence."
        : s.state === "REACQUIRING"
          ? "Checking returning fixes before restoring satellite trust."
          : "Satellite observations agree with the navigation estimate.";
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
          <h2>Navigation integrity</h2>
          <p>Confidence, at every turn.</p>
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
          <span>VEHICLE SPEED</span>
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
      {!basic && (
        <>
          <div className="panel-title secondary">
            <span>MEASUREMENT TRUST</span>
            <Waves size={14} />
          </div>
          <Trust
            label="Phone alignment"
            value={s.alignment}
            note={s.alignment < 1 ? "Recovering" : "Stable"}
          />
          <Trust
            label="Virtual odometer"
            value={s.learnedUsed ? 0.96 : 0.1}
            note={
              s.learnedUsed
                ? "Aiding"
                : replay.config.learned
                  ? "Suspended"
                  : "Disabled"
            }
          />
          <Trust
            label="Road hypothesis"
            value={s.candidates[0].probability}
            note={s.mapUsed ? "Applied" : "Observing"}
          />
          <div className="candidate-section">
            <div className="panel-title">
              <span>ROAD CANDIDATES</span>
              <small>{s.mapUsed ? "FEEDBACK ON" : "FEEDBACK PAUSED"}</small>
            </div>
            {s.candidates.map((c, i) => (
              <div className="candidate-row" key={c.name}>
                <span className={`candidate-index ${i === 0 ? "first" : ""}`}>
                  0{i + 1}
                </span>
                <span>{c.name}</span>
                <strong>{(c.probability * 100).toFixed(0)}%</strong>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="telemetry-note">
        <i />
        <span>All values are simulated. Real-world validation is pending.</span>
      </div>
    </aside>
  );
}
function Trust({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="trust-meter">
      <div>
        <span>{label}</span>
        <small>{note}</small>
      </div>
      <div className="bar">
        <i style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
