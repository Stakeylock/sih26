import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  Compass,
  FlaskConical,
  GitBranch,
  HelpCircle,
  Navigation2,
  Play,
  ShieldCheck,
} from "lucide-react";
import { useReplay } from "./hooks/useReplay";
import { CityMap } from "./components/CityMap";
import { Telemetry } from "./components/Telemetry";
import { Playback } from "./components/Playback";
import { ReplayLab } from "./components/ReplayLab";
import { Evidence } from "./components/Evidence";
import { SystemView } from "./components/SystemView";
import { Modal, Toggle } from "./components/ui";
import { scenarios } from "./engine/scenarios";
type View = "navigate" | "lab" | "evidence" | "system";
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
    [notice, setNotice] = useState("");
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
  const configure = (patch: Parameters<typeof replay.configure>[0]) => {
    replay.configure(patch);
    setNotice("Replay reset with your new configuration.");
  };
  const navigation = [
    { id: "navigate", name: "Navigate", icon: Navigation2 },
    { id: "lab", name: "Replay lab", icon: FlaskConical },
    { id: "evidence", name: "Evidence", icon: Activity },
    { id: "system", name: "Architecture", icon: GitBranch },
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
            <span className="simulation-tag">
              <i />
              Simulation demo
            </span>
            <span className="offline-tag">Local & offline</span>
          </div>
        </header>
        <main>
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
                      : "Built around trust."}
              </h1>
              <p>
                {view === "navigate"
                  ? "Follow the journey. Understand the confidence."
                  : view === "lab"
                    ? "Introduce a failure. Inspect how the system responds."
                    : view === "evidence"
                      ? "A transparent view of what this simulation actually measures."
                      : "Explore the pipeline from sensor observations to navigation."}
              </p>
            </div>
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
          <div className={`workspace ${view}`}>
            {view === "navigate" ? (
              <div className="navigation-layout">
                <CityMap
                  run={replay.run}
                  snapshot={replay.snapshot}
                  basic={basic}
                />
                <Telemetry
                  replay={replay}
                  basic={basic}
                  onExplain={() => setModal("help")}
                />
              </div>
            ) : view === "lab" ? (
              <ReplayLab replay={replay} />
            ) : view === "evidence" ? (
              <Evidence replay={replay} />
            ) : (
              <SystemView />
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
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {modal === "scenario" && (
        <Modal title="Configure your journey" close={() => setModal(null)}>
          <p className="modal-intro">
            Choose a scenario and its blackout duration. Applying changes resets
            the replay.
          </p>
          <div className="scenario-options">
            {scenarios.map((s) => (
              <button
                key={s.id}
                className={replay.config.scenario === s.id ? "selected" : ""}
                onClick={() => configure({ scenario: s.id })}
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
            ))}
          </div>
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
            <h3>Prototype boundary</h3>
            <p>
              The planar simulation and pipeline are functional. A production
              15-state ES-EKF, trained ML model, Android sensors, and dataset
              validation remain future work.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
