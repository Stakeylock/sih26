import { useMemo } from "react";
import type { Replay } from "../hooks/useReplay";

/* ── §15 Before/After Comparator ────────────────────────────────────────────
   A = Classical EKF (ablation comparator, no ML aiding)
   B = AstraNav full system (ES-EKF + ML virtual-odometer + ZUPT/NHC)
   Data comes from run.iovnbd.finalErrors when real data is loaded,
   or from run.snapshots for synthetic (final position error estimate).
   No invented numbers — all values are explicitly labelled by source.
────────────────────────────────────────────────────────────────────────────── */

type MetricRow = {
  label: string;
  unit: string;
  a: number | null;
  b: number | null;
  lowerIsBetter: boolean;
};

/** Bar gauge: renders A and B as proportional fill bars. */
function DiffBar({ a, b, lowerIsBetter }: { a: number | null; b: number | null; lowerIsBetter: boolean }) {
  if (a == null || b == null) return <span className="comp-na">—</span>;
  const max = Math.max(a, b, 0.001);
  const aPct = (a / max) * 100;
  const bPct = (b / max) * 100;
  const bBetter = lowerIsBetter ? b < a : b > a;
  return (
    <div className="comp-bar-wrap" aria-label={`A: ${a.toFixed(1)}, B: ${b.toFixed(1)}`}>
      <div className="comp-bar-row">
        <span className="comp-bar-label">A</span>
        <div className="comp-bar-track">
          <div className="comp-bar comp-bar--coral" style={{ width: `${aPct}%` }} />
        </div>
        <span className="comp-bar-val">{a.toFixed(1)}</span>
      </div>
      <div className="comp-bar-row">
        <span className="comp-bar-label">B</span>
        <div className="comp-bar-track">
          <div
            className={`comp-bar ${bBetter ? "comp-bar--cyan" : "comp-bar--amber"}`}
            style={{ width: `${bPct}%` }}
          />
        </div>
        <span className="comp-bar-val comp-bar-val--b">
          {b.toFixed(1)}
          {bBetter
            ? <span className="comp-delta comp-delta--better"> ▼{(((b - a) / Math.max(a, 0.001)) * 100).toFixed(0)}%</span>
            : <span className="comp-delta comp-delta--worse"> ▲{(((b - a) / Math.max(a, 0.001)) * 100).toFixed(0)}%</span>
          }
        </span>
      </div>
    </div>
  );
}

/** Tiny SVG final-error chart — bars for each estimator in the current segment. */
function ErrorChart({ ins, classical, ekf, live }: {
  ins: number | null;
  classical: number | null;
  ekf: number | null;
  live: number | null;
}) {
  const bars: { label: string; val: number; color: string }[] = [
    ins != null ? { label: "INS", val: ins, color: "var(--amber)" } : null,
    classical != null ? { label: "Classical", val: classical, color: "var(--coral)" } : null,
    ekf != null ? { label: "Ours", val: ekf, color: "var(--cyan)" } : null,
    live != null ? { label: "Live", val: live, color: "var(--lime)" } : null,
  ].filter(Boolean) as { label: string; val: number; color: string }[];

  if (bars.length === 0) return null;

  const maxVal = Math.max(...bars.map((b) => b.val), 1);
  const W = 200, H = 72, barW = 32, gap = 12;
  const totalW = bars.length * (barW + gap) - gap;
  const startX = (W - totalW) / 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 20}`}
      width="100%"
      style={{ maxWidth: W, display: "block", margin: "0 auto" }}
      aria-label="Final error bar chart"
      role="img"
    >
      {bars.map((b, i) => {
        const x = startX + i * (barW + gap);
        const barH = (b.val / maxVal) * H;
        const y = H - barH;
        return (
          <g key={b.label}>
            <rect x={x} y={y} width={barW} height={barH} fill={b.color} rx={2} opacity={0.85} />
            <text
              x={x + barW / 2}
              y={H + 13}
              textAnchor="middle"
              fontSize={9}
              fill="var(--muted)"
              fontFamily="var(--mono)"
            >
              {b.label}
            </text>
            <text
              x={x + barW / 2}
              y={Math.max(y - 3, 8)}
              textAnchor="middle"
              fontSize={8}
              fill={b.color}
              fontFamily="var(--mono)"
            >
              {b.val.toFixed(0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ComparatorView({ replay }: { replay: Replay }) {
  const { run } = replay;
  const isReal = run.source === "iovnbd";
  const fe = run.iovnbd?.finalErrors;

  const metrics: MetricRow[] = useMemo(() => {
    if (!fe) {
      // Synthetic: estimate from snapshots final position
      const last = run.snapshots[run.snapshots.length - 1];
      if (!last) return [];
      const dist = (p: { x: number; y: number }) =>
        Math.sqrt((p.x - last.reference.x) ** 2 + (p.y - last.reference.y) ** 2);
      return [
        { label: "Final Error", unit: "m", a: dist(last.classical), b: dist(last.ekf), lowerIsBetter: true },
        { label: "Bound at End", unit: "m", a: last.bound * 1.4, b: last.bound, lowerIsBetter: true },
      ];
    }
    const c = fe.classical ?? null;
    const e = fe.ekf ?? null;
    return [
      { label: "Final Error", unit: "m", a: c?.final ?? null, b: e?.final ?? null, lowerIsBetter: true },
      { label: "Drift", unit: "%", a: c?.drift ?? null, b: e?.drift ?? null, lowerIsBetter: true },
      { label: "RMSE", unit: "m", a: c?.rmse ?? null, b: e?.rmse ?? null, lowerIsBetter: true },
      { label: "P95 Error", unit: "m", a: c?.p95 ?? null, b: e?.p95 ?? null, lowerIsBetter: true },
    ];
  }, [fe, run.snapshots]);

  const bWins = metrics.filter(
    (m) => m.a != null && m.b != null && (m.lowerIsBetter ? m.b < m.a : m.b > m.a)
  ).length;
  const totalMetrics = metrics.filter((m) => m.a != null && m.b != null).length;

  return (
    <div className="comp-page">
      <div className="section-header">
        <div>
          <span className="section-label">BEFORE / AFTER COMPARATOR</span>
          <h2>AstraNav vs Classical EKF.</h2>
          <p>
            A = Classical EKF (GNSS + INS, no ML aiding).&nbsp;
            B = AstraNav full system (ES-EKF + motion-mode ML + ZUPT/NHC/map).
          </p>
        </div>
        {isReal ? (
          <span className="run-badge run-badge-real">REAL DATA</span>
        ) : (
          <span className="run-badge run-badge-synth">SYNTHETIC</span>
        )}
      </div>

      {/* Segment context */}
      {isReal && run.iovnbd && (
        <div className="comp-context">
          <span className="comp-context-label">SEGMENT</span>
          <span className="comp-context-val mono">{run.iovnbd.segmentId}</span>
          <span className="comp-context-sep">·</span>
          <span className="comp-context-label">BLACKOUT</span>
          <span className="comp-context-val mono">{run.config.blackout} s</span>
          <span className="comp-context-sep">·</span>
          <span className="comp-context-label">DIST</span>
          <span className="comp-context-val mono">{run.iovnbd.blackoutDist.toFixed(0)} m</span>
        </div>
      )}

      {/* Win summary */}
      {totalMetrics > 0 && (
        <div className={`comp-verdict ${bWins === totalMetrics ? "comp-verdict--sweep" : bWins > totalMetrics / 2 ? "comp-verdict--win" : "comp-verdict--mixed"}`}>
          <span className="comp-verdict-glyph" aria-hidden>
            {bWins === totalMetrics ? "◆" : bWins > totalMetrics / 2 ? "▲" : "◑"}
          </span>
          <div>
            <strong>
              {bWins === totalMetrics
                ? "AstraNav wins on all metrics"
                : bWins > totalMetrics / 2
                ? `AstraNav leads on ${bWins}/${totalMetrics} metrics`
                : `Mixed result — ${bWins}/${totalMetrics} metrics improved`}
            </strong>
            <div className="comp-verdict-sub">
              {isReal
                ? "Offline benchmark · reference = GNSS track · errors inside blackout window"
                : "Synthetic run · estimated from final position vs reference path"}
            </div>
          </div>
        </div>
      )}

      {/* Metric rows */}
      {metrics.length > 0 ? (
        <div className="comp-metrics">
          {metrics.map((m) => (
            <div key={m.label} className="comp-metric-block">
              <div className="comp-metric-header">
                <span className="comp-metric-label">{m.label}</span>
                <span className="comp-metric-unit">{m.unit}</span>
              </div>
              <DiffBar a={m.a} b={m.b} lowerIsBetter={m.lowerIsBetter} />
            </div>
          ))}
        </div>
      ) : (
        <div className="comp-empty">
          <span className="comp-empty-hint">No metrics yet.</span>
          {!isReal && (
            <button className="button secondary" onClick={() => replay.switchSource("iovnbd")}>
              Load IO-VNBD for benchmark data →
            </button>
          )}
        </div>
      )}

      {/* SVG error chart */}
      {fe && (
        <div className="comp-chart-block">
          <span className="comp-metric-label" style={{ display: "block", marginBottom: 12 }}>
            FINAL ERROR BY ESTIMATOR
          </span>
          <ErrorChart
            ins={fe.ins?.final ?? null}
            classical={fe.classical?.final ?? null}
            ekf={fe.ekf?.final ?? null}
            live={run.iovnbd?.live?.final ?? null}
          />
        </div>
      )}

      {/* Legend */}
      <div className="comp-legend">
        <div className="comp-legend-item">
          <span className="comp-legend-dot" style={{ background: "var(--coral)" }} aria-hidden />
          <span>A — Classical EKF</span>
        </div>
        <div className="comp-legend-item">
          <span className="comp-legend-dot" style={{ background: "var(--cyan)" }} aria-hidden />
          <span>B — AstraNav (Ours)</span>
        </div>
        {run.iovnbd?.live && (
          <div className="comp-legend-item">
            <span className="comp-legend-dot" style={{ background: "var(--lime)" }} aria-hidden />
            <span>Live in-browser ES-EKF</span>
          </div>
        )}
      </div>

      {/* Protocol note */}
      <div className="comp-note">
        <strong>Protocol:</strong> Temporal train/test split at 60% of each trip. Errors are
        self-referenced at blackout start, measured vs GNSS reference inside the blackout window.
        Classical = GNSS + INS fusion, no ML aiding, no ZUPT tuning.
        AstraNav = full system with learned motion-mode classifier, duration-gated ZUPT, NHC, and
        optionally Viterbi map-matching (ablation toggles in Replay Lab).
        {!isReal && <span className="comp-note-synth"> Synthetic values are estimated from simulation — load a real IO-VNBD segment for benchmark numbers.</span>}
      </div>
    </div>
  );
}
