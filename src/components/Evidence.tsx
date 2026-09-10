import { Download, ArrowUpRight } from "lucide-react";
import type { Replay } from "../hooks/useReplay";
import type { EstimateKey, Run } from "../engine/types";
import { dist, timeLabel } from "../engine/geometry";
import { metrics } from "../engine/simulation";

const labels: Record<EstimateKey, string> = {
  ins: "INS / dead reckoning",
  ekf: "ES-EKF + ML aiding",
  map: "Map-assisted output",
  classical: "Classical EKF comparator",
};

export function exportRun(run: Run, t: number, format: "json" | "csv") {
  const snapshots = run.snapshots.filter((snapshot) => snapshot.t <= t),
    events = run.events.filter((event) => event.at <= t);
  const content =
    format === "json"
      ? JSON.stringify(
          {
            provenance:
              "synthetic planar simulation; not a validated navigation engine",
            version: 3,
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
          "provenance,t,reference_x_m,reference_y_m,ins_x_m,ins_y_m,ekf_x_m,ekf_y_m,map_x_m,map_y_m,classical_x_m,classical_y_m,ml_speed_mps,ml_confidence,ml_quality,gnss_state,gnss_x_m,gnss_y_m,gnss_accepted,gnss_residual_m,bound_m,rejected",
          ...snapshots.map((snapshot) =>
            [
              "synthetic",
              snapshot.t,
              snapshot.reference.x,
              snapshot.reference.y,
              snapshot.ins.x,
              snapshot.ins.y,
              snapshot.ekf.x,
              snapshot.ekf.y,
              snapshot.map.x,
              snapshot.map.y,
              snapshot.classical.x,
              snapshot.classical.y,
              snapshot.mlSpeed,
              snapshot.mlConfidence,
              snapshot.mlQuality,
              snapshot.state,
              snapshot.gnss?.x ?? "",
              snapshot.gnss?.y ?? "",
              snapshot.gnss ? snapshot.gnssAccepted : "",
              snapshot.gnssResidual ?? "",
              snapshot.bound,
              snapshot.rejected,
            ].join(","),
          ),
        ].join("\n");
  const url = URL.createObjectURL(
    new Blob([content], {
      type: format === "json" ? "application/json" : "text/csv",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `astranav-${run.config.scenario}-synthetic.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function Evidence({ replay }: { replay: Replay }) {
  const values = metrics(replay.run, replay.t),
    samples = replay.run.snapshots.filter((snapshot) => snapshot.t <= replay.t),
    primary = values.find((metric) => metric.name === "ekf"),
    ins = values.find((metric) => metric.name === "ins"),
    max = Math.max(
      10,
      ...samples.flatMap((snapshot) => [
        dist(snapshot.ins, snapshot.reference),
        dist(snapshot.ekf, snapshot.reference),
        dist(snapshot.map, snapshot.reference),
        dist(snapshot.classical, snapshot.reference),
        snapshot.bound,
      ]),
    );
  const chart = (key: "ins" | "ekf" | "map" | "classical" | "bound") =>
    samples
      .filter((_, index) => index % 5 === 0)
      .map(
        (snapshot, index) =>
          `${index ? "L" : "M"}${48 + (snapshot.t / 120) * 900},${230 - ((key === "bound" ? snapshot.bound : dist(snapshot[key], snapshot.reference)) / max) * 200}`,
      )
      .join(" ");
  return (
    <div className="evidence-page">
      <div className="section-header">
        <div>
          <span className="section-label">MEASURED WITHIN THIS SIMULATION</span>
          <h2>Trace every branch.</h2>
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
          label="ES-EKF final error"
          value={primary ? `${primary.error.toFixed(1)} m` : "—"}
          detail="Primary fused estimate"
        />
        <Metric
          label="INS final error"
          value={ins ? `${ins.error.toFixed(1)} m` : "—"}
          detail="IMU-only dead reckoning"
        />
        <Metric
          label="Blackout distance"
          value={`${replay.snapshot.distance.toFixed(0)} m`}
          detail="Accumulated reference distance"
        />
        <Metric
          label="ES-EKF bound coverage"
          value={primary ? `${primary.coverage.toFixed(1)}%` : "—"}
          detail="Illustrative, not calibrated"
        />
      </div>
      <section className="chart-panel">
        <div className="chart-title">
          <h3>
            Position error <span>meters</span>
          </h3>
          <div className="map-legend">
            <span>
              <i className="amber" />
              INS
            </span>
            <span>
              <i className="cyan" />
              ES-EKF + ML
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
          aria-label="INS, ES-EKF, map-assisted, classical, and simulated confidence errors over observed replay"
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
          <path d={chart("ins")} fill="none" stroke="#f2bb75" strokeWidth="2" />
          <path
            d={chart("classical")}
            fill="none"
            stroke="#f49484"
            strokeWidth="2"
          />
          <path
            d={chart("ekf")}
            fill="none"
            stroke="#62cbd4"
            strokeWidth="2.2"
          />
          <path
            d={chart("map")}
            fill="none"
            stroke="#d9f5a0"
            strokeWidth="2.5"
          />
        </svg>
        <small>
          Shaded region: GNSS blackout · dashed violet line: simulated 95%
          horizontal bound
        </small>
      </section>
      <div className="evidence-detail">
        <section>
          <h3>Estimator comparison</h3>
          {values.length ? (
            <table>
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Final error</th>
                  <th>RMSE</th>
                  <th>Drift</th>
                </tr>
              </thead>
              <tbody>
                {values.map((metric) => (
                  <tr key={metric.name}>
                    <td>{labels[metric.name]}</td>
                    <td>{metric.error.toFixed(2)} m</td>
                    <td>{metric.rmse.toFixed(2)} m</td>
                    <td>
                      {metric.drift === null
                        ? "N/A"
                        : `${metric.drift.toFixed(2)}%`}
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
