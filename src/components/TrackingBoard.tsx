"use client";

import { useMemo } from "react";
import type { ConfigPayload, LimitItem } from "@/lib/types";

interface DailyRow {
  date: string;
  lo_number: string;
  count: number;
}

interface Props {
  limits: LimitItem[];
  recent: DailyRow[];
  config: ConfigPayload | null;
}

const WINDOW = 7;

/** Limit this lô drops to tomorrow if it still doesn't come. */
function nextTier(item: LimitItem, config: ConfigPayload | null): number {
  if (!config) return item.current_limit;
  const d = item.days_since_last + 1;
  const base = config.base_schedule?.[String(d)] ?? config.min_limit ?? 0;
  const cap =
    item.consecutive_days > (config.consecutive_reset_after ?? 4)
      ? null
      : config.consecutive_limits?.[String(item.consecutive_days)] ?? null;
  return cap !== null ? Math.min(base, cap) : base;
}

export default function TrackingBoard({ limits, recent, config }: Props) {
  // Last 7 DRAW dates, not calendar days — a missed scrape must not silently
  // shorten the rhythm or shift every lô's pattern by a column.
  const { dates, hitBy } = useMemo(() => {
    const byDate = new Map<string, Set<string>>();
    for (const r of recent) {
      if (!byDate.has(r.date)) byDate.set(r.date, new Set());
      byDate.get(r.date)!.add(r.lo_number);
    }
    const all = [...byDate.keys()].sort();
    return { dates: all.slice(-WINDOW), hitBy: byDate };
  }, [recent]);

  const patternOf = (lo: string) => dates.map((d) => (hitBy.get(d)?.has(lo) ? 1 : 0));

  const tracking = useMemo(
    () =>
      limits
        .filter((l) => l.days_since_last > 0)
        .sort((a, b) => b.days_since_last - a.days_since_last || a.lo_number.localeCompare(b.lo_number)),
    [limits]
  );

  const released = useMemo(
    () =>
      limits
        .filter((l) => l.days_since_last === 0)
        .sort((a, b) => b.consecutive_days - a.consecutive_days || a.lo_number.localeCompare(b.lo_number)),
    [limits]
  );

  const dayLabels = dates.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
      {/* ── Đang theo dõi ─────────────────────────────────────── */}
      <section className="plate rise rise-2">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">👁️ Đang Theo Dõi</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Chưa về — tiền đang tụt bậc
            </p>
          </div>
          <span className="numeric inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-sm font-bold bg-[rgba(249,115,22,0.18)] border border-[rgba(249,115,22,0.45)] text-[#ffab6b]">
            {tracking.length}
          </span>
        </div>
        <Table
          rows={tracking}
          dayLabels={dayLabels}
          patternOf={patternOf}
          config={config}
          mode="tracking"
          empty="Mọi lô đều vừa về"
        />
      </section>

      {/* ── Đã nhả ────────────────────────────────────────────── */}
      <section className="plate rise rise-3">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">💰 Đã Nhả Ra</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Vừa về — tiền đã khôi phục
            </p>
          </div>
          <span className="numeric inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-sm font-bold bg-[rgba(16,185,129,0.18)] border border-[rgba(16,185,129,0.45)] text-[#4ade9f]">
            {released.length}
          </span>
        </div>
        <Table
          rows={released}
          dayLabels={dayLabels}
          patternOf={patternOf}
          config={config}
          mode="released"
          empty="Chưa có lô nào về kỳ này"
        />
      </section>
    </div>
  );
}

function Table({
  rows,
  dayLabels,
  patternOf,
  config,
  mode,
  empty,
}: {
  rows: LimitItem[];
  dayLabels: string[];
  patternOf: (lo: string) => number[];
  config: ConfigPayload | null;
  mode: "tracking" | "released";
  empty: string;
}) {
  if (rows.length === 0) {
    return <div className="py-10 text-center text-sm text-[var(--text-muted)]">{empty}</div>;
  }

  return (
    <div className="max-h-[26rem] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[#1b2d4d]">
          <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
            <th className="px-3 py-2 text-left font-bold">Lô</th>
            <th className="px-2 py-2 text-center font-bold">
              Nhịp {dayLabels.length} kỳ
              <div className="hidden sm:flex justify-center gap-[3px] mt-1 font-normal normal-case tracking-normal text-[0.5rem]">
                {dayLabels.map((d) => (
                  <span key={d} className="w-5 text-center">
                    {d.slice(0, 2)}
                  </span>
                ))}
              </div>
            </th>
            <th className="px-2 py-2 text-right font-bold">
              {mode === "tracking" ? "Chưa về" : "Liên tiếp"}
            </th>
            <th className="px-3 py-2 text-right font-bold">Hạn mức</th>
            {mode === "tracking" && <th className="px-3 py-2 text-right font-bold">Bậc kế</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const pat = patternOf(l.lo_number);
            const next = nextTier(l, config);
            const dropping = mode === "tracking" && next < l.current_limit;
            return (
              <tr
                key={l.lo_number}
                className="border-t border-[var(--hairline)] hover:bg-white/[0.06]"
              >
                <td className="px-3 py-2">
                  <span className="numeric text-base font-bold text-white">{l.lo_number}</span>
                </td>
                <td className="px-2 py-2">
                  <div className="flex justify-center gap-[3px]">
                    {pat.map((v, i) => (
                      <span
                        key={i}
                        title={v ? "về" : "không về"}
                        className={`w-5 h-5 rounded-[3px] ${
                          v
                            ? "bg-[#10b981] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                            : "bg-[#0e1a2e] border border-[rgba(150,185,235,0.18)]"
                        }`}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-2 py-2 text-right">
                  <span
                    className={`numeric font-bold ${
                      mode === "tracking"
                        ? l.days_since_last >= 5
                          ? "text-[#ff6b78]"
                          : "text-[#ffab6b]"
                        : l.consecutive_days >= 2
                        ? "text-[#ffd24a]"
                        : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {mode === "tracking" ? `${l.days_since_last}d` : `${l.consecutive_days}d`}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="numeric font-bold text-white">{l.current_limit}n</span>
                </td>
                {mode === "tracking" && (
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`numeric font-semibold ${
                        dropping ? "text-[#ff6b78]" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {dropping ? `↓ ${next}n` : `${next}n`}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
