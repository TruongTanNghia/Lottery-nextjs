"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { REGION_LABELS, type Region } from "@/lib/types";

interface LoDetail {
  lo_number: string;
  current_limit: number;
  days_since_last: number;
  consecutive_days: number;
  appearance_count: number;
  appearance_window_days: number;
  last_appeared_date: string | null;
  history?: { date: string; count: number }[];
}

interface ConfigData {
  cost_multiplier: number;
  price_per_point: number;
}

interface Props {
  lo: string | null;
  region: Region;
  config: ConfigData | null;
  onClose: () => void;
}

export default function LoDetailModal({ lo, region, config, onClose }: Props) {
  const [data, setData] = useState<LoDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lo) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch(`/api/limits/${lo}?region=${region}`)
      .then((r) => r.json())
      .then((d) => setData(d.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [lo, region]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!lo) return null;

  const limit = data?.current_limit ?? 0;
  const costMult = config?.cost_multiplier ?? 18;
  const ppp = config?.price_per_point ?? 75;
  const betCost = limit * costMult * ppp;
  const winPerHit = limit * ppp;

  function categoryEmoji(consec: number, daysSince: number): string {
    if (consec >= 4) return "🔥🔥🔥🔥 Hot!";
    if (consec >= 3) return "🔥🔥🔥 Nóng";
    if (consec >= 2) return "🔥🔥 Liên tiếp";
    if (daysSince === 0) return "✅ Mới về";
    if (daysSince <= 3) return "🟢 Gần đây";
    if (daysSince <= 7) return "🟡 Đang nguội";
    return "🔴 Lâu rồi";
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[#111827] border border-white/[0.06] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <h2 className="text-lg font-bold">
            Lô {lo} — {REGION_LABELS[region]}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.03] hover:bg-red-500/15 hover:text-red-500 transition-colors">
            ✕
          </button>
        </div>

        <div className="p-6">
          {loading || !data ? (
            <div className="text-center py-10 text-slate-500">Đang tải...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Stat label="Hạn mức hiện tại" value={`${limit} điểm`} valueClass="text-emerald-400" />
                <Stat
                  label={`Lần về (${data.appearance_window_days} ngày)`}
                  value={`${data.appearance_count} lần`}
                  valueClass="text-amber-500"
                  border="amber"
                />
                <Stat label="Ngày chưa về" value={String(data.days_since_last)} />
                <Stat
                  label="Liên tiếp"
                  value={data.consecutive_days > 0 ? `${data.consecutive_days} ngày` : "—"}
                />
              </div>

              <div className="mb-5 p-3.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <div className="text-[0.68rem] uppercase tracking-wider text-slate-500 mb-1">Trạng thái</div>
                <div className="text-base font-bold">
                  {categoryEmoji(data.consecutive_days, data.days_since_last)}
                </div>
              </div>

              <h3 className="text-sm font-semibold text-slate-400 mb-2">💵 Tính tiền nếu đánh {limit} điểm</h3>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <Stat
                  label="Xác cược (chi phí)"
                  value={`${betCost.toLocaleString("vi-VN")}đ`}
                  valueClass="text-red-500"
                  sublabel={`${limit} × ${costMult} × ${ppp}`}
                  border="red"
                />
                <Stat
                  label="Trúng / mỗi lần lô về"
                  value={`+${winPerHit.toLocaleString("vi-VN")}đ`}
                  valueClass="text-emerald-500"
                  sublabel={`${limit} × ${ppp}`}
                  border="emerald"
                />
              </div>

              <div className="p-3.5 rounded-lg bg-white/[0.03] border border-white/[0.06] mb-5">
                <div className="text-[0.68rem] uppercase tracking-wider text-slate-500 mb-1">Lần cuối về</div>
                <div className="text-base font-semibold font-mono">
                  {formatDate(data.last_appeared_date)}
                </div>
              </div>

              {data.history && data.history.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-slate-400 mb-2">📅 Lịch sử xuất hiện (30 ngày)</h3>
                  <div className="space-y-1">
                    {data.history.slice(0, 15).map((h, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between px-3 py-2 rounded text-sm ${
                          i % 2 === 0 ? "bg-white/[0.03]" : ""
                        }`}
                      >
                        <span className="text-slate-500 font-mono text-xs">{formatDate(h.date)}</span>
                        <span className="text-emerald-400 font-mono font-semibold">
                          ✅ {h.count} lần — +{(limit * ppp * h.count).toLocaleString("vi-VN")}đ
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = "",
  sublabel,
  border,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sublabel?: string;
  border?: "red" | "emerald" | "amber";
}) {
  const borderClass =
    border === "red"
      ? "border-red-500/25"
      : border === "emerald"
      ? "border-emerald-500/25"
      : border === "amber"
      ? "border-amber-500/25"
      : "border-white/[0.06]";
  return (
    <div className={`p-3.5 rounded-lg bg-white/[0.03] border ${borderClass}`}>
      <div className="text-[0.68rem] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className={`text-base font-bold font-mono ${valueClass}`}>{value}</div>
      {sublabel && <div className="text-[0.65rem] text-slate-500 mt-1 font-mono">{sublabel}</div>}
    </div>
  );
}
