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

const MODEL_LABEL: Record<string, string> = {
  frequency: "Tần suất",
  recency: "Gần đây (EWMA)",
  dayOfWeek: "Cùng thứ",
  temperature: "Hot vs base",
};

export default function PredictionThreePage({ region }: { region: Region }) {
  const toast = useToast();
  const [data, setData] = useState<ThreeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(60);
  const [topK, setTopK] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/predict/three?region=${region}&window=${windowDays}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [region, windowDays]);

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
