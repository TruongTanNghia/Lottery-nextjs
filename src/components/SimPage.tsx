"use client";

import { useEffect, useMemo, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";
import { useToast } from "./Toast";

interface SimDay {
  date: string;
  action: string;
  picks: string[];
  bet_per_pick?: number;
  total_cost: number;
  total_payout: number;
  profit: number;
  balance_after: number;
  hits?: number;
  occurrences?: number;
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

type SubTab = "player" | "house";

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
  const [loading, setLoading] = useState(false);

  const strategy = tab === "player" ? playerStrategy : houseStrategy;

  async function runSim() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/sim/run?region=${region}&mode=${tab}&capital=${capital}&days=${days}&top_n=${topN}&strategy=${strategy}&perf=14`
      );
      const json = await res.json();
      if (json.status === "success") {
        setResult(json);
        toast.show("success", `Sim xong ${json.days_simulated} ngày — ROI ${json.roi_pct}%`);
      } else {
        toast.show("error", json.detail ?? "Sim thất bại");
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
              {tab === "player" ? "Top N để chơi" : "Top N để giảm limit"}
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
        </div>
        <p className="text-[0.7rem] text-slate-400 mt-3 italic">
          {(tab === "player" ? PLAYER_STRATS : HOUSE_STRATS)[strategy]?.desc}
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

      {/* Result */}
      {result && !loading && (
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

          {/* Timeline table */}
          <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-slate-700/50 overflow-hidden">
            <div className="px-4 md:px-6 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm md:text-base font-bold">📋 Nhật ký từng ngày</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.72rem] md:text-xs">
                <thead className="bg-white/[0.03] text-slate-400 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Ngày</th>
                    <th className="px-3 py-2 text-left">Action</th>
                    {tab === "player" && <th className="px-3 py-2 text-left">Picks</th>}
                    <th className="px-2 py-2 text-center">Hit</th>
                    <th className="px-3 py-2 text-right">{tab === "player" ? "Cược" : "Thu"}</th>
                    <th className="px-3 py-2 text-right">{tab === "player" ? "Trúng" : "Bù"}</th>
                    <th className="px-3 py-2 text-right">Lãi/Lỗ</th>
                    <th className="px-3 py-2 text-right">Số dư</th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.timeline].reverse().map((d) => {
                    const profitC = d.profit > 0 ? "text-emerald-400" : d.profit < 0 ? "text-rose-400" : "text-slate-400";
                    const rowBg = d.action === "skip"
                      ? "bg-slate-500/5 border-l-2 border-slate-500/40"
                      : d.profit > 0
                      ? "bg-emerald-500/5 border-l-2 border-emerald-500/40"
                      : "bg-rose-500/5 border-l-2 border-rose-500/40";
                    return (
                      <tr key={d.date} className={`${rowBg} border-t border-white/[0.04]`}>
                        <td className="px-3 py-2 font-mono text-slate-300 whitespace-nowrap">{d.date.slice(5)}</td>
                        <td className="px-3 py-2">
                          {d.action === "skip" ? (
                            <span className="text-amber-400">⏸️ skip</span>
                          ) : (
                            <span className="text-slate-200">
                              {tab === "player"
                                ? `${d.bet_per_pick ?? 1}đ × ${d.picks.length}`
                                : "play"}
                            </span>
                          )}
                          {d.note && (
                            <div className="text-[0.6rem] text-slate-500 italic mt-0.5">{d.note}</div>
                          )}
                        </td>
                        {tab === "player" && (
                          <td className="px-3 py-2 font-mono text-slate-300 max-w-xs truncate">
                            {d.picks.join(" ")}
                          </td>
                        )}
                        <td className="px-2 py-2 text-center font-mono text-slate-300">
                          {d.hits != null ? `${d.hits}/${d.picks.length}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-400">{fmtVndShort(d.total_cost)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-400">{fmtVndShort(d.total_payout)}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${profitC}`}>
                          {d.profit >= 0 ? "+" : ""}{fmtVndShort(d.profit)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-200">
                          {fmtVndShort(d.balance_after)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
