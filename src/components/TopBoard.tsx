"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import type { LimitItem } from "@/lib/types";

type Direction = "cold" | "hot";

const SIZES = [5, 10, 15, 20, 25, 30, 50] as const;
const PREFS_KEY = "top_board_prefs_v1";

interface Prefs {
  size: number;
  dir: Direction;
}

const DEFAULTS: Prefs = { size: 10, dir: "cold" };

export default function TopBoard({ limits }: { limits: LimitItem[] }) {
  const toast = useToast();
  const [size, setSize] = useState<number>(DEFAULTS.size);
  const [dir, setDir] = useState<Direction>(DEFAULTS.dir);

  // Hydrate after mount so SSR markup matches.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<Prefs>;
      if (typeof p.size === "number" && SIZES.includes(p.size as (typeof SIZES)[number])) setSize(p.size);
      if (p.dir === "cold" || p.dir === "hot") setDir(p.dir);
    } catch {
      /* ignore unreadable storage */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ size, dir }));
    } catch {
      /* ignore */
    }
  }, [size, dir]);

  const rows = useMemo(() => {
    const sorted = [...limits].sort((a, b) => {
      const d =
        dir === "cold"
          ? a.appearance_count - b.appearance_count
          : b.appearance_count - a.appearance_count;
      // Stable tie-break so the list doesn't reshuffle between refreshes.
      return d || a.lo_number.localeCompare(b.lo_number);
    });
    return sorted.slice(0, size);
  }, [limits, size, dir]);

  const maxCount = useMemo(
    () => limits.reduce((m, l) => Math.max(m, l.appearance_count), 1),
    [limits]
  );

  async function copyNumbers() {
    if (rows.length === 0) return;
    const txt = rows
      .map((r) => r.lo_number)
      .sort()
      .join(" ");
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
            Đếm số kỳ đã về trong 30 kỳ gần nhất
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
        {/* Direction */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setDir("cold")}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
              dir === "cold" ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.18]"
            }`}
          >
            ❄️ Ít ra nhất
          </button>
          <button
            onClick={() => setDir("hot")}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
              dir === "hot" ? "bg-[#e11d48] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.18]"
            }`}
          >
            🔥 Nhiều ra nhất
          </button>
        </div>

        {/* Size — multiples of 5 */}
        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((n) => (
            <button
              key={n}
              onClick={() => setSize(n)}
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

        <table className="w-full text-sm">
          <thead>
            <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
              <th className="px-2 py-2 text-left font-bold">#</th>
              <th className="px-2 py-2 text-left font-bold">Lô</th>
              <th className="px-2 py-2 text-left font-bold">Số kỳ đã về / 30</th>
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
                  {l.tracked && <span className="ml-1.5 text-[0.6rem] text-[#ffd24a]">👁️</span>}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    {/* Bar makes the spread readable without reading every number */}
                    <div className="flex-1 h-2 rounded-full bg-[#0e1a2e] overflow-hidden min-w-[3rem]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(4, (l.appearance_count / maxCount) * 100)}%`,
                          background: dir === "cold" ? "#4da6ff" : "#e11d48",
                        }}
                      />
                    </div>
                    <span className="numeric text-xs font-bold text-white w-6 text-right">
                      {l.appearance_count}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                  {l.days_since_last}d
                </td>
                <td className="px-2 py-2 text-right numeric font-bold text-white">
                  {l.current_limit}n
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
