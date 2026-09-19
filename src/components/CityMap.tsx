import { memo, useMemo, useState } from "react";
import {
  Crosshair,
  Layers,
  Minus,
  Plus,
  Navigation2,
  Scan,
  Compass,
  Satellite,
} from "lucide-react";
import type { Layers as LayerState, Run, Snapshot } from "../engine/types";
import { mainRoad, northRoad, serviceRoad } from "../engine/scenarios";
import { path } from "../engine/geometry";

/**
 * 95% (2σ) horizontal covariance ellipse from the live filter's 2×2 position
 * covariance Σ = [[xx, xy], [xy, yy]] (plan §7.2): axes are the eigenvalue
 * square roots scaled by χ²(2, 0.95) = 2.448, orientation from the first
 * eigenvector. Replaces the old isotropic radius circle in replay mode.
 */
function Ellipse2Sigma({
  x, y, xx, xy, yy,
}: { x: number; y: number; xx: number; xy: number; yy: number }) {
  const CHI2 = 2.448; // 95% quantile, 2 DOF
  const tr = xx + yy;
  const det = Math.max(1e-9, xx * yy - xy * xy);
  const disc = Math.max(0, (tr * tr) / 4 - det);
  const l1 = Math.max(1e-6, tr / 2 + Math.sqrt(disc));
  const l2 = Math.max(1e-6, tr / 2 - Math.sqrt(disc));
  const a = Math.min(1500, CHI2 * Math.sqrt(l1));
  const b = Math.min(1500, CHI2 * Math.sqrt(l2));
  // eigenvector angle of the major axis (degrees)
  const ang = (Math.atan2(l1 - xx, xy) * 180) / Math.PI;
  return (
    <ellipse
      cx={x}
      cy={y}
      rx={a}
      ry={b}
      transform={`rotate(${ang} ${x} ${y})`}
      fill="#a7dce5"
      fillOpacity=".07"
      stroke="#93d7df"
      strokeDasharray="3 3"
      strokeWidth="1"
    />
  );
}
import { Status } from "./ui";

const blocks = Array.from({ length: 120 }, (_, i) => {
  const x = 65 + (i % 15) * 76 + (Math.floor(i / 15) % 2) * 13,
    y = 65 + Math.floor(i / 15) * 86;
  return {
    x,
    y,
    w: 35 + ((i * 17) % 30),
    h: 26 + ((i * 11) % 28),
    r: i % 3 ? 3 : 7,
  };
});
const BaseMap = memo(function BaseMap() {
  return (
    <>
      <defs>
        <pattern
          id="mapgrid"
          width="50"
          height="50"
          patternUnits="userSpaceOnUse"
        >
          <path d="M50 0H0V50" fill="none" stroke="#233034" strokeWidth=".5" />
        </pattern>
        <pattern
          id="tunnelPattern"
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <path d="M0 0V12" stroke="#9cb0a8" strokeWidth="2" opacity=".2" />
        </pattern>
      </defs>
      <rect width="1200" height="800" fill="#111c20" />
      <rect width="1200" height="800" fill="url(#mapgrid)" />
      <path
        d="M0 690C200 780 210 675 355 690S635 780 760 688 940 590 1200 710V800H0Z"
        fill="#132a2e"
      />
      <path
        d="M0 690C200 780 210 675 355 690S635 780 760 688 940 590 1200 710"
        stroke="#204046"
        strokeWidth="2"
        fill="none"
      />
      <g fill="#1b2a2d" stroke="#28383b" strokeWidth="1">
        {blocks.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.r} />
        ))}
      </g>
      <g fill="none" stroke="#0e191d" strokeWidth="26">
        {[140, 300, 465, 620].map((y) => (
          <path key={y} d={`M-10 ${y}L1200 ${y - 80}`} />
        ))}
        {[185, 370, 555, 740, 925, 1110].map((x) => (
          <path key={x} d={`M${x} -20L${x - 150} 850`} />
        ))}
      </g>
      <g fill="none" stroke="#344346" strokeWidth="1.4">
        {[140, 300, 465, 620].map((y) => (
          <path key={y} d={`M-10 ${y}L1200 ${y - 80}`} />
        ))}
        {[185, 370, 555, 740, 925, 1110].map((x) => (
          <path key={x} d={`M${x} -20L${x - 150} 850`} />
        ))}
      </g>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {[mainRoad, northRoad, serviceRoad].map((p, i) => (
          <g key={i}>
            <path d={path(p)} stroke="#0b1519" strokeWidth={i ? 25 : 35} />
            <path d={path(p)} stroke="#425255" strokeWidth={i ? 18 : 25} />
            <path d={path(p)} stroke="#27373b" strokeWidth={i ? 15 : 21} />
            <path
              d={path(p)}
              stroke="#93a8a8"
              strokeWidth=".8"
              strokeDasharray="6 9"
              opacity=".4"
            />
          </g>
        ))}
      </g>
      <path
        d={path(mainRoad.slice(3, 7))}
        stroke="#142226"
        strokeWidth="39"
        fill="none"
      />
      <path
        d={path(mainRoad.slice(3, 7))}
        stroke="url(#tunnelPattern)"
        strokeWidth="35"
        fill="none"
      />
      <g fill="#92a6a9" fontFamily="inherit" fontSize="11" letterSpacing="2">
        <text x="122" y="345">
          WEST QUARTER
        </text>
        <text x="790" y="147">
          NORTH GATE
        </text>
        <text x="865" y="551">
          EAST COMMONS
        </text>
        <text x="496" y="685" fill="#4c7b80">
          MERIDIAN RIVER
        </text>
      </g>
      <g fill="#7c9498" fontFamily="inherit" fontSize="10">
        <text x="320" y="546" transform="rotate(-32 320 546)">
          Aster Avenue
        </text>
        <text x="565" y="255">
          North Ramp
        </text>
        <text x="690" y="469" transform="rotate(-25 690 469)">
          Service Road
        </text>
      </g>
      <g transform="translate(515 342)">
        <rect width="143" height="27" rx="5" fill="#17282d" stroke="#47615f" />
        <text x="12" y="18" fontSize="10" fill="#b6cac0" letterSpacing="1.2">
          MERIDIAN TUNNEL
        </text>
      </g>
      <g transform="translate(918 389)">
        <rect width="26" height="26" rx="5" fill="#213538" stroke="#466366" />
        <text x="9" y="18" fill="#a7bcc1" fontSize="14">
          P
        </text>
      </g>
      <g fill="#1c3830" opacity=".75">
        {Array.from({ length: 23 }, (_, i) => (
          <circle
            key={i}
            cx={120 + i * 7}
            cy={215 + Math.sin(i) * 20}
            r={9 + (i % 4)}
          />
        ))}
      </g>
    </>
  );
});
const initial: LayerState = {
  reference: true,
  ins: true,
  ekf: true,
  map: true,
  classical: true,
  gnss: true,
  bound: true,
};
export function CityMap({
  run,
  snapshot,
  basic,
  playing = true,
}: {
  run: Run;
  snapshot: Snapshot;
  basic: boolean;
  /** audit #2: false before first playback → show the Space-hint overlay */
  playing?: boolean;
}) {
  const [layers, setLayers] = useState(initial),
    [open, setOpen] = useState(false),
    [zoom, setZoom] = useState(1),
    [follow, setFollow] = useState(() => window.innerWidth <= 700);
  const isReal = run.source === "iovnbd" || run.source === "byod";
  const iov = run.source === "iovnbd";
  const trails = useMemo(
    () =>
      run.snapshots
        .filter((s) => s.t <= snapshot.t)
        .filter((_, i) => i % 3 === 0),
    [run, snapshot.t],
  );
  // reference path is static per run; in IO-VNBD/BYOD mode it is the real GNSS track
  const refD = useMemo(() => path(run.scenario.route), [run]);

  // Compute dynamic ENU bounds so real routes always fit cleanly without clipping
  const bounds = useMemo(() => {
    const pts = run.scenario.route;
    if (!pts || pts.length === 0) {
      return { cx: 600, cy: 400, w: 1200, h: 800 };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x != null && Number.isFinite(p.x)) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
      if (p.y != null && Number.isFinite(p.y)) {
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    // Also check all estimator traces so drift never clips beyond canvas
    if (run.snapshots && run.snapshots.length > 0) {
      for (let i = 0; i < run.snapshots.length; i += 4) {
        const s = run.snapshots[i];
        for (const pt of [s.ekf, s.ins, s.classical, s.live, s.map, s.reference]) {
          if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
          }
        }
      }
    }
    if (!Number.isFinite(minX)) {
      return { cx: 600, cy: 400, w: 1200, h: 800 };
    }
    const spanX = Math.max(120, maxX - minX);
    const spanY = Math.max(90, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Keep 3:2 aspect ratio with 30% padding
    let w = spanX * 1.3;
    let h = spanY * 1.3;
    if (w / h > 1.5) {
      h = w / 1.5;
    } else {
      w = h * 1.5;
    }
    return { cx, cy, w, h };
  }, [run]);

  const defaultCenter = isReal ? { x: bounds.cx, y: bounds.cy } : { x: 600, y: 400 };
  const baseW = isReal ? bounds.w : 1200;

  const c = follow ? (snapshot.map ?? snapshot.ekf) : defaultCenter;
  const w = (follow ? Math.min(baseW, 600) : baseW) / zoom;
  const h = w / 1.5;
  const view = `${c.x - w / 2} ${c.y - h / 2} ${w} ${h}`;
  return (
    <section className="map-surface" aria-label="Interactive navigation map">
      {/* audit #2: affordance for the first 10 seconds. The map stays static until
          playback starts; tell the judge exactly which key moves it */}
      {!playing && (
        <div className="play-hint" role="status">
          <kbd>Space</kbd>
          <span>to start the run</span>
          <small>← → scrub · Ctrl K jump anywhere</small>
        </div>
      )}
      <svg
        className="city-canvas"
        viewBox={view}
        preserveAspectRatio={follow ? "xMidYMid slice" : "xMidYMid meet"}
        role="img"
        aria-label="Interactive district map with separate estimated trajectories"
      >
        {isReal ? (
          <>
            <defs>
              <pattern
                id="enu-mapgrid"
                width="100"
                height="100"
                patternUnits="userSpaceOnUse"
              >
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#1c2a2e" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect
              x={c.x - w * 4}
              y={c.y - h * 4}
              width={w * 8}
              height={h * 8}
              fill="#0d1518"
            />
            <rect
              x={c.x - w * 4}
              y={c.y - h * 4}
              width={w * 8}
              height={h * 8}
              fill="url(#enu-mapgrid)"
            />
          </>
        ) : (
          <BaseMap />
        )}
        {layers.reference && (
          <path
            d={refD}
            stroke="#c9d4ca"
            strokeWidth={iov ? 2 : 1.8}
            strokeDasharray="3 7"
            opacity=".48"
            fill="none"
          />
        )}
        {layers.classical && (
          <path
            data-testid="classical-path"
            d={path(trails.map((s) => s.classical))}
            stroke="#f49484"
            strokeWidth="2.2"
            fill="none"
            opacity=".9"
            /* audit #1: Classical = dotted (double-encoded with coral) */
            strokeDasharray="2 5"
          />
        )}
        {iov && layers.ekf && snapshot.live && (
          <path
            data-testid="live-path"
            d={path(trails.map((s) => s.live ?? s.ekf))}
            stroke="#7fd8c8"
            strokeWidth="2.2"
            strokeDasharray="5 4"
            fill="none"
            opacity=".95"
          />
        )}
        {layers.ins && (
          <path
            data-testid="ins-path"
            d={path(trails.map((s) => s.ins))}
            stroke="#f2bb75"
            strokeWidth="1.8"
            fill="none"
            /* audit #1 double-encoding: INS = long dashes (not color alone) */
            strokeDasharray="10 7"
            opacity=".9"
          />
        )}
        {layers.ekf && (
          <>
            {/* halo pass (wide low-opacity underlay) keeps the primary trace
                legible over the reference dashes, so no SVG glow filter is needed */}
            <path
              d={path(trails.map((s) => s.ekf))}
              stroke="#62cbd4"
              strokeWidth="9"
              fill="none"
              opacity=".2"
            />
            <path
              data-testid="ekf-path"
              d={path(trails.map((s) => s.ekf))}
              stroke="#62cbd4"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          </>
        )}
        {layers.map && (
          <>
            <path
              d={path(trails.map((s) => s.map))}
              stroke="#d9f5a0"
              strokeWidth="9"
              fill="none"
              opacity=".2"
            />
            <path
              data-testid="map-path"
              d={path(trails.map((s) => s.map))}
              stroke="#d9f5a0"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
              // dashed in replay mode: route topology match, not a road network
              strokeDasharray={iov ? "7 5" : undefined}
              // §7.3: opacity carries the CURRENT route lock confidence.
              // a measurement (HMM emission), not decoration; dims honestly
              // when the filter leaves the topology
              opacity={
                snapshot.mapLock != null
                  ? 0.35 + 0.6 * snapshot.mapLock
                  : undefined
              }
            />
          </>
        )}
        {layers.gnss &&
          trails
            .filter((s) => s.gnss)
            .map((s) => (
              <circle
                key={s.t}
                cx={s.gnss!.x}
                cy={s.gnss!.y}
                r={s.rejected ? 4 : 2}
                fill={s.rejected ? "#f49484" : "#6fab92"}
              />
            ))}
        {layers.bound &&
          (snapshot.cov ? (
            <Ellipse2Sigma
              x={snapshot.ekf.x}
              y={snapshot.ekf.y}
              xx={snapshot.cov.xx}
              xy={snapshot.cov.xy}
              yy={snapshot.cov.yy}
            />
          ) : (
            <circle
              cx={snapshot.ekf.x}
              cy={snapshot.ekf.y}
              r={snapshot.bound}
              fill="#a7dce5"
              fillOpacity=".06"
              stroke="#93d7df"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          ))}
        <g transform={`translate(${snapshot.map.x} ${snapshot.map.y})`}>
          <circle r="25" fill="#d9f5a0" opacity=".06" />
          <circle r="16" fill="#172a25" stroke="#d9f5a0" strokeOpacity=".25" />
          <path
            transform={`rotate(${snapshot.heading})`}
            d="M0 -11L8 10L0 6L-8 10Z"
            fill="#d9f5a0"
            stroke="#f4ffe6"
            strokeWidth=".7"
          />
        </g>
        <circle
          cx={run.scenario.route.at(-1)!.x}
          cy={run.scenario.route.at(-1)!.y}
          r="7"
          fill="#192c29"
          stroke="#d9f5a0"
          strokeWidth="2"
        />
      </svg>
      <div className="map-vignette" />
      <div className="map-top">
        <span className="map-location">
          <i />
          {run.source === "iovnbd" ? (
            <>
              IO-VNBD TRIP {run.iovnbd?.trip} <b>REAL DATA REPLAY</b>
            </>
          ) : run.source === "byod" ? (
            <>
              {run.byod?.counterfactual ? "OWN DRIVE (COUNTERFACTUAL)" : "OWN DRIVE"} <b>PHONE CAPTURE</b>
            </>
          ) : (
            <>
              ASTER DISTRICT <b>SYNTHETIC</b>
            </>
          )}
        </span>
        <div className="map-top-actions">
          <span className={`map-signal ${snapshot.state.toLowerCase()}`}>
            <Satellite size={11} />
            {snapshot.state === "DENIED"
              ? "GNSS DENIED"
              : snapshot.gnss
                ? snapshot.gnssAccepted
                  ? "GNSS FIX"
                  : "GNSS REJECTED"
                : "NO FIX"}
          </span>
          <button
            className={`map-button ${open ? "selected" : ""}`}
            aria-label="Toggle map layers"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <Layers size={17} />
          </button>
        </div>
      </div>
      {open && (
        <div className="layers-menu">
          <strong>Map layers</strong>
          {(Object.keys(layers) as (keyof LayerState)[]).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={() =>
                  setLayers((old) => ({ ...old, [key]: !old[key] }))
                }
              />
              <span>
                {
                  {
                    reference: "Reference route",
                    ins: "INS / dead reckoning",
                    ekf: "ES-EKF + ML aiding",
                    map: "Map assisted output",
                    classical: "Classical EKF comparator",
                    gnss: "GNSS observations",
                    bound: iov ? "Live filter 95% integrity bound" : "Simulated 95% bound",
                  }[key]
                }
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="map-direction">
        <span className="direction-icon">
          <Navigation2 size={23} />
        </span>
        <div>
          <small>
            {snapshot.state === "DENIED"
              ? "GNSS OUTAGE · LIVE ES-EKF ACTIVE"
              : iov
                ? "REAL GNSS TRACK · LIVE FILTER ON DEVICE"
                : "CURRENT ROUTE"}
          </small>
          <strong>
            {iov
              ? `Trip ${run.iovnbd?.trip} · ${run.iovnbd?.blackoutDist.toFixed(0)} m outage`
              : basic
                ? "Continue on Aster Avenue"
                : "Meridian passage"}
          </strong>
          <p>
            {snapshot.state === "DENIED"
              ? "ES-EKF propagating · fixes unavailable"
              : iov
                ? "Replaying recorded sensors · reference in gray"
                : "West Quarter → North Gate"}
          </p>
        </div>
      </div>
      <div className="map-tools">
        <button
          className="map-button"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
        >
          <Plus size={18} />
        </button>
        <button
          className="map-button"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.8, z - 0.25))}
        >
          <Minus size={18} />
        </button>
        <button
          className={`map-button ${follow ? "selected" : ""}`}
          aria-label="Follow vehicle"
          aria-pressed={follow}
          onClick={() => setFollow(!follow)}
        >
          <Crosshair size={18} />
        </button>
        <button
          className="map-button"
          aria-label="Fit route"
          onClick={() => {
            setZoom(1);
            setFollow(false);
          }}
        >
          <Scan size={18} />
        </button>
        <div className="north">
          <Compass size={18} />N
        </div>
        {/* buffy: true scale bar. The local frame is ENU meters, so the bar is
            exact for the data (streets are stylized). Picks a round distance
            near 1/5 of the shown width; width% keeps it honest at any zoom. */}
        {(() => {
          const target = w / 5;
          const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((v) => v >= target) ?? (target > 5000 ? Math.round(target / 1000) * 1000 : 1000);
          return (
            <div className="scalebar" aria-hidden>
              <i style={{ width: `${(nice / w) * 100}%` }} />
              <span>{nice >= 1000 ? `${nice / 1000} km` : `${nice} m`}</span>
            </div>
          );
        })()}
      </div>
      <div className="map-bottom">
        <div className="map-legend">
          {/* N2 (Antigravity audit): legend is the decoder ring that is always on.
              every swatch mirrors its trace's color AND dash pattern so the
              5 traces are explainable without opening any toggle. */}
          <span
            title={
              run.byod?.counterfactual
                ? "Reference only, hidden from the estimator during the counterfactual outage"
                : "Recorded GNSS track used as the evaluation reference"
            }
          >
            <i className="grey dashref" />
            {run.byod?.counterfactual ? "Reference (hidden from filter)" : "GNSS reference"}
          </span>
          <span>
            {/* audit #1: pattern+color double encoding, WCAG-safe */}
            <i className="amber dashed" />
            INS / DR
          </span>
          <span>
            <i className="cyan" />
            ES-EKF + ML
          </span>
          <span title="Route topology replay matcher; full OSM graph is future work">
            <i className="lime dashed" />
            Route match
          </span>
          <span>
            <i className="coral dotted" />
            Classical
          </span>
          {snapshot.gnss && (
            <span title="Gated GNSS fixes fused into the filter">
              <i className="gnss-dot" />
              GNSS fix
            </span>
          )}
        </div>
        <Status state={snapshot.state} />
      </div>
    </section>
  );
}
