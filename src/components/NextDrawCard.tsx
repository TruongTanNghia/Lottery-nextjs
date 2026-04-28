"use client";

import { useEffect, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";
import { formatDate } from "@/lib/format";

interface TopPick {
  rank: number;
  lo_number: string;
  probability: number;
  confidence: number;
}

interface Props {
  region: Region;
  latestScraped: string | null;
  onSeeAll: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function nextDateOf(dateStr: string | null): string | null {
  if (!dateStr) return null;
  // Parse as YYYY-MM-DD parts and use Date.UTC to avoid timezone drift
  const [y, m, d] = dateStr.split("-").map(Number);
  const nextMs = Date.UTC(y, m - 1, d) + 86_400_000;
  return new Date(nextMs).toISOString().slice(0, 10);
}

function todayStr(): string {
  // Use VN timezone since lottery is VN-based; en-CA gives YYYY-MM-DD format
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

export default function NextDrawCard({ region, latestScraped, onSeeAll, onRefresh, refreshing }: Props) {
  const [picks, setPicks] = useState<TopPick[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/predict?region=${region}&window=60`)
      .then((r) => r.json())
      .then((d) => {
        if (d.predictions && d.predictions.length > 0) {
          setPicks(d.predictions.slice(0, 5));
        } else {
          setPicks([]);
        }
      })
      .catch(() => setPicks([]))
      .finally(() => setLoading(false));
  }, [region]);

  const today = todayStr();
  const hasToday = latestScraped === today;
  const nextDate = hasToday ? nextDateOf(latestScraped) : today;

  const nowVN = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const hourVN = nowVN.getHours();
  const drawsClosed = hourVN >= 19;       // sau 19:00 VN tất cả miền quay xong
  const showRefreshHint = !hasToday && drawsClosed;

  return (
    <section className="rounded-2xl bg-gradient-to-br from-blue-900/30 to-purple-900/20 border border-blue-500/30 overflow-hidden mb-4 md:mb-6">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm md:text-base font-bold flex items-center gap-2">
            🔮 Dự Đoán Buổi Xổ Tiếp Theo — {REGION_LABELS[region]}
          </h2>
          <p className="text-[0.65rem] md:text-xs text-slate-400 mt-0.5">
            Data mới nhất:{" "}
            <span className={hasToday ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
              {latestScraped ? formatDate(latestScraped) : "Chưa có"}
              {hasToday && " ✓ hôm nay"}
            </span>
            {nextDate && (
              <>
                {" "}— Dự đoán cho:{" "}
                <span className="text-blue-400 font-semibold">{formatDate(nextDate)}</span>
              </>
            )}
          </p>
          {showRefreshHint && onRefresh && (
            <p className="text-[0.62rem] md:text-[0.7rem] text-amber-400/80 mt-1">
              💡 Cron chạy 19:00 VN. Nếu data {hourVN}:00 chưa có → bấm Cập nhật để force scrape.
            </p>
          )}
          {!drawsClosed && (
            <p className="text-[0.62rem] md:text-[0.7rem] text-slate-500 mt-1">
              ⏰ Chưa đến 19:00 VN — chờ cron tự động hoặc các miền chưa quay xong.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="px-3 py-1.5 text-xs rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-semibold transition-colors disabled:opacity-50"
              title="Force scrape data hôm nay"
            >
              <span className={refreshing ? "inline-block animate-spin" : ""}>↻</span>{" "}
              {refreshing ? "Đang..." : "Refresh"}
            </button>
          )}
          <button
            onClick={onSeeAll}
            className="px-3 py-1.5 text-xs rounded-md bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 font-semibold transition-colors"
          >
            Xem đầy đủ →
          </button>
        </div>
      </div>

      <div className="p-3 md:p-5">
        {loading ? (
          <div className="text-center py-6 text-slate-500 text-sm">Đang tính dự đoán...</div>
        ) : !picks || picks.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            Cần ít nhất 5 ngày data. Bấm 🔄 Cập nhật ở header.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
            {picks.map((p) => {
              const rankClass =
                p.rank === 1
                  ? "border-amber-400/60 bg-amber-500/10"
                  : p.rank === 2
                  ? "border-slate-300/40 bg-slate-300/5"
                  : p.rank === 3
                  ? "border-orange-400/40 bg-orange-500/5"
                  : "border-blue-500/30 bg-blue-500/5";
              const rankLabel = p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : `#${p.rank}`;
              return (
                <div
                  key={p.lo_number}
                  className={`rounded-xl border ${rankClass} p-3 text-center hover:scale-105 transition-transform cursor-pointer`}
                >
                  <div className="text-[0.65rem] font-mono font-bold text-slate-400 mb-1">
                    {rankLabel}
                  </div>
                  <div className="font-mono text-2xl md:text-3xl font-extrabold text-white leading-none mb-1">
                    {p.lo_number}
                  </div>
                  <div className="font-mono text-xs md:text-sm font-bold text-emerald-400">
                    {p.probability.toFixed(2)}%
                  </div>
                  <div className="text-[0.55rem] md:text-[0.6rem] text-slate-500 font-mono mt-0.5">
                    conf {p.confidence}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
