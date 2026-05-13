"use client";

import { useEffect, useMemo, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useToast } from "./Toast";

function nextDateOf(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const nextMs = Date.UTC(y, m - 1, d) + 86_400_000;
  return new Date(nextMs).toISOString().slice(0, 10);
}

function todayVN(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

interface ModelTopPick {
  rank: number;
  lo_number: string;
  raw_score: number;
  norm_score: number;
}

interface ModelBreakdown {
  key: string;
  label: string;
  description: string;
  question: string;
  weight: number;
  top_picks: ModelTopPick[];
}

interface FinalPick {
  rank: number;
  lo_number: string;
  probability: number;
  composite_score: number;
  confidence: number;
  breakdown: Record<string, number>;
}

interface ConsensusItem {
  lo_number: string;
  appearances_in_top10: number;
  models: string[];
}

interface VipResponse {
  status: string;
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  model_weights: Record<string, number>;
  top_lift?: number;
  final: FinalPick[];
  models: ModelBreakdown[];
  consensus: ConsensusItem[];
  controversial: ConsensusItem[];
}

interface AdaptiveResponse {
  status: string;
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  adaptive_weights: Record<string, number>;
  previous_weights: Record<string, number>;
  raw_hit_rates: Record<string, number>;
  previous_hit_rates: Record<string, number>;
  performance_window_days: number;
  performance_days_with_data: number;
  previous_days_with_data: number;
  performance_avg_lift: number;
  using_default: boolean;
  predictions: FinalPick[];
}

interface ScorecardDay {
  date: string;
  predicted_top: string[];
  hits: number;
  total_occurrences: number;
  actual_lo_count: number;
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
  using_default: boolean;
}

interface ModelScorecardRow {
  key: string;
  label: string;
  hit_rate_avg: number;
  hit_rate_recent3: number;
  hit_rate_prev3: number;
  current_weight: number;
  rank: number;
  status: "good" | "ok" | "bad" | "no_data";
  trend: "up" | "down" | "flat";
  recommendation: string;
  suggest_mute: boolean;
}

interface ScorecardResponse {
  status: string;
  region: Region;
  days_window: number;
  top_n: number;
  point_value_vnd: number;
  win_multiplier: number;
  break_even_hits_per_day: number;
  baseline_hits_per_day: number;
  days: ScorecardDay[];
  total_cost_vnd: number;
  total_win_vnd: number;
  total_profit_vnd: number;
  roi_pct: number;
  avg_hits_per_day: number;
  days_with_data: number;
  models: ModelScorecardRow[];
  strategy_label: "good" | "neutral" | "bad" | "insufficient";
  strategy_message: string;
  strategy_action: string;
}

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
}

const MODEL_LABELS_FULL: Record<string, string> = {
  frequency: "Frequency",
  recency: "Recency",
  poisson: "Poisson Gap",
  markov: "Markov",
  temperature: "Temperature",
  pair: "Pair",
  streak: "Streak",
  mirror: "Mirror",
  dayOfWeek: "Day-of-Week",
  provinceOfDay: "Province-of-Day",
};

const MODEL_COLOR: Record<string, { border: string; bg: string; text: string }> = {
  frequency: { border: "border-blue-500/40", bg: "bg-blue-500/10", text: "text-blue-300" },
  recency: { border: "border-cyan-500/40", bg: "bg-cyan-500/10", text: "text-cyan-300" },
  poisson: { border: "border-purple-500/40", bg: "bg-purple-500/10", text: "text-purple-300" },
  markov: { border: "border-fuchsia-500/40", bg: "bg-fuchsia-500/10", text: "text-fuchsia-300" },
  temperature: { border: "border-orange-500/40", bg: "bg-orange-500/10", text: "text-orange-300" },
  pair: { border: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-300" },
  streak: { border: "border-rose-500/40", bg: "bg-rose-500/10", text: "text-rose-300" },
  mirror: { border: "border-amber-500/40", bg: "bg-amber-500/10", text: "text-amber-300" },
  dayOfWeek: { border: "border-teal-500/40", bg: "bg-teal-500/10", text: "text-teal-300" },
  provinceOfDay: { border: "border-lime-500/40", bg: "bg-lime-500/10", text: "text-lime-300" },
};

export default function PredictionVipPage({
  region,
  latestScraped,
}: {
  region: Region;
  latestScraped?: string | null;
}) {
  const today = todayVN();
  const hasToday = latestScraped === today;
  const predictionDate = hasToday ? nextDateOf(latestScraped ?? null) : today;
  const toast = useToast();
  const [data, setData] = useState<VipResponse | null>(null);
  const [adaptive, setAdaptive] = useState<AdaptiveResponse | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [adaptiveLoading, setAdaptiveLoading] = useState(true);
  const [scorecardLoading, setScorecardLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [windowDays, setWindowDays] = useState(90);
  const [scorecardDays, setScorecardDays] = useState(14);
  const [scorecardTopN, setScorecardTopN] = useState(10);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/predict/vip?region=${region}&window=${windowDays}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [region, windowDays]);

  useEffect(() => {
    setAdaptiveLoading(true);
    fetch(`/api/predict/adaptive?region=${region}&window=${windowDays}&perf=30`)
      .then((r) => r.json())
      .then((d) => setAdaptive(d))
      .catch(() => setAdaptive(null))
      .finally(() => setAdaptiveLoading(false));
  }, [region, windowDays]);

  useEffect(() => {
    setScorecardLoading(true);
    fetch(
      `/api/predict/adaptive/scorecard?region=${region}&days=${scorecardDays}&top_n=${scorecardTopN}&perf=30`
    )
      .then((r) => r.json())
      .then((d) => setScorecard(d))
      .catch(() => setScorecard(null))
      .finally(() => setScorecardLoading(false));
  }, [region, scorecardDays, scorecardTopN]);

  async function runBackfill() {
    if (backfilling) return;
    setBackfilling(true);
    try {
      const res = await fetch(`/api/backfill-performance?region=${region}&days=14&top_n=10`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.status === "success") {
        toast.show("success", `Backfill xong ${json.days_processed_per_region?.[region] ?? 0} ngày`);
        setAdaptiveLoading(true);
        setScorecardLoading(true);
        const [r1, r2] = await Promise.all([
          fetch(`/api/predict/adaptive?region=${region}&window=${windowDays}&perf=30`),
          fetch(`/api/predict/adaptive/scorecard?region=${region}&days=${scorecardDays}&top_n=${scorecardTopN}&perf=30`),
        ]);
        setAdaptive(await r1.json());
        setScorecard(await r2.json());
        setScorecardLoading(false);
      } else {
        toast.show("error", json.detail ?? "Backfill thất bại");
      }
    } catch {
      toast.show("error", "Lỗi khi backfill");
    } finally {
      setBackfilling(false);
      setAdaptiveLoading(false);
    }
  }

  const consensusLos = useMemo(() => data?.consensus.map((c) => c.lo_number) ?? [], [data]);

  async function copy(nums: string[], label: string) {
    if (nums.length === 0) return;
    try {
      await navigator.clipboard.writeText(nums.join(" "));
      toast.show("success", `Copy ${label}: ${nums.length} lô`);
    } catch {
      toast.show("error", "Trình duyệt không cho phép copy");
    }
  }

  if (loading) {
    return <div className="text-center py-20 text-slate-500">⏳ Đang chạy 9 model...</div>;
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
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-yellow-900/30 via-amber-900/20 to-orange-900/20 border border-yellow-500/40 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
              👑 Dự Đoán VIP — {REGION_LABELS[region]}
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              9 mô hình thống kê chạy song song • Top 10 mỗi model • Consensus + Controversial
            </p>
            <p className="text-[0.7rem] md:text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Data mới nhất:{" "}
                <span className={hasToday ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                  {latestScraped ? formatDate(latestScraped) : "Chưa có"}
                  {hasToday && " ✓"}
                </span>
              </span>
              {predictionDate && (
                <span>
                  • Dự đoán cho:{" "}
                  <span className="text-yellow-300 font-bold">{formatDate(predictionDate)}</span>
                </span>
              )}
              <span>• {data.days_available} ngày • Window {data.window_days} • Lift {data.top_lift}×</span>
            </p>
          </div>
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(parseInt(e.target.value))}
            className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
          >
            <option value={30}>30 ngày</option>
            <option value={45}>45 ngày</option>
            <option value={60}>60 ngày</option>
            <option value={90}>90 ngày (max)</option>
            <option value={180}>180 ngày</option>
          </select>
        </div>
      </section>

      {/* Final ensemble (top 10) */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-purple-900/30 to-fuchsia-900/20 border border-purple-500/40 overflow-hidden">
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm md:text-base font-bold">🏆 KẾT QUẢ TỔNG HỢP — Top 10</h3>
            <p className="text-[0.7rem] text-slate-400 mt-0.5">
              Weighted ensemble của 9 model → softmax (T=0.15)
            </p>
          </div>
          <button
            onClick={() => copy(data.final.slice(0, 10).map((p) => p.lo_number), "top 10 ensemble")}
            className="px-3 py-1.5 text-xs rounded bg-purple-500 hover:bg-purple-400 text-white font-bold"
          >
            📋 Copy Top 10
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-1.5 md:gap-2 p-3 md:p-4">
          {data.final.slice(0, 10).map((p) => (
            <div
              key={p.lo_number}
              className="rounded-lg border border-purple-400/40 bg-purple-500/10 p-2 text-center"
              title={`Rank #${p.rank} • ${p.probability.toFixed(2)}% • conf ${p.confidence}%`}
            >
              <div className="text-[0.55rem] font-mono font-bold text-slate-500">#{p.rank}</div>
              <div className="font-mono text-base md:text-xl font-extrabold text-white leading-none my-0.5">
                {p.lo_number}
              </div>
              <div className="font-mono text-[0.6rem] md:text-xs font-bold text-emerald-400">
                {p.probability.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Adaptive Smart — self-tuning weights */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-cyan-900/30 via-sky-900/20 to-indigo-900/20 border border-cyan-500/40 overflow-hidden">
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
              🤖 Adaptive Smart — Tự học từ accuracy
            </h3>
            <p className="text-[0.7rem] text-slate-400 mt-0.5">
              Trọng số {region === "xsmt" ? 10 : 9} model auto-điều chỉnh theo hit rate {adaptive?.performance_window_days ?? 30} ngày gần nhất
            </p>
          </div>
          <div className="flex items-center gap-2">
            {adaptive && !adaptive.warning && adaptive.predictions.length > 0 && (
              <button
                onClick={() =>
                  copy(adaptive.predictions.slice(0, 10).map((p) => p.lo_number), "top 10 adaptive")
                }
                className="px-3 py-1.5 text-xs rounded bg-cyan-500 hover:bg-cyan-400 text-white font-bold"
              >
                📋 Copy Top 10
              </button>
            )}
            <button
              onClick={runBackfill}
              disabled={backfilling}
              className="px-3 py-1.5 text-xs rounded bg-indigo-500 hover:bg-indigo-400 text-white font-bold disabled:opacity-50"
              title="Replay 14 ngày để bootstrap data accuracy"
            >
              {backfilling ? "⏳ Đang học..." : "🧠 Backfill 14d"}
            </button>
          </div>
        </div>

        {adaptiveLoading ? (
          <div className="text-center py-8 text-slate-500 text-sm">⏳ Đang tính adaptive...</div>
        ) : !adaptive || adaptive.warning ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            {adaptive?.warning ?? "Chưa có data adaptive"}
          </div>
        ) : (
          <>
            <div className="px-4 md:px-6 pt-3 flex flex-wrap items-center gap-2 text-[0.7rem]">
              {adaptive.using_default ? (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200">
                  ⚠️ Dùng default weights — bấm "Backfill" để học từ history
                </span>
              ) : (
                <>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200">
                    ✓ Học từ {adaptive.performance_days_with_data} ngày
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-200">
                    Lift TB: {adaptive.performance_avg_lift}× uniform
                  </span>
                </>
              )}
            </div>

            {/* Dynamic weights — horizontal bars with "was X%" comparison */}
            <div className="px-4 md:px-6 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[0.7rem] text-slate-400 font-semibold">
                  Trọng số HIỆN TẠI (auto-tuned):
                </div>
                <div className="text-[0.6rem] text-slate-500">
                  so với {adaptive.performance_window_days} ngày trước (
                  {adaptive.previous_days_with_data} ngày có data)
                </div>
              </div>
              {(() => {
                // provinceOfDay is MT-only — hide for MN/MB even if backend
                // returns it with weight 0.
                const filtered = Object.entries(adaptive.adaptive_weights).filter(
                  ([key]) => key !== "provinceOfDay" || region === "xsmt"
                );
                const maxW = Math.max(...filtered.map(([, w]) => w), 0.001);
                const sorted = filtered.sort((a, b) => b[1] - a[1]);
                return (
                  <div className="space-y-1">
                    {sorted.map(([key, w]) => {
                      const c = MODEL_COLOR[key] ?? MODEL_COLOR.frequency;
                      const pct = w * 100;
                      const prev = (adaptive.previous_weights[key] ?? 0) * 100;
                      const hasPrev = adaptive.previous_days_with_data > 0;
                      const delta = pct - prev;
                      const widthPct = (w / maxW) * 100;
                      const arrow = delta > 0.5 ? "↑" : delta < -0.5 ? "↓" : "→";
                      const arrowColor =
                        delta > 0.5
                          ? "text-emerald-400"
                          : delta < -0.5
                          ? "text-rose-400"
                          : "text-slate-500";
                      const hot = hasPrev && delta > 1.5;
                      return (
                        <div key={key} className="flex items-center gap-2 text-[0.7rem]">
                          <div className="w-20 md:w-24 text-slate-300 font-semibold flex-shrink-0">
                            {MODEL_LABELS_FULL[key] ?? key}
                          </div>
                          <div className="flex-1 h-4 md:h-5 rounded bg-white/[0.04] overflow-hidden border border-white/[0.05] relative">
                            <div
                              className={`h-full ${c.bg.replace("/10", "/40")} border-r ${c.border}`}
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          <div className="w-12 text-right font-mono font-bold text-white flex-shrink-0">
                            {pct.toFixed(1)}%
                          </div>
                          <div className="w-24 md:w-28 text-right font-mono text-[0.65rem] flex-shrink-0">
                            {hasPrev ? (
                              <>
                                <span className="text-slate-500">(was {prev.toFixed(1)}%)</span>{" "}
                                <span className={arrowColor}>{arrow}</span>
                              </>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </div>
                          {hot && (
                            <span
                              className="text-[0.6rem] text-rose-300 flex-shrink-0"
                              title="Model này gần đây hot"
                            >
                              🔥 hot
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Top 10 adaptive predictions */}
            <div className="px-4 md:px-6 pb-4">
              <div className="text-[0.7rem] text-slate-400 mb-1.5 font-semibold">Top 10 dự đoán:</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-1.5 md:gap-2">
                {adaptive.predictions.slice(0, 10).map((p) => (
                  <div
                    key={p.lo_number}
                    className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 p-2 text-center"
                    title={`Rank #${p.rank} • ${p.probability.toFixed(2)}% • conf ${p.confidence}%`}
                  >
                    <div className="text-[0.55rem] font-mono font-bold text-slate-500">#{p.rank}</div>
                    <div className="font-mono text-base md:text-xl font-extrabold text-white leading-none my-0.5">
                      {p.lo_number}
                    </div>
                    <div className="font-mono text-[0.6rem] md:text-xs font-bold text-cyan-300">
                      {p.probability.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── PANEL 3: Strategy banner (auto recommendation) ── */}
      {scorecardLoading ? (
        <div className="mb-4 md:mb-6 rounded-2xl border border-slate-600/40 p-4 text-center text-slate-500 text-sm">
          ⏳ Đang chấm điểm dự đoán...
        </div>
      ) : scorecard && scorecard.strategy_label ? (
        (() => {
          const colorMap = {
            good: { border: "border-emerald-500/50", bg: "from-emerald-900/40 to-green-900/20", text: "text-emerald-300", icon: "✅" },
            neutral: { border: "border-amber-500/50", bg: "from-amber-900/40 to-yellow-900/20", text: "text-amber-300", icon: "⚠️" },
            bad: { border: "border-rose-500/50", bg: "from-rose-900/40 to-red-900/20", text: "text-rose-300", icon: "❌" },
            insufficient: { border: "border-slate-500/50", bg: "from-slate-900/40 to-slate-800/20", text: "text-slate-300", icon: "ℹ️" },
          }[scorecard.strategy_label];
          return (
            <section className={`mb-4 md:mb-6 rounded-2xl bg-gradient-to-br ${colorMap.bg} border ${colorMap.border} p-4 md:p-5`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl md:text-3xl">{colorMap.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm md:text-base font-bold ${colorMap.text}`}>
                    💡 Chiến thuật khuyến nghị
                  </h3>
                  <p className="text-sm md:text-base font-semibold text-white mt-1">
                    {scorecard.strategy_message}
                  </p>
                  <p className="text-xs md:text-sm text-slate-300 mt-1">
                    {scorecard.strategy_action}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-2 text-[0.7rem] text-slate-400">
                    <span>Hit TB: <b className="text-white">{scorecard.avg_hits_per_day}</b>/{scorecard.top_n}</span>
                    <span>Cần ≥ <b className="text-amber-300">{scorecard.break_even_hits_per_day}</b> để hoà</span>
                    <span>Baseline (random): <b className="text-slate-500">{scorecard.baseline_hits_per_day}</b></span>
                    <span>{scorecard.days_with_data} ngày có data</span>
                  </div>
                </div>
              </div>
            </section>
          );
        })()
      ) : null}

      {/* ── PANEL 1: Bảng chấm điểm thực tế (per-day) ── */}
      {scorecard && scorecard.days.length > 0 && (
        <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-slate-700/50 overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
                📊 Bảng chấm điểm thực tế
              </h3>
              <p className="text-[0.7rem] text-slate-400 mt-0.5">
                Backtest: ngày X dùng weights tới ngày X-1, Top {scorecard.top_n} so với lô thực • Cost {fmtVnd(scorecard.point_value_vnd)}/điểm • Win {fmtVnd(scorecard.win_multiplier * 1000)}/lần xuất hiện
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={scorecardDays}
                onChange={(e) => setScorecardDays(parseInt(e.target.value))}
                className="px-2 py-1 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
              >
                <option value={7}>7 ngày</option>
                <option value={14}>14 ngày</option>
                <option value={21}>21 ngày</option>
                <option value={30}>30 ngày</option>
              </select>
              <select
                value={scorecardTopN}
                onChange={(e) => setScorecardTopN(parseInt(e.target.value))}
                className="px-2 py-1 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
              >
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
                <option value={15}>Top 15</option>
                <option value={20}>Top 20</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[0.72rem] md:text-xs">
              <thead className="bg-white/[0.03] text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2 text-left">Top {scorecard.top_n} đoán</th>
                  <th className="px-2 py-2 text-center">Hit</th>
                  <th className="px-2 py-2 text-center">Lần XH</th>
                  <th className="px-3 py-2 text-right">Chi</th>
                  <th className="px-3 py-2 text-right">Trúng</th>
                  <th className="px-3 py-2 text-right">Lãi/Lỗ</th>
                </tr>
              </thead>
              <tbody>
                {[...scorecard.days].reverse().map((d) => {
                  const breakeven = scorecard.break_even_hits_per_day;
                  const hitColor =
                    d.hits >= breakeven + 1
                      ? "bg-emerald-500/15 border-l-2 border-emerald-500"
                      : d.hits >= Math.ceil(breakeven)
                      ? "bg-amber-500/10 border-l-2 border-amber-500"
                      : "bg-rose-500/10 border-l-2 border-rose-500";
                  return (
                    <tr key={d.date} className={`${hitColor} border-t border-white/[0.04]`}>
                      <td className="px-3 py-2 font-mono text-slate-300 whitespace-nowrap">
                        {d.date.slice(5)}
                        {d.using_default && (
                          <span className="ml-1 text-[0.6rem] text-amber-400" title="Dùng equal weights (chưa có perf data)">⚙</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-200">
                        {d.predicted_top.join(" ")}
                      </td>
                      <td className={`px-2 py-2 text-center font-mono font-bold ${d.hits >= Math.ceil(breakeven) ? "text-emerald-300" : "text-rose-300"}`}>
                        {d.hits}/{scorecard.top_n}
                      </td>
                      <td className="px-2 py-2 text-center font-mono text-slate-400">
                        {d.total_occurrences}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">
                        {fmtVnd(d.cost_vnd)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">
                        {fmtVnd(d.win_vnd)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${d.profit_vnd >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {d.profit_vnd >= 0 ? "+" : ""}{fmtVnd(d.profit_vnd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-white/[0.04] border-t-2 border-white/[0.08] font-bold">
                <tr>
                  <td className="px-3 py-2.5 text-slate-200" colSpan={4}>
                    Tổng {scorecard.days_with_data} ngày — ROI{" "}
                    <span className={scorecard.roi_pct >= 0 ? "text-emerald-300" : "text-rose-300"}>
                      {scorecard.roi_pct >= 0 ? "+" : ""}{scorecard.roi_pct}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-200">
                    {fmtVnd(scorecard.total_cost_vnd)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-400">
                    {fmtVnd(scorecard.total_win_vnd)}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono ${scorecard.total_profit_vnd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {scorecard.total_profit_vnd >= 0 ? "+" : ""}{fmtVnd(scorecard.total_profit_vnd)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* ── PANEL 2: 9-model leaderboard ── */}
      {scorecard && scorecard.models.length > 0 && (
        <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-slate-700/50 overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06]">
            <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
              🎯 Bảng hiệu suất 9 model
            </h3>
            <p className="text-[0.7rem] text-slate-400 mt-0.5">
              Hit rate TB qua {scorecard.days_window} ngày • Break-even ={" "}
              <b className="text-amber-300">{(scorecard.break_even_hits_per_day / scorecard.top_n * 100).toFixed(0)}%</b>{" "}
              • Tốt ≥ 30% • Tệ &lt; break-even
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.72rem] md:text-xs">
              <thead className="bg-white/[0.03] text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-center">Hit rate TB</th>
                  <th className="px-3 py-2 text-center">3 ngày gần</th>
                  <th className="px-3 py-2 text-center">Trend</th>
                  <th className="px-3 py-2 text-center">Weight hiện tại</th>
                  <th className="px-3 py-2 text-center">Trạng thái</th>
                  <th className="px-3 py-2 text-left">Khuyến nghị</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.models.map((m) => {
                  const c = MODEL_COLOR[m.key] ?? MODEL_COLOR.frequency;
                  const statusBadge = {
                    good: { bg: "bg-emerald-500/20", text: "text-emerald-300", label: "✅ Tốt" },
                    ok: { bg: "bg-amber-500/20", text: "text-amber-300", label: "⚠️ Tạm" },
                    bad: { bg: "bg-rose-500/20", text: "text-rose-300", label: "❌ Kém" },
                    no_data: { bg: "bg-slate-500/20", text: "text-slate-400", label: "— Trống" },
                  }[m.status];
                  const trendIcon = m.trend === "up" ? "📈" : m.trend === "down" ? "📉" : "➡️";
                  const trendColor = m.trend === "up" ? "text-emerald-400" : m.trend === "down" ? "text-rose-400" : "text-slate-500";
                  const breakeven = scorecard.break_even_hits_per_day / scorecard.top_n;
                  const hrPct = m.hit_rate_avg * 100;
                  const barPct = Math.min(100, (m.hit_rate_avg / 0.5) * 100); // scale 0..50% → 0..100% bar
                  return (
                    <tr key={m.key} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-3 py-2 font-mono font-bold text-slate-400">{m.rank}</td>
                      <td className={`px-3 py-2 font-bold ${c.text}`}>{m.label}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-white/[0.04] rounded overflow-hidden border border-white/[0.05] min-w-[60px]">
                            <div
                              className={`h-full ${m.hit_rate_avg >= 0.30 ? "bg-emerald-500" : m.hit_rate_avg >= breakeven ? "bg-amber-500" : "bg-rose-500"}`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-white w-10 text-right">{hrPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-slate-300">
                        {(m.hit_rate_recent3 * 100).toFixed(0)}%
                      </td>
                      <td className={`px-3 py-2 text-center ${trendColor}`}>{trendIcon}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-200">
                        {(m.current_weight * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[0.65rem] font-bold ${statusBadge.bg} ${statusBadge.text}`}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-[0.7rem] ${m.suggest_mute ? "text-rose-300 font-semibold" : "text-slate-300"}`}>
                        {m.suggest_mute && "🔇 "}{m.recommendation}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Consensus + Controversial */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
        <section className="rounded-2xl bg-emerald-900/15 border border-emerald-500/30 overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-emerald-300">
                🤝 Consensus (≥ {region === "xsmn" ? 5 : region === "xsmb" ? 4 : 3}/{region === "xsmt" ? 10 : 9} model)
              </h3>
              <p className="text-[0.7rem] text-slate-400 mt-0.5">
                Lô được nhiều model agree → tin cậy CAO
                {region !== "xsmn" && (
                  <span className="text-amber-400/80"> • Ngưỡng hạ vì {region === "xsmb" ? "MB" : "MT"} dự đoán yếu hơn</span>
                )}
              </p>
            </div>
            <button
              onClick={() => copy(consensusLos, "consensus")}
              disabled={consensusLos.length === 0}
              className="px-2.5 py-1 text-[0.7rem] rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold disabled:opacity-50"
            >
              📋 Copy {consensusLos.length} lô
            </button>
          </div>
          <div className="p-3 md:p-4">
            {data.consensus.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-4">Không có consensus</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.consensus.map((c) => (
                  <span
                    key={c.lo_number}
                    title={`${c.appearances_in_top10}/9 model: ${c.models.join(", ")}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-mono font-bold text-sm"
                  >
                    {c.lo_number}
                    <span className="text-[0.6rem] opacity-70">×{c.appearances_in_top10}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-amber-900/15 border border-amber-500/30 overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-bold text-amber-300">
              ⚠️ Một phần đồng thuận (2-4/{region === "xsmt" ? 10 : 9} model)
            </h3>
            <p className="text-[0.7rem] text-slate-400 mt-0.5">
              Lô có ít model agree → chia nhóm theo số tiêu chí đạt được. Càng nhiều model agree càng tin cậy hơn.
              {region !== "xsmn" && (
                <span className="text-slate-500"> • Nhóm 4 và 3 có thể trùng với Consensus (ngưỡng {region === "xsmb" ? 4 : 3})</span>
              )}
            </p>
          </div>
          <div className="p-3 md:p-4 max-h-72 overflow-y-auto space-y-3">
            {(() => {
              // Always show all 3 buckets [4, 3, 2] regardless of region — gives
              // a clear "by agreement count" view. Consensus card shows the
              // ≥ threshold UNION; this panel shows the per-count breakdown.
              const totalModels = region === "xsmt" ? 10 : 9;
              const buckets = [4, 3, 2];
              const groups = buckets.map((n) => ({
                count: n,
                items: data.controversial.filter((c) => c.appearances_in_top10 === n),
              }));
              const total = groups.reduce((s, g) => s + g.items.length, 0);
              if (total === 0) {
                return (
                  <p className="text-center text-slate-500 text-sm py-4">
                    Không có lô nào trong nhóm này
                  </p>
                );
              }
              // Color intensity scales with count (more agreement → bolder)
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
                  label: "Yếu — chỉ vài model",
                },
              };
              return groups.map((g) => {
                const style = bucketStyle[g.count];
                const nums = g.items.map((i) => i.lo_number);
                return (
                  <div
                    key={g.count}
                    className={`rounded-xl border ${style.wrap} p-2.5`}
                  >
                    <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                      <div className="text-[0.7rem] font-bold text-slate-200">
                        🎯 {g.count}/{totalModels} model agree
                        <span className="ml-1.5 text-[0.65rem] font-normal text-slate-400">
                          • {style.label} • {g.items.length} lô
                        </span>
                      </div>
                      <button
                        onClick={() => copy(nums, `${g.count}/9 model`)}
                        disabled={g.items.length === 0}
                        className={`px-2.5 py-1 text-[0.65rem] rounded ${style.btn} text-white font-bold disabled:opacity-50`}
                      >
                        📋 Copy {g.items.length}
                      </button>
                    </div>
                    {g.items.length === 0 ? (
                      <p className="text-[0.7rem] text-slate-500 italic">Không có lô nào</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {g.items.map((c) => (
                          <span
                            key={c.lo_number}
                            title={`${c.appearances_in_top10}/9 model: ${c.models.join(", ")}`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono font-semibold text-xs ${style.chip}`}
                          >
                            {c.lo_number}
                            <span className="text-[0.6rem] opacity-70">×{c.appearances_in_top10}</span>
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

      {/* 9 model cards */}
      <h3 className="text-sm md:text-base font-bold mb-3">🧪 Top 10 mỗi mô hình</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.models.map((m, idx) => {
          const c = MODEL_COLOR[m.key] ?? MODEL_COLOR.frequency;
          const top10Nums = m.top_picks.map((p) => p.lo_number);
          return (
            <section
              key={m.key}
              className={`rounded-2xl bg-[#111827] border ${c.border} overflow-hidden flex flex-col`}
            >
              <div className={`px-4 py-3 border-b border-white/[0.06] ${c.bg}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[0.7rem] font-mono font-bold ${c.text}`}>
                        #{idx + 1}
                      </span>
                      <h4 className="text-sm font-bold truncate">{m.label}</h4>
                      <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-white/[0.08] text-slate-300 font-mono">
                        {(m.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[0.65rem] text-slate-400 mt-1">{m.description}</p>
                    <p className={`text-[0.65rem] mt-0.5 italic ${c.text}`}>"{m.question}"</p>
                  </div>
                </div>
              </div>

              <div className="p-3 flex-1">
                <div className="grid grid-cols-5 gap-1.5">
                  {m.top_picks.map((p) => (
                    <div
                      key={p.lo_number}
                      title={`Rank #${p.rank} • score ${p.norm_score.toFixed(3)}`}
                      className={`rounded border ${c.border} ${c.bg} p-1.5 text-center`}
                    >
                      <div className="text-[0.55rem] font-mono font-bold text-slate-500">
                        #{p.rank}
                      </div>
                      <div className={`font-mono text-sm font-extrabold ${c.text}`}>
                        {p.lo_number}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-3 py-2 border-t border-white/[0.06] flex justify-end">
                <button
                  onClick={() => copy(top10Nums, m.label)}
                  className={`px-2.5 py-1 text-[0.7rem] rounded bg-white/[0.05] hover:bg-white/[0.1] ${c.text} font-semibold`}
                >
                  📋 Copy 10 lô
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
