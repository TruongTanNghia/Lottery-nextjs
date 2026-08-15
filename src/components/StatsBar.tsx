"use client";

import { formatVND } from "@/lib/format";
import type { ProfitStats } from "@/lib/types";

export default function StatsBar({ stats }: { stats: ProfitStats | null }) {
  const thu = stats?.total_thu_vnd ?? stats?.total_bet_vnd ?? 0;
  const bu = stats?.total_bu_vnd ?? stats?.total_win_vnd ?? 0;
  const lai = stats?.net_profit_vnd ?? thu - bu;

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4 mb-4 md:mb-6">
      <Card
        label="Lãi / Lỗ · 30 ngày"
        value={formatVND(lai)}
        tone={lai < 0 ? "loss" : "gain"}
        lead
      />
      <Card label="Tổng Thu" value={formatVND(thu)} tone="gain" />
      <Card label="Tổng Bù" value={formatVND(-bu)} tone="loss" />
      <Card
        label="Tỷ Lệ Ăn"
        value={stats ? `${stats.win_rate.toFixed(1)}%` : "--"}
        tone="neutral"
      />
    </section>
  );
}

const TONE: Record<string, { text: string; bar: string }> = {
  gain: { text: "#34e6a8", bar: "#34e6a8" },
  loss: { text: "#ff6b78", bar: "#ff6b78" },
  neutral: { text: "#8fd0ff", bar: "#8fd0ff" },
};

function Card({
  label,
  value,
  tone,
  lead,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONE | string;
  lead?: boolean;
}) {
  const t = TONE[tone] ?? TONE.neutral;
  return (
    <div className={`plate rise ${lead ? "rise-1 col-span-2 lg:col-span-1" : "rise-2"} p-3.5 md:p-5`}>
      {/* tone bar doubles as the plate's lit edge */}
      <div className="absolute top-0 left-0 h-[3px] w-full" style={{ background: t.bar }} />
      <div className="eyebrow mb-1.5">{label}</div>
      <div
        className={`numeric font-extrabold leading-none ${lead ? "text-2xl md:text-[2rem]" : "text-lg md:text-2xl"}`}
        style={{ color: t.text }}
      >
        {value}
      </div>
    </div>
  );
}
