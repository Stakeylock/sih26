import type { JudgeCallout } from "../../engine/types";

export type { JudgeCallout };

export function JudgeOverlay({
  callout,
}: {
  callout: JudgeCallout;
}) {
  if (callout === null) return <></>;

  const counter = `${String(callout.index).padStart(2, "0")} / ${String(callout.total).padStart(2, "0")}`;

  return (
    <div className="jo-overlay" role="status" aria-live="polite">
      <span className="jo-counter">{counter}</span>
      <strong className="jo-title">{callout.title}</strong>
      <p className="jo-body">{callout.body}</p>
    </div>
  );
}
