import { Filter } from "lucide-react";
import type { Snapshot } from "../engine/types";

type FilterRow = {
  label: string;
  accepted: boolean;
  reason: string;
};

export function ConstraintsPanel({
  snapshot,
  source,
}: {
  snapshot: Snapshot;
  source: "synthetic" | "iovnbd" | "byod";
}) {
  const rows: FilterRow[] = [
    {
      label: "GNSS position",
      accepted: snapshot.gnss != null && snapshot.gnssAccepted,
      reason:
        snapshot.gnss == null
          ? snapshot.state === "DENIED"
            ? "Outage band active, so no fixes"
            : "No fix at this sample"
          : snapshot.gnssAccepted
            ? snapshot.gnssResidual != null
              ? `Innovation ${snapshot.gnssResidual.toFixed(1)} m, inside the gate`
              : "Fix accepted"
            : snapshot.gnssResidual != null
              ? `Innovation ${snapshot.gnssResidual.toFixed(1)} m, outside the gate`
              : "Fix rejected by ES-EKF gate",
    },
    {
      label: "GNSS velocity",
      accepted:
        snapshot.state === "TRUSTED" || snapshot.state === "DEGRADED",
      reason:
        snapshot.state === "TRUSTED"
          ? "GNSS trusted, velocity accepted"
          : snapshot.state === "DEGRADED"
            ? "GNSS degraded, running at reduced weight"
            : snapshot.state === "REACQUIRING"
              ? "Reacquisition check in progress"
              : "GNSS denied, so no velocity aiding",
    },
    {
      label: "ML speed",
      accepted: snapshot.mlUsed && snapshot.mlQuality === "READY",
      reason:
        snapshot.mlQuality === "READY"
          ? snapshot.mlUsed
            ? `${(snapshot.mlSpeed * 3.6).toFixed(1)} km/h · ${(snapshot.mlConfidence * 100).toFixed(0)}% confidence`
            : "Ready but not applied this sample"
          : snapshot.mlQuality === "SUSPENDED"
            ? "Suspended for now while a fault clears"
            : snapshot.mlQuality === "OOD"
              ? "Out of distribution, so aiding is withheld"
              : "ML odometer disabled in config",
    },
    {
      label: "ZUPT",
      accepted: snapshot.speed === 0,
      reason:
        snapshot.speed === 0
          ? "Vehicle stopped, zero velocity update applied"
          : `Speed ${(snapshot.speed * 3.6).toFixed(1)} km/h, ZUPT inactive`,
    },
    {
      label: "Road heading",
      accepted: snapshot.mapUsed,
      reason: snapshot.mapUsed
        ? source === "synthetic"
          ? `Map match applied, top candidate at ${(snapshot.candidates[0].probability * 100).toFixed(0)}%`
          : "Viterbi route topology match locked on the live track"
        : source === "synthetic"
          ? "Confidence gate closed, map feedback paused"
          : "Route matching disabled or no match",
    },
  ];

  return (
    <div className="cp-panel">
      <div className="panel-title">
        <span>
          <Filter size={14} />
          ACTIVE FILTER UPDATES
        </span>
      </div>
      <div className="cp-rows">
        {rows.map((row) => (
          <div className="cp-row" key={row.label}>
            <span
              className={`cp-glyph ${row.accepted ? "cp-glyph--ok" : "cp-glyph--no"}`}
              aria-label={row.accepted ? "accepted" : "rejected"}
            >
              {row.accepted ? "✓" : "✕"}
            </span>
            <span className="cp-label">{row.label}</span>
            <span className="cp-reason">{row.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
