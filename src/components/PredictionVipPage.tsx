"use client";

import { useEffect, useMemo, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";
import { useToast } from "./Toast";

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
};

export default function PredictionVipPage({ region }: { region: Region }) {
  const toast = useToast();
  const [data, setData] = useState<VipResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(90);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/predict/vip?region=${region}&window=${windowDays}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [region, windowDays]);

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
            <p className="text-[0.7rem] md:text-xs text-slate-400 mt-1">
              {data.days_available} ngày • Window {data.window_days} • Top lift {data.top_lift}× uniform
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

      {/* Consensus + Controversial */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
        <section className="rounded-2xl bg-emerald-900/15 border border-emerald-500/30 overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-emerald-300">🤝 Consensus (≥ 5/9 model)</h3>
              <p className="text-[0.7rem] text-slate-400 mt-0.5">
                Lô được nhiều model agree → tin cậy CAO
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
            <h3 className="text-sm font-bold text-amber-300">⚠️ Controversial (1-2/9 model)</h3>
            <p className="text-[0.7rem] text-slate-400 mt-0.5">
              Lô chỉ vài model chọn → ít tin cậy, nhưng có thể là "ngon" theo 1 góc nhìn
            </p>
          </div>
          <div className="p-3 md:p-4 max-h-48 overflow-y-auto">
            {data.controversial.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-4">Không có controversial</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.controversial.slice(0, 30).map((c) => (
                  <span
                    key={c.lo_number}
                    title={`${c.appearances_in_top10}/9 model: ${c.models.join(", ")}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-200 font-mono font-semibold text-xs"
                  >
                    {c.lo_number}
                    <span className="text-[0.6rem] opacity-70">×{c.appearances_in_top10}</span>
                  </span>
                ))}
              </div>
            )}
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
