import { useEffect, useMemo, useRef, useState } from "react";
import { defaultConfig } from "../engine/scenarios";
import { simulate } from "../engine/simulation";
import type { Config, FaultKind } from "../engine/types";

export function useReplay() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [t, setT] = useState(12),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const run = useMemo(() => simulate(config), [config]);
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
  return {
    run,
    config,
    t,
    playing,
    speed,
    snapshot: run.snapshots[Math.min(1200, Math.round(t * 10))],
    seek,
    setPlaying,
    setSpeed,
    configure,
    inject,
    reset: () => {
      setConfig((old) => ({ ...old, faults: [] }));
      seek(0);
    },
    playDemo: () => {
      setConfig(defaultConfig);
      clock.current = 0;
      setT(0);
      setPlaying(true);
    },
  };
}
export type Replay = ReturnType<typeof useReplay>;
