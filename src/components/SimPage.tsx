"use client";

import { useEffect, useMemo, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";
import { useToast } from "./Toast";

interface SimDay {
  date: string;
  action: string;
  picks: string[];
  hit_picks: string[];
  miss_picks: string[];
  pick_occurrences: Record<string, number>;
  bet_per_pick?: number;
  total_cost: number;
  total_payout: number;
  profit: number;
  balance_after: number;
  hits?: number;
  occurrences?: number;
  break_even_hits: number;
  lesson: string;
  note?: string;
}

interface SimResult {
  status: string;
  mode: "player" | "house";
  region: Region;
  strategy: string;
  initial_capital: number;
  days_simulated: number;
  final_balance: number;
  total_profit: number;
  roi_pct: number;
  max_balance: number;
  min_balance: number;
  max_drawdown_pct: number;
  win_days: number;
  lose_days: number;
  skip_days: number;
  bankrupt: boolean;
  bankrupt_date?: string;
  timeline: SimDay[];
}

type SubTab = "player" | "house" | "criteria";

interface CriteriaBucketDay {
  date: string;
  picks: string[];
  hits: number;
  total_occurrences: number;
  hit_picks: string[];
  hit_picks_with_occ: Array<{ lo: string; occ: number }>;
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
}

interface CriteriaBucketStats {
  bucket_key: string;
  label: string;
  min_models: number;
  max_models: number;
  total_picks: number;
  total_hits: number;
  total_occurrences: number;
  hit_rate: number;
  occ_per_pick: number;
  total_cost_vnd: number;
  total_win_vnd: number;
  total_profit_vnd: number;
  roi_pct: number;
  win_days: number;
  lose_days: number;
  skip_days: number;
  days: CriteriaBucketDay[];
}

interface CriteriaSimResult {
  status: string;
  mode: "player_criteria";
  region: Region;
  initial_capital: number;
  days_simulated: number;
  total_models: number;
  buckets: CriteriaBucketStats[];
  total_cost_vnd: number;
  total_win_vnd: number;
  total_profit_vnd: number;
  roi_pct: number;
  final_balance: number;
}

const PLAYER_STRATS: Record<string, { label: string; desc: string }> = {
  conservative: { label: "🐢 Cẩn thận", desc: "Chỉ chơi 1 điểm/pick mọi ngày — ít rủi ro nhất" },
  smart: { label: "🧠 Thông minh", desc: "Tăng cược khi 3 ngày gần lãi, giảm khi lỗ" },
  skip_bad: { label: "⏸️ Né ngày tệ", desc: "Bỏ qua ngày nếu 3 ngày gần lỗ TB — bảo toàn vốn" },
  aggressive: { label: "🔥 Mạnh tay", desc: "Luôn 3 điểm/pick — rủi ro cao, lời cao" },
};

const HOUSE_STRATS: Record<string, { label: string; desc: string }> = {
  none: { label: "🏪 Baseline", desc: "Limit 200 đều cho mọi số (không dùng AI)" },
  mild: { label: "🛡️ Nhẹ", desc: "Giảm 20% limit cho top 10 dự đoán" },
  smart: { label: "🧠 Thông minh", desc: "Limit tỉ lệ nghịch với rank: top 1 → 30%, top 10 → 80%" },
  aggressive: { label: "🔥 Mạnh", desc: "Top 10: limit 50%, còn lại tăng 20% (đẩy người chơi sang số nguội)" },
};

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
}

function fmtVndShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "tỷ";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "tr";
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return Math.round(n).toString();
}

export default function SimPage({ region }: { region: Region }) {
  const toast = useToast();
  const [tab, setTab] = useState<SubTab>("player");
  const [capital, setCapital] = useState(5_000_000);
  const [days, setDays] = useState(30);
  const [topN, setTopN] = useState(10);
  const [playerStrategy, setPlayerStrategy] = useState("smart");
  const [houseStrategy, setHouseStrategy] = useState("smart");
  const [result, setResult] = useState<SimResult | null>(null);
  const [criteriaResult, setCriteriaResult] = useState<CriteriaSimResult | null>(null);
  const [loading, setLoading] = useState(false);

  const strategy = tab === "player" ? playerStrategy : houseStrategy;

  async function runSim() {
    setLoading(true);
    setResult(null);
    setCriteriaResult(null);
    try {
      if (tab === "criteria") {
        const res = await fetch(
          `/api/sim/criteria?region=${region}&capital=${capital}&days=${days}&top_n=${topN}`
        );
        const json = await res.json();
        if (json.status === "success") {
          setCriteriaResult(json);
          toast.show("success", `Sim ${json.days_simulated} ngày × 4 nhóm tiêu chí — ROI ${json.roi_pct}%`);
        } else {
          toast.show("error", json.detail ?? "Sim thất bại");
        }
      } else {
        const res = await fetch(
          `/api/sim/run?region=${region}&mode=${tab}&capital=${capital}&days=${days}&top_n=${topN}&strategy=${strategy}&perf=30`
        );
        const json = await res.json();
        if (json.status === "success") {
          setResult(json);
          toast.show("success", `Sim xong ${json.days_simulated} ngày — ROI ${json.roi_pct}%`);
        } else {
          toast.show("error", json.detail ?? "Sim thất bại");
        }
      }
    } catch {
      toast.show("error", "Lỗi khi chạy sim");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runSim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, tab]);

  const chartPath = useMemo(() => {
    if (!result || result.timeline.length === 0) return null;
    const balances = result.timeline.map((d) => d.balance_after);
    const minB = Math.min(result.initial_capital, ...balances);
    const maxB = Math.max(result.initial_capital, ...balances);
    const range = Math.max(1, maxB - minB);
    const w = 800;
    const h = 200;
    const points = [result.initial_capital, ...balances].map((b, i, arr) => {
      const x = (i / (arr.length - 1)) * w;
      const y = h - ((b - minB) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const baselineY = h - ((result.initial_capital - minB) / range) * h;
    return { line: points.join(" "), baselineY, w, h, minB, maxB };
  }, [result]);

  const profitColor = result && result.total_profit >= 0 ? "text-emerald-400" : "text-rose-400";
  const profitBg = result && result.total_profit >= 0 ? "from-emerald-900/30" : "from-rose-900/30";

  return (
    <>
      {/* Header */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-violet-900/30 via-purple-900/20 to-fuchsia-900/20 border border-violet-500/40 p-4 md:p-6">
        <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
          🎮 Sim AI — Tự chơi với tiền ảo
        </h2>
        <p className="text-xs md:text-sm text-slate-300 mt-1">
          Mô phỏng AI tự đặt cược (Con chơi) hoặc tự điều chỉnh limit (Nhà cái) trên history thực.{" "}
          <b className="text-amber-300">Không nạp tiền thật — vốn ảo, kết quả tham khảo chiến thuật.</b>
        </p>
        <p className="text-[0.7rem] md:text-xs text-slate-400 mt-1">
          {REGION_LABELS[region]} • Replay {days} ngày gần nhất • Vốn{" "}
          {fmtVnd(capital)}
        </p>
      </section>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("player")}
          className={`flex-1 px-4 py-3 rounded-xl border-2 font-bold transition-colors ${
            tab === "player"
              ? "bg-violet-600 border-violet-400 text-white shadow-lg"
              : "bg-[#111827] border-slate-700 text-slate-400 hover:border-violet-500/40 hover:text-slate-200"
          }`}
        >
          🎯 Con chơi
          <div className="text-[0.7rem] font-normal opacity-80 mt-0.5">
            AI đặt cược theo Adaptive predictions
          </div>
        </button>
        <button
          onClick={() => setTab("house")}
          className={`flex-1 px-4 py-3 rounded-xl border-2 font-bold transition-colors ${
            tab === "house"
              ? "bg-amber-600 border-amber-400 text-white shadow-lg"
              : "bg-[#111827] border-slate-700 text-slate-400 hover:border-amber-500/40 hover:text-slate-200"
          }`}
        >
          🏦 Nhà cái
          <div className="text-[0.7rem] font-normal opacity-80 mt-0.5">
            AI điều chỉnh limit để thu max
          </div>
        </button>
        <button
          onClick={() => setTab("criteria")}
          className={`flex-1 px-4 py-3 rounded-xl border-2 font-bold transition-colors ${
            tab === "criteria"
              ? "bg-emerald-600 border-emerald-400 text-white shadow-lg"
              : "bg-[#111827] border-slate-700 text-slate-400 hover:border-emerald-500/40 hover:text-slate-200"
          }`}
        >
          📊 Theo tiêu chí
          <div className="text-[0.7rem] font-normal opacity-80 mt-0.5">
            Cược theo từng nhóm 5+/4/3/2 model
          </div>
        </button>
      </div>

      {/* Controls */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-slate-700/50 p-4 md:p-5">
        <h3 className="text-sm font-bold mb-3 text-slate-200">⚙️ Tham số mô phỏng</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[0.7rem] text-slate-400 font-semibold uppercase">
              Vốn ban đầu
            </label>
            <select
              value={capital}
              onChange={(e) => setCapital(parseInt(e.target.value))}
              className="w-full mt-1 px-3 py-2 rounded text-sm bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={1_000_000}>1.000.000đ</option>
              <option value={5_000_000}>5.000.000đ</option>
              <option value={10_000_000}>10.000.000đ</option>
              <option value={50_000_000}>50.000.000đ</option>
              <option value={100_000_000}>100.000.000đ</option>
              <option value={1_000_000_000}>1 tỷ</option>
            </select>
          </div>
          <div>
            <label className="text-[0.7rem] text-slate-400 font-semibold uppercase">
              Số ngày replay
            </label>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="w-full mt-1 px-3 py-2 rounded text-sm bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={7}>7 ngày</option>
              <option value={14}>14 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={60}>60 ngày</option>
            </select>
          </div>
          <div>
            <label className="text-[0.7rem] text-slate-400 font-semibold uppercase">
              {tab === "player" ? "Top N để chơi" : tab === "house" ? "Top N để giảm limit" : "Top N mỗi model"}
            </label>
            <select
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value))}
              className="w-full mt-1 px-3 py-2 rounded text-sm bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
              <option value={15}>Top 15</option>
              <option value={20}>Top 20</option>
            </select>
          </div>
          {tab !== "criteria" ? (
            <div>
              <label className="text-[0.7rem] text-slate-400 font-semibold uppercase">
                Chiến thuật
              </label>
              <select
                value={strategy}
                onChange={(e) =>
                  tab === "player"
                    ? setPlayerStrategy(e.target.value)
                    : setHouseStrategy(e.target.value)
                }
                className="w-full mt-1 px-3 py-2 rounded text-sm bg-[#1a2332] border border-slate-600 text-slate-100"
              >
                {Object.entries(tab === "player" ? PLAYER_STRATS : HOUSE_STRATS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-[0.7rem] text-emerald-200">
              <b>Auto strategy:</b> AI cược 1đ/pick cho từng nhóm 5+/4/3/2 model agree riêng biệt → so sánh ROI mỗi tiêu chí.
            </div>
          )}
        </div>
        <p className="text-[0.7rem] text-slate-400 mt-3 italic">
          {tab === "criteria"
            ? "Mỗi nhóm tiêu chí được tính P&L riêng — nhóm nào lời, nhóm nào lỗ sẽ rõ ngay."
            : (tab === "player" ? PLAYER_STRATS : HOUSE_STRATS)[strategy]?.desc}
        </p>
        <button
          onClick={runSim}
          disabled={loading}
          className="mt-3 px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm disabled:opacity-50"
        >
          {loading ? "⏳ Đang chạy..." : "▶️ Chạy mô phỏng"}
        </button>
      </section>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-slate-500">⏳ AI đang chơi {days} ngày...</div>
      )}

      {/* Criteria-mode result */}
      {criteriaResult && !loading && tab === "criteria" && (
        <CriteriaResultView result={criteriaResult} />
      )}

      {/* Player/House result */}
      {result && !loading && tab !== "criteria" && (
        <>
          {/* Banner */}
          <section className={`mb-4 md:mb-6 rounded-2xl bg-gradient-to-br ${profitBg} to-transparent border ${result.total_profit >= 0 ? "border-emerald-500/40" : "border-rose-500/40"} p-4 md:p-5`}>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm md:text-base font-bold text-slate-200">
                  {result.bankrupt ? "💀 PHÁ SẢN" : result.total_profit >= 0 ? "✅ LÃI" : "❌ LỖ"}
                  {" — "}
                  {tab === "player" ? "Con chơi" : "Nhà cái"} ({(tab === "player" ? PLAYER_STRATS : HOUSE_STRATS)[result.strategy]?.label})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sau {result.days_simulated} ngày • Win {result.win_days} • Lose {result.lose_days}
                  {result.skip_days > 0 && ` • Skip ${result.skip_days}`}
                  {result.bankrupt && result.bankrupt_date && ` • Phá sản ${result.bankrupt_date}`}
                </p>
              </div>
              <div className="text-right">
                <div className={`text-2xl md:text-3xl font-extrabold font-mono ${profitColor}`}>
                  {result.total_profit >= 0 ? "+" : ""}{fmtVnd(result.total_profit)}
                </div>
                <div className={`text-xs font-bold ${profitColor}`}>
                  ROI {result.roi_pct >= 0 ? "+" : ""}{result.roi_pct}%
                </div>
              </div>
            </div>
          </section>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 md:mb-6">
            <KpiCard label="Vốn ban đầu" value={fmtVnd(result.initial_capital)} />
            <KpiCard label="Vốn cuối" value={fmtVnd(result.final_balance)} accent={profitColor} />
            <KpiCard label="Đỉnh cao nhất" value={fmtVnd(result.max_balance)} accent="text-emerald-400" />
            <KpiCard
              label="Đáy thấp nhất"
              value={fmtVnd(result.min_balance)}
              accent="text-rose-400"
              hint={`Drawdown ${result.max_drawdown_pct}%`}
            />
          </div>

          {/* Balance chart */}
          {chartPath && (
            <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-slate-700/50 p-4 md:p-5">
              <h3 className="text-sm font-bold mb-3">📈 Biến động vốn theo ngày</h3>
              <svg
                viewBox={`0 0 ${chartPath.w} ${chartPath.h + 20}`}
                preserveAspectRatio="none"
                className="w-full h-44 md:h-52"
              >
                {/* Baseline (initial capital) */}
                <line
                  x1={0}
                  x2={chartPath.w}
                  y1={chartPath.baselineY}
                  y2={chartPath.baselineY}
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
                <polyline
                  points={chartPath.line}
                  fill="none"
                  stroke={result.total_profit >= 0 ? "#10b981" : "#f43f5e"}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="flex justify-between text-[0.65rem] text-slate-500 font-mono mt-1">
                <span>{fmtVndShort(chartPath.minB)}</span>
                <span className="text-slate-400">— vốn ban đầu (đường gạch) —</span>
                <span>{fmtVndShort(chartPath.maxB)}</span>
              </div>
            </section>
          )}

          {/* Timeline — verbose per-day cards */}
          <section className="mb-4 md:mb-6">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm md:text-base font-bold">📋 Nhật ký AI từng ngày</h3>
              <span className="text-[0.7rem] text-slate-500">
                Mới nhất ở trên • Cuộn xuống để xem ngày cũ
              </span>
            </div>
            <div className="space-y-2.5">
              {[...result.timeline].reverse().map((d, idx) => (
                <DayCard key={d.date} day={d} mode={tab} dayIndex={result.timeline.length - idx} />
              ))}
            </div>
          </section>

          {/* Conclusion */}
          <section className="rounded-2xl bg-[#111827] border border-slate-700/50 p-4 md:p-5">
            <h3 className="text-sm font-bold mb-2">🤖 Kết luận của AI</h3>
            <Conclusion result={result} mode={tab} />
          </section>
        </>
      )}
    </>
  );
}

function DayCard({ day, mode, dayIndex }: { day: SimDay; mode: SubTab; dayIndex: number }) {
  const isSkip = day.action === "skip";
  const profitColor = day.profit > 0 ? "text-emerald-400" : day.profit < 0 ? "text-rose-400" : "text-slate-400";
  const borderColor = isSkip
    ? "border-amber-500/40 bg-amber-900/10"
    : day.profit > 0
    ? "border-emerald-500/40 bg-emerald-900/10"
    : "border-rose-500/40 bg-rose-900/10";

  // Format date as "Thứ X, dd/mm"
  const [y, m, d] = day.date.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const dayName = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][dateObj.getUTCDay()];
  const ddmm = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;

  if (isSkip) {
    return (
      <div className={`rounded-xl border ${borderColor} p-3 md:p-4`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <span className="text-[0.65rem] text-slate-500 font-mono">Ngày #{dayIndex}</span>
            <h4 className="text-sm md:text-base font-bold text-amber-300">
              ⏸️ {dayName}, {ddmm} — BỎ QUA
            </h4>
          </div>
          <div className="text-right">
            <div className="text-[0.65rem] text-slate-500">Số dư giữ nguyên</div>
            <div className="font-mono font-bold text-slate-200">{fmtVnd(day.balance_after)}</div>
          </div>
        </div>
        <p className="text-[0.75rem] md:text-sm text-amber-200 mt-2 italic">
          💡 {day.lesson}
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${borderColor} p-3 md:p-4`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
        <div>
          <span className="text-[0.65rem] text-slate-500 font-mono">Ngày #{dayIndex}</span>
          <h4 className="text-sm md:text-base font-bold text-slate-100">
            📅 {dayName}, {ddmm}
            {mode === "player" && day.bet_per_pick != null && (
              <span className="ml-2 text-[0.7rem] font-normal text-slate-400">
                — Cược {day.bet_per_pick}đ × {day.picks.length} pick
              </span>
            )}
            {mode === "house" && (
              <span className="ml-2 text-[0.7rem] font-normal text-slate-400">
                — Vai trò Nhà cái
              </span>
            )}
          </h4>
        </div>
        <div className="text-right">
          <div className={`text-base md:text-lg font-extrabold font-mono ${profitColor}`}>
            {day.profit >= 0 ? "+" : ""}{fmtVnd(day.profit)}
          </div>
          <div className="text-[0.65rem] text-slate-500">
            Số dư: <span className="font-mono font-bold text-slate-200">{fmtVnd(day.balance_after)}</span>
          </div>
        </div>
      </div>

      {/* Picks visualization */}
      <div className="mb-2.5">
        <div className="text-[0.7rem] text-slate-400 font-semibold mb-1">
          🎯 AI {mode === "player" ? "đặt cược" : "giảm limit"} vào {day.picks.length} số:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {day.picks.map((pick, i) => {
            const occ = day.pick_occurrences[pick] ?? 0;
            const isHit = occ > 0;
            return (
              <div
                key={pick}
                title={isHit ? `${pick}: trúng ${occ} lần` : `${pick}: không về`}
                className={`relative font-mono font-bold text-sm md:text-base px-2 py-1 rounded border-2 ${
                  isHit
                    ? "bg-emerald-500/25 border-emerald-400 text-emerald-100"
                    : "bg-slate-700/30 border-slate-600 text-slate-400 opacity-60"
                }`}
              >
                <span className="text-[0.55rem] absolute -top-1.5 left-1 text-slate-500 font-normal">
                  #{i + 1}
                </span>
                {pick}
                {isHit && occ > 1 && (
                  <span className="absolute -top-1.5 -right-1.5 text-[0.55rem] bg-emerald-400 text-emerald-900 rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                    {occ}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Money breakdown */}
      <div className="grid grid-cols-3 gap-2 text-[0.7rem] mb-2.5">
        <div className="rounded bg-slate-700/20 px-2 py-1.5">
          <div className="text-slate-500 uppercase">{mode === "player" ? "Đã chi" : "Thu"}</div>
          <div className="font-mono font-bold text-slate-200">{fmtVndShort(day.total_cost)}</div>
        </div>
        <div className="rounded bg-emerald-700/15 px-2 py-1.5">
          <div className="text-emerald-300/70 uppercase">{mode === "player" ? "Trúng" : "Bù"}</div>
          <div className="font-mono font-bold text-emerald-300">{fmtVndShort(day.total_payout)}</div>
        </div>
        <div className={`rounded ${day.profit >= 0 ? "bg-emerald-700/20" : "bg-rose-700/20"} px-2 py-1.5`}>
          <div className="text-slate-400 uppercase">Lãi/Lỗ</div>
          <div className={`font-mono font-bold ${profitColor}`}>
            {day.profit >= 0 ? "+" : ""}{fmtVndShort(day.profit)}
          </div>
        </div>
      </div>

      {/* Lesson */}
      <div className="rounded bg-white/[0.03] border-l-2 border-blue-400/50 px-3 py-2">
        <div className="text-[0.65rem] text-blue-300 font-bold uppercase mb-0.5">
          💡 Bài học AI rút ra
        </div>
        <p className="text-[0.75rem] md:text-sm text-slate-200">{day.lesson}</p>
      </div>

      {day.note && (
        <p className="text-[0.65rem] text-slate-500 italic mt-1.5">
          📝 {day.note}
        </p>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-[#111827] border border-slate-700/50 p-3">
      <div className="text-[0.7rem] text-slate-400 font-semibold uppercase">{label}</div>
      <div className={`text-base md:text-lg font-bold font-mono mt-1 ${accent ?? "text-slate-100"}`}>
        {value}
      </div>
      {hint && <div className="text-[0.6rem] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function Conclusion({ result, mode }: { result: SimResult; mode: SubTab }) {
  const lines: string[] = [];

  if (result.bankrupt) {
    lines.push(`💀 Phá sản ngày ${result.bankrupt_date} sau ${result.days_simulated} ngày → chiến thuật này KHÔNG hợp với data hiện tại.`);
    lines.push("Khuyến nghị: thử chiến thuật khác (Cẩn thận / Né ngày tệ) hoặc chờ adaptive học thêm.");
  } else if (result.total_profit > 0) {
    lines.push(`✅ Sau ${result.days_simulated} ngày: lãi ${fmtVnd(result.total_profit)} (ROI +${result.roi_pct}%).`);
    if (mode === "player") {
      lines.push(`🎯 Tỉ lệ ngày thắng: ${((result.win_days / Math.max(1, result.days_simulated)) * 100).toFixed(0)}% (${result.win_days}/${result.days_simulated}). Drawdown max ${result.max_drawdown_pct}%.`);
      lines.push(result.roi_pct >= 20
        ? "→ Chiến thuật này đang hiệu quả tốt. Có thể dùng làm tham chiếu khi chơi thật, NHƯNG vẫn nên giữ vốn dự phòng vì xổ số luôn có yếu tố may rủi."
        : result.roi_pct >= 5
        ? "→ Có lãi nhẹ. Cân nhắc tăng Top N hoặc thử chiến thuật khác để xem có cải thiện."
        : "→ Lãi mỏng — phần lớn do may. Khuyến nghị test thêm chiến thuật.");
    } else {
      lines.push(`🏦 Nhà cái thắng ${result.win_days}/${result.days_simulated} ngày. Drawdown max ${result.max_drawdown_pct}%.`);
      lines.push(`→ Strategy "${result.strategy}" đang giảm liability hiệu quả. So sánh với "none" (baseline) để xem AI giúp được bao nhiêu.`);
    }
  } else {
    lines.push(`❌ Sau ${result.days_simulated} ngày: lỗ ${fmtVnd(-result.total_profit)} (ROI ${result.roi_pct}%).`);
    if (mode === "player") {
      lines.push("→ Chiến thuật hiện tại KHÔNG vượt break-even. Khuyến nghị:");
      lines.push("  • Thử '⏸️ Né ngày tệ' để bảo toàn vốn");
      lines.push("  • Giảm Top N xuống 5 để chỉ chơi pick mạnh nhất");
      lines.push("  • Bấm 🧠 Backfill ở tab VIP nếu adaptive chưa đủ data học");
    } else {
      lines.push("→ Nhà cái đang thiệt vì các lô dự đoán thực sự về quá nhiều. Khuyến nghị:");
      lines.push("  • Thử strategy 'aggressive' để giảm sâu limit hot");
      lines.push("  • Hoặc giảm Top N để chỉ giảm limit cho pick chắc chắn nhất");
    }
  }

  return (
    <div className="space-y-1.5 text-[0.75rem] md:text-sm text-slate-300">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

function CriteriaResultView({ result }: { result: CriteriaSimResult }) {
  const profitColor = result.total_profit_vnd >= 0 ? "text-emerald-400" : "text-rose-400";
  const profitBg = result.total_profit_vnd >= 0 ? "from-emerald-900/30" : "from-rose-900/30";

  // Pick the best/worst bucket by ROI
  const ranked = [...result.buckets].sort((a, b) => b.roi_pct - a.roi_pct);
  const bestBucket = ranked[0];
  const worstBucket = ranked[ranked.length - 1];

  return (
    <>
      {/* Top banner */}
      <section className={`mb-4 md:mb-6 rounded-2xl bg-gradient-to-br ${profitBg} to-transparent border ${result.total_profit_vnd >= 0 ? "border-emerald-500/40" : "border-rose-500/40"} p-4 md:p-5`}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm md:text-base font-bold text-slate-200">
              {result.total_profit_vnd >= 0 ? "✅ LÃI TỔNG" : "❌ LỖ TỔNG"} — Theo tiêu chí
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {result.days_simulated} ngày × 4 nhóm tiêu chí ({result.total_models} model gốc)
            </p>
          </div>
          <div className="text-right">
            <div className={`text-2xl md:text-3xl font-extrabold font-mono ${profitColor}`}>
              {result.total_profit_vnd >= 0 ? "+" : ""}{fmtVnd(result.total_profit_vnd)}
            </div>
            <div className={`text-xs font-bold ${profitColor}`}>
              ROI {result.roi_pct >= 0 ? "+" : ""}{result.roi_pct}%
            </div>
          </div>
        </div>
      </section>

      {/* Best/Worst summary */}
      <div className="grid grid-cols-2 gap-3 mb-4 md:mb-6">
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-900/15 p-3">
          <div className="text-[0.65rem] text-emerald-300 font-bold uppercase">🏆 Tiêu chí ăn nhất</div>
          <div className="text-lg font-bold text-emerald-200 mt-1">{bestBucket?.label ?? "—"}</div>
          <div className="text-[0.7rem] text-slate-300 mt-0.5">
            ROI <b>{bestBucket?.roi_pct ?? 0}%</b> • Hit rate {bestBucket?.hit_rate ?? 0}%
          </div>
        </div>
        <div className="rounded-xl border border-rose-500/40 bg-rose-900/15 p-3">
          <div className="text-[0.65rem] text-rose-300 font-bold uppercase">💀 Tiêu chí tệ nhất</div>
          <div className="text-lg font-bold text-rose-200 mt-1">{worstBucket?.label ?? "—"}</div>
          <div className="text-[0.7rem] text-slate-300 mt-0.5">
            ROI <b>{worstBucket?.roi_pct ?? 0}%</b> • Hit rate {worstBucket?.hit_rate ?? 0}%
          </div>
        </div>
      </div>

      {/* Per-bucket cards */}
      <h3 className="text-sm md:text-base font-bold mb-3">📊 Chi tiết từng nhóm tiêu chí</h3>
      <div className="space-y-3">
        {result.buckets.map((b) => (
          <BucketCard key={b.bucket_key} bucket={b} />
        ))}
      </div>

      {/* Aggregate totals row */}
      <section className="mt-4 md:mt-6 rounded-2xl bg-[#0f1722] border border-slate-700/50 p-4">
        <h3 className="text-sm font-bold mb-2 text-slate-200">💰 Tổng cộng tất cả nhóm</h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[0.65rem] text-slate-400 uppercase">Tổng chi</div>
            <div className="font-mono font-bold text-slate-200">{fmtVnd(result.total_cost_vnd)}</div>
          </div>
          <div>
            <div className="text-[0.65rem] text-slate-400 uppercase">Tổng trúng</div>
            <div className="font-mono font-bold text-emerald-300">{fmtVnd(result.total_win_vnd)}</div>
          </div>
          <div>
            <div className="text-[0.65rem] text-slate-400 uppercase">Tổng lãi/lỗ</div>
            <div className={`font-mono font-bold ${profitColor}`}>
              {result.total_profit_vnd >= 0 ? "+" : ""}{fmtVnd(result.total_profit_vnd)}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function BucketCard({ bucket }: { bucket: CriteriaBucketStats }) {
  const profit = bucket.total_profit_vnd;
  const isWin = profit > 0;
  const isLoss = profit < 0;
  const isEmpty = bucket.total_picks === 0;

  const wrap = isEmpty
    ? "border-slate-600/40 bg-slate-800/20"
    : isWin
    ? "border-emerald-500/40 bg-emerald-900/15"
    : isLoss
    ? "border-rose-500/40 bg-rose-900/15"
    : "border-amber-500/40 bg-amber-900/15";

  const profitColor = isWin ? "text-emerald-400" : isLoss ? "text-rose-400" : "text-slate-400";

  // Best 3 winning days and worst 3 losing days
  const sortedDays = [...bucket.days];
  const winDays = sortedDays.filter((d) => d.profit_vnd > 0).sort((a, b) => b.profit_vnd - a.profit_vnd).slice(0, 3);
  const loseDays = sortedDays.filter((d) => d.profit_vnd < 0).sort((a, b) => a.profit_vnd - b.profit_vnd).slice(0, 3);

  // Bucket strength label
  const strength: Record<string, string> = {
    "5plus": "🔥 Rất mạnh (consensus)",
    "4": "💪 Mạnh",
    "3": "👌 Trung bình",
    "2": "🤏 Yếu",
  };

  return (
    <div className={`rounded-xl border ${wrap} p-4 md:p-5`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h4 className="text-base md:text-lg font-extrabold text-slate-100">
            🎯 {bucket.label} — {strength[bucket.bucket_key] ?? ""}
          </h4>
          <p className="text-[0.7rem] text-slate-400 mt-0.5">
            Lô có {bucket.min_models === bucket.max_models ? `đúng ${bucket.min_models}` : `≥ ${bucket.min_models}`} model agree
          </p>
        </div>
        <div className="text-right">
          <div className={`text-xl md:text-2xl font-extrabold font-mono ${profitColor}`}>
            {profit >= 0 ? "+" : ""}{fmtVnd(profit)}
          </div>
          <div className={`text-xs font-bold ${profitColor}`}>
            ROI {bucket.roi_pct >= 0 ? "+" : ""}{bucket.roi_pct}%
          </div>
        </div>
      </div>

      {/* Highlight summary: "trúng / lần XH / đề xuất" — the headline numbers */}
      <div className="rounded-lg bg-white/[0.04] border border-slate-600/40 px-3 py-2 mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="text-[0.7rem] text-slate-400 font-semibold uppercase">📈 Cộng dồn</div>
        <div className="text-sm md:text-base">
          <b className="font-mono text-emerald-300">{bucket.total_hits}</b>
          <span className="text-[0.7rem] text-slate-400"> lô trúng</span>
        </div>
        <div className="text-slate-600">/</div>
        <div className="text-sm md:text-base">
          <b className="font-mono text-amber-300">{bucket.total_occurrences}</b>
          <span className="text-[0.7rem] text-slate-400"> lần xuất hiện</span>
        </div>
        <div className="text-slate-600">/</div>
        <div className="text-sm md:text-base">
          <b className="font-mono text-slate-200">{bucket.total_picks}</b>
          <span className="text-[0.7rem] text-slate-400"> lô đề xuất</span>
        </div>
        {bucket.total_picks > 0 && (
          <div className="ml-auto text-[0.65rem] text-slate-500 italic">
            TB {bucket.occ_per_pick.toFixed(2)} lần XH / mỗi lô đề xuất
          </div>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <KpiMini label="Tổng cược" value={fmtVnd(bucket.total_cost_vnd)} />
        <KpiMini label="Tổng trúng" value={fmtVnd(bucket.total_win_vnd)} accent="text-emerald-300" />
        <KpiMini
          label="Hit rate"
          value={`${bucket.hit_rate}%`}
          accent={bucket.hit_rate >= 18 ? "text-emerald-300" : "text-rose-300"}
          hint={`${bucket.total_hits} trúng / ${bucket.total_picks}`}
        />
        <KpiMini
          label="Lần XH/lô"
          value={bucket.occ_per_pick.toFixed(2)}
          accent={bucket.occ_per_pick >= 0.3 ? "text-emerald-300" : "text-rose-300"}
          hint={`Cần ≥ 0.29 để hoà`}
        />
        <KpiMini
          label="Ngày thắng/thua"
          value={`${bucket.win_days}/${bucket.lose_days}`}
          accent="text-slate-200"
          hint={bucket.skip_days > 0 ? `${bucket.skip_days} ngày trống` : undefined}
        />
      </div>

      {/* Best/Worst days */}
      {!isEmpty && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {winDays.length > 0 && (
            <div className="rounded bg-emerald-500/10 border border-emerald-500/30 p-2">
              <div className="text-[0.65rem] text-emerald-300 font-bold uppercase mb-1">🟢 3 ngày trúng nhất</div>
              {winDays.map((d) => (
                <div key={d.date} className="text-[0.7rem] font-mono py-1 border-t border-emerald-500/10 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-300">{d.date.slice(5)}</span>
                    <span className="text-slate-400">
                      {d.hits}/{d.picks.length} trúng • {d.total_occurrences} lần XH
                    </span>
                    <span className="text-emerald-300 font-bold">+{fmtVndShort(d.profit_vnd)}</span>
                  </div>
                  {d.hit_picks_with_occ.length > 0 && (
                    <div className="text-[0.65rem] text-emerald-200 mt-0.5 flex flex-wrap gap-x-1.5">
                      {d.hit_picks_with_occ.slice(0, 12).map((h) => (
                        <span key={h.lo}>
                          {h.lo}
                          {h.occ > 1 && <span className="text-emerald-400 font-bold">×{h.occ}</span>}
                        </span>
                      ))}
                      {d.hit_picks_with_occ.length > 12 && <span className="text-slate-500">…</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {loseDays.length > 0 && (
            <div className="rounded bg-rose-500/10 border border-rose-500/30 p-2">
              <div className="text-[0.65rem] text-rose-300 font-bold uppercase mb-1">🔴 3 ngày tệ nhất</div>
              {loseDays.map((d) => (
                <div key={d.date} className="text-[0.7rem] font-mono py-1 border-t border-rose-500/10 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-300">{d.date.slice(5)}</span>
                    <span className="text-slate-400">
                      {d.hits}/{d.picks.length} trúng • {d.total_occurrences} lần XH
                    </span>
                    <span className="text-rose-300 font-bold">{fmtVndShort(d.profit_vnd)}</span>
                  </div>
                  {d.hit_picks_with_occ.length > 0 && (
                    <div className="text-[0.65rem] text-rose-200 mt-0.5 flex flex-wrap gap-x-1.5">
                      {d.hit_picks_with_occ.slice(0, 12).map((h) => (
                        <span key={h.lo}>
                          {h.lo}
                          {h.occ > 1 && <span className="text-rose-400 font-bold">×{h.occ}</span>}
                        </span>
                      ))}
                      {d.hit_picks_with_occ.length > 12 && <span className="text-slate-500">…</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Conclusion */}
      <p className="text-[0.7rem] text-slate-400 italic mt-3">
        💡 {isEmpty
          ? `Không có ngày nào có lô đạt tiêu chí này — nhóm quá hiếm, không xét được.`
          : bucket.roi_pct >= 5
          ? `Tiêu chí này LỜI rõ ràng (ROI +${bucket.roi_pct}%) → nên ưu tiên dùng để đánh thực.`
          : bucket.roi_pct >= 0
          ? `Hoà vốn (ROI ${bucket.roi_pct}%) — không lỗ nhưng cũng chưa thắng đậm.`
          : `LỖ (ROI ${bucket.roi_pct}%) — không nên dùng tiêu chí này một mình, có thể chỉ là phụ trợ.`}
      </p>
    </div>
  );
}

function KpiMini({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="rounded bg-white/[0.03] p-2">
      <div className="text-[0.6rem] text-slate-500 uppercase">{label}</div>
      <div className={`font-mono font-bold text-sm ${accent ?? "text-slate-200"}`}>{value}</div>
      {hint && <div className="text-[0.55rem] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}
