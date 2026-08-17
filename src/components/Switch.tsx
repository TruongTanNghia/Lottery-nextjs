"use client";

/**
 * The BẬT/TẮT pill used by every board that controls real money.
 *
 * Shared rather than copied so the watchlist and the Top board can never drift
 * apart — the operator reads them as the same control and expects them to
 * behave the same way.
 */
export default function Switch({
  label,
  on,
  muted,
  onToggle,
}: {
  label: string;
  on: boolean;
  /** Saved, but not in effect right now — dimmed yet still clickable. */
  muted?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors active:scale-[0.97] ${
        muted ? "opacity-55" : ""
      } ${
        on
          ? "bg-[rgba(16,185,129,0.18)] border-[rgba(16,185,129,0.55)] text-[#4ade9f]"
          : "bg-white/[0.06] border-[var(--hairline)] text-[var(--text-muted)]"
      }`}
    >
      <span
        className={`w-8 h-4 rounded-full relative transition-colors ${
          on ? "bg-[#10b981]" : "bg-[#3a4a63]"
        }`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
            on ? "left-[1.15rem]" : "left-0.5"
          }`}
        />
      </span>
      {label}: {on ? "BẬT" : "TẮT"}
    </button>
  );
}
