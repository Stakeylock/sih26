import { Sparkles, ShieldAlert, RefreshCw } from "lucide-react";
import type { JudgeCallout, Snapshot } from "../engine/types";

export function NarrationBar({
  callout,
  snapshot,
}: {
  callout: JudgeCallout | null;
  snapshot: Snapshot;
}) {
  const isDenied = snapshot.state === "DENIED";
  const isReacq = snapshot.state === "REACQUIRING";
  const isDegraded = snapshot.state === "DEGRADED";

  const statusTone = isDenied
    ? "denied"
    : isReacq
      ? "reacquiring"
      : isDegraded
        ? "degraded"
        : "nominal";

  const title = callout
    ? callout.title
    : isDenied
      ? "GNSS DENIED — DEAD RECKONING ACTIVE"
      : isReacq
        ? "GNSS FIXES RETURNING — REACQUISITION GATE ACTIVE"
        : isDegraded
          ? "SATELLITE SIGNALS DEGRADED — COVARIANCE INFLATED"
          : "NOMINAL MULTI-SENSOR NAVIGATION";

  const body = callout
    ? callout.body
    : isDenied
      ? "All satellite signals masked. 15-state ES-EKF propagates inertial mechanisation with learned motion classification and dynamic covariance bound."
      : isReacq
        ? "Post-outage fixes detected. Innovation statistics are strictly validated before restoring nominal satellite confidence."
        : isDegraded
          ? "Innovation gate detected abnormal measurement residuals. Position uncertainty expanded to preserve integrity."
          : "Nominal operations: Dual-frequency GNSS fixes fused with IMU observations; non-holonomic vehicle constraints active.";

  const stepText = callout
    ? `${String(callout.index).padStart(2, "0")} / ${String(callout.total).padStart(2, "0")}`
    : "LIVE";

  return (
    <div
      className={`narration-bar ${statusTone}`}
      role="region"
      aria-label="Replay engineering narration"
    >
      <div className="narration-badge">
        {isDenied ? (
          <ShieldAlert size={14} className="narration-icon denied" />
        ) : isReacq ? (
          <RefreshCw size={14} className="narration-icon reacq" />
        ) : (
          <Sparkles size={14} className="narration-icon" />
        )}
        <span className="narration-tag">NARRATION</span>
        <span className={`narration-step ${callout ? "active" : "live"}`}>
          {stepText}
        </span>
      </div>
      <div className="narration-content">
        <strong className="narration-title">{title}</strong>
        <p className="narration-body">{body}</p>
      </div>
    </div>
  );
}
