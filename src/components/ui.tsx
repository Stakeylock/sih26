import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { GnssState } from "../engine/types";
export function Status({ state }: { state: GnssState }) {
  return (
    <span className={`status ${state.toLowerCase()}`}>
      <i />
      {state.toLowerCase()}
    </span>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" onClick={close} aria-label="Close dialog">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      className="toggle-control"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
    >
      <span>{label}</span>
      <i className={checked ? "enabled" : ""}>
        <b />
      </i>
    </button>
  );
}
