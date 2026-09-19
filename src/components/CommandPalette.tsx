import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, BrainCircuit, Command, Database, FlaskConical, FlaskRound,
  FolderOpen, Gauge, GitBranch, Navigation2, Play, Scale, SlidersHorizontal, Search,
} from "lucide-react";
import type { Replay } from "../hooks/useReplay";

/**
 * Command palette (⌘K / Ctrl+K) — Linear/Vercel-style quick navigation and
 * actions, hand-rolled on native primitives (dialog-free, zero deps, fully
 * keyboard driven). Typical of polished engineering consoles; supports the
 * demo (judges can jump anywhere instantly) and power users.
 *
 * Actions: jump to any of the 10 views · play/pause · restart · 2-min demo ·
 * load a BYOD capture (hidden file input) ·
 * switch to IO-VNBD segments.
 */
type Ctx = {
  replay: Replay;
  setView: (v: string) => void;
};

type Item = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ size?: number }>;
  group: "Go to" | "Replay" | "Data";
  run: (ctx: Ctx) => void;
};

const VIEW_ITEMS: [string, string, React.ComponentType<{ size?: number }>][] = [
  ["navigate", "Navigate", Navigation2],
  ["lab", "Replay Lab", FlaskConical],
  ["evidence", "Evidence", Activity],
  ["system", "Architecture", GitBranch],
  ["calibration", "Calibration", SlidersHorizontal],
  ["experiments", "Experiments", FlaskRound],
  ["compare", "Compare", Scale],
  ["data", "Data", Database],
  ["library", "Run Library", FolderOpen],
  ["diagnostics", "Diagnostics", Gauge],
];

const ITEMS: Item[] = [
  ...VIEW_ITEMS.map(([id, label, icon]) => ({
    id: `go-${id}`,
    label,
    hint: id === "navigate" ? "Home" : undefined,
    icon,
    group: "Go to" as const,
    run: ({ setView }: Ctx) => setView(id),
  })),
  {
    id: "act-play",
    label: "Play / Pause",
    hint: "Space",
    icon: Play,
    group: "Replay",
    run: ({ replay }) => replay.setPlaying(!replay.playing),
  },
  {
    id: "act-restart",
    label: "Restart run",
    icon: Play,
    group: "Replay",
    run: ({ replay }) => replay.seek(0),
  },
  {
    id: "act-demo",
    label: "Play 2-minute demo",
    icon: Play,
    group: "Replay",
    run: ({ replay, setView }) => {
      replay.playDemo();
      setView("navigate");
    },
  },
  {
    id: "act-real",
    label: "Switch to real data (IO-VNBD)",
    icon: BrainCircuit,
    group: "Data",
    run: ({ replay, setView }) => {
      replay.switchSource("iovnbd");
      setView("navigate");
    },
  },
  {
    id: "act-synth",
    label: "Switch to synthetic demo",
    icon: BrainCircuit,
    group: "Data",
    run: ({ replay, setView }) => {
      replay.switchSource("synthetic");
      setView("navigate");
    },
  },
  // buffy: BYOD from the palette — same hidden input the modal uses; the
  // element lives in App (id=byod-input) so both entry points share one file
  // picker and one onChange handler.
  {
    id: "act-byod",
    label: "Load your own drive (BYOD capture)…",
    icon: BrainCircuit,
    group: "Data",
    run: ({ setView }) => {
      document.getElementById("byod-input")?.click();
      setView("navigate");
    },
  },
];

export function CommandPalette({ replay, setView }: Ctx) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K toggles; Esc closes. Space toggles playback globally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === " " && !typing && !open) {
        e.preventDefault();
        replay.setPlaying(!replay.playing);
      }
      if (!typing && !open) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          replay.seek(Math.max(0, replay.t - 5));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          replay.seek(Math.min(replay.run.duration, replay.t + 5));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, replay]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    const list = q
      ? ITEMS.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            i.group.toLowerCase().includes(q),
        )
      : ITEMS;
    return list;
  }, [query]);

  if (!open) return null;

  const execute = (item: Item) => {
    setOpen(false);
    item.run({ replay, setView });
  };

  let lastGroup = "";

  return (
    <div
      className="cmdk-backdrop"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmdk-input-row">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Jump to a view, run an action…"
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(results.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter" && results[sel]) {
                e.preventDefault();
                execute(results[sel]);
              }
            }}
          />
          <kbd className="cmdk-kbd">ESC</kbd>
        </div>
        <div className="cmdk-list">
          {results.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header && <div className="cmdk-group">{header}</div>}
                <button
                  className={`cmdk-item ${i === sel ? "sel" : ""}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => execute(item)}
                >
                  <item.icon size={15} />
                  <span>{item.label}</span>
                  {item.hint && <kbd className="cmdk-kbd">{item.hint}</kbd>}
                </button>
              </div>
            );
          })}
          {results.length === 0 && (
            <div className="cmdk-empty">No matches.</div>
          )}
        </div>
        <div className="cmdk-foot">
          <span>
            <kbd className="cmdk-kbd">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="cmdk-kbd">↵</kbd> run
          </span>
          <span>
            <kbd className="cmdk-kbd">Space</kbd> play/pause
          </span>
          <span className="cmdk-brand">
            <Command size={11} /> ASTranav
          </span>
        </div>
      </div>
    </div>
  );
}
