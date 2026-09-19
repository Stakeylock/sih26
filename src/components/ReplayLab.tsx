import { useState } from "react";
import { Activity, Move3d, Satellite, Zap, ShieldAlert, CheckCircle2 } from "lucide-react";
import type { Replay } from "../hooks/useReplay";
import type { FaultKind, Config } from "../engine/types";
import { timeLabel } from "../engine/geometry";
import { Toggle } from "./ui";
export function ReplayLab({ replay }: { replay: Replay }) {
  const [selectedDuration, setSelectedDuration] = useState(30);
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

  const faultDurations = replay.config.faultDurations ?? {};
  const updateFaultDuration = (kind: keyof NonNullable<Config["faultDurations"]>, value: number) => {
    replay.configure({ faultDurations: { ...faultDurations, [kind]: value } });
  };
  return (
    <div className="lab-layout">
      <section className="lab-config">
        <div className="section-label">
          {replay.source === "byod" ? "OWN DRIVE EXPERIMENT" : "CONTROLLED EXPERIMENT"}
        </div>
        <h2>{replay.source === "byod" ? "Test GNSS denial." : "Challenge the estimate."}</h2>
        <p>
          {replay.source === "byod"
            ? "Simulate satellite blackout at any timestamp of your own phone drive. Evaluates dead reckoning against the hidden reference GPS."
            : "Inject a fault at the current timestamp. The replay stays reproducible when you seek back."}
        </p>
        {replay.source === "byod" ? (
          <div className="byod-cf-card" data-testid="byod-cf-card">
            <div className="cf-header">
              <ShieldAlert size={18} className="cf-icon" />
              <div>
                <strong>WHAT IF GPS DISAPPEARED HERE?</strong>
                <p>Artificially remove all satellite aiding from the estimator starting at the current playback position.</p>
              </div>
            </div>

            {replay.byodHealth?.counterfactualEligible !== false ? (
              <div className="cf-body">
                <div className="cf-presets-row">
                  <span className="cf-label">Outage duration:</span>
                  {[10, 30, 60].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`cf-preset-pill ${selectedDuration === s ? "active" : ""}`}
                      onClick={() => setSelectedDuration(s)}
                    >
                      {s} s
                    </button>
                  ))}
                  <label className="cf-custom-label">
                    <span>Custom:</span>
                    <input
                      type="number"
                      min="5"
                      max={Math.max(10, Math.floor(replay.run.duration - 2))}
                      value={selectedDuration}
                      onChange={(e) => setSelectedDuration(Math.max(1, +e.target.value))}
                    />
                  </label>
                </div>

                <div className="cf-actions-row">
                  {replay.isCounterfactual ? (
                    <button
                      type="button"
                      className="button stop cf-main-btn"
                      onClick={() => replay.applyByodCounterfactual(null)}
                    >
                      RESTORE FULL GNSS
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button primary cf-main-btn"
                      disabled={replay.t >= replay.run.duration - 5}
                      onClick={() =>
                        replay.applyByodCounterfactual({
                          outageStart: Math.floor(replay.t),
                          outageDuration: selectedDuration,
                        })
                      }
                    >
                      LOSE GNSS AT {timeLabel(replay.t)}
                    </button>
                  )}
                  {replay.isCounterfactual && (
                    <span className="cf-status-tag">
                      <CheckCircle2 size={13} />
                      Outage: {timeLabel(replay.byodCounterfactual!.outageStart)} →{" "}
                      {timeLabel(replay.byodCounterfactual!.outageStart + replay.byodCounterfactual!.outageDuration)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="cf-ineligible-box">
                <strong>Counterfactual unavailable for this capture</strong>
                <p>
                  This capture predates full 3-axis accelerometer recording.
                  Record a new drive with Capture v2 on <code>/byod.html</code> to enable counterfactual blackout testing.
                </p>
              </div>
            )}
          </div>
        ) : (
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
        )}
        <div className="config-aids">
          <Toggle
            label="ML virtual odometer"
            checked={replay.config.learned}
            onChange={() =>
              replay.configure({ learned: !replay.config.learned })
            }
          />
          <Toggle
            label="Map matching"
            checked={replay.config.map}
            onChange={() => replay.configure({ map: !replay.config.map })}
          />
          <p>Changing aids resets the replay. Fault injections are cleared.</p>
        </div>
        <div className="config-aids lab-ablation">
          <div className="section-label">ABLATION (judge break it mode)</div>
          <Toggle
            label="NHC (lateral/vertical velocity ≈ 0)"
            checked={replay.ablation.useNHC}
            onChange={() => replay.configureAblation({ useNHC: !replay.ablation.useNHC })}
          />
          <Toggle
            label="ZUPT (zero velocity when stopped)"
            checked={replay.ablation.useZUPT}
            onChange={() => replay.configureAblation({ useZUPT: !replay.ablation.useZUPT })}
          />
          <Toggle
            label="ML speed pseudo measurement"
            checked={replay.ablation.useML}
            onChange={() => replay.configureAblation({ useML: !replay.ablation.useML })}
          />
          <Toggle
            label="GNSS integrity gate (NIS)"
            checked={replay.ablation.useGNSSGate}
            onChange={() => replay.configureAblation({ useGNSSGate: !replay.ablation.useGNSSGate })}
          />
          {replay.explainability?.liveErrorDelta != null && (
            <p className="lab-ablation-impact mono" data-testid="ablation-impact">
              LIVE ERROR Δ vs FULL SYSTEM: {replay.explainability.liveErrorDelta >= 0 ? "+" : ""}
              {replay.explainability.liveErrorDelta.toFixed(0)} m
            </p>
          )}
          <p>Toggles rebuild the live filter instantly. Compare live error delta vs full system.</p>
        </div>
        <div className="config-aids lab-faultparams">
          <div className="section-label">FAULT LAB · REPRODUCIBLE PARAMS</div>
          <div className="fp-grid">
            <label className="fp-field">
              <small>Pothole impulse (s)</small>
              <input
                type="number"
                min="1"
                max="30"
                step="1"
                value={faultDurations.shock ?? 3}
                onChange={(e) => updateFaultDuration("shock", +e.target.value)}
              />
            </label>
            <label className="fp-field">
              <small>Mount shift recovery (s)</small>
              <input
                type="number"
                min="1"
                max="30"
                step="1"
                value={faultDurations.mount ?? 8}
                onChange={(e) => updateFaultDuration("mount", +e.target.value)}
              />
            </label>
            <label className="fp-field">
              <small>Speed anomaly (s)</small>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                value={faultDurations.speed ?? 10}
                onChange={(e) => updateFaultDuration("speed", +e.target.value)}
              />
            </label>
            <label className="fp-field">
              <small>GNSS jump (s)</small>
              <input
                type="number"
                min="1"
                max="30"
                step="1"
                value={faultDurations.gnss ?? 3}
                onChange={(e) => updateFaultDuration("gnss", +e.target.value)}
              />
            </label>
          </div>
          <p>Durations persist in the replay config. Change + inject to test custom fault windows.</p>
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
