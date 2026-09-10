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
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" />
        </filter>
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
}: {
  run: Run;
  snapshot: Snapshot;
  basic: boolean;
}) {
  const [layers, setLayers] = useState(initial),
    [open, setOpen] = useState(false),
    [zoom, setZoom] = useState(1),
    [follow, setFollow] = useState(() => window.innerWidth <= 700);
  const trails = useMemo(
    () =>
      run.snapshots
        .filter((s) => s.t <= snapshot.t)
        .filter((_, i) => i % 3 === 0),
    [run, snapshot.t],
  );
  const w = 1200 / zoom,
    h = 800 / zoom,
    c = follow ? snapshot.map : { x: 600, y: 400 };
  const view = `${c.x - w / 2} ${c.y - h / 2} ${w} ${h}`;
  return (
    <section className="map-surface" aria-label="Interactive navigation map">
      <svg
        className="city-canvas"
        viewBox={view}
        preserveAspectRatio={follow ? "xMidYMid slice" : "xMidYMid meet"}
        role="img"
        aria-label="Synthetic district map with separate estimated trajectories"
      >
        <BaseMap />
        {layers.reference && (
          <path
            d={path(run.scenario.route)}
            stroke="#c9d4ca"
            strokeWidth="1.8"
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
          />
        )}
        {layers.ins && (
          <path
            data-testid="ins-path"
            d={path(trails.map((s) => s.ins))}
            stroke="#f2bb75"
            strokeWidth="1.8"
            fill="none"
          />
        )}
        {layers.ekf && (
          <>
            <path
              d={path(trails.map((s) => s.ekf))}
              stroke="#62cbd4"
              strokeWidth="9"
              fill="none"
              opacity=".2"
              filter="url(#glow)"
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
              filter="url(#glow)"
            />
            <path
              data-testid="map-path"
              d={path(trails.map((s) => s.map))}
              stroke="#d9f5a0"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
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
        {layers.bound && (
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
        )}
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
          ASTER DISTRICT <b>SYNTHETIC</b>
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
                    map: "Map-assisted output",
                    classical: "Classical EKF comparator",
                    gnss: "GNSS observations",
                    bound: "Simulated 95% bound",
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
              ? "GNSS OUTAGE · INS ACTIVE"
              : "CURRENT ROUTE"}
          </small>
          <strong>
            {basic ? "Continue on Aster Avenue" : "Meridian passage"}
          </strong>
          <p>
            {snapshot.state === "DENIED"
              ? "ES-EKF propagating · fixes unavailable"
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
        <span />
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
      </div>
      <div className="map-bottom">
        <div className="map-legend">
          <span>
            <i className="amber" />
            INS / DR
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
        <Status state={snapshot.state} />
      </div>
    </section>
  );
}
