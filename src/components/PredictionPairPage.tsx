"use client";

import { useEffect, useMemo, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";
import { useToast } from "./Toast";

interface PairItem {
  rank: number;
  lo_a: string;
  lo_b: string;
  combined_prob: number;
  p_a: number;
  p_b: number;
  cooccur_days: number;
  cooccur_lift: number;
  recent_boost: number;
  heat_score: number;
  pair_score: number;
}

interface PairComponentTopPick {
  rank: number;
  lo_a: string;
  lo_b: string;
  value: number;
}

interface PairComponentBreakdown {
  key: string;
  label: string;
  question: string;
  weight: number;
  top_picks: PairComponentTopPick[];
}

interface PairConsensusItem {
  lo_a: string;
  lo_b: string;
  appearances_in_top: number;
  components: string[];
}

interface PairResponse {
  status: string;
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  top_n_source: number;
  pairs: PairItem[];
  total_components: number;
  consensus_threshold: number;
  components: PairComponentBreakdown[];
  consensus: PairConsensusItem[];
  controversial: PairConsensusItem[];
}

const COMPONENT_COLOR: Record<string, { border: string; bg: string; text: string }> = {
  combined: { border: "border-blue-500/40", bg: "bg-blue-500/10", text: "text-blue-300" },
  cooccur: { border: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-300" },
  recent: { border: "border-orange-500/40", bg: "bg-orange-500/10", text: "text-orange-300" },
  heat: { border: "border-rose-500/40", bg: "bg-rose-500/10", text: "text-rose-300" },
};

interface BacktestDay {
  date: string;
  predicted_pairs: Array<{ lo_a: string; lo_b: string }>;
  actual_lo_count: number;
  actual_total_pairs: number;
  hits: number;
  hit_pairs: Array<{ lo_a: string; lo_b: string }>;
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
  hit_rate_pct: number;
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
  roi_pct: number;
}

interface BacktestResponse {
  status: string;
  region: Region;
  days_window: number;
  top_k: number;
  payout_per_hit_vnd: number;
  cost_per_pick_vnd: number;
  total_predicted: number;
  total_hits: number;
  total_actual_pairs: number;
  hit_rate_pct: number;
  coverage_pct: number;
  days_with_at_least_one_hit: number;
  total_cost_vnd: number;
  total_win_vnd: number;
  total_profit_vnd: number;
  roi_pct: number;
  break_even_hits_per_day: number;
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

export default function PredictionPairPage({ region }: { region: Region }) {
  const toast = useToast();
  const [data, setData] = useState<PairResponse | null>(null);
  const [backtest, setBacktest] = useState<BacktestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [backtestLoading, setBacktestLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(120);
  const [topNSource, setTopNSource] = useState(35);
  const [topKReturn, setTopKReturn] = useState(30);
  const [backtestDays, setBacktestDays] = useState(14);
  const [payout, setPayout] = useState(17);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/predict/pair?region=${region}&window=${windowDays}&top_n=${topNSource}&top_k=${topKReturn}`
    )
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [region, windowDays, topNSource, topKReturn]);

  useEffect(() => {
    setBacktestLoading(true);
    fetch(
      `/api/predict/pair/backtest?region=${region}&days=${backtestDays}&top_k=${topKReturn}&window=${windowDays}&top_n=${topNSource}&payout=${payout}`
    )
      .then((r) => r.json())
      .then((d) => setBacktest(d))
      .catch(() => setBacktest(null))
      .finally(() => setBacktestLoading(false));
  }, [region, windowDays, topNSource, topKReturn, backtestDays, payout]);

  const top10 = useMemo(() => data?.pairs.slice(0, 10) ?? [], [data]);

  async function copyAll() {
    if (!data || data.pairs.length === 0) return;
    const txt = data.pairs.map((p) => `${p.lo_a}-${p.lo_b}`).join(", ");
    try {
      await navigator.clipboard.writeText(txt);
      toast.show("success", `Copy ${data.pairs.length} cặp`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  async function copyTop10() {
    if (top10.length === 0) return;
    const txt = top10.map((p) => `${p.lo_a}-${p.lo_b}`).join(", ");
    try {
      await navigator.clipboard.writeText(txt);
      toast.show("success", `Copy top 10 cặp`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  async function copy(items: string[], label: string) {
    if (items.length === 0) return;
    try {
      await navigator.clipboard.writeText(items.join(", "));
      toast.show("success", `Copy ${label}: ${items.length}`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  if (loading) {
    return <div className="text-center py-20 text-slate-500">⏳ Đang ghép cặp...</div>;
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
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-orange-900/30 via-red-900/20 to-rose-900/20 border border-orange-500/40 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
              🎯 Dự Đoán Đá — {REGION_LABELS[region]}
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              Cặp 2 lô — cả 2 phải về cùng 1 buổi mới ăn • Top {topNSource} VIP × pair co-occurrence boost
            </p>
            <p className="text-[0.7rem] md:text-xs text-slate-400 mt-1">
              {data.days_available} ngày data • {data.pairs.length} cặp đề xuất
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
              value={topNSource}
              onChange={(e) => setTopNSource(parseInt(e.target.value))}
              title="Số lô nguồn từ VIP để ghép cặp (C(N,2) cặp)"
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={20}>Top 20 lô nguồn</option>
              <option value={25}>Top 25 lô nguồn</option>
              <option value={30}>Top 30 lô nguồn</option>
              <option value={35}>Top 35 lô nguồn</option>
              <option value={40}>Top 40 lô nguồn</option>
              <option value={50}>Top 50 lô nguồn</option>
            </select>
            <select
              value={topKReturn}
              onChange={(e) => setTopKReturn(parseInt(e.target.value))}
              title="Số cặp trả về cao nhất"
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={10}>Top 10 cặp</option>
              <option value={20}>Top 20 cặp</option>
              <option value={30}>Top 30 cặp</option>
              <option value={40}>Top 40 cặp</option>
              <option value={50}>Top 50 cặp</option>
            </select>
            <button
              onClick={copyTop10}
              className="px-3 py-1.5 text-xs rounded bg-orange-500 hover:bg-orange-400 text-white font-bold"
            >
              📋 Copy Top 10
            </button>
            <button
              onClick={copyAll}
              className="px-3 py-1.5 text-xs rounded bg-rose-500 hover:bg-rose-400 text-white font-bold"
            >
              📋 Copy hết
            </button>
          </div>
        </div>
      </section>

      {/* Backtest panel — pair accuracy */}
      {backtestLoading ? (
        <div className="mb-4 md:mb-6 rounded-2xl border border-slate-600/40 p-4 text-center text-slate-500 text-sm">
          ⏳ Đang backtest {backtestDays} ngày cặp...
        </div>
      ) : backtest && backtest.days.length > 0 ? (
        <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-orange-500/30 overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
                📊 Độ chính xác Đá (backtest {backtest.days.length} ngày)
              </h3>
              <p className="text-[0.7rem] text-slate-400 mt-0.5">
                "Trúng" = CẢ 2 lô trong cặp đều về cùng ngày đó. Replay từng ngày dùng data trước.
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
              label="Tổng cặp trúng / dự đoán"
              value={`${backtest.total_hits}/${backtest.total_predicted}`}
              hint={`Top ${backtest.top_k} × ${backtest.days.length} ngày`}
            />
            <Kpi
              label="Tổng cặp / tổng cặp thực"
              value={`${backtest.total_hits}/${backtest.total_actual_pairs}`}
              hint="cặp có thể tạo"
            />
            <Kpi
              label="Hit rate"
              value={`${backtest.hit_rate_pct}%`}
              accent={backtest.hit_rate_pct >= 5 ? "text-emerald-300" : backtest.hit_rate_pct >= 1 ? "text-amber-300" : "text-rose-300"}
              hint="% cặp đoán đúng"
            />
            <Kpi
              label="Coverage"
              value={`${backtest.coverage_pct}%`}
              accent="text-cyan-300"
              hint="% cặp thực bắt được"
            />
            <Kpi
              label="Ngày có ≥1 cặp"
              value={`${backtest.days_with_at_least_one_hit}/${backtest.days.length}`}
              accent={backtest.days_with_at_least_one_hit >= backtest.days.length * 0.5 ? "text-emerald-300" : "text-rose-300"}
              hint="ngày trúng ít nhất 1"
            />
          </div>

          {/* Money/Profit panel */}
          <div className="border-t border-white/[0.06] p-3 md:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm md:text-base font-bold text-yellow-300">
                  💰 Lãi/Lỗ giả định (đánh 1 điểm × Top {backtest.top_k} cặp/ngày)
                </h4>
                <p className="text-[0.7rem] text-slate-400 mt-0.5">
                  Cost {fmtVnd(backtest.cost_per_pick_vnd)}/điểm × Top {backtest.top_k} cặp = {fmtVnd(backtest.total_cost_vnd / Math.max(1, backtest.days.length))}/ngày • Thắng {fmtVnd(backtest.payout_per_hit_vnd)}/cặp • Cần ≥ {backtest.break_even_hits_per_day} cặp/ngày để hoà
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.7rem] text-slate-400">Tỉ lệ payout:</span>
                <select
                  value={payout}
                  onChange={(e) => setPayout(parseInt(e.target.value))}
                  className="px-2 py-1 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
                >
                  <option value={15}>15× (dealer chặt)</option>
                  <option value={17}>17× (trung bình)</option>
                  <option value={20}>20×</option>
                  <option value={22}>22× (dealer tốt)</option>
                  <option value={25}>25×</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi
                label="Tổng chi"
                value={fmtVndShort(backtest.total_cost_vnd)}
                hint={`${backtest.top_k} cặp × ${backtest.days.length} ngày`}
                accent="text-slate-200"
              />
              <Kpi
                label="Tổng trúng"
                value={fmtVndShort(backtest.total_win_vnd)}
                hint={`${backtest.total_hits} cặp ăn`}
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

            <div className="mt-3 rounded bg-white/[0.03] border-l-2 border-yellow-400/50 px-3 py-2">
              <p className="text-[0.75rem] md:text-sm text-slate-200">
                💡 {backtest.roi_pct >= 10
                  ? `LỜI tốt — ROI ${backtest.roi_pct}%. Đánh top ${backtest.top_k} cặp mỗi ngày là +EV.`
                  : backtest.roi_pct >= 0
                  ? `HOÀ vốn / lãi mỏng — ROI ${backtest.roi_pct}%. Thử payout cao hơn hoặc giảm Top K cho an toàn.`
                  : `LỖ — ROI ${backtest.roi_pct}%. Đá rất khó (cần cả 2 lô về). Giảm Top K xuống 10-15 để chỉ chơi cặp mạnh nhất, hoặc đợi data nhiều hơn.`}
              </p>
            </div>
          </div>

          {/* Tier breakdown — chia cặp theo Top 1-10, 11-20, 21-30, ... */}
          {backtest.tiers && backtest.tiers.length > 0 && (
            <div className="border-t border-white/[0.06] p-3 md:p-4">
              <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                <div>
                  <h4 className="text-sm md:text-base font-bold text-orange-300">
                    📊 Tỉ lệ trúng cặp theo khoảng Top
                  </h4>
                  <p className="text-[0.7rem] text-slate-400 mt-0.5">
                    Chia Top {backtest.top_k} cặp thành các khúc 10 → xem ROI mỗi khúc → chọn khúc đáng đánh
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[0.72rem] md:text-xs">
                  <thead className="bg-white/[0.03] text-slate-400 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Khúc</th>
                      <th className="px-3 py-2 text-center">Picks</th>
                      <th className="px-3 py-2 text-center">Trúng</th>
                      <th className="px-3 py-2 text-center">Hit rate</th>
                      <th className="px-3 py-2 text-right">Chi</th>
                      <th className="px-3 py-2 text-right">Trúng</th>
                      <th className="px-3 py-2 text-right">Lãi/Lỗ</th>
                      <th className="px-3 py-2 text-right">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtest.tiers.map((t) => {
                      const rowBg = t.roi_pct >= 10
                        ? "bg-emerald-500/8 border-l-2 border-emerald-500"
                        : t.roi_pct >= 0
                        ? "bg-amber-500/5 border-l-2 border-amber-500"
                        : "bg-rose-500/8 border-l-2 border-rose-500";
                      return (
                        <tr key={t.range_start} className={`${rowBg} border-t border-white/[0.04]`}>
                          <td className="px-3 py-2 font-mono font-bold text-slate-200">{t.label}</td>
                          <td className="px-3 py-2 text-center font-mono text-slate-300">{t.total_predicted}</td>
                          <td className="px-3 py-2 text-center font-mono font-bold text-slate-100">{t.total_hits}</td>
                          <td className={`px-3 py-2 text-center font-mono font-bold ${t.hit_rate_pct >= 5 ? "text-emerald-300" : t.hit_rate_pct >= 1 ? "text-amber-300" : "text-rose-300"}`}>
                            {t.hit_rate_pct}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-400">{fmtVndShort(t.cost_vnd)}</td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-400">{fmtVndShort(t.win_vnd)}</td>
                          <td className={`px-3 py-2 text-right font-mono font-bold ${t.profit_vnd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {t.profit_vnd >= 0 ? "+" : ""}{fmtVndShort(t.profit_vnd)}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-bold ${t.roi_pct >= 10 ? "text-emerald-300" : t.roi_pct >= 0 ? "text-amber-300" : "text-rose-300"}`}>
                            {t.roi_pct >= 0 ? "+" : ""}{t.roi_pct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[0.7rem] text-slate-400 italic mt-2">
                💡 <b>Cách đọc:</b> Khúc nào ROI cao = đáng đánh nhất. Top 1-10 thường có hit rate cao nhất vì rank model tin cậy nhất ở đầu.
              </p>
            </div>
          )}

          {/* Per-day table */}
          <div className="overflow-x-auto border-t border-white/[0.06]">
            <table className="w-full text-[0.72rem] md:text-xs">
              <thead className="bg-white/[0.03] text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2 text-center">Cặp trúng/Top {backtest.top_k}</th>
                  <th className="px-3 py-2 text-center">Lô về</th>
                  <th className="px-3 py-2 text-center">Cặp thực</th>
                  <th className="px-3 py-2 text-center">Hit rate</th>
                  <th className="px-3 py-2 text-right">Lãi/Lỗ</th>
                  <th className="px-3 py-2 text-left">Cặp trúng</th>
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
                      <td className="px-3 py-2 text-center font-mono text-slate-400">
                        {d.actual_lo_count}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-slate-400">
                        {d.actual_total_pairs}
                      </td>
                      <td className={`px-3 py-2 text-center font-mono ${d.hits > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {d.hit_rate_pct}%
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${profitC}`}>
                        {d.profit_vnd >= 0 ? "+" : ""}{fmtVndShort(d.profit_vnd)}
                      </td>
                      <td className="px-3 py-2 font-mono text-emerald-200">
                        {d.hit_pairs.length === 0
                          ? <span className="text-slate-600">—</span>
                          : d.hit_pairs.slice(0, 6).map((p) => `${p.lo_a}-${p.lo_b}`).join(", ")}
                        {d.hit_pairs.length > 6 && <span className="text-slate-500"> …</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Top 10 highlight */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-orange-500/30 overflow-hidden">
        <div className="px-4 md:px-6 py-3 border-b border-white/[0.06]">
          <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
            🏆 TOP 10 CẶP MẠNH NHẤT
          </h3>
          <p className="text-[0.65rem] text-slate-400 mt-0.5">
            Sắp xếp theo pair score = √(p_A × p_B) × cooccur boost (cap 3×)
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 md:p-4">
          {top10.map((p) => (
            <PairTile key={`${p.lo_a}-${p.lo_b}`} pair={p} highlight />
          ))}
        </div>
      </section>

      {/* All pairs grid */}
      <section className="rounded-2xl bg-[#0f1722] border border-slate-700/50 overflow-hidden">
        <div className="px-4 md:px-6 py-3 border-b border-white/[0.06]">
          <h3 className="text-sm md:text-base font-bold">📊 Tất cả {data.pairs.length} cặp đề xuất</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.72rem] md:text-xs">
            <thead className="bg-white/[0.03] text-slate-400 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Cặp</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">P(A)</th>
                <th className="px-3 py-2 text-right">P(B)</th>
                <th className="px-3 py-2 text-right">Combined</th>
                <th className="px-3 py-2 text-center">Cooccur</th>
                <th className="px-3 py-2 text-center">Lift</th>
              </tr>
            </thead>
            <tbody>
              {data.pairs.map((p) => {
                const liftColor = p.cooccur_lift >= 1.5
                  ? "text-emerald-300 font-bold"
                  : p.cooccur_lift >= 1
                  ? "text-amber-300"
                  : "text-slate-500";
                return (
                  <tr
                    key={`${p.lo_a}-${p.lo_b}`}
                    className="border-t border-white/[0.04] hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2 font-mono font-bold text-slate-400">{p.rank}</td>
                    <td className="px-3 py-2 font-mono text-base font-extrabold text-white">
                      {p.lo_a} <span className="text-slate-500">-</span> {p.lo_b}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-orange-300">
                      {p.pair_score.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                      {p.p_a.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                      {p.p_b.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-200">
                      {p.combined_prob.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-slate-300">
                      {p.cooccur_days}d
                    </td>
                    <td className={`px-3 py-2 text-center font-mono ${liftColor}`}>
                      {p.cooccur_lift}×
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Consensus + Controversial */}
      {data.components.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-4 md:mt-6">
          <section className="rounded-2xl bg-emerald-900/15 border border-emerald-500/30 overflow-hidden">
            <div className="px-4 md:px-5 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-emerald-300">
                  🤝 Consensus (≥ {data.consensus_threshold}/{data.total_components} tiêu chí)
                </h3>
                <p className="text-[0.7rem] text-slate-400 mt-0.5">
                  Cặp được nhiều tiêu chí cùng chọn → tin cậy CAO
                </p>
              </div>
              <button
                onClick={() => copy(data.consensus.map((c) => `${c.lo_a}-${c.lo_b}`), "consensus pair")}
                disabled={data.consensus.length === 0}
                className="px-2.5 py-1 text-[0.7rem] rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold disabled:opacity-50"
              >
                📋 Copy {data.consensus.length} cặp
              </button>
            </div>
            <div className="p-3 md:p-4 max-h-72 overflow-y-auto">
              {data.consensus.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-4">Không có consensus</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {data.consensus.map((c) => (
                    <span
                      key={`${c.lo_a}-${c.lo_b}`}
                      title={`${c.appearances_in_top}/${data.total_components} tiêu chí: ${c.components.join(", ")}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-mono font-bold text-sm"
                    >
                      {c.lo_a}-{c.lo_b}
                      <span className="text-[0.6rem] opacity-70">×{c.appearances_in_top}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-amber-900/15 border border-amber-500/30 overflow-hidden">
            <div className="px-4 md:px-5 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-bold text-amber-300">
                ⚠️ Yếu / Controversial
              </h3>
              <p className="text-[0.7rem] text-slate-400 mt-0.5">
                Cặp chỉ vài tiêu chí chọn → ít tin cậy hơn, có thể "ngon" theo 1 góc nhìn
              </p>
            </div>
            <div className="p-3 md:p-4 max-h-72 overflow-y-auto">
              {data.controversial.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-4">Không có</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {data.controversial.slice(0, 30).map((c) => (
                    <span
                      key={`${c.lo_a}-${c.lo_b}`}
                      title={`${c.appearances_in_top}/${data.total_components} tiêu chí: ${c.components.join(", ")}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-200 font-mono font-semibold text-xs"
                    >
                      {c.lo_a}-{c.lo_b}
                      <span className="text-[0.55rem] opacity-70">×{c.appearances_in_top}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Per-component Top 10 */}
      {data.components.length > 0 && (
        <>
          <h3 className="text-sm md:text-base font-bold mt-4 md:mt-6 mb-3">
            🧪 Top 10 cặp mỗi tiêu chí ({data.total_components} tiêu chí)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {data.components.map((comp, idx) => {
              const c = COMPONENT_COLOR[comp.key] ?? COMPONENT_COLOR.combined;
              const pairs = comp.top_picks.map((p) => `${p.lo_a}-${p.lo_b}`);
              return (
                <section
                  key={comp.key}
                  className={`rounded-2xl bg-[#111827] border ${c.border} overflow-hidden flex flex-col`}
                >
                  <div className={`px-3 py-2.5 border-b border-white/[0.06] ${c.bg}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[0.65rem] font-mono font-bold ${c.text}`}>#{idx + 1}</span>
                      <h4 className="text-xs font-bold truncate">{comp.label}</h4>
                      <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-white/[0.08] text-slate-300 font-mono">
                        {(comp.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className={`text-[0.6rem] italic ${c.text}`}>"{comp.question}"</p>
                  </div>
                  <div className="p-2.5 flex-1">
                    <div className="space-y-1">
                      {comp.top_picks.map((p) => (
                        <div
                          key={`${p.lo_a}-${p.lo_b}`}
                          className={`flex items-center justify-between px-2 py-1 rounded border ${c.border} ${c.bg}`}
                          title={`Rank #${p.rank} • value ${p.value}`}
                        >
                          <span className="text-[0.55rem] font-mono text-slate-500 w-5">#{p.rank}</span>
                          <span className={`font-mono text-sm font-extrabold ${c.text}`}>
                            {p.lo_a}-{p.lo_b}
                          </span>
                          <span className="text-[0.6rem] font-mono text-slate-400">
                            {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="px-2.5 py-1.5 border-t border-white/[0.06] flex justify-end">
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(pairs.join(", "));
                          toast.show("success", `Copy ${comp.label}: 10 cặp`);
                        } catch {
                          toast.show("error", "Trình duyệt chặn copy");
                        }
                      }}
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

      {/* Explanation */}
      <p className="mt-3 text-[0.7rem] text-slate-500 italic">
        💡 <b>Cách đọc:</b> Score càng cao = cặp càng đáng đánh. Lift &gt; 1 = cặp này thực tế về CÙNG NHAU nhiều hơn nếu 2 lô độc lập. Cooccur = số ngày trong lịch sử cả 2 lô đều về cùng buổi.
      </p>
    </>
  );
}

function PairTile({ pair, highlight }: { pair: PairItem; highlight?: boolean }) {
  const rankClass =
    pair.rank === 1
      ? "border-amber-400/70 bg-amber-500/15"
      : pair.rank === 2
      ? "border-slate-300/40 bg-slate-300/5"
      : pair.rank === 3
      ? "border-orange-400/50 bg-orange-500/15"
      : highlight
      ? "border-orange-500/40 bg-orange-500/5"
      : "border-slate-700 bg-white/[0.02]";

  return (
    <div
      className={`rounded-lg border-2 ${rankClass} p-2.5 text-center`}
      title={`#${pair.rank} • Score ${pair.pair_score} • P(A) ${pair.p_a}% • P(B) ${pair.p_b}% • Cooccur ${pair.cooccur_days}d • Lift ${pair.cooccur_lift}×`}
    >
      <div className="text-[0.55rem] font-mono font-bold text-slate-500">#{pair.rank}</div>
      <div className="font-mono text-lg md:text-2xl font-extrabold text-white leading-none my-1">
        {pair.lo_a} <span className="text-slate-500">-</span> {pair.lo_b}
      </div>
      <div className="font-mono text-[0.65rem] font-bold text-orange-300">
        Score {pair.pair_score.toFixed(2)}
      </div>
      <div className="text-[0.55rem] text-slate-500 mt-0.5">
        {pair.cooccur_days}d cùng • lift {pair.cooccur_lift}×
      </div>
    </div>
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
