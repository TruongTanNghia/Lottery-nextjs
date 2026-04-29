"use client";

import { useEffect, useMemo, useState } from "react";
import { REGION_LABELS, type PredictionResult, type Region } from "@/lib/types";
import { useToast } from "./Toast";

const MODEL_LABELS: Record<string, string> = {
  frequency: "Frequency",
  recency: "Recency",
  poisson: "Poisson Gap",
  markov: "Markov",
  temperature: "Temperature",
  pair: "Pair",
  streak: "Streak",
};

export default function PredictionPage({ region }: { region: Region }) {
  const [windowDays, setWindowDays] = useState(60);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/predict?region=${region}&window=${windowDays}`)
      .then((r) => r.json())
      .then((d) => setResult(d))
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [region, windowDays]);

  if (loading) {
    return <div className="text-center py-20 text-slate-500">Đang tính toán...</div>;
  }

  if (!result || !result.predictions || result.predictions.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        {result?.warning ?? "Không có dữ liệu để dự đoán."}
      </div>
    );
  }

  const top20 = result.predictions.slice(0, 20);
  const avgConf = result.predictions.reduce((s, p) => s + p.confidence, 0) / result.predictions.length;
  const maxProb = Math.max(...result.predictions.map((p) => p.probability));

  return (
    <>
      {/* Top stat cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat icon="📚" label="Dữ liệu phân tích" value={`${result.days_available} ngày`} />
        <Stat icon="🥇" label="Lô khả năng cao nhất" value={top20[0]?.lo_number ?? "--"} valueClass="text-emerald-400" />
        <Stat icon="📈" label="Lift so với uniform (1%)" value={`${result.top_lift?.toFixed(2) ?? "--"}×`} valueClass="text-blue-400" />
        <Stat icon="🎯" label="Confidence trung bình" value={`${avgConf.toFixed(1)}%`} valueClass="text-amber-500" />
      </section>

      {/* Copy section */}
      <CopySection predictions={result.predictions} />

      {/* Top 20 + Models + Methodology */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 mb-6 items-start">
        <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-bold">🔮 Top 20 Lô Khả Năng Cao Nhất — {REGION_LABELS[region]}</h2>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded bg-[#1a2332] border border-slate-600 text-slate-100 text-xs"
            >
              <option value={30}>30 ngày</option>
              <option value={60}>60 ngày</option>
              <option value={90}>90 ngày</option>
              <option value={180}>180 ngày</option>
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 p-4">
            {top20.map((p) => {
              const barW = (p.probability / maxProb) * 100;
              const rankClass =
                p.rank === 1 ? "text-amber-400" : p.rank === 2 ? "text-slate-300" : p.rank === 3 ? "text-orange-400" : "text-slate-500";
              return (
                <div
                  key={p.lo_number}
                  className="grid grid-cols-[40px_1fr_auto] gap-3 items-center p-3 rounded-lg bg-[#1a2332] border border-[#1f2937] hover:border-blue-500"
                >
                  <div className={`text-center font-mono font-bold text-sm ${rankClass}`}>#{p.rank}</div>
                  <div>
                    <div className="font-mono text-xl font-extrabold text-slate-100 leading-none">{p.lo_number}</div>
                    <div className="mt-1.5 h-1.5 rounded bg-white/[0.05]">
                      <div
                        className="h-full rounded bg-gradient-to-r from-blue-500 to-emerald-500"
                        style={{ width: `${barW}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="font-mono text-base font-bold text-emerald-400">{p.probability.toFixed(2)}%</div>
                    <div className="font-mono text-[0.62rem] text-slate-500">conf {p.confidence}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <h2 className="text-sm font-bold">🧠 Mô Hình Kết Hợp</h2>
            </div>
            <div className="p-4 space-y-2">
              {result.model_weights &&
                Object.entries(result.model_weights).map(([k, w]) => {
                  const max = Math.max(...Object.values(result.model_weights!));
                  const pct = (w / max) * 100;
                  return (
                    <div key={k} className="grid grid-cols-[100px_1fr_50px] items-center gap-2.5 text-xs">
                      <span className="text-slate-400">{MODEL_LABELS[k] ?? k}</span>
                      <div className="h-1.5 rounded bg-white/[0.05] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-right font-mono text-blue-400">{(w * 100).toFixed(0)}%</span>
                    </div>
                  );
                })}
            </div>
          </section>

          <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <h2 className="text-sm font-bold">📐 Phương Pháp Luận</h2>
            </div>
            <div className="p-5 text-sm text-slate-300 leading-relaxed">
              <p><strong className="text-blue-400">1. Frequency:</strong> tần suất lô về toàn bộ window.</p>
              <p><strong className="text-blue-400">2. Recency:</strong> EWMA, half-life 7 ngày.</p>
              <p><strong className="text-blue-400">3. Poisson Gap:</strong> P(về | đã chờ N ngày).</p>
              <p><strong className="text-blue-400">4. Markov:</strong> P(lô X | lô set hôm qua).</p>
              <p><strong className="text-blue-400">5. Temperature:</strong> z-score nóng/lạnh.</p>
              <p><strong className="text-blue-400">6. Pair:</strong> co-occurrence với lô hôm qua.</p>
              <p><strong className="text-blue-400">7. Streak:</strong> boost theo chuỗi liên tiếp.</p>
              <p className="mt-3 p-2.5 rounded text-xs text-slate-400 bg-blue-500/[0.06] border-l-[3px] border-blue-500">
                Final = weighted ensemble → softmax (T=0.15). Lift = top probability ÷ uniform (1%).
              </p>
            </div>
          </section>
        </aside>
      </div>

      {/* Heatmap */}
      <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold">🗺️ Bản Đồ Xác Suất 100 Lô</h2>
        </div>
        <div className="grid grid-cols-10 gap-1.5 p-5">
          {result.predictions
            .slice()
            .sort((a, b) => a.lo_number.localeCompare(b.lo_number))
            .map((p) => {
              const intensity = Math.min(1, p.probability / maxProb);
              return (
                <div
                  key={p.lo_number}
                  title={`Lô ${p.lo_number} • ${p.probability.toFixed(2)}% • Rank #${p.rank}`}
                  className="aspect-square flex flex-col items-center justify-center rounded bg-[#1a2332] border border-[#1f2937] hover:border-blue-400 cursor-pointer relative overflow-hidden"
                >
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-emerald-500/45 to-blue-500/25"
                    style={{ opacity: intensity }}
                  />
                  <span className="font-mono text-base font-bold text-slate-100 leading-none mb-1 relative z-10">
                    {p.lo_number}
                  </span>
                  <span className="text-[0.6rem] font-mono font-semibold text-slate-400 relative z-10">
                    {p.probability.toFixed(1)}%
                  </span>
                </div>
              );
            })}
        </div>
      </section>

      {/* Detail table */}
      <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold">📊 Bảng Chi Tiết Toàn Bộ 100 Lô</h2>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <thead>
              <tr className="bg-[#0f1623]">
                {["#", "Lô", "Xác suất", "Composite", "Conf.", "Freq", "Recency", "Poisson", "Markov", "Temp", "Pair", "Streak"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-2 py-2.5 border-b border-[#1f2937] text-slate-400 font-semibold text-[0.7rem] uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.predictions.map((p) => (
                <tr key={p.lo_number} className="hover:bg-white/[0.02]">
                  <td className="px-2 py-2 text-slate-500">#{p.rank}</td>
                  <td className="px-2 py-2 font-bold text-slate-100 text-sm">{p.lo_number}</td>
                  <td className="px-2 py-2 text-emerald-400 font-bold">{p.probability.toFixed(3)}%</td>
                  <td className="px-2 py-2 text-slate-300">{p.composite_score.toFixed(3)}</td>
                  <td className="px-2 py-2 text-slate-300">{p.confidence}%</td>
                  <td className="px-2 py-2 text-slate-300">{(p.breakdown.frequency * 100).toFixed(1)}</td>
                  <td className="px-2 py-2 text-slate-300">{(p.breakdown.recency * 100).toFixed(1)}</td>
                  <td className="px-2 py-2 text-slate-300">{(p.breakdown.poisson * 100).toFixed(1)}</td>
                  <td className="px-2 py-2 text-slate-300">{(p.breakdown.markov * 100).toFixed(1)}</td>
                  <td className="px-2 py-2 text-slate-300">{(p.breakdown.temperature * 100).toFixed(1)}</td>
                  <td className="px-2 py-2 text-slate-300">{(p.breakdown.pair * 100).toFixed(1)}</td>
                  <td className="px-2 py-2 text-slate-300">{(p.breakdown.streak * 100).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  valueClass = "text-slate-100",
}: {
  icon: string;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-4 p-5 rounded-2xl bg-[#111827] border border-white/[0.06]">
      <div className="text-3xl flex-shrink-0">{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</div>
        <div className={`text-xl font-extrabold font-mono ${valueClass}`}>{value}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Copy Section — for batch-copying lo numbers
// ─────────────────────────────────────────────

const COPY_PRESETS = [5, 10, 20, 50, 100] as const;
type CopySep = "space" | "comma" | "newline";

function CopySection({
  predictions,
}: {
  predictions: { lo_number: string; rank: number; probability: number }[];
}) {
  const toast = useToast();
  const [copyN, setCopyN] = useState<number>(20);
  const [sep, setSep] = useState<CopySep>("space");

  const formatted = useMemo(() => {
    const nums = predictions.slice(0, copyN).map((p) => p.lo_number);
    const sepChar = sep === "space" ? " " : sep === "comma" ? ", " : "\n";
    return nums.join(sepChar);
  }, [predictions, copyN, sep]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formatted);
      toast.show("success", `Đã copy ${copyN} số vào clipboard`);
    } catch {
      toast.show("error", "Trình duyệt không cho phép copy. Bấm Ctrl+C trên textbox.");
    }
  }

  const sepLabels: Record<CopySep, string> = {
    space: "Khoảng cách",
    comma: "Dấu phẩy",
    newline: "Mỗi số 1 dòng",
  };

  return (
    <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border border-emerald-500/30 overflow-hidden">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06]">
        <h2 className="text-sm md:text-base font-bold flex items-center gap-2">
          📋 Copy Danh Sách Lô Dự Đoán
        </h2>
        <p className="text-[0.7rem] md:text-xs text-slate-400 mt-0.5">
          Chọn số lượng + format → bấm Copy.
        </p>
      </div>

      <div className="p-4 md:p-5">
        {/* Preset buttons */}
        <div className="mb-3">
          <div className="text-[0.7rem] text-slate-400 mb-1.5 font-semibold">Số lượng:</div>
          <div className="flex flex-wrap gap-1.5">
            {COPY_PRESETS.map((n) => (
              <button
                key={n}
                onClick={() => setCopyN(n)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                  copyN === n
                    ? "bg-emerald-500 text-white"
                    : "bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]"
                }`}
              >
                Top {n}
              </button>
            ))}
          </div>
        </div>

        {/* Separator buttons */}
        <div className="mb-3">
          <div className="text-[0.7rem] text-slate-400 mb-1.5 font-semibold">Format:</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(sepLabels) as CopySep[]).map((s) => (
              <button
                key={s}
                onClick={() => setSep(s)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  sep === s
                    ? "bg-blue-500/30 border border-blue-400/50 text-blue-200"
                    : "bg-white/[0.03] border border-white/[0.08] text-slate-400 hover:bg-white/[0.08]"
                }`}
              >
                {sepLabels[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <textarea
          readOnly
          value={formatted}
          rows={sep === "newline" ? Math.min(copyN, 10) : 4}
          className="w-full px-3 py-2.5 rounded-lg bg-[#0f1623] border border-[#1f2937] text-slate-100 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2 justify-between">
          <span className="text-[0.7rem] text-slate-500">
            {copyN} số • {formatted.length} ký tự
          </span>
          <button
            onClick={handleCopy}
            className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white font-bold text-sm shadow-[0_2px_12px_rgba(16,185,129,0.35)] hover:shadow-[0_4px_20px_rgba(16,185,129,0.5)]"
          >
            📋 Copy ({copyN} số)
          </button>
        </div>
      </div>
    </section>
  );
}
