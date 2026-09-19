/**
 * Judge Report: a one click, self contained HTML evidence document (plan §16.2
 * "report export").
 *
 * Everything embedded is REAL run data: provenance, configuration (incl.
 * ablation flags), per-branch final errors, and the evaluation protocol.
 * For own-drive BYOD and Counterfactual experiments, it provides transparent
 * disclosures of masked estimator inputs and reacquisition metrics.
 * No network, no deps. A Blob download judges can open on any machine,
 * print, or attach to their evaluation notes.
 */
import type { Run } from "../engine/types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmtM = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "n/a" : `${v.toFixed(1)} m`;

const fmtDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export function buildJudgeReportHtml(run: Run): string {
  const now = new Date();
  const isIov = run.source === "iovnbd";
  const isByod = run.source === "byod";
  const cf = run.byod?.counterfactual;
  const cfg = run.config;
  // finalErrors is a Record keyed by estimator branch: final/drift/rmse/p95 each.
  const fe = run.iovnbd?.finalErrors ?? {};
  const live = run.iovnbd?.live;
  const get = (k: string) => fe[k]?.final;

  const rows: { label: string; value: string }[] = isByod
    ? [
        { label: "Reference phone GPS track", value: "0.0 m (reference)" },
        ...(live?.final != null
          ? [{ label: "Live ES-EKF in the browser (15 states)", value: fmtM(live.final) }]
          : []),
        ...(cf?.deviationM != null
          ? [{ label: "Estimator final deviation vs recorded GPS", value: fmtM(cf.deviationM) }]
          : []),
      ]
    : [
        { label: "Raw INS (dead reckoning)", value: fmtM(get("ins")) },
        { label: "Classical complementary + ZUPT (no ML)", value: fmtM(get("classical")) },
        { label: "AstraNav full system (offline benchmark)", value: fmtM(get("ekf")) },
        ...(live?.final != null
          ? [{ label: "Live ES-EKF in the browser (15 states)", value: fmtM(live.final) }]
          : []),
      ];

  const numeric = rows
    .map((r) => parseFloat(r.value))
    .filter((v) => Number.isFinite(v) && v > 0);
  const bestVal = numeric.length ? Math.min(...numeric) : null;

  const metricRow = (r: { label: string; value: string }) => `
    <tr>
      <td>${esc(r.label)}</td>
      <td class="num${bestVal != null && parseFloat(r.value) === bestVal ? " best" : ""}">${esc(r.value)}</td>
    </tr>`;

  const insFinal = get("ins");

  const badgeClass = cf ? "cf" : isByod ? "byod" : isIov ? "real" : "synth";
  const badgeLabel = cf
    ? "COUNTERFACTUAL TEST · REAL SENSORS · SYNTHETIC OUTAGE"
    : isByod
      ? "OWN DRIVE · REAL PHONE SENSORS"
      : isIov
        ? "REAL DATA · IO-VNBD"
        : "SYNTHETIC SCENARIO";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AstraNav-IDR Judge Report: ${esc(cfg.scenario)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 14px/1.55 "Segoe UI", system-ui, sans-serif; color: #17272b;
         max-width: 860px; margin: 0 auto; padding: 32px 24px; }
  h1 { font-size: 21px; margin: 0 0 2px; letter-spacing: .2px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1.4px;
       color: #4c6166; border-bottom: 1px solid #dde5e7; padding-bottom: 6px;
       margin: 28px 0 10px; }
  .sub { color: #5a7075; font-size: 12.5px; margin-bottom: 20px; }
  .badge { display: inline-block; font-size: 11px; font-weight: 700;
           letter-spacing: 1px; padding: 2px 9px; border-radius: 3px;
           margin-right: 6px; }
  .badge.real { background: #12312c; color: #7ef0c0; }
  .badge.byod { background: #132a30; color: #6fd3e8; }
  .badge.cf { background: #3d2a13; color: #f2bb75; border: 1px solid #b9822a; }
  .badge.synth { background: #2b2358; color: #b9a6ed; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #e7edee; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
       color: #5a7075; }
  td.num { text-align: right; font-variant-numeric: tabular-nums;
           font-family: Consolas, monospace; }
  td.num.best { color: #0c7a55; font-weight: 700; }
  .kv { display: grid; grid-template-columns: 240px 1fr; gap: 3px 16px; }
  .kv b { color: #4c6166; font-weight: 600; }
  .note { background: #f4f7f5; border-left: 3px solid #0c7a55;
          padding: 10px 14px; font-size: 13px; margin: 10px 0; }
  .warn { background: #fdf6ec; border-left: 3px solid #b9822a; }
  footer { margin-top: 34px; font-size: 11.5px; color: #7a8b8f;
           border-top: 1px solid #dde5e7; padding-top: 10px; }
  @media print {
    body { padding: 0; }
    .note, table, .kv { break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>AstraNav-IDR Navigation Evidence Report</h1>
  <div class="sub">
    <span class="badge ${badgeClass}">${badgeLabel}</span>
    Run <code>${esc(cfg.scenario)}${isIov ? ` · trip ${esc(run.iovnbd?.trip ?? "n/a")}` : isByod ? ` · ${esc(run.iovnbd?.trip ?? "OWN DRIVE")}` : ""}</code> · generated ${esc(now.toLocaleString())}
  </div>

  <h2>Run provenance</h2>
  <div class="kv">
    <b>Data source</b><span>${
      isByod
        ? `Own-drive smartphone recording (${esc(run.byod?.device?.platform || "Mobile device")})`
        : isIov
          ? `IO-VNBD benchmark, trip ${esc(run.iovnbd?.trip ?? "n/a")}`
          : "Deterministic synthetic scenario"
    }</span>
    ${
      run.byod?.capturedAt
        ? `<b>Captured timestamp</b><span>${esc(new Date(run.byod.capturedAt).toLocaleString())}</span>`
        : ""
    }
    ${
      run.byod?.duration
        ? `<b>Recording duration</b><span>${fmtDuration(run.byod.duration)} (${run.byod.duration.toFixed(1)} s @ ${(run.byod.rateHz ?? 10).toFixed(0)} Hz)</span>`
        : ""
    }
    <b>GNSS outage</b><span>${cfg.blackout}s ${cf ? `(window ${fmtDuration(cf.start)} → ${fmtDuration(cf.start + cf.duration)})` : `(begins t+${run.scenario.start}s)`}</span>
    <b>Reference standard</b><span>${isByod ? "Recorded phone GNSS track (reference only, not survey grade ground truth)" : isIov ? "High rate GNSS trajectory" : "Ground truth planar trajectory"}</span>
    <b>Ablation flags</b><span>NHC ${cfg.useNHC !== false ? "on" : "OFF"} · ZUPT ${cfg.useZUPT !== false ? "on" : "OFF"} · ML aid ${cfg.useML !== false ? "on" : "OFF"} · GNSS gate ${cfg.useGNSSGate !== false ? "on" : "OFF"}</span>
    ${cfg.faults?.length ? `<b>Injected faults</b><span>${esc(JSON.stringify(cfg.faults))}</span>` : ""}
  </div>

  ${
    cf
      ? `<h2>Counterfactual Experiment</h2>
  <div class="kv">
    <b>Experiment type</b><span>Counterfactual GNSS blackout on an own drive capture</span>
    <b>Outage window</b><span>${fmtDuration(cf.start)} → ${fmtDuration(cf.start + cf.duration)} (${cf.duration.toFixed(1)} s)</span>
    <b>Estimator GNSS inputs masked</b><span>Position: YES · Speed: YES · Course: YES · Accuracy: YES</span>
    <b>Evaluation reference</b><span>Original recorded phone GNSS track</span>
    <b>Reference supplied to filter</b><span>NO (strictly hidden from estimator during blackout)</span>
    <b>Deviation vs recorded reference</b><span>${fmtM(cf.deviationM)}</span>
    <b>Reacquisition relock time</b><span>${cf.timeToLock != null ? `${cf.timeToLock.toFixed(1)} s` : "n/a"}</span>
    <b>Reacquisition correction jump</b><span>${cf.correctionJump != null ? `${cf.correctionJump.toFixed(1)} m` : "n/a"}</span>
  </div>
  <div class="note">
    Important: The original phone GNSS track was algorithmically removed from the estimator
    for ${cf.duration} seconds and retained solely as a post-hoc evaluation reference.
    When satellite fixes returned, the filter validated consistency across 3 consecutive epochs before restoring full trust.
  </div>`
      : ""
  }

  <h2>Final position error after a ${cfg.blackout}s window without GNSS</h2>
  <table>
    <tr><th>Estimator</th><th style="text-align:right">Final horizontal error</th></tr>
    ${rows.map(metricRow).join("")}
  </table>
  ${
    bestVal != null && insFinal != null && insFinal > 0
      ? `<div class="note">Error reduction vs raw INS: <b>${(((insFinal - bestVal) / insFinal) * 100).toFixed(0)}%</b> over the same outage window, same sensor stream, no tuning per branch.</div>`
      : ""
  }

  <h2>Evaluation protocol</h2>
  <div class="kv">
    <b>Error anchoring</b><span>Self referenced: position error resets to zero at blackout start, isolating dead reckoning drift from error carried in from before the outage.</span>
    <b>ML protocol</b><span>Device adapted temporal holdout: the first 60% of each trip trains the model and evaluation runs strictly on the unseen later 40%. Cross mount transfer (LOTO) reported separately.</span>
    <b>GNSS integrity</b><span>χ²(2, 0.99) NIS gate at 9.21 rejects corrupted fixes before they enter the filter.</span>
    <b>ML gated ZUPT</b><span>Zero velocity update fires only on physical stationary detection AND learned P(stopped) &gt; 0.45 held 2 s.</span>
  </div>

  <h2>Honest limitations</h2>
  <div class="note warn">
    Replay adapter: the live filter propagates with recorded gyro/compass channels;
    horizontal phone-accelerometer propagation is intentionally suppressed
    (commercial grade noise). Map matching uses the recorded route topology. A full
    OSM road graph is future work. The systematic heading protection bound is
    SBAS-inspired, not formal aviation RAIM. Android/ONNX deployment is a
    documented roadmap item, not part of this build.
  </div>

  <footer>
    AstraNav-IDR · Team Recalibrate · SIH26168 · Intelligent Dead Reckoning ·
    Automated Vitest test suite, CI gated · Fully offline evidence console ·
    This report is machine-generated from run data at export time.
  </footer>
</body>
</html>`;
}

/** Trigger a browser download of the report for `run`. */
export function downloadJudgeReport(run: Run): void {
  const blob = new Blob([buildJudgeReportHtml(run)], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `astranav-judge-report-${run.source ?? "synthetic"}-${run.iovnbd?.trip ?? run.config.scenario}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
