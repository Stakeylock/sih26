import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { Replay } from "../hooks/useReplay";
import { timeLabel } from "../engine/geometry";
export function Playback({ replay }: { replay: Replay }) {
  const { run, t, speed, playing } = replay;
  return (
    <section className="playback">
      <div className="transport">
        <button
          className="play"
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={() => {
            if (t >= 120) replay.seek(0);
            replay.setPlaying(!playing);
          }}
        >
          {playing ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </button>
        <button
          className="icon"
          aria-label="Reset replay"
          onClick={replay.reset}
        >
          <RotateCcw size={17} />
        </button>
        <span className="replay-time">
          {timeLabel(t)}
          <small> / 02:00</small>
        </span>
      </div>
      <div className="timeline">
        <div className="timeline-labels">
          <span>GNSS TRUST</span>
          <span>Drag to inspect</span>
        </div>
        <div className="track">
          <span
            className="outage-band"
            style={{
              left: `${run.scenario.start / 1.2}%`,
              width: `${run.config.blackout / 1.2}%`,
            }}
          />
          <span className="played" style={{ width: `${t / 1.2}%` }} />
          {run.events
            .filter((e) => e.id.startsWith("state-"))
            .map((e) => (
              <button
                className="event-dot"
                key={e.id}
                style={{ left: `${e.at / 1.2}%` }}
                aria-label={`Seek to ${e.title}`}
                title={`${timeLabel(e.at)} · ${e.title}`}
                onClick={() => replay.seek(e.at)}
              />
            ))}
          <input
            aria-label="Replay position"
            type="range"
            min="0"
            max="120"
            step="0.1"
            value={t}
            onChange={(e) => replay.seek(+e.target.value)}
          />
        </div>
        <div className="timeline-ticks">
          <span>00:00</span>
          <span>00:30</span>
          <span>01:00</span>
          <span>01:30</span>
          <span>02:00</span>
        </div>
      </div>
      <div className="playback-speed">
        <select
          aria-label="Playback speed"
          value={speed}
          onChange={(e) => replay.setSpeed(+e.target.value)}
        >
          {[0.5, 1, 2, 4].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <button
          className="icon"
          aria-label="Skip to next event"
          onClick={() =>
            replay.seek(run.events.find((e) => e.at > t + 0.1)?.at ?? 120)
          }
        >
          <SkipForward size={17} />
        </button>
      </div>
    </section>
  );
}
