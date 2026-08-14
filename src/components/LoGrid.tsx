"use client";

import { formatVND } from "@/lib/format";
import type { LimitItem } from "@/lib/types";

interface Props {
  data: LimitItem[];
  onCellClick: (lo: string) => void;
}

/**
 * Bucket a limit into a 0-5 tier by its share of the day's highest limit.
 *
 * Ranking by absolute value used to be hardcoded to the stock schedule
 * (200/150/100/...), so an operator-edited schedule producing 113 or 64 left
 * those cells unstyled. Relative bucketing keeps the board readable whatever
 * numbers the schedule yields.
 */
function tierOf(limit: number, max: number): number {
  if (limit <= 0) return 0;          // shut — no bets taken
  if (max <= 0) return 3;
  const share = limit / max;
  if (share > 0.8) return 5;
  if (share > 0.6) return 4;
  if (share > 0.4) return 3;
  if (share > 0.2) return 2;
  return 1;
}

export default function LoGrid({ data, onCellClick }: Props) {
  // Always render 100 cells (00-99); fill from data when available
  const byLo = new Map(data.map((d) => [d.lo_number, d]));
  const maxLimit = data.reduce((m, d) => Math.max(m, d.current_limit), 0);
  const cells = Array.from({ length: 100 }, (_, i) => {
    const lo = String(i).padStart(2, "0");
    return byLo.get(lo) ?? null;
  });

  return (
    <div className="grid grid-cols-10 gap-1.5 p-3 sm:p-4 md:p-5">
      {cells.map((item, i) => {
        const lo = String(i).padStart(2, "0");

        // No row yet (first paint, before /api/limits resolves). Must NOT fall
        // through to limit 0 — that renders the whole board as "CHẶN", which
        // reads as a real instruction to block every number.
        if (!item) {
          return (
            <div key={lo} data-tier="na" className="lo-cell" title={`Lô ${lo} — đang tải`}>
              <span className="lo-num">{lo}</span>
              <span className="lo-limit">—</span>
              <span className="lo-meta" />
            </div>
          );
        }

        const limit = item.current_limit;
        const days = item.days_since_last;
        const tooltip =
          `Lô ${lo} • ${limit === 0 ? "CHẶN — không nhận cược" : `${limit} điểm`}\n` +
          `Đã về ${item.appearance_count} lần / 30 ngày\n` +
          `Xác cược: ${formatVND(item.bet_cost_vnd)}\n` +
          `Trúng 1 lần: ${formatVND(item.win_per_hit_vnd)}`;

        const streak =
          item.category === "hot_streak" ? "hot" : item.category === "consecutive" ? "on" : undefined;

        return (
          <div
            key={lo}
            data-tier={tierOf(limit, maxLimit)}
            data-streak={streak}
            className="lo-cell"
            onClick={() => onCellClick(lo)}
            title={tooltip}
          >
            <span className="lo-num">{lo}</span>
            <span className="lo-limit">{limit === 0 ? "CHẶN" : `${limit}n`}</span>
            <span className="lo-meta">{days === 0 ? "mới về" : `${days}d`}</span>
          </div>
        );
      })}
    </div>
  );
}
