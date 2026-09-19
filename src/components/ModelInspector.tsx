import { useEffect, useState } from "react";
import { BrainCircuit, AlertCircle } from "lucide-react";

/**
 * Model Inspector (plan §32) with provenance for the trained motion mode
 * classifier, straight from the training bundle (iovnbd-model.json).
 * Everything shown is a REAL training artifact: protocol, class/speed
 * structure, holdout accuracy vs the majority baseline, LOTO cross mount
 * transfer, and the learned weight matrix as a heatmap. No simulated
 * numbers. Where the model is weak (cross mount S3a), it says so.
 */
type ModelJson = {
  kind: string;
  version: string;
  trainedAt: string;
  windowSamples: number;
  rateHz: number;
  classes: string[];
  speedCenters: number[];
  protocol: string;
  features: string[];
  weights: number[][]; // [feature][class] (+ final bias row)
  evalHoldout: Record<
    string,
    { acc: number; majority: number; mae: number; rmse: number; n: number }
  >;
  evalLoto: Record<string, { acc: number }>;
  note: string;
};

export function ModelInspector() {
  const [m, setM] = useState<ModelJson | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/data/iovnbd-model.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ModelJson | null) => {
        if (alive && d) setM(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!m) return null;

  const trips = Object.keys(m.evalHoldout);
  const nF = m.weights.length;
  const nC = m.classes.length;

  // Heatmap normalization: per-feature max |weight| so each row uses the
  // full intensity range (features live on very different scales).
  const rowMax = m.weights.map((w) =>
    Math.max(...w.map((x) => Math.abs(x)), 1e-9),
  );

  return (
    <div className="model-inspector">
      <div className="section-header">
        <div>
          <span className="section-label">MODEL INSPECTOR</span>
          <h2>The learned component, opened up.</h2>
          <p>
            Training artifacts from the virtual odometer classifier. Nothing
            here is simulated.
          </p>
        </div>
        <span className="run-badge run-badge-real">
          <BrainCircuit size={10} /> {m.kind} · {m.version}
        </span>
      </div>

      <div className="mi-grid">
        {/* --- provenance --- */}
        <div className="mi-card">
          <h3>Provenance</h3>
          <dl className="mi-dl">
            <dt>Input window</dt>
            <dd className="exp-mono">
              {(m.windowSamples / m.rateHz).toFixed(1)} s @ {m.rateHz} Hz
            </dd>
            <dt>Classes</dt>
            <dd className="exp-mono">{m.classes.join(" · ")}</dd>
            <dt>Speed centers</dt>
            <dd className="exp-mono">
              {m.speedCenters.map((s) => s.toFixed(1)).join(" / ")} m/s
            </dd>
            <dt>Parameters</dt>
            <dd className="exp-mono">
              {nF}×{nC} (weights + bias)
            </dd>
            <dt>Trained</dt>
            <dd className="exp-mono">{m.trainedAt.slice(0, 16)}Z</dd>
          </dl>
          <p className="mi-note">{m.protocol}</p>
        </div>

        {/* --- holdout vs baseline --- */}
        <div className="mi-card">
          <h3>Temporal holdout: accuracy vs majority baseline</h3>
          {trips.map((t) => {
            const e = m.evalHoldout[t];
            const lift = e.acc - e.majority;
            return (
              <div key={t} className="mi-bar-row">
                <span className="mi-bar-label exp-mono">{t}</span>
                <div className="mi-bar">
                  <div
                    className="mi-bar-baseline"
                    style={{ width: `${e.majority * 100}%` }}
                  />
                  <div
                    className="mi-bar-acc"
                    style={{ width: `${e.acc * 100}%` }}
                  />
                </div>
                <span className="mi-bar-val exp-mono">
                  {(e.acc * 100).toFixed(1)}%{" "}
                  <em className={lift > 0 ? "up" : "down"}>
                    +{(lift * 100).toFixed(1)}
                  </em>
                </span>
              </div>
            );
          })}
          <p className="mi-note">
            Gray = always-predict-majority baseline; green = model. MAE{" "}
            {trips
              .map((t) => m.evalHoldout[t].mae.toFixed(1))
              .join("/")}{" "}
            m/s, N ={" "}
            {trips.reduce((a, t) => a + m.evalHoldout[t].n, 0).toLocaleString()}{" "}
            windows. Held out temporal split with no leakage from blackout
            segments.
          </p>
        </div>

        {/* --- LOTO transfer --- */}
        <div className="mi-card">
          <h3>Cross mount transfer (leave one trip out)</h3>
          <div className="mi-loto">
            {Object.keys(m.evalLoto).map((t) => (
              <div key={t} className="mi-loto-cell">
                <span className="exp-mono mi-loto-trip">{t}</span>
                <span className="exp-mono mi-loto-acc">
                  {(m.evalLoto[t].acc * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          <p className="mi-note mi-warn">
            <AlertCircle size={11} /> {m.note}
          </p>
        </div>
      </div>

      {/* --- learned weights heatmap --- */}
      <div className="mi-card mi-heat-card">
        <h3>Learned weights: {nF} features × {nC} classes</h3>
        <svg
          className="mi-heat"
          viewBox={`0 0 ${nC * 44 + 8} ${Math.min(nF, 28) * 7 + 22}`}
          role="img"
          aria-label="Heatmap of learned model weights"
        >
          {m.classes.map((c, j) => (
            <text
              key={c}
              x={12 + j * 44 + 18}
              y={9}
              textAnchor="middle"
              className="mi-heat-head"
            >
              {c.slice(0, 4)}
            </text>
          ))}
          {m.weights.slice(0, 28).map((w, i) =>
            w.map((x, j) => (
              <rect
                key={`${i}-${j}`}
                x={12 + j * 44}
                y={16 + i * 7}
                width={40}
                height={5.4}
                rx={1.2}
                fill={x >= 0 ? "#62cbd4" : "#f49484"}
                opacity={0.08 + 0.87 * (Math.abs(x) / rowMax[i])}
              />
            )),
          )}
        </svg>
        <p className="mi-note">
          Each row is one rotation-invariant feature (linAccMag / gyroMag /
          axis-gyro / vertical-dominance / jerk statistics at 2 s, 5 s, 10 s
          windows); columns are the four motion classes. Cyan = positive
          weight, coral = negative, intensity = magnitude normalized per row.
        </p>
      </div>
    </div>
  );
}
