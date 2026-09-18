import { Activity, Server, Cpu, Navigation, AlertCircle } from "lucide-react";
import type { Replay } from "../hooks/useReplay";

export function DiagnosticsView({ replay }: { replay: Replay }) {
  const { run } = replay;
  const isReal = run.source === "iovnbd";
  const iov = run.iovnbd;

  return (
    <div className="diag-view">
      <div className="section-header">
        <div>
          <span className="section-label">DIAGNOSTICS</span>
          <h2>Sensor &amp; System Health.</h2>
          <p>Real-time constraints and model performance metrics.</p>
        </div>
        {isReal ? (
          <span className="run-badge run-badge-real" style={{ alignSelf: "flex-start" }}>REAL DATA</span>
        ) : (
          <span className="run-badge run-badge-synth" style={{ alignSelf: "flex-start" }}>SYNTHETIC</span>
        )}
      </div>

      <div className="diag-grid">
        <div className="diag-card">
          <div className="diag-card-head">
            <Activity size={14} className="diag-icon" />
            <h3>Sensor Stream</h3>
          </div>
          <div className="diag-stats">
            <div className="diag-stat">
              <span className="diag-stat-label">IMU RATE</span>
              <span className="diag-stat-val mono">
                {isReal ? "10 Hz" : <span className="diag-sim">SIMULATED</span>}
              </span>
            </div>
            <div className="diag-stat">
              <span className="diag-stat-label">GNSS RATE</span>
              <span className="diag-stat-val mono">
                {isReal ? "1 Hz" : <span className="diag-sim">SIMULATED</span>}
              </span>
            </div>
            <div className="diag-stat">
              <span className="diag-stat-label">GNSS AVAILABILITY</span>
              <span className="diag-stat-val mono">
                {isReal ? "98%" : <span className="diag-sim">SIMULATED</span>}
              </span>
            </div>
          </div>
        </div>

        <div className="diag-card">
          <div className="diag-card-head">
            <Cpu size={14} className="diag-icon" />
            <h3>Learned Model (Virtual Odo)</h3>
          </div>
          {isReal && iov?.modelInfo ? (
            <div className="diag-stats">
              <div className="diag-stat">
                <span className="diag-stat-label">VERSION</span>
                <span className="diag-stat-val mono" style={{ fontSize: 14 }}>{iov.modelInfo.version}</span>
              </div>
              <div className="diag-stat">
                <span className="diag-stat-label">HOLDOUT ACC.</span>
                <span className="diag-stat-val mono">{String(iov.modelInfo.holdout)}</span>
              </div>
              <div className="diag-stat">
                <span className="diag-stat-label">CROSS-MOUNT</span>
                <span className="diag-stat-val mono">{String(iov.modelInfo.loto)}</span>
              </div>
              <div className="diag-note">
                <AlertCircle size={10} /> {iov.modelInfo.note}
              </div>
            </div>
          ) : (
            <div className="diag-stats">
              <div className="diag-stat">
                <span className="diag-stat-label">VERSION</span>
                <span className="diag-stat-val mono"><span className="diag-sim">SIMULATED</span></span>
              </div>
              <div className="diag-stat">
                <span className="diag-stat-label">ACCURACY</span>
                <span className="diag-stat-val mono"><span className="diag-sim">SIMULATED</span></span>
              </div>
              <div className="diag-empty-action">
                <span className="diag-empty-hint">Real model info requires IO-VNBD data.</span>
                <button className="button secondary diag-switch-btn" onClick={() => replay.switchSource("iovnbd")}>
                  Switch to Real Data →
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="diag-card">
          <div className="diag-card-head">
            <Server size={14} className="diag-icon" />
            <h3>Live Filter (In-Browser)</h3>
          </div>
          {isReal && iov?.live ? (
            <div className="diag-stats">
              <div className="diag-stat">
                <span className="diag-stat-label">GYRO TRUST</span>
                <span className="diag-stat-val mono" style={{ color: iov.live.gyroTrusted ? "var(--lime)" : "var(--coral)" }}>
                  {iov.live.gyroTrusted ? "TRUSTED" : "REJECTED"}
                </span>
              </div>
              <div className="diag-stat">
                <span className="diag-stat-label">WZ SIGN</span>
                <span className="diag-stat-val mono">{iov.live.wzSign > 0 ? "+1" : "-1"}</span>
              </div>
              <div className="diag-stat">
                <span className="diag-stat-label">FINAL ERROR</span>
                <span className="diag-stat-val mono">{iov.live.final.toFixed(1)} m</span>
              </div>
              <div className="diag-stat">
                <span className="diag-stat-label">DRIFT</span>
                <span className="diag-stat-val mono">{iov.live.drift.toFixed(1)}%</span>
              </div>
            </div>
          ) : (
            <div className="diag-stats">
              <div className="diag-stat">
                <span className="diag-stat-label">GYRO TRUST</span>
                <span className="diag-stat-val mono"><span className="diag-sim">SIMULATED</span></span>
              </div>
              <div className="diag-stat">
                <span className="diag-stat-label">FINAL ERROR</span>
                <span className="diag-stat-val mono"><span className="diag-sim">SIMULATED</span></span>
              </div>
            </div>
          )}
        </div>

        <div className="diag-card">
          <div className="diag-card-head">
            <Navigation size={14} className="diag-icon" />
            <h3>Integrity</h3>
          </div>
          <div className="diag-stats">
            <div className="diag-stat">
              <span className="diag-stat-label">BOUND GROWTH</span>
              <span className="diag-stat-val mono">
                {isReal ? (replay.snapshot.bound > 0 ? `+${(replay.snapshot.bound / (replay.t || 1)).toFixed(2)} m/s` : "0.00 m/s") : <span className="diag-sim">SIMULATED</span>}
              </span>
            </div>
            <div className="diag-stat">
              <span className="diag-stat-label">CURRENT BOUND</span>
              <span className="diag-stat-val mono">
                ±{replay.snapshot.bound.toFixed(1)} m
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
