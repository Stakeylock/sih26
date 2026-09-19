import { useEffect, useState } from "react";
import { Database, HardDriveDownload, Satellite, Timer } from "lucide-react";
import type { Replay } from "../hooks/useReplay";

/**
 * Data view (plan §20 Data Manager / §44 Dataset Dashboard).
 *
 * Presents the REAL dataset the system runs on: per-trip quality stats and
 * paths from the IO-VNBD trips bundle, plus the blackout-segment inventory.
 * Pure presentation over bundles that are already shipped locally. No new
 * data, no invented numbers. Honest provenance note included.
 */
type Trip = {
  id: string;
  duration: number; // s
  distance: number; // m
  rateHz: number;
  gpsOkPct: number;
  origin: [number, number];
  pathX: number[];
  pathY: number[];
};

type SegInfo = { id: string; trip: string; blackDur: number; blackoutDist: number };

export function DataView({ replay }: { replay: Replay }) {
  const [trips, setTrips] = useState<Record<string, Trip> | null>(null);
  const [segs, setSegs] = useState<SegInfo[]>([]);

  // bundles are static local assets (demo lock: same-origin fetch only)
  useEffect(() => {
    let alive = true;
    fetch("/data/iovnbd-trips.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setTrips(d))
      .catch(() => alive && setTrips(null));
    fetch("/data/iovnbd-segments.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setSegs(d?.segments ?? []))
      .catch(() => alive && setSegs([]));
    return () => {
      alive = false;
    };
  }, []);

  const iov = replay.run.iovnbd;

  return (
    <section className="data-view" aria-label="Dataset dashboard">
      <header className="dv-head">
        <span className="dv-title">
          <Database size={16} /> DATA · IO-VNBD BENCHMARK
        </span>
        <span className="dv-prov">
          <Satellite size={12} /> University of Nottingham · real vehicle smartphone
          recordings · Driver A
        </span>
      </header>

      {trips ? (
        <div className="dv-trips">
          {Object.values(trips).map((t) => (
            <article className="dv-trip" key={t.id}>
              <div className="dv-trip-head">
                <strong>TRIP {t.id}</strong>
                <span className="dv-rate mono">{t.rateHz.toFixed(0)} Hz</span>
              </div>
              <svg className="dv-path" viewBox="0 0 200 90" role="img" aria-label={`Trip ${t.id} track`}>
                <path d={miniPath(t.pathX, t.pathY)} fill="none" stroke="#62cbd4" strokeWidth="1.5" />
              </svg>
              <dl className="dv-stats mono">
                <div>
                  <dt>DURATION</dt>
                  <dd>
                    <Timer size={11} /> {Math.round(t.duration / 60)} min
                  </dd>
                </div>
                <div>
                  <dt>DISTANCE</dt>
                  <dd>{(t.distance / 1000).toFixed(1)} km</dd>
                </div>
                <div>
                  <dt>GNSS OK</dt>
                  <dd>{t.gpsOkPct.toFixed(0)}%</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <p className="dv-missing">Trip bundles unavailable (offline fallback).</p>
      )}

      <div className="dv-segments">
        <strong>BLACKOUT SEGMENT INVENTORY</strong>
        <table>
          <thead>
            <tr>
              <th>Segment</th>
              <th>Trip</th>
              <th>Outage</th>
              <th>Outage distance</th>
              <th>Region</th>
            </tr>
          </thead>
          <tbody>
            {segs.map((s) => (
              <tr key={s.id} className={iov?.segmentId === s.id ? "active" : ""}>
                <td>{s.id}</td>
                <td>{s.trip}</td>
                <td className="mono">{s.blackDur} s</td>
                <td className="mono">{s.blackoutDist.toFixed(0)} m</td>
                <td>holdout (last 35%)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="dv-foot">
        <HardDriveDownload size={13} />
        <span>
          Prepared offline by <span className="mono">tools/prep_iovnbd.py</span>: 10 Hz
          re-grid, 25 m/sample fix jump rejection, fix-space track rebuild, calibration
          from the 40 s window before the outage. Bundles ship inside the app, so the demo needs
          zero network. Raw CSVs: <span className="mono">data/io-vnbd/</span> (git-LFS).
        </span>
      </footer>
    </section>
  );
}

/** Normalize a track into a small fixed viewBox. */
function miniPath(xs: number[], ys: number[]): string {
  if (xs.length < 2) return "";
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]);
  }
  const sx = 180 / Math.max(1e-6, maxX - minX);
  const sy = 70 / Math.max(1e-6, maxY - minY);
  const s = Math.min(sx, sy);
  const ox = 10 + (180 - (maxX - minX) * s) / 2;
  const oy = 10 + (70 - (maxY - minY) * s) / 2;
  let d = "";
  for (let i = 0; i < xs.length; i += Math.max(1, Math.floor(xs.length / 400))) {
    d += `${i === 0 ? "M" : "L"}${(ox + (xs[i] - minX) * s).toFixed(1)},${(90 - (oy + (ys[i] - minY) * s)).toFixed(1)} `;
  }
  return d;
}
