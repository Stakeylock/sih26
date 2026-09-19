import { useEffect, useState } from "react";
import { BookmarkPlus, Download, ArrowUpRight, FileText } from "lucide-react";
import { saveRun } from "../engine/runlog";
import { downloadJudgeReport } from "./judgeReport";
import { pairedBootstrapReduction, type BootstrapResult } from "../engine/bootstrap";
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
  const iov = run.source === "iovnbd" ? run.iovnbd : undefined;
  const content =
    format === "json"
      ? JSON.stringify(
          {
            provenance: iov
              ? `IO-VNBD real-data replay: trip ${iov.trip}, segment ${iov.segmentId}; benchmark CSVs processed by tools/prep_iovnbd.py; estimator errors measured inside the ${run.config.blackout}s GNSS outage; reference = GNSS track. Not a validated production navigation engine.`
              : "synthetic planar simulation; not a validated navigation engine",
            version: 4,
            data_source: run.source ?? "synthetic",
            config: run.config,
            until: t,
            ...(iov
              ? {
                  iovnbd: {
                    trip: iov.trip,
                    segment: iov.segmentId,
                    blackout_distance_m: iov.blackoutDist,
                    calibration: iov.calib,
                    published_final_errors: iov.finalErrors,
                    model: iov.modelInfo,
                  },
                }
              : {}),
            metrics: metrics(run, t),
            events,
            snapshots,
          },
          null,
          2,
        )
      : [
          "provenance,t,reference_x_m,reference_y_m,ins_x_m,ins_y_m,ekf_x_m,ekf_y_m,map_x_m,map_y_m,classical_x_m,classical_y_m,live_x_m,live_y_m,ml_speed_mps,ml_confidence,ml_quality,gnss_state,gnss_x_m,gnss_y_m,gnss_accepted,gnss_residual_m,gnss_nis,bound_m,rejected",
          ...snapshots.map((snapshot) =>
            [
              run.source === "iovnbd" ? "iovnbd-replay" : "synthetic",
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
              snapshot.live?.x ?? "",
              snapshot.live?.y ?? "",
              snapshot.mlSpeed,
              snapshot.mlConfidence,
              snapshot.mlQuality,
              snapshot.state,
              snapshot.gnss?.x ?? "",
              snapshot.gnss?.y ?? "",
              snapshot.gnss ? snapshot.gnssAccepted : "",
              snapshot.gnssResidual ?? "",
              snapshot.nis ?? "",
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
  anchor.download = `astranav-${run.source === "iovnbd" ? "iovnbd-" : ""}${run.config.scenario}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function Evidence({ replay }: { replay: Replay }) {
  // buffy: run-library persistence (Claude's runlog REQUEST) — last save's id
  // for button feedback; resets per component mount, which is fine for a toast
  const [savedId, setSavedId] = useState<string | null>(null);
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
          <span className="section-label">
            {replay.run.source === "iovnbd"
              ? "MEASURED ON REAL IO-VNBD DATA"
              : "MEASURED WITHIN THIS SIMULATION"}
          </span>
          <h2>Trace every branch.</h2>
          <p>
            Observed through {timeLabel(replay.t)}. Future samples are excluded.
          </p>
        </div>
        <div className="actions">
          {/* buffy (Claude's §19 runlog REQUEST): pin this run to the local
              library so judges can revisit it; confirmation text doubles as
              the run_id readout. localStorage only — still fully offline. */}
          <button
            className="button"
            onClick={() => {
              const saved = saveRun(replay.run);
              setSavedId(saved.run_id);
            }}
          >
            <BookmarkPlus size={15} />
            {savedId ? "Saved ✓" : "Save run"}
          </button>
          {/* buffy: §16.2 judge report — self-contained offline HTML evidence
              doc (provenance, metrics vs INS, protocol, limitations). */}
          <button className="button primary" onClick={() => downloadJudgeReport(replay.run)}>
            <FileText size={15} />
            Judge report
          </button>
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
      {replay.run.iovnbd && (
        <section className="iov-benchmark" data-testid="iov-benchmark">
          <div className="iov-benchmark-head">
            <h3>REAL-DATA BENCHMARK · IO-VNBD</h3>
            <small>
              Trip {replay.run.iovnbd.trip} · segment {replay.run.iovnbd.segmentId} ·{" "}
              {replay.run.iovnbd.blackoutDist.toFixed(0)} m travelled inside the outage
            </small>
          </div>
          <table>
            <thead>
              <tr>
                <th>Estimator</th>
                <th>Final error</th>
                <th>Drift</th>
                <th>RMSE</th>
                <th>P95</th>
              </tr>
            </thead>
            <tbody>
              {["ins", "classical", "ekf"].map((k) => {
                const m = replay.run.iovnbd!.finalErrors[k];
                if (!m) return null;
                const name =
                  k === "ins"
                    ? "INS / dead reckoning"
                    : k === "classical"
                      ? "Classical (ZUPT, no ML)"
                      : "Ours (ES-EKF + learned modes)";
                return (
                  <tr key={k} className={k === "ekf" ? "ours" : ""}>
                    <td>{name}</td>
                    <td>{m.final.toFixed(1)} m</td>
                    <td>{m.drift.toFixed(1)}%</td>
                    <td>{m.rmse.toFixed(1)} m</td>
                    <td>{m.p95.toFixed(1)} m</td>
                  </tr>
                );
              })}
              <tr data-testid="live-row">
                <td>
                  Live in-browser ES-EKF
                  <small>
                    {replay.run.iovnbd.live.gyroTrusted
                      ? " · gyro validated"
                      : " · compass-aided"}
                  </small>
                </td>
                <td>{replay.run.iovnbd.live.final.toFixed(1)} m</td>
                <td>{replay.run.iovnbd.live.drift.toFixed(1)}%</td>
                <td>—</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
          <div className="iov-calib">
            <span>
              <small>GYRO BIAS</small>
              {replay.run.iovnbd.calib.gyroBias.toFixed(4)} rad/s
            </span>
            <span>
              <small>HEADING OFFSET</small>
              {replay.run.iovnbd.calib.headingOffset.toFixed(1)}°
            </span>
            <span>
              <small>INIT HEADING</small>
              {replay.run.iovnbd.calib.initialHeading.toFixed(1)}°
            </span>
            <span>
              <small>INIT SPEED</small>
              {replay.run.iovnbd.calib.initialSpeed.toFixed(1)} m/s
            </span>
          </div>
          {/* buffy: statistical-depth row — paired block-bootstrap 95% CI on
              the INS→ours error reduction over the outage window. Answers
              "29% — significant or noise?" Deterministic (LCG-seeded). */}
          <BootstrapCI snapshots={replay.run.snapshots} />
          <small className="iov-note">
            Protocol: motion-mode model trained on the first 60% of this trip; blackout
            taken from the unseen remainder. Reference: GNSS track. Estimator errors are
            self-referenced at blackout start. No estimator dominates every segment —
            selection under integrity rules is the research question.
          </small>
        </section>
      )}
      <div className="metric-grid">
        <Metric
          label={replay.run.source === "iovnbd" ? "Ours final error (live)" : "ES-EKF final error"}
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
        {replay.run.iovnbd ? (
          <section>
            <h3>
              Provenance <ArrowUpRight size={15} />
            </h3>
            <p>
              Dataset: IO-VNBD (public benchmark, smartphone GNSS/IMU @ 10 Hz).
              Trip {replay.run.iovnbd.trip}, segment {replay.run.iovnbd.segmentId}.
              Model: motion-mode classifier {replay.run.iovnbd.modelInfo.version},
              trained on the first 60% of the trip; blackout drawn from the unseen
              remainder. Cross-mount transfer remains an open challenge — reported,
              not hidden.
            </p>
            <span className="outline-tag">REAL-DATA EVIDENCE</span>
          </section>
        ) : (
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
        )}
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

/**
 * buffy: paired block-bootstrap 95% CI on the headline reduction
 * (INS final error → ours) over the outage window. Deterministic via
 * fixed LCG seed, so the number never changes between takes.
 */
function BootstrapCI({ snapshots }: { snapshots: Replay["run"]["snapshots"] }) {
  const [ci, setCi] = useState<BootstrapResult | null | undefined>(undefined);
  useEffect(() => {
    // deferred so the table paints first; 500 resamples is ~ms on n≈600
    const id = setTimeout(() => setCi(pairedBootstrapReduction(snapshots) ?? null), 40);
    return () => clearTimeout(id);
  }, [snapshots]);
  if (ci === undefined)
    return <div className="iov-ci">REDUCTION CONFIDENCE — resampling…</div>;
  if (ci === null) return null; // window too short — honest silence, not fake stats
  const sig = ci.loPct > 0;
  return (
    <div className="iov-ci" data-testid="bootstrap-ci">
      <span>
        <small>REDUCTION vs RAW INS (95% BLOCK BOOTSTRAP)</small>
        <b className="mono">
          {ci.pointPct.toFixed(0)}% [{ci.loPct.toFixed(0)}, {ci.hiPct.toFixed(0)}]
        </b>
      </span>
      <small className={sig ? "ci-sig" : "ci-ns"}>
        {sig
          ? `significant — interval excludes 0 · ${ci.nBlocks} circular blocks × ${ci.blockLen} epochs`
          : `NOT significant — interval includes 0 (${ci.nBlocks} blocks)`}
      </small>
    </div>
  );
}
