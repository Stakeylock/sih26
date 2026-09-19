import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { Replay } from "../hooks/useReplay";
import { timeLabel } from "../engine/geometry";
export function Playback({ replay }: { replay: Replay }) {
  const { run, t, speed, playing } = replay;
  // N1 (Antigravity audit): fresh judges decide in ~7s but the transport looks
  // static. Pulsing affordance ONLY before playback starts (t<=12, paused) —
  // it disappears the moment the demo runs, so it never competes with content.
  const coldStart = !playing && t <= 12;
  return (
    <section className="playback">
      {coldStart && (
        <button
          className="start-badge"
          onClick={() => {
            if (t >= run.duration) replay.seek(0);
            replay.setPlaying(true);
          }}
        >
          <Play size={13} fill="currentColor" />
          START DEMO
          <small>Space works too</small>
        </button>
      )}
      <div className="transport">
        <button
          className="play"
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={() => {
            if (t >= run.duration) replay.seek(0);
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
          <small> / {timeLabel(run.duration)}</small>
        </span>
      </div>
      <div className="timeline">
        <div className="timeline-labels">
          <span>GNSS SIGNAL</span>
          <span>Shaded = outage · drag to inspect</span>
        </div>
        <div className="track">
          <span
            className="outage-band"
            role="img"
            aria-label={`GNSS blackout from ${timeLabel(run.scenario.start)} to ${timeLabel(run.scenario.start + run.config.blackout)}`}
            style={{
              left: `${run.scenario.start / 1.2}%`,
              width: `${run.config.blackout / 1.2}%`,
            }}
          >
            <b>GNSS OUTAGE</b>
          </span>
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
            max={run.duration}
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
          <span>{timeLabel(run.duration)}</span>
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
            replay.seek(
              run.events.find((e) => e.at > t + 0.1)?.at ?? run.duration,
            )
          }
        >
          <SkipForward size={17} />
        </button>
      </div>
    </section>
  );
}
