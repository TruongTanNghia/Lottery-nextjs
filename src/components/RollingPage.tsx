"use client";

/**
 * "Cuốn Chiếu" page — Recurring endings analysis.
 *
 * Anchor at the latest scraped date D. Window = K+1 days {D-K, ..., D-1, D}.
 * For each 3 or 4-digit ending, count how many DISTINCT days in the window it
 * appeared in. An ending that appeared in ≥ 2 distinct days = "số xổ lại"
 * (recurring number).
 *
 * Output is a single box: the list of recurring endings, sorted by day-count
 * (most recurring first), with ×N badge when N > 2.
 *
 * Region toggle (MN/MB/MT) controls which province blocks contribute. Defaults
 * to all 3 miền on, matching the customer's cross-region workflow.
 */

import { useEffect, useMemo, useState } from "react";
import type { Region } from "@/lib/types";
import { useToast } from "./Toast";

type Digits = 3 | 4;

interface ProvinceBlock {
  name: string;
  prizes: { prize_type: string; numbers: string[] }[];
}

interface DayBlock {
  date: string;
  provinces: ProvinceBlock[];
}

interface ApiResponse {
  status: string;
  region: Region;
  days: number;
  total_dates: number;
  total_rows: number;
  data: DayBlock[];
}

/** Distinct endings (set, no count) — we only need presence-per-day here. */
function extractEndingsSet(blocks: ProvinceBlock[], digits: Digits): Set<string> {
  const s = new Set<string>();
  for (const prov of blocks) {
    for (const prize of prov.prizes) {
      for (const num of prize.numbers) {
        if (num.length >= digits) s.add(num.slice(-digits));
      }
    }
  }
  return s;
}

interface Recurring {
  ending: string;
  days: number;      // distinct days the ending appeared in (within window)
  dateList: string[]; // sorted asc dates it appeared on — for tooltip / future use
}

export default function RollingPage({ region: _region }: { region: Region }) {
  void _region; // page always uses 3 miền regardless of nav region

  const toast = useToast();

  // Controls
  const [digits, setDigits] = useState<Digits>(3);
  const [carryK, setCarryK] = useState(1);
  const [regions, setRegions] = useState({ xsmn: true, xsmb: true, xsmt: true });

  // Data state
  const [cache, setCache] = useState<Partial<Record<Region, ApiResponse>>>({});
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      // K up to 5 → need 6 days of data minimum; fetch a generous 14 for buffer.
      const [a, b, c] = await Promise.all(
        (["xsmn", "xsmb", "xsmt"] as const).map((r) =>
          fetch(`/api/results/history-full?region=${r}&days=14`).then((res) => res.json())
        )
      );
      setCache({ xsmn: a, xsmb: b, xsmt: c });
    } catch {
      toast.show("error", "Lỗi khi tải data 3 miền");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-date endings sets (separate for 3-digit and 4-digit modes).
  const perDateEndings = useMemo(() => {
    const map = new Map<string, { d3: Set<string>; d4: Set<string> }>();
    const datesSet = new Set<string>();
    for (const r of ["xsmn", "xsmb", "xsmt"] as const) {
      if (!regions[r]) continue;
      for (const day of cache[r]?.data ?? []) datesSet.add(day.date);
    }
    for (const date of datesSet) {
      const blocks: ProvinceBlock[] = [];
      for (const r of ["xsmn", "xsmb", "xsmt"] as const) {
        if (!regions[r]) continue;
        const day = cache[r]?.data.find((d) => d.date === date);
        if (day) blocks.push(...day.provinces);
      }
      map.set(date, {
        d3: extractEndingsSet(blocks, 3),
        d4: extractEndingsSet(blocks, 4),
      });
    }
    return map;
  }, [cache, regions]);

  // Recurring endings within the K+1 day window ending at the latest scraped date.
  const result = useMemo(() => {
    if (perDateEndings.size === 0) return null;
    const sortedDates = Array.from(perDateEndings.keys()).sort(); // asc

    // Window = last (K+1) dates of the sorted list. If fewer dates exist, use what we have.
    const windowSize = carryK + 1;
    const windowDates = sortedDates.slice(-windowSize);
    if (windowDates.length < 2) return { windowDates, recurring: [] as Recurring[] };

    // Count distinct-day appearance per ending across the window.
    const appearances = new Map<string, string[]>(); // ending -> dates
    for (const date of windowDates) {
      const e = perDateEndings.get(date);
      if (!e) continue;
      const src = digits === 3 ? e.d3 : e.d4;
      for (const tail of src) {
        if (!appearances.has(tail)) appearances.set(tail, []);
        appearances.get(tail)!.push(date);
      }
    }

    const recurring: Recurring[] = [];
    for (const [ending, dateList] of appearances) {
      if (dateList.length >= 2) {
        recurring.push({ ending, days: dateList.length, dateList });
      }
    }
    // Sort: most-recurring first, then ending asc
    recurring.sort((a, b) => b.days - a.days || a.ending.localeCompare(b.ending));

    return { windowDates, recurring };
  }, [perDateEndings, digits, carryK]);

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.show("success", `Đã copy ${label}`),
      () => toast.show("error", "Lỗi copy")
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {/* ─── Control bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-[#111827] border border-white/[0.06]">
        <SegPicker
          options={[
            { v: 3, label: "3 số" },
            { v: 4, label: "4 số" },
          ]}
          value={digits}
          onChange={(v) => setDigits(v as Digits)}
        />
        <SegPicker
          options={[1, 2, 3, 5].map((k) => ({ v: k, label: `K=${k}` }))}
          value={carryK}
          onChange={(v) => setCarryK(v as number)}
        />
        <div className="inline-flex p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          {(["xsmn", "xsmb", "xsmt"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRegions((s) => ({ ...s, [r]: !s[r] }))}
              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                regions[r] ? "bg-cyan-600 text-white" : "text-slate-500"
              }`}
            >
              {{ xsmn: "MN", xsmb: "MB", xsmt: "MT" }[r]}
            </button>
          ))}
        </div>
        <button
          onClick={loadAll}
          disabled={loading}
          className="ml-auto px-2.5 py-1 rounded text-xs font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* ─── Result box ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="px-3 py-12 text-center text-slate-500 text-sm">Đang tải…</div>
      ) : result === null || result.windowDates.length < 2 ? (
        <div className="px-3 py-12 text-center text-slate-500 text-sm">
          Cần ít nhất {carryK + 1} ngày data ở miền đã chọn.
        </div>
      ) : (
        <ResultBox
          digits={digits}
          carryK={carryK}
          windowDates={result.windowDates}
          recurring={result.recurring}
          onCopy={copyText}
        />
      )}
    </div>
  );
}

function SegPicker<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { v: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      {options.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          className={`px-2 py-0.5 rounded text-xs font-semibold ${
            o.v === value ? "bg-cyan-600 text-white" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function shortDate(d: string): string {
  const [, m, day] = d.split("-").map(Number);
  const dt = new Date(d + "T00:00:00Z");
  const dow = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][dt.getUTCDay()];
  return `${dow} ${day}/${m}`;
}

function ResultBox({
  digits,
  carryK,
  windowDates,
  recurring,
  onCopy,
}: {
  digits: Digits;
  carryK: number;
  windowDates: string[];
  recurring: Recurring[];
  onCopy: (text: string, label: string) => void;
}) {
  const copyList = recurring.map((r) => r.ending).join(", ");
  const windowLabel = windowDates.length
    ? `${shortDate(windowDates[0])} → ${shortDate(windowDates[windowDates.length - 1])}`
    : "—";

  // Group by day-count for the legend strip (helps user see "wow, 3 numbers
  // appeared in all 4 days").
  const byDays = new Map<number, number>();
  for (const r of recurring) byDays.set(r.days, (byDays.get(r.days) ?? 0) + 1);
  const dayCountGroups = Array.from(byDays.entries()).sort((a, b) => b[0] - a[0]);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-red-950/20 to-[#111827] border border-red-500/25 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.06] flex flex-wrap items-center gap-x-3 gap-y-1">
        <div>
          <h2 className="text-sm md:text-base font-bold text-slate-100">
            🎯 Số Xổ Lại — {carryK + 1} ngày gần nhất
          </h2>
          <div className="text-[0.65rem] md:text-xs text-slate-500 font-mono mt-0.5">
            {windowLabel} · {digits} số cuối
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs md:text-sm font-mono">
            <b className="text-red-400 text-base md:text-lg">{recurring.length}</b>
            <span className="text-slate-500"> số xổ lại</span>
          </span>
          <button
            onClick={() => onCopy(copyList, `${recurring.length} số xổ lại`)}
            disabled={recurring.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📋 Copy {recurring.length} số
          </button>
        </div>
      </div>

      {/* Legend strip — only shown when there's variety in day-counts */}
      {dayCountGroups.length > 1 && (
        <div className="px-5 py-2 border-b border-white/[0.04] flex flex-wrap gap-3 text-[0.65rem] md:text-xs font-mono text-slate-400">
          {dayCountGroups.map(([days, count]) => (
            <span key={days}>
              <b className="text-red-400">×{days}</b> ngày: {count} số
            </span>
          ))}
        </div>
      )}

      {/* Numbers grid */}
      <div className="px-5 py-4">
        {recurring.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm italic">
            — Không có số nào xổ lại trong {carryK + 1} ngày này —
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {recurring.map((r) => (
              <span
                key={r.ending}
                className={`inline-flex items-baseline gap-0.5 px-2 py-1 rounded font-mono font-bold border ${
                  r.days >= 4
                    ? "text-base md:text-lg bg-red-500/25 border-red-400 text-red-200 shadow-[0_0_12px_-3px_rgba(239,68,68,0.5)]"
                    : r.days === 3
                    ? "text-sm md:text-base bg-red-500/18 border-red-500/55 text-red-300"
                    : "text-sm md:text-[0.95rem] bg-red-500/10 border-red-500/35 text-red-300"
                }`}
                title={r.dateList.join(", ")}
              >
                {r.ending}
                {r.days > 2 && (
                  <sup className="text-[0.6rem] font-bold text-red-200">×{r.days}</sup>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
