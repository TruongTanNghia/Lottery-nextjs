"use client";

import { formatVND } from "@/lib/format";
import type { ProfitStats } from "@/lib/types";

export default function StatsBar({ stats }: { stats: ProfitStats | null }) {
  const thu = stats?.total_thu_vnd ?? stats?.total_bet_vnd ?? 0;
  const bu = stats?.total_bu_vnd ?? stats?.total_win_vnd ?? 0;
  const lai = stats?.net_profit_vnd ?? thu - bu;

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card icon="💰" label="Tổng Lãi/Lỗ (30 ngày)" value={formatVND(lai)} valueClass={lai < 0 ? "text-red-500" : "text-emerald-500"} />
      <Card icon="📈" label="Tổng Thu" value={formatVND(thu)} valueClass="text-emerald-500" />
      <Card icon="📉" label="Tổng Bù" value={formatVND(-bu)} valueClass="text-red-500" />
      <Card icon="🎯" label="Tỷ Lệ Ăn" value={stats ? `${stats.win_rate.toFixed(1)}%` : "--"} valueClass="text-blue-400" />
    </section>
  );
}

function Card({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: string;
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center gap-4 p-5 rounded-2xl bg-[#111827] border border-white/[0.06] hover:border-white/[0.12] transition-colors">
      <div className="text-3xl flex-shrink-0">{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</div>
        <div className={`text-xl font-extrabold font-mono tracking-tight ${valueClass}`}>{value}</div>
      </div>
    </div>
  );
}
