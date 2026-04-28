"use client";

import { formatVND } from "@/lib/format";
import type { LimitItem } from "@/lib/types";

interface Props {
  data: LimitItem[];
  onCellClick: (lo: string) => void;
}

export default function LoGrid({ data, onCellClick }: Props) {
  // Always render 100 cells (00-99); fill from data when available
  const byLo = new Map(data.map((d) => [d.lo_number, d]));
  const cells = Array.from({ length: 100 }, (_, i) => {
    const lo = String(i).padStart(2, "0");
    return byLo.get(lo) ?? null;
  });

  return (
    <div className="grid grid-cols-10 gap-1.5 p-5">
      {cells.map((item, i) => {
        const lo = String(i).padStart(2, "0");
        const limit = item?.current_limit ?? 200;
        const days = item?.days_since_last;
        const tooltip = item
          ? `Lô ${lo} • ${limit} điểm\nĐã về ${item.appearance_count} lần / 30 ngày\nXác cược: ${formatVND(item.bet_cost_vnd)}\nTrúng 1 lần: ${formatVND(item.win_per_hit_vnd)}`
          : `Lô ${lo}`;

        const extraClass =
          item?.category === "hot_streak"
            ? "ring-2 ring-red-500/50 animate-pulse"
            : item?.category === "consecutive"
            ? "ring-2 ring-amber-500/40"
            : "";

        return (
          <div
            key={lo}
            data-limit={limit}
            className={`lo-cell ${extraClass}`}
            onClick={() => onCellClick(lo)}
            title={tooltip}
          >
            <span className="lo-num">{lo}</span>
            <span className="lo-limit">{limit}đ</span>
            <span className="lo-meta">{days === 0 ? "mới về" : days !== undefined ? `${days}d` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
