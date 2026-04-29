"use client";

import { useMemo, useState } from "react";
import { useToast } from "./Toast";
import type { LimitItem } from "@/lib/types";

type Filter = "consecutive" | "cold";
type CopySep = "space" | "comma" | "newline";

interface Props {
  limits: LimitItem[];
}

// Note: consecutive_days max = 4 (spec: "qua 4 ngày liên tiếp → reset về 1")
// → no "5+" / "6+" buckets because they would always be empty.
const STREAK_OPTIONS: Array<{ key: string; label: string; match: (l: LimitItem) => boolean }> = [
  { key: "1", label: "1 ngày", match: (l) => l.consecutive_days === 1 },
  { key: "2", label: "2 ngày", match: (l) => l.consecutive_days === 2 },
  { key: "3", label: "3 ngày", match: (l) => l.consecutive_days === 3 },
  { key: "4", label: "4 ngày (max)", match: (l) => l.consecutive_days === 4 },
];

const COLD_OPTIONS: Array<{ key: string; label: string; match: (l: LimitItem) => boolean }> = [
  { key: "0", label: "0 ngày (mới về)", match: (l) => l.days_since_last === 0 },
  { key: "1", label: "1 ngày", match: (l) => l.days_since_last === 1 },
  { key: "2", label: "2 ngày", match: (l) => l.days_since_last === 2 },
  { key: "3", label: "3 ngày", match: (l) => l.days_since_last === 3 },
  { key: "4", label: "4 ngày", match: (l) => l.days_since_last === 4 },
  { key: "5", label: "5 ngày", match: (l) => l.days_since_last === 5 },
  { key: "6+", label: "6+ ngày", match: (l) => l.days_since_last >= 6 },
];

export default function StreakCopyCard({ limits }: Props) {
  const toast = useToast();
  const [filterMode, setFilterMode] = useState<Filter>("consecutive");
  const [optionKey, setOptionKey] = useState<string>("2");
  const [sep, setSep] = useState<CopySep>("space");

  const options = filterMode === "consecutive" ? STREAK_OPTIONS : COLD_OPTIONS;
  const currentOption = options.find((o) => o.key === optionKey) ?? options[0];

  const filtered = useMemo(
    () => limits.filter(currentOption.match).sort((a, b) => a.lo_number.localeCompare(b.lo_number)),
    [limits, currentOption]
  );

  const formatted = useMemo(() => {
    const sepChar = sep === "space" ? " " : sep === "comma" ? ", " : "\n";
    return filtered.map((l) => l.lo_number).join(sepChar);
  }, [filtered, sep]);

  function switchMode(m: Filter) {
    setFilterMode(m);
    setOptionKey(m === "consecutive" ? "2" : "0");
  }

  async function handleCopy() {
    if (filtered.length === 0) {
      toast.show("info", "Không có lô nào trong filter này.");
      return;
    }
    try {
      await navigator.clipboard.writeText(formatted);
      toast.show("success", `Đã copy ${filtered.length} lô vào clipboard`);
    } catch {
      toast.show("error", "Trình duyệt không cho phép copy. Bấm vào textbox để select rồi Ctrl+C.");
    }
  }

  const sepLabels: Record<CopySep, string> = {
    space: "Khoảng cách",
    comma: "Dấu phẩy",
    newline: "Mỗi số 1 dòng",
  };

  return (
    <section className="rounded-2xl bg-gradient-to-br from-amber-900/25 to-rose-900/15 border border-amber-500/30 overflow-hidden mb-4 md:mb-6">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06]">
        <h2 className="text-sm md:text-base font-bold flex items-center gap-2">
          🔥 Copy Lô Theo Tiêu Chí
        </h2>
        <p className="text-[0.7rem] md:text-xs text-slate-400 mt-0.5">
          Lọc lô theo "ngày liên tiếp về" hoặc "ngày chưa về" → copy 1 phát.
        </p>
      </div>

      <div className="p-4 md:p-5">
        {/* Mode toggle */}
        <div className="mb-3 flex gap-1.5 p-1 rounded-full bg-[#0f1623] border border-[#1f2937] w-fit">
          <button
            onClick={() => switchMode("consecutive")}
            className={`px-3 py-1.5 text-xs rounded-full font-semibold transition-colors ${
              filterMode === "consecutive"
                ? "bg-amber-500 text-white"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            🔥 Liên tiếp về
          </button>
          <button
            onClick={() => switchMode("cold")}
            className={`px-3 py-1.5 text-xs rounded-full font-semibold transition-colors ${
              filterMode === "cold"
                ? "bg-blue-500 text-white"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            ❄️ Chưa về
          </button>
        </div>

        {/* Filter options */}
        <div className="mb-3">
          <div className="text-[0.7rem] text-slate-400 mb-1.5 font-semibold">Tiêu chí lọc:</div>
          <div className="flex flex-wrap gap-1.5">
            {options.map((opt) => {
              const count = limits.filter(opt.match).length;
              const active = opt.key === optionKey;
              return (
                <button
                  key={opt.key}
                  onClick={() => setOptionKey(opt.key)}
                  className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                    active
                      ? filterMode === "consecutive"
                        ? "bg-amber-500 text-white"
                        : "bg-blue-500 text-white"
                      : "bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]"
                  }`}
                >
                  {opt.label}
                  <span className={`ml-1.5 text-[0.65rem] ${active ? "opacity-90" : "opacity-60"}`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Format options */}
        <div className="mb-3">
          <div className="text-[0.7rem] text-slate-400 mb-1.5 font-semibold">Format:</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(sepLabels) as CopySep[]).map((s) => (
              <button
                key={s}
                onClick={() => setSep(s)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  sep === s
                    ? "bg-blue-500/30 border border-blue-400/50 text-blue-200"
                    : "bg-white/[0.03] border border-white/[0.08] text-slate-400 hover:bg-white/[0.08]"
                }`}
              >
                {sepLabels[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <textarea
          readOnly
          value={formatted || "(không có lô nào)"}
          rows={sep === "newline" ? Math.min(filtered.length, 8) || 2 : 3}
          className="w-full px-3 py-2.5 rounded-lg bg-[#0f1623] border border-[#1f2937] text-slate-100 font-mono text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2 justify-between">
          <span className="text-[0.7rem] text-slate-500">
            {filtered.length} lô • {formatted.length} ký tự
          </span>
          <button
            onClick={handleCopy}
            disabled={filtered.length === 0}
            className="px-4 py-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white font-bold text-sm shadow-[0_2px_12px_rgba(245,158,11,0.35)] hover:shadow-[0_4px_20px_rgba(245,158,11,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📋 Copy ({filtered.length} lô)
          </button>
        </div>
      </div>
    </section>
  );
}
