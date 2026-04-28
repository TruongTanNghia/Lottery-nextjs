"use client";

import { REGION_ICONS, REGION_LABELS, type Region } from "@/lib/types";

interface Props {
  current: Region;
  onChange: (r: Region) => void;
  view: "dashboard" | "prediction";
  onViewChange: (v: "dashboard" | "prediction") => void;
  badges?: Record<Region, number>;
}

export default function RegionTabs({ current, onChange, view, onViewChange, badges }: Props) {
  const regions: Region[] = ["xsmn", "xsmb", "xsmt"];

  return (
    <nav className="sticky top-[72px] z-40 flex items-center justify-between gap-4 px-7 py-3 bg-[#0a0e17] border-b border-white/[0.06]">
      <div className="flex items-center gap-2">
        {regions.map((r) => {
          const active = r === current;
          const badge = badges?.[r] ?? 0;
          return (
            <button
              key={r}
              onClick={() => onChange(r)}
              className={`inline-flex items-center gap-2.5 px-7 py-2.5 rounded-full border font-semibold text-sm transition-colors ${
                active
                  ? "bg-blue-900 border-blue-500 text-white shadow-[0_2px_12px_rgba(59,130,246,0.25)]"
                  : "bg-[#111827] border-[#1f2937] text-slate-300 hover:bg-[#1a2332] hover:border-slate-600 hover:text-slate-100"
              }`}
            >
              <span className="text-lg leading-none">{REGION_ICONS[r]}</span>
              <span>{REGION_LABELS[r]}</span>
              {badge > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[0.62rem] font-bold font-mono ${
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

      <div className="flex gap-1.5 p-1 rounded-full bg-[#111827] border border-[#1f2937]">
        {(["dashboard", "prediction"] as const).map((v) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              v === view
                ? "bg-blue-900 text-white shadow-[0_1px_6px_rgba(59,130,246,0.25)]"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {v === "dashboard" ? "📊 Dashboard" : "🔮 Dự Đoán"}
          </button>
        ))}
      </div>
    </nav>
  );
}
