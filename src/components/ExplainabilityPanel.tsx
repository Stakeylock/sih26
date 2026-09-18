import { HelpCircle } from "lucide-react";
import type { Replay } from "../hooks/useReplay";
import type { Contribution } from "../engine/explain";

/**
 * Explainability Panel (plan §39) — "WHY IS THE VEHICLE HERE?"
 *
 * Renders the per-epoch contribution breakdown computed by
 * src/engine/explain.ts from the LIVE filter / simulation state. Every row is
 * a real signal: active/inactive, magnitude with unit, and a one-line reason.
 * The dominant source is highlighted; the ablation delta (when present) shows
 * the honest cost of the disabled aiding. No invented numbers.
 */
export function ExplainabilityPanel({ replay }: { replay: Replay }) {
  const ex = replay.explainability;
  if (!ex?.contributions?.length) return null;

  return (
    <section className="explain-panel" aria-label="Explainability: why is the vehicle here">
      <div className="explain-head">
        <span className="explain-title">
          <HelpCircle size={15} /> WHY IS THE VEHICLE HERE?
          <small>per-epoch contributions · live state</small>
        </span>
        {ex.liveErrorDelta != null && (
          <span
            className="explain-delta mono"
            title="Live in-browser ES-EKF final blackout error minus the offline benchmark's"
          >
            live vs offline: {ex.liveErrorDelta >= 0 ? "+" : ""}
            {ex.liveErrorDelta.toFixed(0)} m
          </span>
        )}
      </div>
      <ul className="explain-list">
        {ex.contributions.map((c) => (
          <ExplainRow key={c.label} c={c} dominant={c.label === dominantLabel(ex)} />
        ))}
      </ul>
    </section>
  );
}

function dominantLabel(ex: Replay["explainability"]): string | null {
  if (!ex) return null;
  const found = ex.contributions.find((c) => {
    switch (ex.dominantSource) {
      case "ml": return c.label === "ML speed correction";
      case "gnss": return c.label === "GNSS position update";
      case "zupt": return c.label.startsWith("ZUPT");
      case "nhc": return c.label.startsWith("NHC");
      default: return c.label === "INS propagation";
    }
  });
  return found?.label ?? null;
}

function ExplainRow({ c, dominant }: { c: Contribution; dominant: boolean }) {
  const mag =
    c.magnitude != null
      ? `${c.magnitude >= 100 ? c.magnitude.toFixed(0) : c.magnitude.toFixed(2)}${c.unit ? ` ${c.unit}` : ""}`
      : null;
  const rejected = c.threshold != null && c.magnitude != null && c.magnitude >= c.threshold;
  return (
    <li className={`explain-row ${c.active ? "on" : "off"} ${dominant ? "dominant" : ""}`}>
      <span className="explain-glyph" aria-hidden>
        {c.active ? (rejected ? "⚠" : "✓") : "✕"}
      </span>
      <div className="explain-body">
        <span className="explain-label">
          {c.label}
          {dominant && <em>DOMINANT</em>}
          {rejected && <em className="rej">REJECTED</em>}
        </span>
        <span className="explain-detail">{c.detail}</span>
      </div>
      {mag && (
        <span className="explain-mag mono">
          {mag}
          {c.threshold != null && <small> / {c.threshold}</small>}
        </span>
      )}
    </li>
  );
}
