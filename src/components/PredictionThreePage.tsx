"use client";

import { useEffect, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";
import { useToast } from "./Toast";

interface ThreeItem {
  rank: number;
  number: string;
  probability: number;
  composite_score: number;
  breakdown: Record<string, number>;
}

interface ThreeResponse {
  status: string;
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  weights: Record<string, number>;
  predictions: ThreeItem[];
}

interface BacktestDay {
  date: string;
  predicted_top: string[];
  actual_count: number;
  hits: number;
  hit_picks: string[];
  hit_rate_pct: number;
  coverage_pct: number;
}

interface BacktestResponse {
  status: string;
  region: Region;
  days_window: number;
  top_k: number;
  baseline_pct: number;
  total_predicted: number;
  total_hits: number;
  total_actual: number;
  hit_rate_pct: number;
  coverage_pct: number;
  lift_vs_baseline: number;
  days: BacktestDay[];
}

const MODEL_LABEL: Record<string, string> = {
  frequency: "Tần suất",
  recency: "Gần đây (EWMA)",
  dayOfWeek: "Cùng thứ",
  temperature: "Hot vs base",
};

export default function PredictionThreePage({ region }: { region: Region }) {
  const toast = useToast();
  const [data, setData] = useState<ThreeResponse | null>(null);
  const [backtest, setBacktest] = useState<BacktestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [backtestLoading, setBacktestLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(60);
  const [topK, setTopK] = useState(30);
  const [backtestDays, setBacktestDays] = useState(14);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/predict/three?region=${region}&window=${windowDays}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [region, windowDays]);

  useEffect(() => {
    setBacktestLoading(true);
    fetch(`/api/predict/three/backtest?region=${region}&days=${backtestDays}&top_k=${topK}&window=${windowDays}`)
      .then((r) => r.json())
      .then((d) => setBacktest(d))
      .catch(() => setBacktest(null))
      .finally(() => setBacktestLoading(false));
  }, [region, windowDays, topK, backtestDays]);

  async function copyAll() {
    if (!data || data.predictions.length === 0) return;
    const nums = data.predictions.slice(0, topK).map((p) => p.number);
    try {
      await navigator.clipboard.writeText(nums.join(" "));
      toast.show("success", `Copy top ${nums.length} số`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  if (loading) {
    return <div className="text-center py-20 text-slate-500">⏳ Đang phân tích 1000 số (000-999)...</div>;
  }

  if (!data || data.warning) {
    return (
      <div className="text-center py-20 text-slate-500">
        {data?.warning ?? "Không có data."}
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-pink-900/30 via-fuchsia-900/20 to-purple-900/20 border border-pink-500/40 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
              🎲 Dự Đoán 3 Chân — {REGION_LABELS[region]}
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              Đoán 3 số cuối của giải (000-999) • 4 model ensemble • Top {topK} candidate
            </p>
            <p className="text-[0.7rem] md:text-xs text-slate-400 mt-1">
              {data.days_available} ngày data • Window {data.window_days}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={30}>30 ngày</option>
              <option value={60}>60 ngày</option>
              <option value={90}>90 ngày</option>
              <option value={180}>180 ngày</option>
            </select>
            <select
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={30}>Top 30</option>
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
            </select>
            <button
              onClick={copyAll}
              className="px-3 py-1.5 text-xs rounded bg-pink-500 hover:bg-pink-400 text-white font-bold"
            >
              📋 Copy Top {topK}
            </button>
          </div>
        </div>
      </section>

      {/* Weights legend */}
      <section className="mb-4 md:mb-6 rounded-xl bg-[#111827] border border-slate-700/50 p-3">
        <div className="text-[0.7rem] text-slate-400 mb-1.5 font-semibold uppercase">⚖️ Trọng số ensemble</div>
        <div className="flex flex-wrap gap-2 text-[0.7rem]">
          {Object.entries(data.weights).map(([k, w]) => (
            <span key={k} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] border border-slate-700">
              <span className="text-pink-300 font-bold">{MODEL_LABEL[k] ?? k}</span>
              <span className="font-mono text-white">{(w * 100).toFixed(0)}%</span>
            </span>
          ))}
        </div>
      </section>

      {/* Backtest panel — accuracy stats */}
      {backtestLoading ? (
        <div className="mb-4 md:mb-6 rounded-2xl border border-slate-600/40 p-4 text-center text-slate-500 text-sm">
          ⏳ Đang backtest {backtestDays} ngày...
        </div>
      ) : backtest && backtest.days.length > 0 ? (
        <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-pink-500/30 overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
                📊 Độ chính xác (backtest {backtest.days.length} ngày)
              </h3>
              <p className="text-[0.7rem] text-slate-400 mt-0.5">
                Mỗi ngày replay prediction với data trước ngày đó → so với 3 chân thực
              </p>
            </div>
            <select
              value={backtestDays}
              onChange={(e) => setBacktestDays(parseInt(e.target.value))}
              className="px-2 py-1 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={7}>7 ngày</option>
              <option value={14}>14 ngày</option>
              <option value={21}>21 ngày</option>
              <option value={30}>30 ngày</option>
            </select>
          </div>

          {/* Aggregate KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 md:p-4">
            <Kpi
              label="Tổng trúng / dự đoán"
              value={`${backtest.total_hits}/${backtest.total_predicted}`}
              hint={`Top ${backtest.top_k} × ${backtest.days.length} ngày`}
            />
            <Kpi
              label="Tổng trúng / đã ra"
              value={`${backtest.total_hits}/${backtest.total_actual}`}
              hint="3-chân khác nhau"
            />
            <Kpi
              label="Hit rate (chính xác)"
              value={`${backtest.hit_rate_pct}%`}
              accent={backtest.hit_rate_pct >= backtest.baseline_pct * 1.5 ? "text-emerald-300" : backtest.hit_rate_pct >= backtest.baseline_pct ? "text-amber-300" : "text-rose-300"}
              hint={`Baseline ${backtest.baseline_pct}%`}
            />
            <Kpi
              label="Coverage"
              value={`${backtest.coverage_pct}%`}
              accent="text-cyan-300"
              hint="% bắt được số đã ra"
            />
            <Kpi
              label="Lift vs random"
              value={`${backtest.lift_vs_baseline}×`}
              accent={backtest.lift_vs_baseline >= 1.5 ? "text-emerald-300" : backtest.lift_vs_baseline >= 1 ? "text-amber-300" : "text-rose-300"}
              hint="1.0 = bằng random"
            />
          </div>

          {/* Per-day table */}
          <div className="overflow-x-auto border-t border-white/[0.06]">
            <table className="w-full text-[0.72rem] md:text-xs">
              <thead className="bg-white/[0.03] text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2 text-center">Trúng/Top {backtest.top_k}</th>
                  <th className="px-3 py-2 text-center">Trúng/Đã ra</th>
                  <th className="px-3 py-2 text-center">Hit rate</th>
                  <th className="px-3 py-2 text-center">Coverage</th>
                  <th className="px-3 py-2 text-left">Số trúng</th>
                </tr>
              </thead>
              <tbody>
                {[...backtest.days].reverse().map((d) => {
                  const rowBg = d.hits >= 3
                    ? "bg-emerald-500/5 border-l-2 border-emerald-500"
                    : d.hits >= 1
                    ? "bg-amber-500/5 border-l-2 border-amber-500"
                    : "bg-rose-500/5 border-l-2 border-rose-500";
                  return (
                    <tr key={d.date} className={`${rowBg} border-t border-white/[0.04]`}>
                      <td className="px-3 py-2 font-mono text-slate-300 whitespace-nowrap">{d.date.slice(5)}</td>
                      <td className="px-3 py-2 text-center font-mono font-bold text-slate-100">
                        {d.hits}/{backtest.top_k}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-slate-300">
                        {d.hits}/{d.actual_count}
                      </td>
                      <td className={`px-3 py-2 text-center font-mono ${d.hit_rate_pct >= backtest.baseline_pct ? "text-emerald-400" : "text-rose-400"}`}>
                        {d.hit_rate_pct}%
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-cyan-300">
                        {d.coverage_pct}%
                      </td>
                      <td className="px-3 py-2 font-mono text-emerald-200">
                        {d.hit_picks.length === 0 ? <span className="text-slate-600">—</span> : d.hit_picks.slice(0, 10).join(" ")}
                        {d.hit_picks.length > 10 && <span className="text-slate-500"> …</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Top picks grid */}
      <section className="rounded-2xl bg-[#0f1722] border border-slate-700/50 overflow-hidden">
        <div className="px-4 md:px-6 py-3 border-b border-white/[0.06]">
          <h3 className="text-sm md:text-base font-bold">🏆 Top {topK} dự đoán 3 chân</h3>
          <p className="text-[0.65rem] text-slate-400 mt-0.5">
            Baseline đồng đều = 0.1% mỗi số (1/1000). Top {topK} sẽ rất cao hơn nếu model tin cậy.
          </p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5 md:gap-2 p-3 md:p-4">
          {data.predictions.slice(0, topK).map((p) => {
            const rankClass =
              p.rank === 1
                ? "border-amber-400/70 bg-amber-500/15"
                : p.rank === 2
                ? "border-slate-300/40 bg-slate-300/5"
                : p.rank === 3
                ? "border-orange-400/40 bg-orange-500/10"
                : p.rank <= 5
                ? "border-pink-500/40 bg-pink-500/10"
                : p.rank <= 10
                ? "border-fuchsia-500/30 bg-fuchsia-500/5"
                : "border-white/[0.08] bg-white/[0.02]";

            const breakdownTitle = Object.entries(p.breakdown)
              .map(([k, v]) => `${MODEL_LABEL[k] ?? k}: ${v.toFixed(3)}`)
              .join(" • ");

            return (
              <div
                key={p.number}
                title={`Rank #${p.rank} • ${p.probability.toFixed(2)}% • ${breakdownTitle}`}
                className={`rounded-lg border ${rankClass} p-2 text-center hover:scale-105 transition-transform cursor-pointer`}
              >
                <div className="text-[0.55rem] font-mono font-bold text-slate-500">
                  #{p.rank}
                </div>
                <div className="font-mono text-base md:text-lg font-extrabold text-white leading-none my-0.5">
                  {p.number}
                </div>
                <div className="font-mono text-[0.6rem] font-bold text-pink-300">
                  {p.probability.toFixed(2)}%
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.04] border border-slate-700/40 p-2.5">
      <div className="text-[0.6rem] text-slate-400 uppercase font-semibold">{label}</div>
      <div className={`font-mono font-extrabold text-base md:text-lg mt-0.5 ${accent ?? "text-slate-100"}`}>
        {value}
      </div>
      {hint && <div className="text-[0.6rem] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}
