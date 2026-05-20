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
  pair_score: number;
}

interface PairResponse {
  status: string;
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  top_n_source: number;
  pairs: PairItem[];
}

export default function PredictionPairPage({ region }: { region: Region }) {
  const toast = useToast();
  const [data, setData] = useState<PairResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(60);
  const [topNSource, setTopNSource] = useState(25);
  const [topKReturn] = useState(30);

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
              <option value={180}>180 ngày</option>
            </select>
            <select
              value={topNSource}
              onChange={(e) => setTopNSource(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={15}>Top 15 lô</option>
              <option value={20}>Top 20 lô</option>
              <option value={25}>Top 25 lô</option>
              <option value={30}>Top 30 lô</option>
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
