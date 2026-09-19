import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  Compass,
  Database,
  FlaskConical,
  FolderOpen,
  Gauge,
  FlaskRound,
  GitBranch,
  HelpCircle,
  Navigation2,
  Play,
  Scale,
  Search as SearchIcon,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useReplay } from "./hooks/useReplay";
import { CityMap } from "./components/CityMap";
import { Telemetry } from "./components/Telemetry";
import { Playback } from "./components/Playback";
import { ReplayLab } from "./components/ReplayLab";
import { Evidence } from "./components/Evidence";
import { SystemView } from "./components/SystemView";
import { CalibrationView } from "./components/CalibrationView";
import { ExperimentsView } from "./components/ExperimentsView";
import { ComparatorView } from "./components/ComparatorView";
import { ChartsPanel } from "./components/ChartsPanel";
import { DataView } from "./components/DataView";
import { ModelInspector } from "./components/ModelInspector";
import { ExplainabilityPanel } from "./components/ExplainabilityPanel";
import { RunLibrary } from "./components/RunLibrary";
import { DiagnosticsView } from "./components/DiagnosticsView";
import { CommandPalette } from "./components/CommandPalette";
import { ConstraintsPanel } from "./components/ConstraintsPanel";
import { TrustPanel } from "./components/TrustPanel";
import { FallbackCard } from "./components/FallbackCard";
import { NarrationBar } from "./components/NarrationBar";
import { Modal, Toggle } from "./components/ui";
import { scenarios } from "./engine/scenarios";
import { judgeCalloutAt, judgeStages } from "./engine/judge";
type View =
  | "navigate"
  | "lab"
  | "evidence"
  | "system"
  | "calibration"
  | "experiments"
  | "compare"
  | "data"
  | "library"
  | "diagnostics";
// shared with CommandPalette so items type-check against the real View union
export type AppView = View;
function getBasic() {
  try {
    return localStorage.getItem("astranav-basic-v2") === "true";
  } catch {
    return false;
  }
}
export default function App() {
  const replay = useReplay(),
    [view, setView] = useState<View>("navigate"),
    [basic, setBasic] = useState(getBasic),
    [modal, setModal] = useState<"scenario" | "help" | null>(null),
    [notice, setNotice] = useState(""),
    [palette, setPalette] = useState(false);
  // BYOD file input (hidden; triggered from the scenario modal + palette)
  const byodInput = useRef<HTMLInputElement | null>(null);
  const onByodFile = (file: File) => {
    file.text().then((txt) => {
      try {
        const res = replay.loadByod(JSON.parse(txt));
        if (res.ok && res.report) {
          const rep = res.report;
          const cfMsg = rep.counterfactualEligible ? " · Counterfactual outage eligible" : " · v1 replay";
          setNotice(`Capture loaded (${rep.duration.toFixed(0)}s, ${rep.motionRateHz.toFixed(0)} Hz)${cfMsg}`);
        } else {
          setNotice(res.ok ? "Capture loaded — navigating your drive." : res.error ?? "Load failed.");
        }
        if (res.ok) {
          setModal(null);
          setView("navigate");
        }
      } catch {
        setNotice("Not valid JSON — is that a capture file?");
      }
    });
  };
  const stages = useMemo(() => judgeStages(replay.run), [replay.run]);
  const callout = useMemo(() => judgeCalloutAt(stages, replay.t), [stages, replay.t]);
  useEffect(() => {
    try {
      localStorage.setItem("astranav-basic-v2", String(basic));
    } catch {
      /* optional storage */
    }
  }, [basic]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(id);
  }, [notice]);
  // buffy: live tab title — during outage the tab itself reads GNSS DENIED.
  // Small tell, but it makes screen-share recordings look like a real product.
  useEffect(() => {
    const s = replay.snapshot;
    const st = s?.state;
    document.title =
      st === "DENIED"
        ? "⚠ GNSS DENIED — AstraNav-IDR"
        : st === "DEGRADED"
          ? "GNSS DEGRADED — AstraNav-IDR"
          : "AstraNav-IDR — Team Recalibrate";
    return () => {
      document.title = "AstraNav-IDR — Team Recalibrate";
    };
  }, [replay.snapshot?.state]);
  const configure = (patch: Parameters<typeof replay.configure>[0]) => {
    replay.configure(patch);
    setNotice("Replay reset with your new configuration.");
  };
  const navigation = [
    { id: "navigate", name: "Navigate", icon: Navigation2 },
    { id: "lab", name: "Replay lab", icon: FlaskConical },
    { id: "evidence", name: "Evidence", icon: Activity },
    { id: "system", name: "Architecture", icon: GitBranch },
    { id: "calibration", name: "Calibration", icon: SlidersHorizontal },
    { id: "experiments", name: "Experiments", icon: FlaskRound },
    { id: "compare", name: "Compare", icon: Scale },
    { id: "data", name: "Data", icon: Database },
    { id: "library", name: "Runs", icon: FolderOpen },
    { id: "diagnostics", name: "Diagnostics", icon: Gauge },
  ] as const;
  return (
    <div className="application">
      <aside className="rail">
        <a
          href="#"
          className="brand-symbol"
          aria-label="AstraNav home"
          onClick={(e) => {
            e.preventDefault();
            setView("navigate");
          }}
        >
          <Navigation2 size={25} strokeWidth={2.3} />
        </a>
        <nav aria-label="Main navigation">
          {navigation.map((n) => (
            <button
              key={n.id}
              title={n.name}
              aria-label={n.name}
              aria-current={view === n.id ? "page" : undefined}
              className={view === n.id ? "active" : ""}
              onClick={() => setView(n.id)}
            >
              <n.icon size={20} />
              <span>{n.name}</span>
            </button>
          ))}
        </nav>
        <button
          className="help-button"
          aria-label="About this prototype"
          onClick={() => setModal("help")}
        >
          <HelpCircle size={20} />
        </button>
        <div className="team-avatar" title="Team Recalibrate">
          R
        </div>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div className="wordmark">
            AstraNav<span>IDR</span>
            <i /> <small>TEAM RECALIBRATE</small>
          </div>
          <div className="header-right">
            {/* buffy: ⌘K launcher — affordance in the header opens it too */}
            <button
              className="cmdk-trigger"
              onClick={() => setPalette(true)}
              aria-label="Open command palette"
            >
              <SearchIcon size={13} />
              <span>Jump to…</span>
              <kbd>Ctrl K</kbd>
            </button>
            {replay.source === "iovnbd" ? (
              <span className="simulation-tag iovnbd">
                <i />
                MODE: IO-VNBD REPLAY · REAL DATA
              </span>
            ) : replay.source === "byod" ? (
              <span className={`simulation-tag iovnbd ${replay.isCounterfactual ? "counterfactual" : ""}`}>
                <i />
                {replay.isCounterfactual
                  ? "MODE: OWN DRIVE · SYNTHETIC OUTAGE (CF)"
                  : "MODE: OWN DRIVE · GPS-REFERENCED · LIVE FILTER"}
              </span>
            ) : (
              <span className="simulation-tag">
                <i />
                MODE: SYNTHETIC
              </span>
            )}
            <span className="offline-tag">Local & offline</span>
          </div>
        </header>
        <main>
          {replay.isCounterfactual && (
            <div className="counterfactual-banner" role="status" data-testid="cf-banner">
              <span className="cf-pill">COUNTERFACTUAL TEST</span>
              <strong>REAL PHONE RECORDING · SYNTHETIC GNSS OUTAGE</strong>
              <small>
                GPS position, speed &amp; course algorithmically masked from the estimator for{" "}
                {replay.byodCounterfactual?.outageDuration}s. Original phone GPS track is retained
                strictly as a hidden evaluation reference.
              </small>
            </div>
          )}
          <div className="workspace-heading">
            <div>
              <div className="section-label">
                SMART INDIA HACKATHON 2026 <span>/</span> 26168
              </div>
              <h1>
                {view === "navigate"
                  ? "Navigation, uninterrupted."
                  : view === "lab"
                    ? "The replay lab."
                    : view === "evidence"
                      ? "Evidence over assumptions."
                      : view === "calibration"
                        ? "Sensor alignment."
                        : view === "experiments"
                          ? "Segment experiments."
                          : "Built around trust."}
              </h1>
              <p>
                {view === "navigate" && replay.t > 0
                  ? // N3 (Antigravity audit): live one-liner replaces the static
                    // tagline while a run is underway — bound, GNSS state, and
                    // time to outage/reacquisition, all from real snapshot data.
                    `±${replay.snapshot.bound.toFixed(0)} m bound · ${
                      replay.snapshot.state === "DENIED"
                        ? "GNSS DENIED — dead reckoning"
                        : replay.snapshot.state === "DEGRADED"
                          ? "GNSS degraded"
                          : "TRUSTED GNSS"
                    } · ${
                      replay.t < replay.run.scenario.start
                        ? `outage in ${Math.max(0, Math.round(replay.run.scenario.start - replay.t))} s`
                        : replay.t < replay.run.scenario.start + replay.run.config.blackout
                          ? `reacquisition in ${Math.max(0, Math.round(replay.run.scenario.start + replay.run.config.blackout - replay.t))} s`
                          : "GNSS re-acquired"
                    }`
                  : view === "navigate"
                    ? "Follow the journey. Understand the confidence."
                    : view === "lab"
                      ? "Introduce a failure. Inspect how the system responds."
                      : view === "evidence"
                        ? "A transparent view of what this simulation actually measures."
                        : view === "calibration"
                          ? "Phone-to-vehicle frame alignment and sensor bias."
                          : view === "experiments"
                            ? "Compare all 5 IO-VNBD segments. No estimator wins every time."
                            : "Explore the pipeline from sensor observations to navigation."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button primary"
                onClick={() => {
                  replay.playDemo();
                  setView("navigate");
                }}
              >
                <Play size={14} fill="currentColor" />
                Play demo <span>02:00</span>
              </button>
            </div>
          </div>
          <div className="workspace-toolbar">
            <button
              className="scenario-select"
              onClick={() => setModal("scenario")}
            >
              <span className="scenario-icon">
                <Compass size={18} />
              </span>
              <span>
                <small>ACTIVE SCENARIO</small>
                <strong>{replay.run.scenario.name}</strong>
              </span>
              <ChevronDown size={15} />
            </button>
            <div className="toolbar-tabs" role="group" aria-label="Workspace">
              {navigation.map((n) => (
                <button
                  key={n.id}
                  className={view === n.id ? "active" : ""}
                  onClick={() => setView(n.id)}
                >
                  {n.name}
                </button>
              ))}
            </div>
            <div className="mode-control">
              <button
                className={basic ? "active" : ""}
                onClick={() => setBasic(true)}
              >
                Basic
              </button>
              <button
                className={!basic ? "active" : ""}
                onClick={() => setBasic(false)}
              >
                Expert
              </button>
            </div>
          </div>
          <NarrationBar callout={callout} snapshot={replay.snapshot} />
          <div className={`workspace ${view}`}>
            {view === "navigate" ? (
              <div className="navigation-layout">
                <CityMap
                  run={replay.run}
                  snapshot={replay.snapshot}
                  basic={basic}
                  playing={replay.playing}
                />
                <Telemetry
                  replay={replay}
                  basic={basic}
                  onExplain={() => setModal("help")}
                />
                <FallbackCard snapshot={replay.snapshot} />
                {!basic && (
                  <div className="expert-stack">
                    <TrustPanel
                      snapshot={replay.snapshot}
                      iovnbd={replay.run.iovnbd}
                      run={replay.run}
                    />
                    <ConstraintsPanel
                      snapshot={replay.snapshot}
                      source={replay.source}
                    />
                    <ChartsPanel replay={replay} />
                    <ExplainabilityPanel replay={replay} />
                  </div>
                )}
              </div>
            ) : view === "lab" ? (
              <ReplayLab replay={replay} />
            ) : view === "evidence" ? (
              <Evidence replay={replay} />
            ) : view === "data" ? (
              <>
                <DataView replay={replay} />
                {/* buffy: §32 model inspector lives with the dataset story */}
                <ModelInspector />
              </>
            ) : view === "library" ? (
              <RunLibrary replay={replay} />
            ) : view === "diagnostics" ? (
              <DiagnosticsView replay={replay} />
            ) : view === "calibration" ? (
              <CalibrationView replay={replay} />
            ) : view === "experiments" ? (
              <ExperimentsView replay={replay} />
            ) : view === "compare" ? (
              <ComparatorView replay={replay} />
            ) : (
              <SystemView snapshot={replay.snapshot} />
            )}
            <Playback replay={replay} />
          </div>
          <footer className="app-footer">
            <span>
              <i />
              ENGINE READY <b>10 Hz</b>
            </span>
            <span>
              Self-calibrating. Integrity-aware. <ShieldCheck size={12} />
            </span>
            <span>Prototype v0.2</span>
          </footer>
        </main>
      </div>
      {/* buffy: hidden BYOD capture loader (id used by the Ctrl K palette too) */}
      <input
        ref={byodInput}
        id="byod-input"
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onByodFile(f);
          e.target.value = ""; // allow re-loading the same file
        }}
      />
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {modal === "scenario" && (
        <Modal title="Configure your journey" close={() => setModal(null)}>
          <p className="modal-intro">
            Choose a data source, a scenario and its blackout duration.
            Applying changes resets the replay.
          </p>
          {replay.iovReady && (
            <div className="source-control" role="group" aria-label="Data source">
              <button
                className={replay.source === "synthetic" ? "active" : ""}
                onClick={() => {
                  replay.switchSource("synthetic");
                }}
              >
                <strong>SYNTHETIC DEMO</strong>
                <small>Bundled scenario engine · offline</small>
              </button>
              <button
                className={replay.source === "iovnbd" ? "active" : ""}
                onClick={() => {
                  replay.switchSource("iovnbd");
                }}
              >
                <strong>IO-VNBD REPLAY</strong>
                <small>Real benchmark data · UK drives · 10 Hz</small>
              </button>
              {/* buffy: BYOD — Bring Your Own Drive. Loads a capture made on
                  the judge's/team's own phone (public/byod.html) and runs the
                  SAME live filter on it. Breadth answer to "where's the app?" */}
              <button
                className={replay.source === "byod" ? "active" : ""}
                onClick={() => byodInput.current?.click()}
              >
                <strong>YOUR DRIVE (BYOD)</strong>
                <small>
                  {replay.byodLoaded
                    ? "Capture loaded · your phone's sensors"
                    : "Load a capture from byod.html"}
                </small>
              </button>
            </div>
          )}
          <div className="scenario-options">
            {(replay.source === "iovnbd" ? replay.iovnbdList : scenarios).map(
              (s) => (
                <button
                  key={s.id}
                  className={replay.config.scenario === s.id ? "selected" : ""}
                  onClick={() =>
                    replay.source === "iovnbd"
                      ? replay.switchSource("iovnbd", s.id)
                      : configure({ scenario: s.id })
                  }
                >
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.subtitle}</small>
                  </span>
                  {replay.config.scenario === s.id ? (
                    <Check size={18} />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                </button>
              ),
            )}
          </div>
          {replay.source === "synthetic" && (
            <>
              <label className="duration-field">
                GNSS blackout duration
                <select
                  aria-label="Blackout duration"
                  value={replay.config.blackout}
                  onChange={(e) => configure({ blackout: +e.target.value })}
                >
                  {[10, 30, 60].map((s) => (
                    <option key={s} value={s}>
                      {s} seconds
                    </option>
                  ))}
                </select>
              </label>
              <Toggle
                label="ML virtual odometer"
                checked={replay.config.learned}
                onChange={() => configure({ learned: !replay.config.learned })}
              />
              <Toggle
                label="Map matching"
                checked={replay.config.map}
                onChange={() => configure({ map: !replay.config.map })}
              />
            </>
          )}
          <button
            className="button primary modal-done"
            onClick={() => setModal(null)}
          >
            Open workspace <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="Navigation that explains itself"
          close={() => setModal(null)}
        >
          <p className="modal-intro">
            AstraNav-IDR explores how a phone can continue estimating vehicle
            motion when GNSS becomes unreliable.
          </p>
          <div className="help-copy">
            <h3>Read the map</h3>
            <p>
              Amber is IMU-only INS. Cyan is the primary reduced-order ES-EKF
              with ML virtual-odometer aiding. Lime is the confidence-gated
              map-assisted output. Coral is the classical EKF comparator. GNSS
              dots show accepted and rejected fixes; no dots means an outage.
            </p>
            <h3>Inspect trust</h3>
            <p>
              The simulated position bound grows during unsupported motion. It
              is an illustrative covariance model, not a calibrated safety
              guarantee. Reacquisition requires three consistent GNSS fixes.
            </p>
            <h3>Try a fault</h3>
            <p>
              Open Replay lab, play the run, and inject a pothole, mount shift,
              GNSS jump, or bad speed. Every fault is recorded in the ledger and
              survives seeking.
            </p>
            <h3>Bring Your Own Drive (BYOD)</h3>
            <p>
              Test the console on your own physical drive captured from an ordinary smartphone:
            </p>
            <ol style={{ paddingLeft: "18px", margin: "6px 0 10px", lineHeight: "1.6" }}>
              <li><strong>Step 1 — Connect:</strong> Ensure your phone and laptop are on the same local Wi-Fi.</li>
              <li><strong>Step 2 — Open Capture:</strong> In your mobile browser, navigate to <code>/byod.html</code> (e.g. <code>http://&lt;laptop-ip&gt;:4175/byod.html</code>).</li>
              <li><strong>Step 3 — Record:</strong> Firmly mount or hold the phone steady, tap <strong>START CAPTURE</strong>, then drive or walk normally (recommended 2–5 min; include turns and one stop).</li>
              <li><strong>Step 4 — Import:</strong> Tap <strong>DOWNLOAD CAPTURE</strong>, then in AstraNav click <em>Configure → YOUR DRIVE (BYOD) → Load</em>.</li>
            </ol>
            <p style={{ fontSize: "12px", color: "#e8b664", background: "#261d12", padding: "8px 12px", borderRadius: "4px" }}>
              <strong>Important:</strong> BYOD uses the phone's own GPS track as a reference standard. It is not survey-grade ground truth. Mobile Chrome/Safari may require HTTPS for motion sensors.
            </p>
            <h3>Prototype boundary</h3>
            <p>
              The live 15-state ES-EKF, learned motion-mode classifier, and Viterbi
              map matching run entirely client-side in-browser. Android background services
              and external CAN-bus/IMU integrations are roadmap targets — every replay
              uses recorded sensor data, labeled transparently.
            </p>
          </div>
        </Modal>
      )}
      {/* buffy: ⌘K command palette + global Space/←/→ transport */}
      <CommandPalette
        replay={replay}
        setView={(v) => setView(v as AppView)}
      />
    </div>
  );
}
