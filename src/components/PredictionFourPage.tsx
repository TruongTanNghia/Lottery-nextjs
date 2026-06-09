"use client";

import { useEffect, useMemo, useState } from "react";
import { type Region } from "@/lib/types";
import { useToast } from "./Toast";

interface FourItem {
  rank: number;
  number: string;
  probability: number;
  composite_score: number;
  breakdown: Record<string, number>;
}

interface FourModelTopPick {
  rank: number;
  number: string;
  norm_score: number;
}

interface FourModelBreakdown {
  key: string;
  label: string;
  question: string;
  weight: number;
  top_picks: FourModelTopPick[];
}

interface FourConsensusItem {
  number: string;
  appearances_in_top: number;
  models: string[];
}

interface FourResponse {
  status: string;
  combined: true;
  window_days: number;
  days_available: number;
  warning?: string;
  weights: Record<string, number>;
  predictions: FourItem[];
  candidate_pool_size: number;
  total_observations: number;
  total_models: number;
  consensus_threshold: number;
  models: FourModelBreakdown[];
  consensus: FourConsensusItem[];
}

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
  combined: true;
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
  candidate_pool_size_avg: number;
  total_observations: number;
  random_baseline_hits_per_day: number;
  random_baseline_total_hits: number;
  model_lift_vs_random: number;
  tiers: TierStat[];
  days: BacktestDay[];
}

const MODEL_COLOR: Record<string, { border: string; bg: string; text: string }> = {
  frequency: { border: "border-blue-500/40", bg: "bg-blue-500/10", text: "text-blue-300" },
  recency: { border: "border-cyan-500/40", bg: "bg-cyan-500/10", text: "text-cyan-300" },
  dayOfWeek: { border: "border-teal-500/40", bg: "bg-teal-500/10", text: "text-teal-300" },
  temperature: { border: "border-orange-500/40", bg: "bg-orange-500/10", text: "text-orange-300" },
  digitFreq: { border: "border-fuchsia-500/40", bg: "bg-fuchsia-500/10", text: "text-fuchsia-300" },
  loBorrow: { border: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-300" },
  threeBorrow: { border: "border-amber-500/40", bg: "bg-amber-500/10", text: "text-amber-300" },
  pairFreq: { border: "border-purple-500/40", bg: "bg-purple-500/10", text: "text-purple-300" },
};

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

// Parse user's free-text 4-digit list: accept commas, spaces, tabs, newlines.
// Pad numerals shorter than 4 with leading zeros. Dedupe + drop invalid.
function parseFourDigitList(raw: string): string[] {
  if (!raw.trim()) return [];
  const tokens = raw.split(/[,\s\t\n;]+/).map((t) => t.trim()).filter(Boolean);
  const set = new Set<string>();
  for (const t of tokens) {
    if (!/^\d{1,4}$/.test(t)) continue;
    set.add(t.padStart(4, "0"));
  }
  return Array.from(set).sort();
}

const FILTER_LIST_KEY = "four_filter_list_v1";

function loadFilterList(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(FILTER_LIST_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveFilterList(s: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FILTER_LIST_KEY, s);
  } catch {
    /* ignore */
  }
}

// Combined-mode tab — the region prop is intentionally ignored.
// 4-càng aggregates G.DB across all 3 miền (see prediction-four.ts rationale).
export default function PredictionFourPage(_props: { region: Region }) {
  const toast = useToast();
  const [data, setData] = useState<FourResponse | null>(null);
  const [backtest, setBacktest] = useState<BacktestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [backtestLoading, setBacktestLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(180);
  const [topK, setTopK] = useState(200);
  const [backtestDays, setBacktestDays] = useState(14);
  const [payout, setPayout] = useState(6_000_000);
  void _props;

  // ─── Filter section: user's "số chủ đạo" intersected with model's top-K ───
  const [filterRaw, setFilterRaw] = useState<string>("");
  const [showAllExcluded, setShowAllExcluded] = useState(false);
  const [expandedNumber, setExpandedNumber] = useState<string | null>(null);

  useEffect(() => {
    setFilterRaw(loadFilterList());
  }, []);

  const filterParsed = useMemo(() => parseFourDigitList(filterRaw), [filterRaw]);

  // Build rank lookup over ALL predictions (full pool ~9000), not just top K
  const rankByNumber = useMemo(() => {
    const map = new Map<string, number>();
    if (data?.predictions) {
      for (const p of data.predictions) map.set(p.number, p.rank);
    }
    return map;
  }, [data]);

  // Build breakdown lookup for accordion details
  const breakdownByNumber = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    if (data?.predictions) {
      for (const p of data.predictions) map.set(p.number, p.breakdown);
    }
    return map;
  }, [data]);

  // Intersection: filterParsed ∩ topK picks
  const { included, excluded } = useMemo(() => {
    const inc: { number: string; rank: number }[] = [];
    const exc: { number: string; rank: number | null }[] = [];
    for (const n of filterParsed) {
      const rank = rankByNumber.get(n);
      if (rank !== undefined && rank <= topK) {
        inc.push({ number: n, rank });
      } else {
        exc.push({ number: n, rank: rank ?? null });
      }
    }
    inc.sort((a, b) => a.rank - b.rank);
    exc.sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999));
    return { included: inc, excluded: exc };
  }, [filterParsed, rankByNumber, topK]);

  function handleFilterChange(v: string) {
    setFilterRaw(v);
    saveFilterList(v);
  }

  function clearFilter() {
    setFilterRaw("");
    saveFilterList("");
    setExpandedNumber(null);
  }

  async function copyIncluded() {
    if (included.length === 0) return;
    const txt = included.map((x) => x.number).join(", ");
    try {
      await navigator.clipboard.writeText(txt);
      toast.show("success", `Copy ${included.length} số được chơi`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  useEffect(() => {
    setLoading(true);
    fetch(`/api/predict/four?window=${windowDays}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [windowDays]);

  useEffect(() => {
    setBacktestLoading(true);
    fetch(`/api/predict/four/backtest?days=${backtestDays}&top_k=${topK}&window=${windowDays}&payout=${payout}`)
      .then((r) => r.json())
      .then((d) => setBacktest(d))
      .catch(() => setBacktest(null))
      .finally(() => setBacktestLoading(false));
  }, [windowDays, topK, backtestDays, payout]);

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

  async function copyChunk(nums: string[], label: string) {
    if (nums.length === 0) return;
    try {
      await navigator.clipboard.writeText(nums.join(" "));
      toast.show("success", `Copy ${label}: ${nums.length} số`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  if (loading) {
    return <div className="text-center py-20 text-slate-500">⏳ Đang gộp ĐB của 3 miền + lọc số đã từng ra... mất ~10-20s</div>;
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
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-purple-900/30 via-fuchsia-900/20 to-violet-900/20 border border-fuchsia-500/40 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
              🎰 Dự Đoán 4 Càng
              <span className="px-2 py-0.5 text-[0.65rem] rounded-full bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-200 font-mono uppercase">
                Tổng hợp 3 miền · TẤT cả giải
              </span>
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              Gộp <b>tất cả giải ≥4 chữ số</b> của MN + MB + MT (~80-120 sự kiện/ngày) • Lọc còn <b className="text-emerald-300">{data.candidate_pool_size}</b> số đã từng ra trong {data.window_days} ngày • 8 model
            </p>
            <p className="text-[0.7rem] md:text-xs text-slate-400 mt-1">
              {data.days_available} ngày data • <b>{data.total_observations}</b> lần quan sát •
              Baseline = <b className="text-amber-300">{((topK / data.candidate_pool_size) * 100).toFixed(2)}%/lần</b>
            </p>
            <p className="text-[0.7rem] text-amber-300 mt-1.5">
              ⚠️ <b>QUAN TRỌNG về payout:</b> Mở rộng sang tất cả giải có nghĩa là <b>hit</b> tính cho mọi giải ≥4 chữ.
              Nhưng đa số nhà cái CHỈ trả tiền 4 càng cho <b>Đặc Biệt</b>. Anh cần check với bookie:
              giải khác có được trả không, payout bao nhiêu, hay chỉ là tín hiệu tham khảo.
            </p>
            <p className="text-[0.7rem] text-rose-300 mt-1">
              🚨 ROI backtest là <b>giả định</b>. Trước khi đánh: xác nhận tỉ lệ thật của bookie + thử số nhỏ vài ngày trước khi tăng vốn.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={60}>60 ngày</option>
              <option value={90}>90 ngày</option>
              <option value={120}>120 ngày</option>
              <option value={180}>180 ngày</option>
              <option value={270}>270 ngày</option>
              <option value={360}>360 ngày (max)</option>
            </select>
            <select
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={10}>Top 10</option>
              <option value={30}>Top 30</option>
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
              <option value={150}>Top 150</option>
              <option value={200}>Top 200</option>
              <option value={300}>Top 300</option>
            </select>
            <button
              onClick={copyAll}
              className="px-3 py-1.5 text-xs rounded bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold"
            >
              📋 Copy Top {topK}
            </button>
          </div>
        </div>
      </section>

      {/* Weights legend */}
      <section className="mb-4 md:mb-6 rounded-xl bg-[#111827] border border-slate-700/50 p-3">
        <div className="text-[0.7rem] text-slate-400 mb-1.5 font-semibold uppercase">⚖️ Trọng số 8 model</div>
        <div className="flex flex-wrap gap-2 text-[0.7rem]">
          {Object.entries(data.weights).map(([k, w]) => {
            const color = MODEL_COLOR[k];
            return (
              <span key={k} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] border ${color?.border ?? "border-slate-700"}`}>
                <span className={`font-bold ${color?.text ?? "text-slate-300"}`}>{data.models.find((m) => m.key === k)?.label ?? k}</span>
                <span className="font-mono text-white">{(w * 100).toFixed(0)}%</span>
              </span>
            );
          })}
        </div>
      </section>

      {/* Backtest panel */}
      {backtestLoading ? (
        <div className="mb-4 md:mb-6 rounded-2xl border border-slate-600/40 p-4 text-center text-slate-500 text-sm">
          ⏳ Đang backtest {backtestDays} ngày × 10.000 số... mất ~30-60s
        </div>
      ) : backtest && backtest.days.length > 0 ? (
        <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-fuchsia-500/30 overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
                📊 Độ chính xác 4 Càng — Gộp 3 miền (backtest {backtest.days.length} ngày)
              </h3>
              <p className="text-[0.7rem] text-slate-400 mt-0.5">
                Replay top {backtest.top_k} mỗi ngày, so với <b>tất cả giải ≥4 chữ</b> của 3 miền hôm đó (~80-120 sự kiện/ngày) •
                Pool TB: <b className="text-emerald-300">{backtest.candidate_pool_size_avg} số</b> • Baseline = {backtest.baseline_pct}%/lần
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
              label="Model — tổng trúng"
              value={`${backtest.total_hits}`}
              accent={backtest.total_hits >= backtest.random_baseline_total_hits ? "text-emerald-300" : "text-rose-300"}
              hint={`Top ${backtest.top_k} × ${backtest.days.length} ngày`}
            />
            <Kpi
              label="🎲 Random baseline"
              value={`${backtest.random_baseline_total_hits}`}
              accent="text-slate-300"
              hint={`Nếu chọn random từ pool ${backtest.candidate_pool_size_avg}`}
            />
            <Kpi
              label="Model lift vs Random"
              value={`${backtest.model_lift_vs_random}×`}
              accent={backtest.model_lift_vs_random >= 1.2 ? "text-emerald-300" : backtest.model_lift_vs_random >= 0.9 ? "text-amber-300" : "text-rose-300"}
              hint={backtest.model_lift_vs_random >= 1.0 ? "✅ Khá hơn random" : "❌ Tệ hơn random"}
            />
            <Kpi
              label="Hit/ngày"
              value={`${(backtest.total_hits / Math.max(1, backtest.days.length)).toFixed(2)}`}
              accent="text-cyan-300"
              hint={`Random: ${backtest.random_baseline_hits_per_day}/ngày`}
            />
            <Kpi
              label="Ngày có hit"
              value={`${backtest.days.filter(d => d.hits > 0).length}/${backtest.days.length}`}
              accent={backtest.days.filter(d => d.hits > 0).length >= backtest.days.length * 0.3 ? "text-emerald-300" : "text-rose-300"}
            />
          </div>

          {/* Reality check */}
          <div className="px-3 md:px-4 pb-3">
            <div className={`rounded-lg border-l-2 px-3 py-2 text-[0.75rem] ${
              backtest.model_lift_vs_random >= 1.2
                ? "bg-emerald-500/5 border-emerald-400 text-emerald-200"
                : backtest.model_lift_vs_random >= 0.9
                ? "bg-amber-500/5 border-amber-400 text-amber-200"
                : "bg-rose-500/5 border-rose-400 text-rose-200"
            }`}>
              🧮 <b>Trần lý thuyết:</b> chọn ngẫu nhiên K số từ pool ~{backtest.candidate_pool_size_avg} → kỳ vọng <b>{backtest.random_baseline_hits_per_day} hit/ngày</b>.
              Model anh đang ra <b>{(backtest.total_hits / Math.max(1, backtest.days.length)).toFixed(2)} hit/ngày</b>.
              {backtest.model_lift_vs_random >= 1.2
                ? " Model thực sự có edge — đáng để tiếp tục tinh chỉnh."
                : backtest.model_lift_vs_random >= 0.9
                ? " Model gần bằng random — xổ số quá ngẫu nhiên để model học được pattern rõ ràng."
                : " Model đang KÉM RANDOM. Đây là dấu hiệu model bị bias — em vừa rebalance weights, anh re-test sau khi deploy."}
            </div>
          </div>

          {/* Money panel */}
          <div className="border-t border-white/[0.06] p-3 md:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm md:text-base font-bold text-yellow-300">
                  💰 Lãi/Lỗ giả định (đánh 1 điểm × Top {backtest.top_k} / ngày)
                </h4>
                <p className="text-[0.7rem] text-slate-400 mt-0.5">
                  Cost {fmtVnd(backtest.cost_per_pick_vnd)}/số × Top {backtest.top_k} = {fmtVnd(backtest.total_cost_vnd / Math.max(1, backtest.days.length))}/ngày •
                  Trúng {fmtVnd(backtest.payout_per_hit_vnd)}/lần • Cần ≥ {backtest.break_even_occurrences_per_day} lần trúng/ngày để hoà
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.7rem] text-slate-400">Tỉ lệ trúng:</span>
                <select
                  value={payout}
                  onChange={(e) => setPayout(parseInt(e.target.value))}
                  className="px-2 py-1 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
                >
                  <option value={5_000_000}>5tr (dealer chặt)</option>
                  <option value={5_500_000}>5.5tr</option>
                  <option value={6_000_000}>6tr (chuẩn — 80k/số)</option>
                  <option value={7_000_000}>7tr</option>
                  <option value={8_000_000}>8tr (dealer tốt)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi label="Tổng chi" value={fmtVndShort(backtest.total_cost_vnd)} hint={`${backtest.top_k}×${backtest.days.length}`} accent="text-slate-200" />
              <Kpi label="Tổng trúng" value={fmtVndShort(backtest.total_win_vnd)} hint={`${backtest.total_occurrences} lần`} accent="text-emerald-300" />
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
                💡 {backtest.roi_pct >= 20
                  ? `ROI ${backtest.roi_pct}% — model làm việc tốt, lift ${backtest.lift_vs_baseline}× baseline. Đáng đánh.`
                  : backtest.roi_pct >= 0
                  ? `ROI ${backtest.roi_pct}% — hoà vốn/lãi mỏng. 4 càng cực thưa, hãy chia khoản nhỏ + theo dõi nhiều tháng.`
                  : `ROI ${backtest.roi_pct}% — model CHƯA đủ lift để bù chi phí. Cân nhắc giảm Top K xuống 30-50 (chỉ chơi cặp mạnh nhất) hoặc đợi data dày hơn.`}
              </p>
            </div>
          </div>

          {/* Tier breakdown */}
          {backtest.tiers && backtest.tiers.length > 0 && (
            <div className="border-t border-white/[0.06] p-3 md:p-4">
              <h4 className="text-sm md:text-base font-bold text-fuchsia-300 mb-2">
                📊 Hit rate theo từng quãng 20 số
              </h4>
              <div className="space-y-2">
                {backtest.tiers.map((t) => {
                  const color = t.roi_pct >= 0
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : t.hit_rate_pct >= backtest.baseline_pct
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-rose-500/40 bg-rose-500/5";
                  const tierPicks = data.predictions
                    .slice(t.range_start - 1, t.range_end)
                    .map((p) => p.number);
                  return (
                    <div key={t.range_start} className={`rounded-xl border ${color} p-3`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <span className="font-mono font-bold text-sm text-slate-100">{t.label}</span>
                          <span className="text-[0.7rem] text-slate-400">
                            <b className="text-slate-100">{t.total_hits}</b>/{t.total_predicted} trúng •
                            Hit rate <b className={t.hit_rate_pct >= backtest.baseline_pct * 1.5 ? "text-emerald-300" : "text-amber-300"}>{t.hit_rate_pct}%</b> •
                            ROI <b className={t.roi_pct >= 0 ? "text-emerald-300" : "text-rose-300"}>{t.roi_pct >= 0 ? "+" : ""}{t.roi_pct}%</b>
                          </span>
                        </div>
                        <button
                          onClick={() => copyChunk(tierPicks, t.label)}
                          className="px-2.5 py-1 text-[0.65rem] rounded bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold"
                        >
                          📋 Copy {tierPicks.length}
                        </button>
                      </div>
                      {t.hit_numbers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {t.hit_numbers.slice(0, 12).map((h) => (
                            <span
                              key={h.number}
                              title={`${h.number}: trúng ${h.days_hit} ngày, ${h.total_occ} lần`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-100 font-mono font-bold text-xs"
                            >
                              {h.number}
                              {h.total_occ > 1 && (
                                <span className="text-[0.55rem] text-emerald-300 font-normal">×{h.total_occ}</span>
                              )}
                            </span>
                          ))}
                          {t.hit_numbers.length > 12 && (
                            <span className="text-[0.65rem] text-slate-500 italic">+{t.hit_numbers.length - 12} nữa</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                  <th className="px-3 py-2 text-center">ĐB thực</th>
                  <th className="px-3 py-2 text-center">Hit rate</th>
                  <th className="px-3 py-2 text-right">Lãi/Lỗ</th>
                  <th className="px-3 py-2 text-left">Trúng</th>
                </tr>
              </thead>
              <tbody>
                {[...backtest.days].reverse().map((d) => {
                  const pc = d.profit_vnd > 0 ? "text-emerald-300" : d.profit_vnd < 0 ? "text-rose-300" : "text-slate-400";
                  const rowBg = d.profit_vnd > 0
                    ? "bg-emerald-500/5 border-l-2 border-emerald-500"
                    : d.profit_vnd === 0
                    ? "bg-amber-500/5 border-l-2 border-amber-500"
                    : "bg-rose-500/5 border-l-2 border-rose-500";
                  return (
                    <tr key={d.date} className={`${rowBg} border-t border-white/[0.04]`}>
                      <td className="px-3 py-2 font-mono text-slate-300 whitespace-nowrap">{d.date.slice(5)}</td>
                      <td className="px-3 py-2 text-center font-mono font-bold text-slate-100">{d.hits}/{backtest.top_k}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-400">{d.actual_count}</td>
                      <td className={`px-3 py-2 text-center font-mono ${d.hits > 0 ? "text-emerald-400" : "text-rose-400"}`}>{d.hit_rate_pct}%</td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${pc}`}>
                        {d.profit_vnd >= 0 ? "+" : ""}{fmtVndShort(d.profit_vnd)}
                      </td>
                      <td className="px-3 py-2 font-mono text-emerald-200">
                        {d.hit_picks.length === 0
                          ? <span className="text-slate-600">—</span>
                          : d.hit_picks.slice(0, 4).join(", ")}
                        {d.hit_picks.length > 4 && <span className="text-slate-500"> …</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Top K grid */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-fuchsia-500/30 overflow-hidden">
        <div className="px-4 md:px-6 py-3 border-b border-white/[0.06]">
          <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
            🏆 TOP {topK} SỐ — DỰ ĐOÁN CHO NGÀY TỚI
          </h3>
          <p className="text-[0.65rem] text-slate-400 mt-0.5">
            Sắp xếp theo composite probability • Hover để xem điểm từng model
          </p>
        </div>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 p-3">
          {data.predictions.slice(0, topK).map((p) => (
            <div
              key={p.number}
              title={`Rank #${p.rank} • prob ${p.probability.toFixed(4)}% • score ${p.composite_score}`}
              className={`relative rounded-lg border ${p.rank <= 10 ? "border-amber-400/70 bg-amber-500/10" : p.rank <= 30 ? "border-fuchsia-500/50 bg-fuchsia-500/5" : "border-slate-700 bg-[#1a2332]"} p-1.5 text-center`}
            >
              <div className="text-[0.5rem] font-mono text-slate-500">#{p.rank}</div>
              <div className="font-mono text-sm md:text-base font-extrabold text-white tracking-wider">
                {p.number}
              </div>
              <div className="text-[0.5rem] font-mono text-fuchsia-300">{p.probability.toFixed(3)}%</div>
            </div>
          ))}
        </div>
      </section>

      {/* Consensus */}
      {data.consensus.length > 0 && (
        <section className="mb-4 md:mb-6 rounded-2xl bg-emerald-900/15 border border-emerald-500/30 overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-emerald-300">
                🤝 Consensus (≥ {data.consensus_threshold}/{data.total_models} model agree)
              </h3>
              <p className="text-[0.7rem] text-slate-400 mt-0.5">
                Số được nhiều model cùng chọn vào top 10 → tin cậy cao
              </p>
            </div>
            <button
              onClick={() => copyChunk(data.consensus.map((c) => c.number), "consensus")}
              className="px-2.5 py-1 text-[0.7rem] rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold"
            >
              📋 Copy {data.consensus.length} số
            </button>
          </div>
          <div className="p-3 md:p-4 max-h-72 overflow-y-auto">
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
          </div>
        </section>
      )}

      {/* Per-model Top 10 */}
      {data.models.length > 0 && (
        <>
          <h3 className="text-sm md:text-base font-bold mt-4 md:mt-6 mb-3">
            🧪 Top 10 của mỗi model ({data.total_models} model)
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
                    <div className="grid grid-cols-2 gap-1">
                      {m.top_picks.map((p) => (
                        <div
                          key={p.number}
                          className={`px-2 py-1 rounded border ${c.border} ${c.bg} text-center`}
                        >
                          <span className={`text-[0.55rem] font-mono ${c.text} block`}>#{p.rank}</span>
                          <span className={`font-mono text-sm font-extrabold ${c.text}`}>{p.number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="px-2.5 py-1.5 border-t border-white/[0.06] flex justify-end">
                    <button
                      onClick={() => copyChunk(nums, m.label)}
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

      <p className="mt-4 text-[0.7rem] text-slate-500 italic">
        💡 <b>Cách đọc:</b> Model "Mượn lô" và "Mượn 3 chân" leverage data dày hơn (100/1000-space) — trọng số cao nhất.
        Hover số bất kỳ để xem rank, probability, composite score.
      </p>

      {/* ─────────────────────────────────────────────── */}
      {/* FILTER SECTION: số chủ đạo ∩ Top K model        */}
      {/* ─────────────────────────────────────────────── */}
      <section className="mt-4 md:mt-6 rounded-2xl bg-gradient-to-br from-emerald-900/20 via-teal-900/15 to-cyan-900/15 border border-emerald-500/40 overflow-hidden">
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06]">
          <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
            🎯 Lọc theo Số Chủ Đạo của anh
          </h3>
          <p className="text-[0.7rem] text-slate-400 mt-0.5">
            Dán list số chủ đạo → hệ thống lọc giao với <b className="text-emerald-300">Top {topK}</b> model. Chỉ chơi số nào trong cả 2.
            <b className="text-amber-300"> Auto-sync với dropdown Top K phía trên.</b>
          </p>
        </div>

        {/* Input area */}
        <div className="p-3 md:p-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label className="text-[0.7rem] text-slate-300 font-semibold">
              ▸ List số chủ đạo (4 chữ — phẩy/space/newline đều OK; số ngắn tự pad số 0):
            </label>
            <div className="flex gap-1.5">
              {filterParsed.length > 0 && (
                <span className="px-2 py-0.5 text-[0.65rem] rounded-full bg-emerald-500/20 text-emerald-200 font-mono">
                  ✓ {filterParsed.length} số duy nhất
                </span>
              )}
              <button
                onClick={clearFilter}
                disabled={!filterRaw}
                className="px-2.5 py-1 text-[0.65rem] rounded bg-slate-600 hover:bg-slate-500 text-white font-bold disabled:opacity-40"
              >
                🗑 Xoá hết
              </button>
            </div>
          </div>
          <textarea
            value={filterRaw}
            onChange={(e) => handleFilterChange(e.target.value)}
            placeholder="VD:&#10;0123, 4567, 8901&#10;1234 5678 9012&#10;234 (tự pad → 0234)"
            rows={4}
            className="w-full px-3 py-2 rounded bg-[#1a2332] border-2 border-slate-700 focus:border-emerald-400 text-slate-100 font-mono text-sm outline-none resize-y"
          />
        </div>

        {filterParsed.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            ↑ Nhập list số chủ đạo để xem kết quả lọc
          </div>
        ) : (
          <>
            {/* Result summary */}
            <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="flex flex-wrap items-baseline gap-4 text-[0.75rem]">
                <span>
                  Đã nhập: <b className="text-slate-200 font-mono">{filterParsed.length}</b>
                </span>
                <span>
                  ✅ Trùng Top {topK}: <b className="text-emerald-300 font-mono">{included.length}</b>
                </span>
                <span>
                  ❌ Bị loại: <b className="text-rose-300 font-mono">{excluded.length}</b>
                </span>
                <span className="text-slate-400">
                  ({((included.length / filterParsed.length) * 100).toFixed(0)}% match)
                </span>
              </div>
            </div>

            {/* Included (green) */}
            <div className="p-3 md:p-4 border-b border-white/[0.06]">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h4 className="text-sm font-bold text-emerald-300">
                  ✅ Được Chơi ({included.length}) — sắp theo rank model tăng dần
                </h4>
                <button
                  onClick={copyIncluded}
                  disabled={included.length === 0}
                  className="px-3 py-1.5 text-xs rounded bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold disabled:opacity-40"
                >
                  📋 Copy {included.length} số
                </button>
              </div>
              {included.length === 0 ? (
                <p className="text-center text-slate-500 text-xs py-4">
                  Không có số nào trong list khớp Top {topK} model — anh nên tăng Top K hoặc xem lại list chủ đạo.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {included.map((x) => {
                    const isOpen = expandedNumber === x.number;
                    const bd = breakdownByNumber.get(x.number);
                    return (
                      <div key={x.number} className="rounded-lg border border-emerald-400/40 bg-emerald-500/5 overflow-hidden">
                        <button
                          onClick={() => setExpandedNumber(isOpen ? null : x.number)}
                          className="w-full px-3 py-2 flex items-center justify-between hover:bg-emerald-500/10 transition"
                        >
                          <span className="flex items-center gap-3">
                            <span className="font-mono text-base font-extrabold text-emerald-100 tracking-wider">
                              {x.number}
                            </span>
                            <span className="text-[0.7rem] font-mono text-emerald-300">
                              rank #{x.rank}
                            </span>
                            <span className="text-[0.65rem] text-slate-500">
                              {x.rank <= 10 ? "🏆 Top 10" : x.rank <= 30 ? "🥇 Top 30" : x.rank <= 100 ? "🥈 Top 100" : `Top ${topK}`}
                            </span>
                          </span>
                          <span className="text-[0.7rem] text-slate-400">
                            {isOpen ? "▼ chi tiết" : "▶ xem chi tiết"}
                          </span>
                        </button>
                        {isOpen && bd && (
                          <div className="px-3 py-2 bg-[#0a0e17] border-t border-emerald-500/20">
                            <div className="text-[0.6rem] text-slate-400 uppercase mb-1.5">Điểm từng model (normalized 0-1):</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                              {Object.entries(bd).map(([k, v]) => (
                                <div key={k} className="flex items-center justify-between px-2 py-1 rounded bg-white/[0.03] text-[0.65rem]">
                                  <span className="text-slate-300 font-mono">{k}</span>
                                  <span className="text-emerald-300 font-mono font-bold">{v.toFixed(3)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Excluded (gray) */}
            <div className="p-3 md:p-4">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h4 className="text-sm font-bold text-rose-300">
                  ❌ Không Nên Chơi ({excluded.length}) — ngoài Top {topK} model
                </h4>
                {excluded.length > 30 && (
                  <button
                    onClick={() => setShowAllExcluded((v) => !v)}
                    className="px-2.5 py-1 text-[0.65rem] rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold"
                  >
                    {showAllExcluded ? "Thu gọn" : `Hiện hết ${excluded.length}`}
                  </button>
                )}
              </div>
              {excluded.length === 0 ? (
                <p className="text-center text-emerald-300 text-xs py-3 font-bold">
                  🎉 Toàn bộ list của anh đều trong Top {topK} model — anh có gu tốt!
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(showAllExcluded ? excluded : excluded.slice(0, 30)).map((x) => {
                    const tooltip = x.rank
                      ? `Rank trong full pool: #${x.rank} (cần ≤ ${topK})`
                      : "Không có trong pool — chưa từng ra trong 180 ngày";
                    return (
                      <span
                        key={x.number}
                        title={tooltip}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-500/8 border border-rose-500/30 text-rose-200/80 font-mono font-semibold text-xs"
                      >
                        {x.number}
                        <span className="text-[0.55rem] text-rose-300/60">
                          {x.rank ? `#${x.rank}` : "off-pool"}
                        </span>
                      </span>
                    );
                  })}
                  {!showAllExcluded && excluded.length > 30 && (
                    <span className="text-[0.7rem] text-slate-500 italic px-2 py-1">
                      ... +{excluded.length - 30} nữa
                    </span>
                  )}
                </div>
              )}
              <p className="mt-2 text-[0.65rem] text-slate-500 italic">
                💡 Số có rank thấp (#1500-5000) = model có để ý nhưng chưa đủ cao. Số "off-pool" = chưa từng ra trong 180 ngày qua.
              </p>
            </div>
          </>
        )}
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
