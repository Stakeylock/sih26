import { Compass, Info } from "lucide-react";
import type { Replay } from "../hooks/useReplay";

/** Gauge bar: 0..1 fill, coloured by token class */
function GaugeBar({ value, tone }: { value: number; tone: "lime" | "amber" | "cyan" | "coral" }) {
  const clamp = Math.max(0, Math.min(1, value));
  const colours: Record<string, string> = {
    lime: "#d9f5a0",
    amber: "#f2bb75",
    cyan: "#62cbd4",
    coral: "#f49484",
  };
  return (
    <div className="cal-gauge-track">
      <div
        className="cal-gauge-fill"
        style={{ width: `${clamp * 100}%`, background: colours[tone] }}
        role="progressbar"
        aria-valuenow={Math.round(clamp * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

/** Single labeled stat tile */
function StatTile({
  label,
  value,
  unit,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  tone?: "lime" | "amber" | "cyan" | "coral" | "neutral";
}) {
  return (
    <div className={`cal-stat cal-stat--${tone}`}>
      <span className="cal-stat-label">{label}</span>
      <span className="cal-stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      <span className="cal-stat-sub">{sub}</span>
    </div>
  );
}

/** SVG diagram: phone axes rotated by headingOffset relative to vehicle frame */
function FrameDiagram({ headingOffsetDeg }: { headingOffsetDeg: number }) {
  const rad = (headingOffsetDeg * Math.PI) / 180;
  const cx = 120, cy = 120, len = 68;
  // vehicle axes (fixed)
  const vAxes = [
    { dx: 0, dy: -len, label: "FWD", color: "#d9f5a0" },
    { dx: len, dy: 0, label: "RIGHT", color: "#d9f5a0" },
    { dx: 0, dy: 22, label: "DOWN", color: "#84959a", small: true },
  ];
  // phone axes (rotated by headingOffset)
  const pAxes = [
    { angle: -Math.PI / 2 + rad, label: "+X", color: "#f2bb75" },
    { angle: 0 + rad, label: "+Y", color: "#f2bb75" },
  ];
  const arrowHead = (x1: number, y1: number, x2: number, y2: number, color: string) => {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const a1x = x2 - 10 * Math.cos(ang - 0.4);
    const a1y = y2 - 10 * Math.sin(ang - 0.4);
    const a2x = x2 - 10 * Math.cos(ang + 0.4);
    const a2y = y2 - 10 * Math.sin(ang + 0.4);
    return <polygon points={`${x2},${y2} ${a1x},${a1y} ${a2x},${a2y}`} fill={color} />;
  };
  return (
    <svg
      viewBox="0 0 240 240"
      className="cal-frame-svg"
      role="img"
      aria-label={`Phone-to-vehicle frame diagram: heading offset ${headingOffsetDeg.toFixed(1)} degrees`}
    >
      {/* grid dot pattern */}
      {Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) => (
          <circle key={`${r}-${c}`} cx={40 + c * 40} cy={40 + r * 40} r={1.2} fill="#283840" />
        )),
      )}
      {/* origin circle */}
      <circle cx={cx} cy={cy} r={5} fill="#2a3e48" stroke="#445e68" strokeWidth="1" />
      {/* vehicle axes */}
      {vAxes.map((a) => {
        const x2 = cx + a.dx, y2 = cy + a.dy;
        return (
          <g key={a.label}>
            <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={a.color} strokeWidth={a.small ? 1 : 1.5} strokeDasharray={a.small ? "3 4" : undefined} />
            {!a.small && arrowHead(cx, cy, x2, y2, a.color)}
            <text
              x={x2 + (a.dx === 0 ? (a.dy < 0 ? 0 : 8) : a.dx > 0 ? 7 : -28)}
              y={y2 + (a.dy === 0 ? 14 : a.dy < 0 ? -6 : 5)}
              fontSize="9"
              fill={a.color}
              textAnchor="middle"
              fontFamily="inherit"
              letterSpacing="1"
            >
              {a.label}
            </text>
          </g>
        );
      })}
      {/* phone axes (rotated) */}
      {pAxes.map((a) => {
        const x2 = cx + len * Math.cos(a.angle);
        const y2 = cy + len * Math.sin(a.angle);
        const lx = cx + (len + 16) * Math.cos(a.angle);
        const ly = cy + (len + 16) * Math.sin(a.angle);
        return (
          <g key={a.label}>
            <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={a.color} strokeWidth={1.5} strokeDasharray="5 3" />
            {arrowHead(cx, cy, x2, y2, a.color)}
            <text x={lx} y={ly + 4} fontSize="9" fill={a.color} textAnchor="middle" fontFamily="inherit">
              {a.label}
            </text>
          </g>
        );
      })}
      {/* angle arc */}
      {Math.abs(headingOffsetDeg) > 2 && (
        <>
          <path
            d={`M ${cx} ${cy - 35} A 35 35 0 ${Math.abs(headingOffsetDeg) > 180 ? 1 : 0} ${headingOffsetDeg > 0 ? 1 : 0} ${cx + 35 * Math.sin(rad)} ${cy - 35 * Math.cos(rad)}`}
            fill="none"
            stroke="#62cbd4"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <text
            x={cx + 42 * Math.sin(rad / 2)}
            y={cy - 42 * Math.cos(rad / 2) + 4}
            fontSize="8"
            fill="#62cbd4"
            textAnchor="middle"
            fontFamily="Cascadia Code, Consolas, monospace"
          >
            {headingOffsetDeg.toFixed(1)}°
          </text>
        </>
      )}
      {/* legend */}
      <g>
        <line x1="14" y1="218" x2="28" y2="218" stroke="#d9f5a0" strokeWidth="1.5" />
        <text x="32" y="222" fontSize="8" fill="#84959a" fontFamily="inherit">Vehicle frame</text>
        <line x1="116" y1="218" x2="130" y2="218" stroke="#f2bb75" strokeWidth="1.5" strokeDasharray="5 3" />
        <text x="134" y="222" fontSize="8" fill="#84959a" fontFamily="inherit">Phone axes</text>
      </g>
    </svg>
  );
}

export function CalibrationView({ replay }: { replay: Replay }) {
  const iov = replay.run.iovnbd;
  const snap = replay.snapshot;

  if (iov) {
    const { calib } = iov;
    const headingNorm = ((calib.headingOffset % 360) + 360) % 360;
    const headingDisplay = headingNorm > 180 ? headingNorm - 360 : headingNorm;

    return (
      <div className="cal-page">
        <div className="section-header">
          <div>
            <span className="section-label">IO-VNBD REAL-DATA CALIBRATION</span>
            <h2>Sensor-to-frame alignment.</h2>
            <p className="cal-intro">
              Calibration estimated from the 40&nbsp;s of GNSS-aided driving immediately before the
              outage. Gyro bias removed from integration; heading offset rotates the phone axes into
              the vehicle forward direction.
            </p>
          </div>
          <span className="outline-tag">REAL MEASUREMENT</span>
        </div>

        <div className="cal-stat-grid">
          <StatTile
            label="Heading offset"
            value={headingDisplay.toFixed(1)}
            unit="°"
            sub="Phone → vehicle yaw rotation"
            tone="amber"
          />
          <StatTile
            label="Initial heading"
            value={calib.initialHeading.toFixed(1)}
            unit="°"
            sub="True north bearing at outage start"
            tone="cyan"
          />
          <StatTile
            label="Gyro bias"
            value={calib.gyroBias.toFixed(5)}
            unit=" rad/s"
            sub="Yaw-axis drift per second"
            tone="lime"
          />
          <StatTile
            label="Initial speed"
            value={(calib.initialSpeed * 3.6).toFixed(1)}
            unit=" km/h"
            sub="Vehicle speed at blackout entry"
            tone="coral"
          />
        </div>

        <div className="cal-lower">
          <div className="cal-diagram-card">
            <div className="panel-title" style={{ marginBottom: 16 }}>
              <span><Compass size={14} /> PHONE-TO-VEHICLE FRAME</span>
              <small>YAW AXIS</small>
            </div>
            <FrameDiagram headingOffsetDeg={headingDisplay} />
            <p className="cal-diagram-note">
              Lime = vehicle axes. Amber dashed = recorded phone axes. Arc = measured heading offset.
              Offset corrected before IMU integration.
            </p>
          </div>

          <div className="cal-detail-card">
            <div className="panel-title" style={{ marginBottom: 12 }}>
              <span><Info size={14} /> CALIBRATION PROTOCOL</span>
            </div>
            <div className="cal-protocol">
              <div className="cal-protocol-row">
                <span className="cal-protocol-step">01</span>
                <div>
                  <strong>Pre-outage window</strong>
                  <p>40&nbsp;s of GNSS-aided driving before the blackout provides a known-good reference track for calibration.</p>
                </div>
              </div>
              <div className="cal-protocol-row">
                <span className="cal-protocol-step">02</span>
                <div>
                  <strong>Heading offset estimation</strong>
                  <p>Phone yaw is rotated to align IMU-integrated heading with the GNSS velocity vector. Offset = {headingDisplay.toFixed(1)}°.</p>
                </div>
              </div>
              <div className="cal-protocol-row">
                <span className="cal-protocol-step">03</span>
                <div>
                  <strong>Gyro bias correction</strong>
                  <p>Stationary intervals detected by ZUPT. Bias = {calib.gyroBias.toFixed(5)}&nbsp;rad/s removed from all integration steps.</p>
                </div>
              </div>
              <div className="cal-protocol-row">
                <span className="cal-protocol-step">04</span>
                <div>
                  <strong>Alignment score at playhead</strong>
                  <p>{(snap.alignment * 100).toFixed(0)}% — heading agreement between the EKF estimate and the last accepted GNSS velocity bearing.</p>
                </div>
              </div>
            </div>
            <div className="cal-align-row">
              <span className="cal-align-label">ALIGNMENT</span>
              <GaugeBar value={snap.alignment} tone="lime" />
              <span className="cal-align-pct">{(snap.alignment * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Synthetic mode
  return (
    <div className="cal-page">
      <div className="section-header">
        <div>
          <span className="section-label">SYNTHETIC CALIBRATION STATE</span>
          <h2>Simulated alignment.</h2>
          <p className="cal-intro">
            In synthetic mode, the IMU is assumed to be perfectly aligned with the vehicle at
            initialisation. Calibration parameters are fixed constants, not measured from real
            sensor data.
          </p>
        </div>
        <span className="outline-tag">SIMULATED</span>
      </div>

      <div className="cal-stat-grid">
        <StatTile label="Heading offset" value="0.0" unit="°" sub="Assumed perfect alignment" tone="neutral" />
        <StatTile label="Gyro bias" value="0.00000" unit=" rad/s" sub="No bias in simulation" tone="neutral" />
        <StatTile
          label="Alignment (live)"
          value={`${(snap.alignment * 100).toFixed(0)}`}
          unit="%"
          sub="EKF map-heading agreement"
          tone={snap.alignment >= 0.9 ? "lime" : snap.alignment >= 0.5 ? "amber" : "coral"}
        />
        <StatTile
          label="EKF bound"
          value={snap.bound.toFixed(1)}
          unit=" m"
          sub="Simulated 95% horizontal"
          tone="cyan"
        />
      </div>

      <div className="cal-lower">
        <div className="cal-diagram-card">
          <div className="panel-title" style={{ marginBottom: 16 }}>
            <span><Compass size={14} /> PHONE-TO-VEHICLE FRAME</span>
            <small>YAW AXIS</small>
          </div>
          <FrameDiagram headingOffsetDeg={0} />
          <p className="cal-diagram-note">
            In simulation, phone and vehicle axes are co-aligned. No rotation is applied.
          </p>
        </div>

        <div className="cal-detail-card">
          <div className="panel-title" style={{ marginBottom: 12 }}>
            <span><Info size={14} /> CALIBRATION NOTE</span>
          </div>
          <p style={{ fontSize: 12, color: "#839ba4", lineHeight: 1.6 }}>
            Real-world deployment requires estimating heading offset and gyro bias from a
            calibration drive before entering the GNSS-denied region. Switch to an IO-VNBD
            segment to see measured calibration values from a real smartphone drive.
          </p>
          <div className="cal-align-row" style={{ marginTop: 20 }}>
            <span className="cal-align-label">LIVE ALIGNMENT</span>
            <GaugeBar value={snap.alignment} tone="lime" />
            <span className="cal-align-pct">{(snap.alignment * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
