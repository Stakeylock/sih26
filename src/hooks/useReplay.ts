import { useEffect, useMemo, useRef, useState } from "react";
import { defaultConfig, scenarios } from "../engine/scenarios";
import { simulate } from "../engine/simulation";
import { buildIovnbdRun, iovnbdScenarios, loadIovnbd } from "../engine/iovnbd";
import { computeExplainability } from "../engine/explain";
import type { Config, FaultKind, Run, Scenario } from "../engine/types";

export type SourceId = "synthetic" | "iovnbd";

export function useReplay() {
  const [source, setSource] = useState<SourceId>("synthetic");
  const [iovReady, setIovReady] = useState(false);
  const [iovData, setIovData] = useState<Awaited<ReturnType<typeof loadIovnbd>>>(null);
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [ablation, setAblation] = useState({
    useNHC: true,
    useZUPT: true,
    useML: true,
    useGNSSGate: true,
  });
  const [t, setT] = useState(12),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);

  // Try to load IO-VNBD bundles once (offline-safe: local files, graceful null).
  useEffect(() => {
    let alive = true;
    loadIovnbd().then((d) => {
      if (!alive) return;
      setIovData(d);
      setIovReady(!!d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const iovnbdList = useMemo(
    () => (iovData ? iovnbdScenarios(iovData) : []),
    [iovData],
  );

  const run: Run = useMemo(() => {
    if (source === "iovnbd" && iovData) {
      return buildIovnbdRun({ ...config, ...ablation }, iovData);
    }
    return simulate({ ...config, ...ablation });
  }, [source, iovData, config, ablation]);

  const activeScenarios: Scenario[] = source === "iovnbd" ? iovnbdList : scenarios;

  const clock = useRef(t);
  useEffect(() => {
    clock.current = t;
  }, [t]);
  useEffect(() => {
    if (!playing) return;
    let id: number,
      last = performance.now(),
      published = -1;
    const frame = (now: number) => {
      clock.current = Math.min(
        run.duration,
        clock.current + Math.min((now - last) / 1000, 0.25) * speed,
      );
      last = now;
      const tick = Math.floor(clock.current * 10);
      if (tick !== published) {
        setT(tick / 10);
        published = tick;
      }
      if (clock.current >= run.duration) setPlaying(false);
      else id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [playing, speed, run.duration]);

  const seek = (value: number) => {
    setPlaying(false);
    clock.current = value;
    setT(value);
  };
  const configure = (patch: Partial<Config>) => {
    setConfig((old) => ({ ...old, ...patch, faults: [] }));
    seek(0);
  };
  const inject = (kind: FaultKind) => {
    // fault injection is a synthetic-scenario feature; replay data is immutable
    if (source !== "synthetic") return;
    setConfig((old) => ({
      ...old,
      faults: [
        ...old.faults,
        {
          kind,
          at: Math.round(t * 10) / 10,
          id: `${kind}-${t}-${old.faults.length}`,
        },
      ],
    }));
  };
  const configureAblation = (patch: { useNHC?: boolean; useZUPT?: boolean; useML?: boolean; useGNSSGate?: boolean }) => {
    setAblation((old) => ({ ...old, ...patch }));
    seek(0);
  };
  const switchSource = (next: SourceId, scenarioId?: string) => {
    setSource(next);
    if (next === "iovnbd" && iovnbdList.length) {
      setConfig((old) => ({
        ...old,
        scenario: scenarioId ?? iovnbdList[0].id,
        faults: [],
      }));
    } else if (next === "synthetic") {
      setConfig((old) => ({ ...old, scenario: defaultConfig.scenario, faults: [] }));
    }
    seek(0);
    setPlaying(false);
  };
  const snapshot = run.snapshots[Math.min(run.snapshots.length - 1, Math.round(t * 10))];
  const explainability = useMemo(
    () => computeExplainability(snapshot, run, ablation),
    [snapshot, run, ablation],
  );

  return {
    run,
    config,
    source,
    iovReady,
    iovnbdList,
    switchSource,
    t,
    playing,
    speed,
    snapshot,
    explainability,
    seek,
    setPlaying,
    setSpeed,
    configure,
    inject,
    configureAblation,
    ablation,
    reset: () => {
      setConfig((old) => ({ ...old, faults: [] }));
      seek(0);
    },
    playDemo: () => {
      setConfig(defaultConfig);
      setSource("synthetic");
      clock.current = 0;
      setT(0);
      setPlaying(true);
    },
  };
}
export type Replay = ReturnType<typeof useReplay>;
