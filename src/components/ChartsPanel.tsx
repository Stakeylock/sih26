import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Activity } from "lucide-react";
import type { Replay } from "../hooks/useReplay";

/**
 * Time-synced chart drawer (plan §11/§37): small-multiple strip charts sharing
 * one cursor; dragging on any strip seeks the replay (Grafana-style crosshair,
 * adapted to our design tokens — pure SVG, no chart lib, fully offline).
 *
 * Every series is a REAL signal, not decoration:
 *  - SPEED    : primary fused speed
 *  - GNSS NIS : live ES-EKF normalized innovation square (iovnbd runs; null
 *               before the first fix), with the 9.21 gate line
 *  - BOUND    : live filter 95% covariance + protection level
 *  - ML CONF  : learned motion-mode confidence (drives the OOD gate)
 *
 * The blackout region is shaded on every strip so outages read instantly.
 */
const CHART_H = 64;
const W = 1000; // internal viewBox width; CSS scales responsively

type Series = {
  key: string;
  label: string;
  color: string;
  data: (number | null)[];
  refLine?: { y: number; label: string };
  fmt: (v: number) => string;
};

export function ChartsPanel({ replay }: { replay: Replay }) {
  const { run, t, seek } = replay;
  const [open, setOpen] = useState(true);
  const dragging = useRef(false);

  const model = useMemo(() => {
    const snaps = run.snapshots;
    const n = snaps.length;
    const stride = Math.max(1, Math.floor(n / W));
    const sub = snaps.filter((_, i) => i % stride === 0);
    // blackout span from state (source-agnostic: works for synthetic + iovnbd)
    let b0 = -1, b1 = -1;
    sub.forEach((s, i) => {
      if (s.state === "DENIED") {
        if (b0 < 0) b0 = i;
        b1 = i;
      }
    });
    const hasNis = sub.some((s) => s.nis != null);
    const series: Series[] = [
      {
        key: "speed",
        label: "SPEED",
        color: "var(--cyan)",
        data: sub.map((s) => s.speed),
        fmt: (v) => `${v.toFixed(1)} m/s`,
      },
      ...(hasNis
        ? [
            {
              key: "nis",
              label: "GNSS NIS",
              color: "var(--violet, #a78bfa)",
              data: sub.map((s) => (s.nis == null ? null : Math.min(s.nis, 60))),
              refLine: { y: 9.21, label: "gate" },
              fmt: (v: number) => v.toFixed(2),
            },
          ]
        : []),
      {
        key: "bound",
        label: "INTEGRITY BOUND (95%)",
        color: "var(--amber)",
        data: sub.map((s) => s.bound),
        fmt: (v) => `±${v.toFixed(1)} m`,
      },
      {
        key: "dml",
        label: "ML CORRECTION",
        color: "var(--violet, #b9a6ed)",
        data: sub.map((s) => Math.abs(s.mlSpeed - s.speed)),
        fmt: (v) => `${v.toFixed(2)} m/s`,
      },
      (() => {
        // unwrap heading so 360°->0° crossings don't draw vertical artifacts
        const raw = sub.map((s) => s.heading);
        const unwrapped: number[] = [];
        let acc = 0, prev = 0;
        raw.forEach((h, i) => {
          if (i === 0) { prev = h; unwrapped.push(h); return; }
          let d = h - prev;
          while (d > 180) d -= 360;
          while (d < -180) d += 360;
          acc += d;
          prev = h;
          unwrapped.push(acc);
        });
        return {
          key: "hdg",
          label: "HEADING (unwrapped)",
          color: "var(--muted, #84959a)",
          data: unwrapped,
          // unwrapped mod 360 == the actual compass heading at that sample
          fmt: (v: number) => `${Math.round(((v % 360) + 360) % 360)}°`,
        };
      })(),
      {
        key: "mlc",
        label: "ML CONFIDENCE",
        color: "var(--lime)",
        data: sub.map((s) => s.mlConfidence),
        fmt: (v) => `${Math.round(v * 100)}%`,
      },
    ];
    return {
      n: sub.length,
      t0: snaps[0]?.t ?? 0,
      tEnd: snaps[n - 1]?.t ?? 0,
      black: { start: b0, end: b1 },
      series,
    };
  }, [run]);

  if (!run.snapshots.length) return null;

  const { n, t0, tEnd, black, series } = model;
  const toX = (i: number) => (i / Math.max(1, n - 1)) * W;
  const cursorI = Math.round(((t - t0) / Math.max(1e-6, tEnd - t0)) * (n - 1));

  const seekFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    seek(t0 + frac * (tEnd - t0));
  };

  return (
    <section className="charts-panel" aria-label="Time-synchronized navigation charts">
      <div className="charts-head">
        <span className="charts-title">
          <Activity size={15} /> TELEMETRY STRIPS
          <small>drag anywhere to scrub · shared cursor</small>
        </span>
        <button
          className="charts-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse charts" : "Expand charts"}
        >
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>
      {open && (
        <div className="charts-body">
          {series.map((s) => {
            const vals = s.data.filter((v): v is number => v != null && Number.isFinite(v));
            const hi = Math.max(1e-6, quantile(vals, 0.99)); // robust y-scale
            const cur = s.data[Math.max(0, Math.min(n - 1, cursorI))];
            return (
              <div className="chart-strip" key={s.key}>
                <div className="chart-label">
                  <span className="chart-name" style={{ color: s.color }}>
                    {s.label}
                  </span>
                  <span className="chart-val mono">
                    {cur == null ? "—" : s.fmt(cur)}
                  </span>
                </div>
                <svg
                  className="chart-svg"
                  viewBox={`0 0 ${W} ${CHART_H}`}
                  preserveAspectRatio="none"
                  onPointerDown={(e) => {
                    dragging.current = true;
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    seekFromEvent(e);
                  }}
                  onPointerMove={(e) => {
                    if (dragging.current) seekFromEvent(e);
                  }}
                  onPointerUp={() => (dragging.current = false)}
                  onPointerLeave={() => (dragging.current = false)}
                  style={{ touchAction: "none" }}
                  role="img"
                  aria-label={`${s.label} over time`}
                >
                  {black.start >= 0 && (
                    <rect
                      x={toX(black.start)}
                      width={Math.max(1, toX(black.end) - toX(black.start))}
                      y={0}
                      height={CHART_H}
                      fill="rgba(255,120,90,.07)"
                      stroke="rgba(255,120,90,.25)"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {s.refLine && (
                    <line
                      x1={0}
                      x2={W}
                      y1={yOf(Math.min(s.refLine.y, hi), hi)}
                      y2={yOf(Math.min(s.refLine.y, hi), hi)}
                      stroke="rgba(167,139,250,.5)"
                      strokeDasharray="4 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  <path
                    d={linePath(s.data, hi)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {cursorI >= 0 && cursorI < n && (
                    <line
                      x1={toX(cursorI)}
                      x2={toX(cursorI)}
                      y1={0}
                      y2={CHART_H}
                      stroke="rgba(255,255,255,.55)"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
                <div className="chart-axis mono">
                  <span>{fmtT(t0)}</span>
                  <span>{fmtT((t0 + tEnd) / 2)}</span>
                  <span>{fmtT(tEnd)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------- helpers ---------- */

function yOf(v: number, hi: number): number {
  return CHART_H - 4 - Math.min(1, v / hi) * (CHART_H - 10);
}

function quantile(src: number[], q: number): number {
  if (!src.length) return 1;
  const a = [...src].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

function linePath(data: (number | null)[], hi: number): string {
  let d = "";
  let pen = false;
  data.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = (i / Math.max(1, data.length - 1)) * W;
    d += `${pen ? "L" : "M"}${x.toFixed(1)},${yOf(v, hi).toFixed(1)} `;
    pen = true;
  });
  return d;
}

function fmtT(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
