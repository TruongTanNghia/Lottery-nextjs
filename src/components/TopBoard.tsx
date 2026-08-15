"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import type { LimitItem, Region } from "@/lib/types";

type Direction = "cold" | "hot";

const SIZES = [5, 10, 15, 20, 25, 30, 50] as const;

interface DailyRow {
  date: string;
  lo_number: string;
  count: number;
}

export default function TopBoard({
  limits,
  recent,
  region,
  onChanged,
}: {
  limits: LimitItem[];
  recent: DailyRow[];
  region: Region;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [size, setSize] = useState(10);
  const [dir, setDir] = useState<Direction>("hot");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // The selection lives on the server because it halves real limits.
  useEffect(() => {
    fetch(`/api/config/top?region=${region}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.data) return;
        setSize(d.data.size);
        setDir(d.data.dir);
        setEnabled(d.data.enabled);
      })
      .catch(() => void 0);
  }, [region]);

  async function persist(next: { size?: number; dir?: Direction; enabled?: boolean }) {
    const cfg = { size, dir, enabled, ...next };
    setSize(cfg.size);
    setDir(cfg.dir);
    setEnabled(cfg.enabled);
    setSaving(true);
    try {
      const res = await fetch(`/api/config/top?region=${region}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error(await res.text());
      onChanged(); // pull fresh limits — the halving changed
    } catch (err) {
      toast.show("error", `Lỗi lưu: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  // Server already ranked and flagged these; just read the flag so the table
  // can never disagree with the limits shown elsewhere.
  const rows = useMemo(
    () =>
      limits
        .filter((l) => l.in_top)
        .sort((a, b) => {
          const ha = a.recent_hits ?? 0;
          const hb = b.recent_hits ?? 0;
          const primary = dir === "cold" ? ha - hb : hb - ha;
          if (primary !== 0) return primary;
          const qa = a.rhythm?.draws_since_last ?? 0;
          const qb = b.rhythm?.draws_since_last ?? 0;
          return (dir === "cold" ? qb - qa : qa - qb) || a.lo_number.localeCompare(b.lo_number);
        }),
    [limits, dir]
  );

  // Same 7-draw strip as the watchlist, so both boards read the same way.
  const { dates, hitBy } = useMemo(() => {
    const byDate = new Map<string, Set<string>>();
    for (const r of recent) {
      if (!byDate.has(r.date)) byDate.set(r.date, new Set());
      byDate.get(r.date)!.add(r.lo_number);
    }
    return { dates: [...byDate.keys()].sort().slice(-7), hitBy: byDate };
  }, [recent]);

  const patternOf = (lo: string) => dates.map((d) => (hitBy.get(d)?.has(lo) ? 1 : 0));
  const dayLabels = dates.map((d) => d.slice(8, 10));

  const totalSaved = rows.reduce(
    (s, l) => s + ((l.limit_before_tracking ?? l.current_limit) - l.current_limit),
    0
  );

  async function copyNumbers() {
    if (rows.length === 0) return;
    const txt = rows.map((r) => r.lo_number).sort().join(" ");
    try {
      await navigator.clipboard.writeText(txt);
      toast.show("success", `Đã copy ${rows.length} lô`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  return (
    <section className="plate rise rise-3 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">
            🏆 Top {size} lô {dir === "cold" ? "ÍT ra nhất" : "NHIỀU ra nhất"}
          </h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            7 kỳ gần nhất · hạn mức các lô này đã chia đôi
          </p>
        </div>
        <button
          onClick={copyNumbers}
          disabled={rows.length === 0}
          className="btn-ghost px-3 py-1.5 rounded-lg text-xs"
        >
          📋 Copy
        </button>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => persist({ dir: "cold" })}
            disabled={saving}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
              dir === "cold" ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.18]"
            }`}
          >
            ❄️ Ít ra nhất
          </button>
          <button
            onClick={() => persist({ dir: "hot" })}
            disabled={saving}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
              dir === "hot" ? "bg-[#e11d48] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.18]"
            }`}
          >
            🔥 Nhiều ra nhất
          </button>
          <label className="ml-auto inline-flex items-center gap-2 text-xs text-[#c2d4ea] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enabled}
              disabled={saving}
              onChange={(e) => persist({ enabled: e.target.checked })}
              className="accent-emerald-500"
            />
            Bật chia đôi
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((n) => (
            <button
              key={n}
              onClick={() => persist({ size: n })}
              disabled={saving}
              className={`min-w-[2.75rem] px-2.5 py-1.5 text-xs font-bold rounded transition-colors numeric ${
                size === n
                  ? "bg-[#10b981] text-[#04251a]"
                  : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.18]"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">
            {enabled ? "Chưa có dữ liệu" : "Đang tắt — hạn mức giữ nguyên"}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-2 py-2 text-left font-bold">#</th>
                  <th className="px-2 py-2 text-left font-bold">Lô</th>
                  <th className="px-2 py-2 text-center font-bold">
                    Nhịp {dates.length} kỳ
                    <div className="hidden sm:flex justify-center gap-[3px] mt-1 font-normal normal-case tracking-normal text-[0.5rem]">
                      {dayLabels.map((d) => (
                        <span key={d} className="w-5 text-center">
                          {d}
                        </span>
                      ))}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-right font-bold">Về</th>
                  <th className="px-2 py-2 text-right font-bold">Chưa về</th>
                  <th className="px-2 py-2 text-right font-bold">Hạn mức</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l, i) => (
                  <tr key={l.lo_number} className="border-t border-[var(--hairline)] hover:bg-white/[0.06]">
                    <td className="px-2 py-2 numeric text-[var(--text-muted)]">{i + 1}</td>
                    <td className="px-2 py-2">
                      <span className="numeric text-base font-bold text-white">{l.lo_number}</span>
                      {l.rhythm?.due && <span className="ml-1.5 text-[0.6rem]">👁️</span>}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-center gap-[3px]">
                        {patternOf(l.lo_number).map((v, k) => (
                          <span
                            key={k}
                            title={v ? "về" : "không về"}
                            className={`w-5 h-5 rounded-[3px] ${
                              v
                                ? "bg-[#10b981] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                                : "bg-[#0e1a2e] border border-[rgba(150,185,235,0.18)]"
                            }`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span className="numeric text-sm font-bold text-white">
                        {l.recent_hits ?? 0}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                      {l.days_since_last}d
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {l.limit_before_tracking !== undefined &&
                        l.limit_before_tracking !== l.current_limit && (
                          <span className="numeric text-[0.7rem] text-[var(--text-muted)] line-through mr-1.5">
                            {l.limit_before_tracking}n
                          </span>
                        )}
                      <span className="numeric font-bold text-[#ffd24a]">{l.current_limit}n</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[0.7rem] text-[var(--text-muted)] text-right">
              Chia đôi {rows.length} lô — giảm tổng{" "}
              <strong className="text-[#ffd24a]">{totalSaved}n</strong> tiền nhận vào
            </div>
          </>
        )}
      </div>
    </section>
  );
}
