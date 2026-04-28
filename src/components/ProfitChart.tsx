"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartData } from "@/lib/types";

interface Props {
  data: ChartData | null;
  days: number;
  onDaysChange: (d: number) => void;
}

export default function ProfitChart({ data, days, onDaysChange }: Props) {
  if (!data) {
    return <div className="p-10 text-center text-slate-500">Đang tải biểu đồ...</div>;
  }

  // Convert to recharts format (millions)
  const chartRows = data.labels.map((label, i) => ({
    label,
    Thu: (data.datasets.thu[i] ?? 0) / 1_000_000,
    Bù: (data.datasets.bu[i] ?? 0) / 1_000_000,
    "Lãi lũy kế": (data.datasets.cumulative[i] ?? 0) / 1_000_000,
  }));

  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h2 className="text-sm font-bold">📈 Biểu Đồ Thu/Bù</h2>
        <div className="flex gap-1.5">
          {[7, 15, 30].map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`px-3 py-1 text-xs rounded ${
                d === days
                  ? "bg-blue-500/15 border border-blue-500/30 text-blue-400"
                  : "bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:text-slate-200"
              }`}
            >
              {d} ngày
            </button>
          ))}
        </div>
      </div>
      <div className="h-64 px-3 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.03)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }}
              tickFormatter={(v: number) => `${v}M`}
            />
            <Tooltip
              contentStyle={{ background: "rgba(17,24,39,0.95)", border: "1px solid rgba(255,255,255,0.1)" }}
              labelStyle={{ color: "#94a3b8" }}
              formatter={(v: number, name: string) => [`${v >= 0 ? "+" : ""}${v.toFixed(1)}M`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            <Bar dataKey="Thu" fill="rgba(16, 185, 129, 0.5)" stroke="rgba(16, 185, 129, 0.8)" />
            <Bar dataKey="Bù" fill="rgba(239, 68, 68, 0.5)" stroke="rgba(239, 68, 68, 0.8)" />
            <Line type="monotone" dataKey="Lãi lũy kế" stroke="#60a5fa" strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
