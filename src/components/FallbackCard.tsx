import { AlertTriangle } from "lucide-react";
import type { Snapshot } from "../engine/types";

/**
 * "What happens if everything fails?" screen (plan §53).
 *
 * Trigger is REAL state, not decoration: shown while GNSS is DENIED *and*
 * either the learned aiding is suspended (OOD) or the 95% bound has grown
 * past 60 m — the worst legitimate operating points. The card states plainly
 * what is still running, what is not, and how fast uncertainty is growing.
 * It never hides the degradation — that honesty is the differentiator.
 */
export function FallbackCard({ snapshot }: { snapshot: Snapshot }) {
  const mlSuspended = snapshot.mlOod || snapshot.mlQuality === "OOD";
  const boundBlown = snapshot.bound > 60;
  const denied = snapshot.state === "DENIED" || snapshot.state === "REACQUIRING";
  const show = denied && (mlSuspended || boundBlown);
  if (!show) return null;

  // uncertainty growth rate over the last ~2 s of history is not available in
  // a single snapshot; state the current bound + rate label honestly
  const rate =
    snapshot.bound > 120 ? "fast" : snapshot.bound > 60 ? "moderate" : "slow";

  return (
    <div className="fallback-card" data-testid="fallback-card" role="alert">
      <div className="fallback-head">
        <AlertTriangle size={16} />
        <strong>NAVIGATION DEGRADED</strong>
        <span className="fallback-why">
          {snapshot.state} · bound ±{snapshot.bound.toFixed(0)} m ({rate} growth)
        </span>
      </div>
      <div className="fallback-grid">
        <div>
          <small>STILL ACTIVE</small>
          <ul>
            <li>INS mechanisation (gyro + calibrated compass)</li>
            {snapshot.speed > 0.5 && <li>Learned motion-mode aiding {mlSuspended ? "(confidence low — deweighted)" : ""}</li>}
            {!mlSuspended && <li>NHC lateral constraint</li>}
            <li>Duration-gated ZUPT at genuine stops</li>
          </ul>
        </div>
        <div>
          <small>SUSPENDED / UNAVAILABLE</small>
          <ul>
            <li>GNSS position &amp; velocity {snapshot.rejected ? "(fixes rejected by NIS gate)" : "(masked)"}</li>
            {mlSuspended && <li>ML speed (OOD — suspended to avoid corruption)</li>}
            <li>Road matching (no map in replay mode)</li>
          </ul>
        </div>
      </div>
      <p className="fallback-note">
        Position uncertainty is <b>±{snapshot.bound.toFixed(1)} m and growing</b>. The
        estimate is propagated, not frozen: the filter keeps its covariance honest so
        reacquisition can resume safely instead of pretending confidence it does not have.
      </p>
    </div>
  );
}
