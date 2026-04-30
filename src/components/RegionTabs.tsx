"use client";

import { REGION_ICONS, REGION_LABELS, type Region } from "@/lib/types";

type ViewKey = "dashboard" | "prediction" | "today" | "accuracy" | "history";

interface Props {
  current: Region;
  onChange: (r: Region) => void;
  view: ViewKey;
  onViewChange: (v: ViewKey) => void;
  badges?: Record<Region, number>;
}

export default function RegionTabs({ current, onChange, view, onViewChange, badges }: Props) {
  const regions: Region[] = ["xsmn", "xsmb", "xsmt"];

  return (
    <nav className="sticky top-[60px] md:top-[72px] z-40 flex flex-wrap items-center justify-between gap-2 md:gap-4 px-3 sm:px-5 md:px-7 py-2 md:py-3 bg-[#0a0e17] border-b border-white/[0.06]">
      <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
        {regions.map((r) => {
          const active = r === current;
          const badge = badges?.[r] ?? 0;
          return (
            <button
              key={r}
              onClick={() => onChange(r)}
              className={`inline-flex items-center gap-1.5 md:gap-2.5 px-3 md:px-7 py-1.5 md:py-2.5 rounded-full border font-semibold text-xs md:text-sm transition-colors ${
                active
                  ? "bg-blue-900 border-blue-500 text-white shadow-[0_2px_12px_rgba(59,130,246,0.25)]"
                  : "bg-[#111827] border-[#1f2937] text-slate-300 hover:bg-[#1a2332] hover:border-slate-600 hover:text-slate-100"
              }`}
            >
              <span className="text-base md:text-lg leading-none">{REGION_ICONS[r]}</span>
              <span>{REGION_LABELS[r]}</span>
              {badge > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] md:min-w-5 md:h-5 px-1 md:px-1.5 rounded-full text-[0.55rem] md:text-[0.62rem] font-bold font-mono ${
                    active ? "bg-white/20 text-white" : "bg-white/[0.08] text-slate-400"
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1 md:gap-1.5 p-1 rounded-full bg-[#111827] border border-[#1f2937]">
        {(["dashboard", "prediction", "today", "accuracy", "history"] as const).map((v) => {
          const labels: Record<ViewKey, string> = {
            dashboard: "📊 Dashboard",
            prediction: "🔮 Dự Đoán",
            today: "📡 Hôm Nay",
            accuracy: "🎯 Độ Chính Xác",
            history: "📑 Lịch Sử",
          };
          const activeBg: Record<ViewKey, string> = {
            dashboard: "bg-blue-900 shadow-[0_1px_6px_rgba(59,130,246,0.25)]",
            prediction: "bg-blue-900 shadow-[0_1px_6px_rgba(59,130,246,0.25)]",
            today: "bg-emerald-700 shadow-[0_1px_6px_rgba(16,185,129,0.25)]",
            accuracy: "bg-purple-700 shadow-[0_1px_6px_rgba(139,92,246,0.25)]",
            history: "bg-indigo-700 shadow-[0_1px_6px_rgba(99,102,241,0.25)]",
          };
          return (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={`px-2 md:px-4 py-1 md:py-1.5 rounded-full text-[0.65rem] md:text-xs font-semibold transition-colors whitespace-nowrap ${
                v === view ? `${activeBg[v]} text-white` : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {labels[v]}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
