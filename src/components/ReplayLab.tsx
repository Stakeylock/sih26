import { Activity, Move3d, Satellite, Zap } from "lucide-react";
import type { Replay } from "../hooks/useReplay";
import type { FaultKind } from "../engine/types";
import { timeLabel } from "../engine/geometry";
import { Toggle } from "./ui";
export function ReplayLab({ replay }: { replay: Replay }) {
  const faults = [
    {
      id: "gnss",
      name: "GNSS jump",
      detail: "Shift the position fix",
      icon: Satellite,
    },
    {
      id: "shock",
      name: "Pothole",
      detail: "3 s vibration impulse",
      icon: Zap,
    },
    {
      id: "mount",
      name: "Mount shift",
      detail: "8 s alignment recovery",
      icon: Move3d,
    },
    {
      id: "speed",
      name: "Speed anomaly",
      detail: "10 s unreliable aiding",
      icon: Activity,
    },
  ] as const;
  const events = replay.run.events
    .filter((e) => e.at <= replay.t)
    .slice()
    .reverse();
  return (
    <div className="lab-layout">
      <section className="lab-config">
        <div className="section-label">CONTROLLED EXPERIMENT</div>
        <h2>Challenge the estimate.</h2>
        <p>
          Inject a fault at the current timestamp. The replay stays reproducible
          when you seek back.
        </p>
        <div className="fault-grid">
          {faults.map((f) => (
            <button
              key={f.id}
              disabled={
                replay.t >= 110 ||
                (f.id === "gnss" && replay.snapshot.state === "DENIED")
              }
              title={
                f.id === "gnss" && replay.snapshot.state === "DENIED"
                  ? "No GNSS fixes are available to corrupt during a blackout."
                  : `Inject ${f.name} at ${timeLabel(replay.t)}`
              }
              onClick={() => replay.inject(f.id as FaultKind)}
            >
              <f.icon size={19} />
              <strong>{f.name}</strong>
              <small>{f.detail}</small>
              <span>Inject now ↗</span>
            </button>
          ))}
        </div>
        <div className="config-aids">
          <Toggle
            label="Virtual odometer"
            checked={replay.config.learned}
            onChange={() =>
              replay.configure({ learned: !replay.config.learned })
            }
          />
          <Toggle
            label="Map assistance"
            checked={replay.config.map}
            onChange={() => replay.configure({ map: !replay.config.map })}
          />
          <p>Changing aids resets the replay. Fault injections are cleared.</p>
        </div>
      </section>
      <section className="event-ledger">
        <div className="ledger-heading">
          <h2>Event ledger</h2>
          <span>{events.length} events</span>
        </div>
        <div className="event-list">
          {events.map((e) => (
            <button
              className={`event-item ${e.severity}`}
              key={e.id}
              onClick={() => replay.seek(e.at)}
            >
              <time>{timeLabel(e.at)}</time>
              <div>
                <strong>{e.title}</strong>
                <p>{e.reason}</p>
                <small>{e.action}</small>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
