"use client";

/**
 * VIP Tổng Hợp ("Quãng vàng") — meta-board across 4 prediction models.
 *
 * On-demand only: user picks region + window (14/30/60 days), presses
 * "Tính VIP" → backend backtests + finds best 2 segments per model →
 * returns aggregated picks. Heavy compute, so we cache 60 min server-side
 * and debounce client clicks.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";
import { useToast } from "./Toast";

interface SegmentStat {
  range_start: number;
  range_end: number;
  label: string;
  total_hits: number;
  total_occurrences: number;
  days_with_hit: number;
  hit_rate_pct: number;
}

interface GoldenPick {
  rank: number;
  value: string;
  segment_start: number;
}

interface GoldenModelResult {
  model: "lo2" | "lo3" | "pair_hot" | "pair_cold";
  label: string;
  days_used: number;
  segments: SegmentStat[];
  top_segments: SegmentStat[];
  picks: GoldenPick[];
  warning?: string;
}

interface VipBoardResponse {
  status: string;
  elapsed_ms: number;
  region: Region;
  window_days: number;
  segment_size: number;
  max_rank: number;
  computed_at: string;
  cached_until: string;
  lo2: GoldenModelResult;
  lo3: GoldenModelResult;
  pair_hot: GoldenModelResult;
  pair_cold: GoldenModelResult;
}

const MODEL_THEME: Record<GoldenModelResult["model"], { accent: string; border: string; bg: string; chip: string; chipText: string }> = {
  lo2: {
    accent: "text-blue-300",
    border: "border-blue-500/40",
    bg: "bg-blue-500/5",
    chip: "bg-blue-500/15 border-blue-400/40",
    chipText: "text-blue-100",
  },
  lo3: {
    accent: "text-pink-300",
    border: "border-pink-500/40",
    bg: "bg-pink-500/5",
    chip: "bg-pink-500/15 border-pink-400/40",
    chipText: "text-pink-100",
  },
  pair_hot: {
    accent: "text-orange-300",
    border: "border-orange-500/40",
    bg: "bg-orange-500/5",
    chip: "bg-orange-500/15 border-orange-400/40",
    chipText: "text-orange-100",
  },
  pair_cold: {
    accent: "text-cyan-300",
    border: "border-cyan-500/40",
    bg: "bg-cyan-500/5",
    chip: "bg-cyan-500/15 border-cyan-400/40",
    chipText: "text-cyan-100",
  },
};

const MODEL_ICON: Record<GoldenModelResult["model"], string> = {
  lo2: "🎯",
  lo3: "🎲",
  pair_hot: "🔥",
  pair_cold: "❄️",
};

const DEBOUNCE_MS = 3000;

export default function VipBoardPage({ region }: { region: Region }) {
  const toast = useToast();
  const [data, setData] = useState<VipBoardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [lastClickAt, setLastClickAt] = useState(0);
  const [progressStep, setProgressStep] = useState("");
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear state when region changes (cache is per region)
  useEffect(() => {
    setData(null);
  }, [region]);

  // Fake progress steps to keep user calm during 30-60s backend compute
  const startProgressTicker = useCallback(() => {
    const steps = [
      "Đang nạp lịch sử...",
      "Replay Lô 2 chân...",
      "Replay Lô 3 chân...",
      "Replay Đá nóng...",
      "Replay Đá lạnh...",
      "Tìm quãng hay ra nhất...",
      "Gom kết quả...",
    ];
    let i = 0;
    setProgressStep(steps[0]);
    progressTimer.current = setInterval(() => {
      i = Math.min(i + 1, steps.length - 1);
      setProgressStep(steps[i]);
    }, 6000);
  }, []);

  const stopProgressTicker = useCallback(() => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    setProgressStep("");
  }, []);

  const compute = useCallback(async (bust: boolean = false) => {
    const now = Date.now();
    if (now - lastClickAt < DEBOUNCE_MS) {
      toast.show("error", `Chờ ${Math.ceil((DEBOUNCE_MS - (now - lastClickAt)) / 1000)}s rồi bấm lại`);
      return;
    }
    setLastClickAt(now);
    setLoading(true);
    startProgressTicker();
    try {
      const bustParam = bust ? "&bust=1" : "";
      const res = await fetch(`/api/predict/golden?region=${region}&days=${days}${bustParam}`);
      const json = (await res.json()) as VipBoardResponse | { status: string; detail: string };
      if (json.status !== "success") {
        toast.show("error", `Lỗi: ${"detail" in json ? json.detail : "unknown"}`);
        return;
      }
      setData(json as VipBoardResponse);
      toast.show("success", `Tính xong (${(((json as VipBoardResponse).elapsed_ms ?? 0) / 1000).toFixed(1)}s)`);
    } catch (err) {
      toast.show("error", `Lỗi mạng: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
      stopProgressTicker();
    }
  }, [region, days, lastClickAt, toast, startProgressTicker, stopProgressTicker]);

  useEffect(() => () => stopProgressTicker(), [stopProgressTicker]);

  async function copy(items: string[], label: string) {
    if (items.length === 0) return;
    try {
      await navigator.clipboard.writeText(items.join(", "));
      toast.show("success", `Copy ${label}: ${items.length}`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  async function copyAll() {
    if (!data) return;
    const lines = [
      `🎯 LÔ 2 CHÂN (${data.lo2.picks.length}): ${data.lo2.picks.map((p) => p.value).join(", ")}`,
      `🎲 LÔ 3 CHÂN (${data.lo3.picks.length}): ${data.lo3.picks.map((p) => p.value).join(", ")}`,
      `🔥 ĐÁ NÓNG (${data.pair_hot.picks.length}): ${data.pair_hot.picks.map((p) => p.value).join(", ")}`,
      `❄️ ĐÁ LẠNH (${data.pair_cold.picks.length}): ${data.pair_cold.picks.map((p) => p.value).join(", ")}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      const total = data.lo2.picks.length + data.lo3.picks.length + data.pair_hot.picks.length + data.pair_cold.picks.length;
      toast.show("success", `Copy toàn bộ board (${total} mục)`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  return (
    <>
      {/* Header */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-yellow-900/30 via-amber-900/20 to-orange-900/20 border border-yellow-500/40 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
              🏆 VIP Tổng Hợp — {REGION_LABELS[region]}
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              Tìm <b className="text-yellow-300">2 quãng hay ra nhất</b> của mỗi model trong {days} ngày qua → gom thành board đánh duy nhất
            </p>
            <p className="text-[0.7rem] md:text-xs text-slate-400 mt-1">
              Phân tích top 50 hạng × 10 quãng × 4 model (lô 2c, lô 3c, đá nóng, đá lạnh) • Cache 60 phút
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              disabled={loading}
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100 disabled:opacity-50"
            >
              <option value={14}>14 ngày (nhanh)</option>
              <option value={30}>30 ngày (mặc định)</option>
              <option value={60}>60 ngày (có thể chậm)</option>
            </select>
            <button
              onClick={() => compute(false)}
              disabled={loading}
              className="px-4 py-1.5 text-xs rounded bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold disabled:opacity-50"
            >
              {loading ? "⏳ Đang tính..." : data ? "🔄 Tính lại" : "▶️ Tính VIP"}
            </button>
            {data && !loading && (
              <button
                onClick={() => compute(true)}
                className="px-3 py-1.5 text-xs rounded bg-white/[0.08] hover:bg-white/[0.12] text-slate-200 font-semibold border border-slate-600"
                title="Bỏ qua cache, tính lại từ đầu"
              >
                ↻ Bust cache
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="mt-3 rounded bg-yellow-500/10 border border-yellow-500/30 px-3 py-2">
            <p className="text-xs text-yellow-200 font-mono">⏳ {progressStep || "Khởi tạo..."} <span className="text-slate-400">(thường mất 20-50s, không tắt tab)</span></p>
          </div>
        )}
      </section>

      {/* Empty state */}
      {!data && !loading && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-base mb-2">🏆 Chưa có data — bấm <b className="text-yellow-300">"Tính VIP"</b> để bắt đầu</p>
          <p className="text-xs">Hệ thống sẽ backtest {days} ngày × 4 model rồi gom kết quả. Mất khoảng 20-50 giây.</p>
        </div>
      )}

      {/* Copy All */}
      {data && (
        <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-yellow-500/30 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm md:text-base font-bold text-yellow-300">📋 Bảng VIP — sẵn sàng đánh</h3>
              <p className="text-[0.7rem] text-slate-400 mt-0.5">
                Tính lúc {new Date(data.computed_at).toLocaleTimeString("vi-VN")} • cache đến {new Date(data.cached_until).toLocaleTimeString("vi-VN")} • {(data.elapsed_ms / 1000).toFixed(1)}s compute
              </p>
            </div>
            <button
              onClick={copyAll}
              className="px-4 py-2 text-sm rounded bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold"
            >
              📋 Copy TOÀN BỘ board
            </button>
          </div>
        </section>
      )}

      {/* 4 model sections */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {([data.lo2, data.lo3, data.pair_hot, data.pair_cold] as GoldenModelResult[]).map((m) => (
            <ModelSection key={m.model} m={m} onCopy={copy} />
          ))}
        </div>
      )}
    </>
  );
}

function ModelSection({ m, onCopy }: { m: GoldenModelResult; onCopy: (items: string[], label: string) => void }) {
  const theme = MODEL_THEME[m.model];
  const icon = MODEL_ICON[m.model];
  const [expanded, setExpanded] = useState(false);

  const picksText = m.picks.map((p) => p.value);

  return (
    <section className={`rounded-2xl ${theme.bg} border ${theme.border} overflow-hidden`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b border-white/[0.06]`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h3 className={`text-sm md:text-base font-bold ${theme.accent}`}>
            {icon} {m.label}
            <span className="ml-2 text-[0.65rem] text-slate-400 font-normal">
              {m.picks.length} mục • {m.days_used} ngày replay
            </span>
          </h3>
          <button
            onClick={() => onCopy(picksText, m.label)}
            disabled={m.picks.length === 0}
            className={`px-3 py-1 text-[0.7rem] rounded ${theme.chip} ${theme.chipText} font-bold border disabled:opacity-40 hover:opacity-90`}
          >
            📋 Copy {m.picks.length}
          </button>
        </div>
        {/* Top segments summary */}
        {m.top_segments.length > 0 && (
          <p className="text-[0.7rem] text-slate-400">
            Quãng vàng:{" "}
            {m.top_segments.map((s, i) => (
              <span key={s.range_start}>
                <b className={theme.accent}>{s.label}</b>
                <span className="text-slate-500"> ({s.total_hits} hit / {s.hit_rate_pct}%)</span>
                {i < m.top_segments.length - 1 ? <span className="text-slate-600"> + </span> : null}
              </span>
            ))}
          </p>
        )}
        {m.warning && (
          <p className="text-[0.65rem] text-rose-300 mt-1">⚠️ {m.warning}</p>
        )}
      </div>

      {/* Picks chips */}
      <div className="p-3 md:p-4">
        {m.picks.length === 0 ? (
          <p className="text-center text-slate-500 text-xs py-4">Không có pick (chưa đủ data)</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {m.picks.map((p) => (
              <span
                key={`${p.value}-${p.rank}`}
                title={`Rank #${p.rank} • thuộc quãng ${p.segment_start}-${p.segment_start + 4}`}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border ${theme.chip} ${theme.chipText} font-mono font-bold text-sm`}
              >
                {p.value}
                <span className="text-[0.55rem] opacity-60">#{p.rank}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expandable: all segments table */}
      <div className="border-t border-white/[0.06]">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2 text-left text-[0.7rem] text-slate-400 hover:bg-white/[0.03] flex items-center justify-between"
        >
          <span>{expanded ? "▼" : "▶"} Chi tiết {m.segments.length} quãng</span>
          <span className="text-slate-500 italic">(rank 1-{m.segments.length * 5})</span>
        </button>
        {expanded && (
          <div className="px-4 pb-3">
            <table className="w-full text-[0.7rem]">
              <thead className="text-slate-500 uppercase">
                <tr>
                  <th className="px-2 py-1 text-left">Quãng</th>
                  <th className="px-2 py-1 text-right">Hits</th>
                  <th className="px-2 py-1 text-right">Hit rate</th>
                  <th className="px-2 py-1 text-right">Ngày có hit</th>
                </tr>
              </thead>
              <tbody>
                {m.segments.map((s) => {
                  const isTop = m.top_segments.some((t) => t.range_start === s.range_start);
                  return (
                    <tr
                      key={s.range_start}
                      className={`border-t border-white/[0.04] ${isTop ? `${theme.bg} font-bold` : ""}`}
                    >
                      <td className={`px-2 py-1 font-mono ${isTop ? theme.accent : "text-slate-400"}`}>
                        {isTop && "⭐ "}{s.label}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-slate-200">{s.total_hits}</td>
                      <td className="px-2 py-1 text-right font-mono text-slate-300">{s.hit_rate_pct}%</td>
                      <td className="px-2 py-1 text-right font-mono text-slate-400">{s.days_with_hit}/{m.days_used}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
