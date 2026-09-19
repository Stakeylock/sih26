import { useState } from "react";
import { loadRuns, deleteRun, type SavedRun } from "../engine/runlog";
import { Search, Play } from "lucide-react";
import type { Replay } from "../hooks/useReplay";
import { scenarios, defaultConfig } from "../engine/scenarios";

export function RunLibrary({ replay }: { replay: Replay }) {
  const [search, setSearch] = useState("");
  // buffy (Claude's runlog REQUEST): locally pinned runs from Evidence's
  // "Save run". Remounts on nav, so a fresh read here is always current.
  const [saved, setSaved] = useState(loadRuns);
  const [filterSource, setFilterSource] = useState<"all" | "synthetic" | "iovnbd">("all");
  const [filterOutage, setFilterOutage] = useState<"all" | "short" | "long">("all");

  const synthRows = scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    subtitle: s.subtitle,
    source: "synthetic" as const,
    trip: "Synthetic",
    outage: defaultConfig.blackout,
    ours: null,
    winner: null,
  }));

  const iovnbdRows = replay.iovnbdList.map((s) => {
    const rawId = s.id.replace(/^iov-/, "");
    // Extract outage from subtitle
    const durMatch = s.subtitle.match(/(\d+)\s*s outage/);
    const outage = durMatch ? parseInt(durMatch[1]) : 60;
    
    // We only have metrics for the CURRENT segment in `run.iovnbd`, but wait!
    // As seen in ExperimentsView, `run.iovnbd` only has the current segment's finalErrors.
    // However, ExperimentsView rebuilds rows with `run.iovnbd?.segmentId === rawId` to get metrics.
    // If we want ALL metrics, wait, `ExperimentsView` only shows metrics for the LOADED segment!
    // "Metrics only appear for the currently loaded segment. Switch segments to populate others."
    // "and for iovnbd rows the benchmark final error of "Ours" + winner glyph", if it is available!
    
    let ours = null;
    let winner = null;
    if (replay.run.source === "iovnbd" && replay.run.iovnbd?.segmentId === rawId) {
      const fe = replay.run.iovnbd.finalErrors;
      ours = fe?.ekf?.final;
      
      const c = [
        fe?.ins ? { k: "ins", v: fe.ins.final } : null,
        fe?.classical ? { k: "classical", v: fe.classical.final } : null,
        fe?.ekf ? { k: "ekf", v: fe.ekf.final } : null,
      ].filter(Boolean) as { k: string, v: number }[];
      
      if (c.length) {
        winner = c.reduce((a, b) => (a.v <= b.v ? a : b)).k;
      }
    }

    return {
      id: `iov-${rawId}`,
      name: s.name,
      subtitle: s.subtitle,
      source: "iovnbd" as const,
      trip: rawId.split("-")[0],
      outage,
      ours,
      winner,
    };
  });

  const allRows = [...iovnbdRows, ...synthRows];

  const filtered = allRows.filter((r) => {
    if (filterSource !== "all" && r.source !== filterSource) return false;
    if (filterOutage === "short" && r.outage > 30) return false;
    if (filterOutage === "long" && r.outage <= 30) return false;
    if (search.trim() !== "") {
      const q = search.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.subtitle.toLowerCase().includes(q) && !r.trip.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const [sortCol, setSortCol] = useState<"none" | "outage" | "ours">("none");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const currentId = replay.run.source === "iovnbd" ? `iov-${replay.run.iovnbd?.segmentId}` : replay.run.scenario.id;

  const sorted = [...filtered].sort((a, b) => {
    if (sortCol === "none") return 0;
    let vA, vB;
    if (sortCol === "outage") {
      vA = a.outage;
      vB = b.outage;
    } else {
      vA = a.ours ?? Infinity;
      vB = b.ours ?? Infinity;
    }
    if (vA < vB) return sortDir === "asc" ? -1 : 1;
    if (vA > vB) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (col: "outage" | "ours") => {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else setSortCol("none");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  return (
    <>
    {/* buffy: pinned runs (saved from Evidence). Local, offline, §19 */}
    {saved.length > 0 && (
      <div className="run-lib-pinned">
        <div className="section-header">
          <div>
            <span className="section-label">PINNED RUNS</span>
            <h2>Saved from Evidence this session.</h2>
            <p>Stored locally in your browser. No server, fully offline.</p>
          </div>
        </div>
        <div className="exp-table-wrap">
          <table className="exp-table">
            <thead>
              <tr>
                <th>Saved</th>
                <th>Source</th>
                <th>Trip</th>
                <th>Outage</th>
                <th className="exp-ours-header">Live Final (m)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {saved.map((s) => (
                <tr key={s.run_id} className="exp-row">
                  <td className="exp-mono">
                    {new Date(s.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    {s.source === "iovnbd" ? (
                      <span className="run-badge run-badge-real">REAL DATA</span>
                    ) : (
                      <span className="run-badge run-badge-synth">SYNTHETIC</span>
                    )}
                  </td>
                  <td className="exp-trip">{s.trip}</td>
                  <td className="exp-mono">{s.blackout} s</td>
                  <td className="exp-mono">
                    {s.live ? s.live.final.toFixed(1) : "n/a"}
                  </td>
                  <td>
                    <button
                      className="button run-lib-load"
                      onClick={() => {
                        replay.switchSource(s.source);
                        deleteRun(s.run_id);
                        setSaved(loadRuns());
                      }}
                    >
                      <Play size={10} /> OPEN
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
    <div className="run-library">
      <div className="section-header">
        <div>
          <span className="section-label">RUN LIBRARY</span>
          <h2>Select a scenario or benchmark.</h2>
          <p>Filter and load synthetic edge cases or real IO-VNBD datasets.</p>
        </div>
      </div>

      <div className="run-lib-controls">
        <div className="run-lib-search">
          <Search size={14} className="run-lib-search-icon" />
          <input 
            type="text" 
            placeholder="Search runs..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="run-lib-filters">
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value as any)}>
            <option value="all">All Sources</option>
            <option value="iovnbd">Real Data</option>
            <option value="synthetic">Synthetic</option>
          </select>
          <select value={filterOutage} onChange={(e) => setFilterOutage(e.target.value as any)}>
            <option value="all">All Outages</option>
            <option value="short">≤ 30s Outage</option>
            <option value="long">&gt; 30s Outage</option>
          </select>
        </div>
      </div>

      <div className="exp-table-wrap">
        <table className="exp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Source</th>
              <th>Trip / Scenario</th>
              <th onClick={() => toggleSort("outage")} style={{ cursor: "pointer", userSelect: "none" }}>
                Outage {sortCol === "outage" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="exp-ours-header" onClick={() => toggleSort("ours")} style={{ cursor: "pointer", userSelect: "none" }}>
                Ours Final (m) {sortCol === "ours" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const isCurrent = r.id === currentId;
              return (
                <tr 
                  key={r.id} 
                  className={`exp-row ${isCurrent ? "exp-row--active" : ""}`}
                  onClick={() => replay.switchSource(r.source, r.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="exp-seg-name">
                    {isCurrent && <span className="exp-active-dot" aria-hidden />}
                    {r.name}
                    <div className="exp-sub run-lib-sub">{r.subtitle}</div>
                  </td>
                  <td>
                    {r.source === "iovnbd" ? (
                      <span className="run-badge run-badge-real">REAL DATA</span>
                    ) : (
                      <span className="run-badge run-badge-synth">SYNTHETIC</span>
                    )}
                  </td>
                  <td className="exp-trip">{r.trip}</td>
                  <td className="exp-mono">{r.outage} s</td>
                  <td>
                    {r.ours != null ? (
                      <span className={r.winner === "ekf" ? "exp-winner" : ""}>
                        {r.ours.toFixed(1)} m {r.winner === "ekf" ? "◆" : ""}
                      </span>
                    ) : (
                      <span className="exp-na">n/a</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="button primary run-lib-load"
                      onClick={(e) => {
                        e.stopPropagation();
                        replay.switchSource(r.source, r.id);
                      }}
                    >
                      <Play size={10} /> {isCurrent ? "RELOAD" : "LOAD"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                  <div style={{ marginBottom: 16 }}>No runs match your filters.</div>
                  <button className="button secondary" onClick={() => { setSearch(""); setFilterSource("all"); setFilterOutage("all"); }}>
                    Clear Filters
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
