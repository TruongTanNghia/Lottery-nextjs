"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { REGION_LABELS, type Region } from "@/lib/types";

interface Predicted {
  lo_number: string;
  rank: number;
  probability: number;
}

interface DayResult {
  date: string;
  predicted: Predicted[];
  actual_lo: string[];
  actual_count: number;
  matched: string[];
  match_count: number;
  hit_rate: number;
  precision_vs_baseline: number;
}

interface AccuracyResponse {
  status: string;
  region: Region;
  days_analyzed: number;
  top_n: number;
  window_days: number;
  warning?: string;
  summary: {
    avg_match_count: number;
    avg_hit_rate: number;
    avg_baseline_rate: number;
    avg_lift: number;
    top1_hit_count: number;
    top1_hit_rate: number;
  };
  results: DayResult[];
}

export default function AccuracyPage({ region }: { region: Region }) {
  const [data, setData] = useState<AccuracyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [topN, setTopN] = useState(10);
  const [days, setDays] = useState(14);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/accuracy?region=${region}&days=${days}&top_n=${topN}&window=60`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [region, topN, days]);

  if (loading) {
    return <div className="text-center py-20 text-slate-500">Đang chấm điểm dự đoán...</div>;
  }

  if (!data || data.warning || !data.results || data.results.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        {data?.warning ?? "Chưa đủ data để chấm điểm. Cần ≥ 8 ngày data trong DB."}
      </div>
    );
  }

  const s = data.summary;

  return (
    <>
      {/* Header */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-purple-900/30 to-fuchsia-900/20 border border-purple-500/30 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
              📊 Độ Chính Xác Dự Đoán — {REGION_LABELS[region]}
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              Chấm điểm dự đoán bằng cách replay: dùng data TRƯỚC mỗi ngày để dự đoán, so với kết quả thực ngày đó.
            </p>
            <p className="text-[0.7rem] md:text-xs text-slate-400 mt-1">
              {data.days_analyzed} ngày phân tích • Top {data.top_n} predicted • Window {data.window_days} ngày
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={7}>7 ngày</option>
              <option value={14}>14 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={60}>60 ngày</option>
            </select>
            <select
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={30}>Top 30</option>
            </select>
          </div>
        </div>
      </section>

      {/* Summary cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat
          icon="🎯"
          label={`Trúng / Top ${data.top_n}`}
          value={`${s.avg_match_count}/${data.top_n}`}
          sub={`${s.avg_hit_rate}% trung bình`}
          valueClass="text-emerald-400"
        />
        <Stat
          icon="📊"
          label="Baseline (random)"
          value={`${s.avg_baseline_rate}%`}
          sub="P(lô bất kỳ về)"
          valueClass="text-slate-300"
        />
        <Stat
          icon="📈"
          label="Lift vs baseline"
          value={`${s.avg_lift}×`}
          sub={s.avg_lift > 1 ? "Tốt hơn random" : "Bằng random"}
          valueClass={s.avg_lift > 1.2 ? "text-emerald-400" : s.avg_lift > 1 ? "text-amber-400" : "text-red-400"}
        />
        <Stat
          icon="🥇"
          label="Top-1 hit"
          value={`${s.top1_hit_count}/${data.days_analyzed}`}
          sub={`${s.top1_hit_rate}%`}
          valueClass="text-blue-400"
        />
      </section>

      {/* Per-day results table */}
      <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-bold">📅 Chi Tiết Theo Ngày</h3>
        </div>
        <div className="p-3 md:p-4 space-y-2 md:space-y-3">
          {data.results.map((r) => {
            const goodHit = r.match_count / data.top_n >= s.avg_baseline_rate / 100;
            return (
              <div
                key={r.date}
                className={`rounded-lg border p-3 md:p-4 ${
                  goodHit
                    ? "bg-emerald-500/[0.05] border-emerald-500/25"
                    : "bg-white/[0.02] border-white/[0.06]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="font-semibold text-slate-200">
                    {formatDate(r.date)}{" "}
                    <span className="text-xs text-slate-500 font-mono">({r.date})</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400">
                      Lô về: <strong className="text-slate-200">{r.actual_count}</strong>/100
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        goodHit ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {r.match_count}/{data.top_n} match ({(r.hit_rate * 100).toFixed(0)}%)
                    </span>
                    <span className="text-slate-500 font-mono">
                      lift {r.precision_vs_baseline.toFixed(2)}×
                    </span>
                  </div>
                </div>

                <div className="text-[0.7rem] text-slate-400 mb-1">Top {data.top_n} dự đoán:</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {r.predicted.map((p) => {
                    const hit = r.matched.includes(p.lo_number);
                    return (
                      <span
                        key={p.lo_number}
                        title={`Rank #${p.rank}, ${p.probability.toFixed(2)}%${hit ? " ✓ HIT" : ""}`}
                        className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold ${
                          hit
                            ? "bg-emerald-500/30 border border-emerald-400 text-emerald-200"
                            : "bg-white/[0.04] border border-white/[0.08] text-slate-400"
                        }`}
                      >
                        {p.lo_number}
                        {hit && " ✓"}
                      </span>
                    );
                  })}
                </div>

                <details className="text-[0.7rem] text-slate-500">
                  <summary className="cursor-pointer hover:text-slate-300">
                    Lô về thực tế ({r.actual_count})
                  </summary>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.actual_lo.map((lo) => {
                      const matched = r.matched.includes(lo);
                      return (
                        <span
                          key={lo}
                          className={`px-1.5 py-0.5 rounded text-[0.65rem] font-mono ${
                            matched
                              ? "bg-emerald-500/20 text-emerald-300 font-bold"
                              : "bg-white/[0.03] text-slate-500"
                          }`}
                        >
                          {lo}
                        </span>
                      );
                    })}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  valueClass = "text-slate-100",
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 md:gap-4 p-4 md:p-5 rounded-2xl bg-[#111827] border border-white/[0.06]">
      <div className="text-2xl md:text-3xl flex-shrink-0">{icon}</div>
      <div>
        <div className="text-[0.65rem] md:text-xs uppercase tracking-wider text-slate-500 mb-1">
          {label}
        </div>
        <div className={`text-lg md:text-xl font-extrabold font-mono ${valueClass}`}>{value}</div>
        <div className="text-[0.6rem] md:text-[0.65rem] text-slate-500 mt-0.5">{sub}</div>
      </div>
    </div>
  );
}
