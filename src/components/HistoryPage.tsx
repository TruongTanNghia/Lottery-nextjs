"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { REGION_LABELS, type Region } from "@/lib/types";

type ViewMode = "normal" | "last2" | "last3";

interface ProvinceBlock {
  name: string;
  prizes: { prize_type: string; numbers: string[] }[];
}

interface DayBlock {
  date: string;
  provinces: ProvinceBlock[];
}

interface ApiResponse {
  status: string;
  region: Region;
  days: number;
  total_dates: number;
  total_rows: number;
  data: DayBlock[];
}

const PRIZE_LABELS: Record<string, string> = {
  "G.DB": "ĐB",
  "G.1": "G1",
  "G.2": "G2",
  "G.3": "G3",
  "G.4": "G.4",
  "G.5": "G.5",
  "G.6": "G.6",
  "G.7": "G.7",
  "G.8": "G.8",
};

function transformNumber(num: string, mode: ViewMode): string {
  if (mode === "last2") return num.slice(-2);
  if (mode === "last3") return num.slice(-3);
  return num;
}

export default function HistoryPage({ region }: { region: Region }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("normal");
  const [days, setDays] = useState(45);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/results/history-full?region=${region}&days=${days}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [region, days]);

  if (loading) {
    return <div className="text-center py-20 text-slate-500">Đang tải lịch sử...</div>;
  }

  if (!data || !data.data || data.data.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        Chưa có dữ liệu lịch sử cho {REGION_LABELS[region]}. Bấm 🔄 Cập nhật để scrape data.
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-indigo-900/25 to-blue-900/15 border border-indigo-500/30 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
              📑 Lịch Sử {data.days} Ngày — {REGION_LABELS[region]}
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              Hiển thị toàn bộ data từng đài cho từng ngày — verify trực quan
            </p>
            <p className="text-[0.7rem] md:text-xs text-slate-400 mt-1">
              {data.total_dates} ngày • {data.total_rows} kết quả
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={7}>7 ngày</option>
              <option value={15}>15 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={45}>45 ngày</option>
            </select>
            <div className="flex gap-1 p-1 rounded bg-[#1a2332] border border-slate-600">
              {(["normal", "last2", "last3"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setView(m)}
                  className={`px-3 py-1 text-xs rounded font-semibold transition-colors ${
                    view === m
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {m === "normal" ? "Số đầy đủ" : m === "last2" ? "2 số cuối" : "3 số cuối"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Per-day blocks */}
      <div className="space-y-3 md:space-y-4">
        {data.data.map((day) => (
          <DayCard key={day.date} day={day} view={view} />
        ))}
      </div>
    </>
  );
}

function DayCard({ day, view }: { day: DayBlock; view: ViewMode }) {
  const provinceCount = day.provinces.length;

  const prizeOrder = ["G.DB", "G.1", "G.2", "G.3", "G.4", "G.5", "G.6", "G.7", "G.8"];
  const prizeSet = new Set<string>();
  for (const p of day.provinces) for (const pr of p.prizes) prizeSet.add(pr.prize_type);
  const prizes = prizeOrder.filter((p) => prizeSet.has(p));

  function getNumbers(prizeType: string, provinceName: string): string[] {
    const prov = day.provinces.find((p) => p.name === provinceName);
    if (!prov) return [];
    const pr = prov.prizes.find((x) => x.prize_type === prizeType);
    return pr?.numbers ?? [];
  }

  // Total numbers per province (for verification)
  function totalNumbers(provName: string): number {
    const prov = day.provinces.find((p) => p.name === provName);
    if (!prov) return 0;
    return prov.prizes.reduce((s, pr) => s + pr.numbers.length, 0);
  }

  const chipBase = "inline-block px-1.5 py-0.5 rounded font-mono font-bold leading-none border";
  const chipColor: Record<ViewMode, string> = {
    normal: "bg-white/[0.04] border-white/[0.08] text-slate-100",
    last2: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    last3: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  };

  return (
    <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm md:text-base font-bold">
          {formatDate(day.date)}{" "}
          <span className="text-slate-500 font-mono text-xs">({day.date})</span>
        </h3>
        <span className="text-[0.7rem] text-slate-400">
          {provinceCount} đài •{" "}
          {day.provinces.map((p) => `${p.name}(${totalNumbers(p.name)})`).join(" / ")}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead>
            <tr className="bg-[#0f1623] border-b border-white/[0.06]">
              <th className="px-2 md:px-3 py-2 text-left text-[0.7rem] font-semibold text-amber-400 uppercase tracking-wide w-12 md:w-14">
                Giải
              </th>
              {day.provinces.map((p) => (
                <th
                  key={p.name}
                  className="px-2 md:px-3 py-2 text-center text-[0.72rem] font-semibold text-slate-200 border-l border-white/[0.04]"
                >
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prizes.map((prize) => (
              <tr key={prize} className="border-b border-white/[0.03] hover:bg-white/[0.01]">
                <td className="px-2 md:px-3 py-2 font-bold text-amber-300 text-[0.72rem] align-top">
                  {PRIZE_LABELS[prize] ?? prize}
                </td>
                {day.provinces.map((prov) => {
                  const nums = getNumbers(prize, prov.name);
                  const isDB = prize === "G.DB";
                  return (
                    <td
                      key={prov.name}
                      className="px-2 md:px-3 py-2 text-center border-l border-white/[0.04] align-top"
                    >
                      <div className="flex flex-wrap justify-center gap-1">
                        {nums.map((n, i) => (
                          <span
                            key={i}
                            className={`${chipBase} ${chipColor[view]} ${
                              isDB
                                ? "text-sm md:text-base px-2 py-1"
                                : "text-[0.72rem] md:text-xs"
                            }`}
                          >
                            {transformNumber(n, view)}
                          </span>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
