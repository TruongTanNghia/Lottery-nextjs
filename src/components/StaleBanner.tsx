"use client";

import { freshness, freshnessText, formatDayMonth } from "@/lib/freshness";

/**
 * Says out loud when the board is priced off an old draw.
 *
 * Deliberately impossible to miss when it matters: the limits look completely
 * normal whether the data is from today or from last week, and the only thing
 * that used to distinguish them was a small date in the header nobody reads.
 */
export default function StaleBanner({
  latestScraped,
  onUpdate,
  isUpdating,
}: {
  latestScraped: string | null;
  onUpdate?: () => void;
  isUpdating?: boolean;
}) {
  const f = freshness(latestScraped);
  if (f.level === "ok") return null;

  const alarm = f.level === "alarm";

  return (
    <div
      role="alert"
      className={`mb-4 rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 ${
        alarm
          ? "bg-[rgba(220,38,38,0.16)] border-[rgba(248,113,113,0.55)]"
          : "bg-[rgba(245,158,11,0.13)] border-[rgba(251,191,36,0.45)]"
      }`}
    >
      <span className={`text-xl leading-none ${alarm ? "animate-pulse" : ""}`}>
        {alarm ? "🔴" : "⚠️"}
      </span>

      <div className="min-w-0 flex-1">
        <div className={`text-sm font-bold ${alarm ? "text-[#ffb4b4]" : "text-[#ffd98a]"}`}>
          {freshnessText(f)}
        </div>
        <div className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
          KQ đang dùng: <strong>{latestScraped ? formatDayMonth(latestScraped) : "chưa có"}</strong>
          {" · "}
          cần tới: <strong>{formatDayMonth(f.expected)}</strong>
        </div>
      </div>

      {onUpdate && (
        <button
          onClick={onUpdate}
          disabled={isUpdating}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            alarm
              ? "bg-[#dc2626] hover:bg-[#ef4444] text-white"
              : "bg-[#f59e0b] hover:bg-[#fbbf24] text-[#3a2600]"
          }`}
        >
          {isUpdating ? "Đang lấy KQ…" : "Cập nhật ngay"}
        </button>
      )}
    </div>
  );
}
