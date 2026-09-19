/**
 * Run persistence — localStorage-backed library of completed runs.
 *
 * Key: "astranav.runs.v1"
 * Cap: 20 runs, newest first.
 * Stored fields are JSON-safe (no functions, classes, or circular refs).
 * Large arrays (snapshots, events, route) are stripped; only summary fields retained.
 */
import type { Run, Config } from "./types";

export type SavedRun = {
  /** Unique run identifier (UUID v4). */
  run_id: string;
  /** Data provenance: "synthetic" | "iovnbd". */
  source: "synthetic" | "iovnbd" | "byod";
  /** Trip/segment identifier (e.g., "S1-B60-A"). */
  trip: string;
  /** Blackout duration in seconds. */
  blackout: number;
  /** Configuration used for this run. */
  config: Config;
  /** Final errors per estimator (from iovnbd metadata or synthetic benchmark). */
  finalErrors: Record<string, { final: number; drift: number; rmse: number; p95: number }>;
  /** Live filter summary (IO-VNBD only). */
  live?: { final: number; drift: number; gyroTrusted: boolean; wzSign: number };
  /** ISO timestamp when the run was saved. */
  timestamp: string;
};

const STORAGE_KEY = "astranav.runs.v1";
const MAX_RUNS = 20;

/** Generate a simple UUID v4. */
function genId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Extract a SavableRun from a full Run, stripping heavy arrays. */
export function toSavedRun(run: Run): SavedRun {
  const src = run.source ?? "synthetic";
  const trip = src === "iovnbd" && run.iovnbd
    ? run.iovnbd.segmentId
    : src === "byod"
      ? "OWN DRIVE"
      : run.scenario.id;
  const finalErrors = src === "iovnbd" && run.iovnbd
    ? run.iovnbd.finalErrors
    : {};
  const live = src === "iovnbd" && run.iovnbd
    ? run.iovnbd.live
    : undefined;

  return {
    run_id: genId(),
    source: src,
    trip,
    blackout: run.config.blackout,
    config: run.config,
    finalErrors,
    live,
    timestamp: new Date().toISOString(),
  };
}

/** Load all saved runs from localStorage (newest first). */
export function loadRuns(): SavedRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate each entry has required fields
    return parsed.filter((r): r is SavedRun =>
      typeof r === "object" &&
      r !== null &&
      typeof r.run_id === "string" &&
      typeof r.source === "string" &&
      typeof r.trip === "string" &&
      typeof r.blackout === "number" &&
      typeof r.config === "object" &&
      typeof r.timestamp === "string"
    );
  } catch {
    return [];
  }
}

/** Save a run to localStorage, enforcing the 20-run cap (newest first). */
export function saveRun(run: Run): SavedRun {
  const saved = toSavedRun(run);
  const existing = loadRuns();
  // Prepend new run, cap at MAX_RUNS
  const updated = [saved, ...existing].slice(0, MAX_RUNS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Quota exceeded or storage unavailable — silently ignore per offline-first policy
  }
  return saved;
}

/** Delete a specific run by ID. */
export function deleteRun(runId: string): void {
  const existing = loadRuns();
  const filtered = existing.filter((r) => r.run_id !== runId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}

/** Clear all saved runs. */
export function clearRuns(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}