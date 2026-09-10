import { Download, ArrowUpRight } from "lucide-react";
import type { Replay } from "../hooks/useReplay";
import type { Run } from "../engine/types";
import { dist, timeLabel } from "../engine/geometry";
import { metrics } from "../engine/simulation";
export function exportRun(run: Run, t: number, format: "json" | "csv") {
  const snapshots = run.snapshots.filter((s) => s.t <= t),
    events = run.events.filter((e) => e.at <= t);
  const content =
    format === "json"
      ? JSON.stringify(
          {
            provenance:
              "synthetic planar simulation; not a validated navigation engine",
            version: 2,
            config: run.config,
            until: t,
            metrics: metrics(run, t),
            events,
            snapshots,
          },
          null,
          2,
        )
      : [
          "provenance,t,reference_x_m,reference_y_m,raw_x_m,raw_y_m,assisted_x_m,assisted_y_m,baseline_x_m,baseline_y_m,state,bound_m,rejected",
          ...snapshots.map((s) =>
            [
              "synthetic",
              s.t,
              s.reference.x,
              s.reference.y,
              s.raw.x,
              s.raw.y,
              s.assisted.x,
              s.assisted.y,
              s.baseline.x,
              s.baseline.y,
              s.state,
              s.bound,
              s.rejected,
            ].join(","),
          ),
        ].join("\n");
  const url = URL.createObjectURL(
    new Blob([content], {
      type: format === "json" ? "application/json" : "text/csv",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `astranav-${run.config.scenario}-synthetic.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function Evidence({ replay }: { replay: Replay }) {
  const values = metrics(replay.run, replay.t),
    samples = replay.run.snapshots.filter((s) => s.t <= replay.t),
    raw = values.find((m) => m.name === "raw"),
    max = Math.max(
      10,
      ...samples.map((s) => Math.max(dist(s.baseline, s.reference), s.bound)),
    );
  const chart = (key: "raw" | "assisted" | "baseline" | "bound") =>
    samples
      .filter((_, i) => i % 5 === 0)
      .map(
        (s, i) =>
          `${i ? "L" : "M"}${48 + (s.t / 120) * 900},${230 - ((key === "bound" ? s.bound : dist(s[key], s.reference)) / max) * 200}`,
      )
      .join(" ");
  return (
    <div className="evidence-page">
      <div className="section-header">
        <div>
          <span className="section-label">MEASURED WITHIN THIS SIMULATION</span>
          <h2>Every trajectory tells a story.</h2>
          <p>
            Observed through {timeLabel(replay.t)}. Future samples are excluded.
          </p>
        </div>
        <div className="actions">
          <button
            className="button"
            onClick={() => exportRun(replay.run, replay.t, "json")}
          >
            <Download size={15} />
            JSON
          </button>
          <button
            className="button"
            onClick={() => exportRun(replay.run, replay.t, "csv")}
          >
            CSV
          </button>
        </div>
      </div>
      <div className="metric-grid">
        <Metric
          label="Raw blackout error"
          value={raw ? `${raw.error.toFixed(1)} m` : "—"}
          detail="Before map assistance"
        />
        <Metric
          label="Raw drift"
          value={raw?.drift != null ? `${raw.drift.toFixed(2)}%` : "—"}
          detail="Error / reference distance"
        />
        <Metric
          label="Blackout distance"
          value={`${replay.snapshot.distance.toFixed(0)} m`}
          detail="Accumulated reference distance"
        />
        <Metric
          label="Observed bound coverage"
          value={raw ? `${raw.coverage.toFixed(1)}%` : "—"}
          detail="Simulated bound, not calibrated"
        />
      </div>
      <section className="chart-panel">
        <div className="chart-title">
          <h3>
            Position error <span>meters</span>
          </h3>
          <div className="map-legend">
            <span>
              <i className="cyan" />
              Raw
            </span>
            <span>
              <i className="lime" />
              Map-assisted
            </span>
            <span>
              <i className="coral" />
              Classical
            </span>
          </div>
        </div>
        <svg
          className="error-chart"
          viewBox="0 0 1000 265"
          role="img"
          aria-label="Position errors and simulated confidence bound over observed replay"
        >
          <rect
            x={48 + (replay.run.scenario.start / 120) * 900}
            y="20"
            width={(replay.config.blackout / 120) * 900}
            height="210"
            fill="#ca9260"
            opacity=".06"
          />
          {[0, 0.25, 0.5, 0.75, 1].map((n) => (
            <g key={n}>
              <line
                x1="48"
                x2="950"
                y1={230 - n * 200}
                y2={230 - n * 200}
                stroke="#29363b"
                strokeDasharray="3 6"
              />
              <text x="5" y={234 - n * 200} fill="#84959b" fontSize="11">
                {(max * n).toFixed(0)}
              </text>
            </g>
          ))}
          {[0, 30, 60, 90, 120].map((n) => (
            <text
              key={n}
              x={48 + (n / 120) * 900}
              y="255"
              fill="#84959b"
              fontSize="11"
              textAnchor="middle"
            >
              {timeLabel(n)}
            </text>
          ))}
          <path
            d={chart("bound")}
            fill="none"
            stroke="#978bbd"
            strokeDasharray="5 5"
            strokeWidth="1.5"
          />
          <path
            d={chart("baseline")}
            fill="none"
            stroke="#f49484"
            strokeWidth="2"
          />
          <path d={chart("raw")} fill="none" stroke="#62cbd4" strokeWidth="2" />
          <path
            d={chart("assisted")}
            fill="none"
            stroke="#d9f5a0"
            strokeWidth="2"
          />
        </svg>
        <small>
          Shaded region: GNSS blackout · dashed violet line: simulated 95%
          horizontal bound
        </small>
      </section>
      <div className="evidence-detail">
        <section>
          <h3>Blackout comparison</h3>
          {values.length ? (
            <table>
              <thead>
                <tr>
                  <th>Estimator</th>
                  <th>Final error</th>
                  <th>RMSE</th>
                  <th>Drift</th>
                </tr>
              </thead>
              <tbody>
                {values.map((m) => (
                  <tr key={m.name}>
                    <td>
                      {
                        {
                          raw: "Raw inertial + speed",
                          assisted: "Map-assisted display",
                          baseline: "Classical baseline",
                        }[m.name]
                      }
                    </td>
                    <td>{m.error.toFixed(2)} m</td>
                    <td>{m.rmse.toFixed(2)} m</td>
                    <td>
                      {m.drift === null ? "N/A" : `${m.drift.toFixed(2)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty-message">
              Play into the blackout to collect comparison data.
            </p>
          )}
        </section>
        <section>
          <h3>
            Next: real-world validation <ArrowUpRight size={15} />
          </h3>
          <p>
            IO-VNBD replay, a trip-disjoint test split, own-phone drives, and
            Android runtime measurements remain pending.
          </p>
          <span className="outline-tag">RESEARCH MILESTONE</span>
        </section>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
