"use client";

import { useEffect, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";
import { useToast } from "./Toast";
import PatternFilterPanel from "./PatternFilterPanel";

interface ThreeItem {
  rank: number;
  number: string;
  probability: number;
  composite_score: number;
  breakdown: Record<string, number>;
}

interface ThreeModelTopPick {
  rank: number;
  number: string;
  norm_score: number;
}

interface ThreeModelBreakdown {
  key: string;
  label: string;
  question: string;
  weight: number;
  top_picks: ThreeModelTopPick[];
}

interface ThreeConsensusItem {
  number: string;
  appearances_in_top: number;
  models: string[];
}

interface ThreeResponse {
  status: string;
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  weights: Record<string, number>;
  predictions: ThreeItem[];
  total_models: number;
  consensus_threshold: number;
  models: ThreeModelBreakdown[];
  consensus: ThreeConsensusItem[];
  controversial: ThreeConsensusItem[];
}

const MODEL_COLOR: Record<string, { border: string; bg: string; text: string }> = {
  frequency: { border: "border-blue-500/40", bg: "bg-blue-500/10", text: "text-blue-300" },
  recency: { border: "border-cyan-500/40", bg: "bg-cyan-500/10", text: "text-cyan-300" },
  dayOfWeek: { border: "border-teal-500/40", bg: "bg-teal-500/10", text: "text-teal-300" },
  temperature: { border: "border-orange-500/40", bg: "bg-orange-500/10", text: "text-orange-300" },
  streak: { border: "border-rose-500/40", bg: "bg-rose-500/10", text: "text-rose-300" },
  digitFreq: { border: "border-fuchsia-500/40", bg: "bg-fuchsia-500/10", text: "text-fuchsia-300" },
  loBorrow: { border: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-300" },
  pairFreq: { border: "border-purple-500/40", bg: "bg-purple-500/10", text: "text-purple-300" },
};

interface BacktestDay {
  date: string;
  predicted_top: string[];
  actual_count: number;
  hits: number;
  hit_picks: string[];
  total_occurrences: number;
  hit_rate_pct: number;
  coverage_pct: number;
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
}

interface TierStat {
  range_start: number;
  range_end: number;
  label: string;
  picks_per_day: number;
  total_predicted: number;
  total_hits: number;
  total_occurrences: number;
  hit_rate_pct: number;
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
  roi_pct: number;
  hit_numbers: Array<{ number: string; days_hit: number; total_occ: number }>;
}

interface BacktestResponse {
  status: string;
  region: Region;
  days_window: number;
  top_k: number;
  baseline_pct: number;
  payout_per_hit_vnd: number;
  cost_per_pick_vnd: number;
  total_predicted: number;
  total_hits: number;
  total_occurrences: number;
  total_actual: number;
  hit_rate_pct: number;
  coverage_pct: number;
  lift_vs_baseline: number;
  total_cost_vnd: number;
  total_win_vnd: number;
  total_profit_vnd: number;
  roi_pct: number;
  break_even_occurrences_per_day: number;
  tiers: TierStat[];
  days: BacktestDay[];
}

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
}

function fmtVndShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "tỷ";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "tr";
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return Math.round(n).toString();
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
  const [windowDays, setWindowDays] = useState(120);
  const [topK, setTopK] = useState(30);
  const [backtestDays, setBacktestDays] = useState(14);
  const [payout, setPayout] = useState(600_000);

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
    fetch(`/api/predict/three/backtest?region=${region}&days=${backtestDays}&top_k=${topK}&window=${windowDays}&payout=${payout}`)
      .then((r) => r.json())
      .then((d) => setBacktest(d))
      .catch(() => setBacktest(null))
      .finally(() => setBacktestLoading(false));
  }, [region, windowDays, topK, backtestDays, payout]);

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

  async function copy(nums: string[], label: string) {
    if (nums.length === 0) return;
    try {
      await navigator.clipboard.writeText(nums.join(" "));
      toast.show("success", `Copy ${label}: ${nums.length} số`);
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
              <option value={120}>120 ngày</option>
              <option value={180}>180 ngày (max)</option>
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

          {/* Money/Profit panel */}
          <div className="border-t border-white/[0.06] p-3 md:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm md:text-base font-bold text-yellow-300">
                  💰 Lãi/Lỗ giả định (đánh 1 điểm × Top {backtest.top_k} mỗi ngày)
                </h4>
                <p className="text-[0.7rem] text-slate-400 mt-0.5">
                  Cost {fmtVnd(backtest.cost_per_pick_vnd)}/điểm • Thắng {fmtVnd(backtest.payout_per_hit_vnd)}/lần XH • Cần ≥ {backtest.break_even_occurrences_per_day} lần XH/ngày để hoà
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.7rem] text-slate-400">Tỉ lệ payout:</span>
                <select
                  value={payout}
                  onChange={(e) => setPayout(parseInt(e.target.value))}
                  className="px-2 py-1 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
                >
                  <option value={400_000}>400k (dealer chặt)</option>
                  <option value={500_000}>500k</option>
                  <option value={600_000}>600k (trung bình)</option>
                  <option value={700_000}>700k (dealer tốt)</option>
                  <option value={800_000}>800k</option>
                </select>
              </div>
            </div>

            {/* 4 money KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi
                label="Tổng chi"
                value={fmtVndShort(backtest.total_cost_vnd)}
                hint={`${backtest.top_k} × ${backtest.days.length} ngày`}
                accent="text-slate-200"
              />
              <Kpi
                label="Tổng trúng"
                value={fmtVndShort(backtest.total_win_vnd)}
                hint={`${backtest.total_occurrences} lần XH`}
                accent="text-emerald-300"
              />
              <Kpi
                label="Lãi / Lỗ"
                value={(backtest.total_profit_vnd >= 0 ? "+" : "") + fmtVndShort(backtest.total_profit_vnd)}
                accent={backtest.total_profit_vnd >= 0 ? "text-emerald-300" : "text-rose-300"}
              />
              <Kpi
                label="ROI"
                value={`${backtest.roi_pct >= 0 ? "+" : ""}${backtest.roi_pct}%`}
                accent={backtest.roi_pct >= 5 ? "text-emerald-300" : backtest.roi_pct >= 0 ? "text-amber-300" : "text-rose-300"}
                hint={backtest.roi_pct >= 0 ? "✅ Có lời" : "❌ Đang lỗ"}
              />
            </div>

            {/* AI conclusion */}
            <div className="mt-3 rounded bg-white/[0.03] border-l-2 border-yellow-400/50 px-3 py-2">
              <p className="text-[0.75rem] md:text-sm text-slate-200">
                💡 {backtest.roi_pct >= 10
                  ? `LỜI tốt — ROI ${backtest.roi_pct}% qua ${backtest.days.length} ngày. Nếu data ổn định, đánh top ${backtest.top_k} mỗi ngày SẼ LỜI.`
                  : backtest.roi_pct >= 0
                  ? `HOÀ vốn / lãi mỏng — ROI ${backtest.roi_pct}%. Tăng payout dealer hoặc thử Top khác để xem có cải thiện không.`
                  : `LỖ — ROI ${backtest.roi_pct}%. Hit rate ${backtest.hit_rate_pct}% chưa đủ vượt break-even. Cần dealer payout cao hơn hoặc model chính xác hơn.`}
              </p>
            </div>
          </div>

          {/* Tier breakdown — chia theo Top 1-10, 11-20, 21-30, ... */}
          {backtest.tiers && backtest.tiers.length > 0 && (
            <div className="border-t border-white/[0.06] p-3 md:p-4">
              <div className="mb-3">
                <h4 className="text-sm md:text-base font-bold text-pink-300">
                  📊 Tỉ lệ trúng theo khoảng Top
                </h4>
                <p className="text-[0.7rem] text-slate-400 mt-0.5">
                  Chia Top {backtest.top_k} thành các khúc 10 → xem số nào trúng ở mỗi khúc
                </p>
              </div>
              <div className="space-y-2.5">
                {backtest.tiers.map((t) => {
                  const wrap = t.hit_rate_pct >= backtest.baseline_pct * 1.5
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : t.hit_rate_pct >= backtest.baseline_pct
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-rose-500/40 bg-rose-500/5";
                  const hitColor = t.hit_rate_pct >= backtest.baseline_pct
                    ? "text-emerald-300"
                    : "text-rose-300";
                  return (
                    <div key={t.range_start} className={`rounded-xl border ${wrap} p-3`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <span className="font-mono font-bold text-sm md:text-base text-slate-100">
                            {t.label}
                          </span>
                          <span className="text-[0.7rem] text-slate-400">
                            <b className="text-slate-100">{t.total_hits}</b>/{t.total_predicted} trúng
                            <span className="mx-1">•</span>
                            <b className="text-amber-300">{t.total_occurrences}</b> lần XH
                            <span className="mx-1">•</span>
                            Hit rate <b className={hitColor}>{t.hit_rate_pct}%</b>
                          </span>
                        </div>
                        <span className="text-[0.6rem] text-slate-500 italic">
                          (số đã ra trong period — xem thôi)
                        </span>
                      </div>
                      {t.hit_numbers.length === 0 ? (
                        <p className="text-[0.7rem] text-slate-500 italic">Không có số nào trúng trong khúc này</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {t.hit_numbers.map((h) => (
                            <span
                              key={h.number}
                              title={`${h.number}: trúng ${h.days_hit} ngày, tổng ${h.total_occ} lần XH`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-100 font-mono font-bold text-xs"
                            >
                              {h.number}
                              {h.total_occ > 1 && (
                                <span className="text-[0.6rem] text-emerald-300 font-normal">×{h.total_occ}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[0.7rem] text-slate-400 italic mt-2">
                💡 Khúc nào trúng nhiều = khúc đó AI đoán giỏi. Khúc xanh = vượt baseline, đỏ = dưới baseline.
              </p>

              {/* DỰ ĐOÁN ĐÁNH — chia theo khúc, copy được */}
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <div className="mb-2">
                  <h5 className="text-sm font-bold text-yellow-300">
                    🎯 Dự đoán đánh — chia theo khúc Top
                  </h5>
                  <p className="text-[0.7rem] text-slate-400 mt-0.5">
                    Đây là Top {data.predictions.length > backtest.top_k ? backtest.top_k : data.predictions.length} dự đoán cho ngày tới, chia khúc 10. <b className="text-yellow-300">Bấm Copy để đánh.</b>
                  </p>
                </div>
                <div className="space-y-2">
                  {backtest.tiers.map((t) => {
                    const tierPicks = data.predictions
                      .slice(t.range_start - 1, t.range_end)
                      .map((p) => p.number);
                    return (
                      <div
                        key={`pred-${t.range_start}`}
                        className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-2.5"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
                          <span className="font-mono font-bold text-sm text-yellow-200">
                            {t.label} dự đoán
                            <span className="ml-1.5 text-[0.65rem] text-slate-400 font-normal">
                              ({tierPicks.length} số)
                            </span>
                          </span>
                          <button
                            onClick={() => copy(tierPicks, `Dự đoán ${t.label}`)}
                            disabled={tierPicks.length === 0}
                            className="px-2.5 py-1 text-[0.65rem] rounded bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold disabled:opacity-40"
                          >
                            📋 Copy {tierPicks.length}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 font-mono text-sm">
                          {tierPicks.map((n) => (
                            <span
                              key={n}
                              className="inline-block px-2 py-0.5 rounded bg-yellow-500/15 border border-yellow-400/40 text-yellow-100 font-bold"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Per-day table */}
          <div className="overflow-x-auto border-t border-white/[0.06]">
            <table className="w-full text-[0.72rem] md:text-xs">
              <thead className="bg-white/[0.03] text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2 text-center">Trúng/Top {backtest.top_k}</th>
                  <th className="px-3 py-2 text-center">Trúng/Đã ra</th>
                  <th className="px-3 py-2 text-center">Lần XH</th>
                  <th className="px-3 py-2 text-center">Hit rate</th>
                  <th className="px-3 py-2 text-right">Lãi/Lỗ</th>
                  <th className="px-3 py-2 text-left">Số trúng</th>
                </tr>
              </thead>
              <tbody>
                {[...backtest.days].reverse().map((d) => {
                  const profitC = d.profit_vnd > 0
                    ? "text-emerald-300"
                    : d.profit_vnd < 0
                    ? "text-rose-300"
                    : "text-slate-400";
                  const rowBg = d.profit_vnd > 0
                    ? "bg-emerald-500/5 border-l-2 border-emerald-500"
                    : d.profit_vnd === 0
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
                      <td className="px-3 py-2 text-center font-mono text-amber-300">
                        {d.total_occurrences}
                      </td>
                      <td className={`px-3 py-2 text-center font-mono ${d.hit_rate_pct >= backtest.baseline_pct ? "text-emerald-400" : "text-rose-400"}`}>
                        {d.hit_rate_pct}%
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${profitC}`}>
                        {d.profit_vnd >= 0 ? "+" : ""}{fmtVndShort(d.profit_vnd)}
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

      {/* Consensus + Partial agreement grid */}
      {data.models.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-4 md:mt-6">
          {/* Consensus */}
          <section className="rounded-2xl bg-emerald-900/15 border border-emerald-500/30 overflow-hidden">
            <div className="px-4 md:px-5 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-emerald-300">
                  🤝 Consensus (≥ {data.consensus_threshold}/{data.total_models} model)
                </h3>
                <p className="text-[0.7rem] text-slate-400 mt-0.5">
                  Số được nhiều model agree → tin cậy CAO
                </p>
              </div>
              <button
                onClick={() => copy(data.consensus.map((c) => c.number), "consensus 3-chân")}
                disabled={data.consensus.length === 0}
                className="px-2.5 py-1 text-[0.7rem] rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold disabled:opacity-50"
              >
                📋 Copy {data.consensus.length} số
              </button>
            </div>
            <div className="p-3 md:p-4 max-h-72 overflow-y-auto">
              {data.consensus.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-4">Không có consensus</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {data.consensus.map((c) => (
                    <span
                      key={c.number}
                      title={`${c.appearances_in_top}/${data.total_models} model: ${c.models.join(", ")}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-mono font-bold text-sm"
                    >
                      {c.number}
                      <span className="text-[0.6rem] opacity-70">×{c.appearances_in_top}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Partial agreement grouped 4/3/2 */}
          <section className="rounded-2xl bg-amber-900/15 border border-amber-500/30 overflow-hidden">
            <div className="px-4 md:px-5 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-bold text-amber-300">
                ⚠️ Một phần đồng thuận (2-4/{data.total_models} model)
              </h3>
              <p className="text-[0.7rem] text-slate-400 mt-0.5">
                Số có ít model agree → chia nhóm theo số tiêu chí. Nhóm 4 + 3 có thể trùng Consensus.
              </p>
            </div>
            <div className="p-3 md:p-4 max-h-72 overflow-y-auto space-y-3">
              {(() => {
                const buckets = [4, 3, 2];
                const groups = buckets.map((n) => ({
                  count: n,
                  items: data.controversial.filter((c) => c.appearances_in_top === n),
                }));
                if (groups.every((g) => g.items.length === 0)) {
                  return <p className="text-center text-slate-500 text-sm py-4">Không có nhóm nào</p>;
                }
                const bucketStyle: Record<number, { wrap: string; chip: string; btn: string; label: string }> = {
                  4: {
                    wrap: "border-emerald-500/40 bg-emerald-500/5",
                    chip: "bg-emerald-500/20 border-emerald-400/50 text-emerald-100",
                    btn: "bg-emerald-500 hover:bg-emerald-400",
                    label: "Mạnh — gần consensus",
                  },
                  3: {
                    wrap: "border-amber-500/40 bg-amber-500/5",
                    chip: "bg-amber-500/20 border-amber-400/50 text-amber-100",
                    btn: "bg-amber-500 hover:bg-amber-400",
                    label: "Khá đồng thuận",
                  },
                  2: {
                    wrap: "border-orange-500/30 bg-orange-500/[0.04]",
                    chip: "bg-orange-500/15 border-orange-400/40 text-orange-200",
                    btn: "bg-orange-500 hover:bg-orange-400",
                    label: "Yếu — vài model",
                  },
                };
                return groups.map((g) => {
                  const style = bucketStyle[g.count];
                  const nums = g.items.map((i) => i.number);
                  return (
                    <div key={g.count} className={`rounded-xl border ${style.wrap} p-2.5`}>
                      <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                        <div className="text-[0.7rem] font-bold text-slate-200">
                          🎯 {g.count}/{data.total_models} model agree
                          <span className="ml-1.5 text-[0.65rem] font-normal text-slate-400">
                            • {style.label} • {g.items.length} số
                          </span>
                        </div>
                        <button
                          onClick={() => copy(nums, `${g.count}/${data.total_models} model`)}
                          disabled={g.items.length === 0}
                          className={`px-2.5 py-1 text-[0.65rem] rounded ${style.btn} text-white font-bold disabled:opacity-50`}
                        >
                          📋 Copy {g.items.length}
                        </button>
                      </div>
                      {g.items.length === 0 ? (
                        <p className="text-[0.7rem] text-slate-500 italic">Không có số nào</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {g.items.map((c) => (
                            <span
                              key={c.number}
                              title={`${c.appearances_in_top}/${data.total_models} model: ${c.models.join(", ")}`}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono font-semibold text-xs ${style.chip}`}
                            >
                              {c.number}
                              <span className="text-[0.6rem] opacity-70">×{c.appearances_in_top}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </section>
        </div>
      )}

      {/* Per-model Top 10 cards */}
      {data.models.length > 0 && (
        <>
          <h3 className="text-sm md:text-base font-bold mt-4 md:mt-6 mb-3">
            🧪 Top 10 mỗi mô hình ({data.total_models} model)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {data.models.map((m, idx) => {
              const c = MODEL_COLOR[m.key] ?? MODEL_COLOR.frequency;
              const nums = m.top_picks.map((p) => p.number);
              return (
                <section
                  key={m.key}
                  className={`rounded-2xl bg-[#111827] border ${c.border} overflow-hidden flex flex-col`}
                >
                  <div className={`px-3 py-2.5 border-b border-white/[0.06] ${c.bg}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[0.65rem] font-mono font-bold ${c.text}`}>#{idx + 1}</span>
                      <h4 className="text-xs font-bold truncate">{m.label}</h4>
                      <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-white/[0.08] text-slate-300 font-mono">
                        {(m.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className={`text-[0.6rem] italic ${c.text}`}>"{m.question}"</p>
                  </div>
                  <div className="p-2.5 flex-1">
                    <div className="grid grid-cols-5 gap-1">
                      {m.top_picks.map((p) => (
                        <div
                          key={p.number}
                          title={`Rank #${p.rank} • score ${p.norm_score}`}
                          className={`rounded border ${c.border} ${c.bg} p-1 text-center`}
                        >
                          <div className="text-[0.5rem] font-mono text-slate-500">#{p.rank}</div>
                          <div className={`font-mono text-[0.7rem] font-extrabold ${c.text}`}>
                            {p.number}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="px-2.5 py-1.5 border-t border-white/[0.06] flex justify-end">
                    <button
                      onClick={() => copy(nums, m.label)}
                      className={`px-2 py-0.5 text-[0.6rem] rounded bg-white/[0.05] hover:bg-white/[0.1] ${c.text} font-semibold`}
                    >
                      📋 Copy 10
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* Pattern filter + Martingale + Sit-Out + Bet multiplier (shared component) */}
      <PatternFilterPanel
        predictions={data.predictions}
        topK={topK}
        backtest={backtest ? { days: backtest.days, top_k: backtest.top_k, baseline_pct: backtest.baseline_pct } : null}
        numberDigits={3}
        numberSpaceSize={1000}
        costPerPick={23_000}
        payoutPerHit={600_000}
        storagePrefix="three"
        label="3 Chân"
        unitOfPick="số"
      />
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
