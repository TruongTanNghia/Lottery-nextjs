"use client";

/**
 * "Cuốn Chiếu" page — Past K-day endings dump.
 *
 * Latest scraped date D = "hôm nay" (excluded from output).
 * Window = K days BEFORE today: {D-K, ..., D-1}.
 *   K=1 → just hôm qua (D-1)
 *   K=2 → hôm qua + hôm kia (D-1 + D-2)
 *   K=3 → 3 ngày trước
 *
 * Output is the UNION of all distinct 3/4-digit endings from those K days,
 * with each ending tagged by how many of the K days it appeared in. Sorted
 * by day-count desc so numbers that recurred across the window come first.
 *
 * Copy = full distinct list. The day-count coloring is for visual scanning
 * ("số xổ đi xổ lại" pops out) but does NOT filter the output.
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

interface EndingHit {
  ending: string;
  days: number;       // # of distinct days the ending appeared in (within window)
  dateList: string[]; // sorted asc dates — for tooltip
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

  // Past K days (EXCLUDING the latest scraped day = "hôm nay").
  // Customer's exact ask: K=1 → hôm qua only, K=2 → hôm qua + hôm kia, etc.
  const result = useMemo(() => {
    if (perDateEndings.size === 0) return null;
    const sortedDates = Array.from(perDateEndings.keys()).sort(); // asc
    if (sortedDates.length < 2) return { latestDate: null, windowDates: [], endings: [] as EndingHit[] };

    const latestDate = sortedDates[sortedDates.length - 1];
    // Take K days BEFORE the latest. slice(-(K+1), -1) handles edge of short history.
    const windowDates = sortedDates.slice(-(carryK + 1), -1);
    if (windowDates.length === 0) return { latestDate, windowDates, endings: [] as EndingHit[] };

    // For each ending, collect the days in the window it appeared on.
    const appearances = new Map<string, string[]>();
    for (const date of windowDates) {
      const e = perDateEndings.get(date);
      if (!e) continue;
      const src = digits === 3 ? e.d3 : e.d4;
      for (const tail of src) {
        if (!appearances.has(tail)) appearances.set(tail, []);
        appearances.get(tail)!.push(date);
      }
    }

    const endings: EndingHit[] = [];
    for (const [ending, dateList] of appearances) {
      endings.push({ ending, days: dateList.length, dateList });
    }
    // Sort: most-recurring first (số xổ đi xổ lại lên đầu), then ending asc
    endings.sort((a, b) => b.days - a.days || a.ending.localeCompare(b.ending));

    return { latestDate, windowDates, endings };
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
      ) : result === null || result.windowDates.length === 0 ? (
        <div className="px-3 py-12 text-center text-slate-500 text-sm">
          Cần ít nhất {carryK + 1} ngày data ở miền đã chọn (hôm nay + {carryK} ngày trước).
        </div>
      ) : (
        <ResultBox
          digits={digits}
          carryK={carryK}
          latestDate={result.latestDate}
          windowDates={result.windowDates}
          endings={result.endings}
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
  latestDate,
  windowDates,
  endings,
  onCopy,
}: {
  digits: Digits;
  carryK: number;
  latestDate: string | null;
  windowDates: string[];
  endings: EndingHit[];
  onCopy: (text: string, label: string) => void;
}) {
  const copyList = endings.map((e) => e.ending).join(", ");

  // Window label: "T4 17/6 → T5 18/6" (multi-day) or just "T5 18/6" (K=1)
  const windowLabel =
    windowDates.length === 1
      ? shortDate(windowDates[0])
      : `${shortDate(windowDates[0])} → ${shortDate(windowDates[windowDates.length - 1])}`;

  const titleByK: Record<number, string> = {
    1: "Số Đuôi Hôm Qua",
    2: "Số Đuôi 2 Ngày Trước (hôm qua + hôm kia)",
    3: "Số Đuôi 3 Ngày Trước",
    5: "Số Đuôi 5 Ngày Trước",
  };
  const title = titleByK[carryK] ?? `Số Đuôi ${carryK} Ngày Trước`;

  // Legend: how many endings appeared in N days within the window.
  // Only meaningful when K ≥ 2 (otherwise all are "×1 ngày").
  const byDays = new Map<number, number>();
  for (const e of endings) byDays.set(e.days, (byDays.get(e.days) ?? 0) + 1);
  const dayCountGroups = Array.from(byDays.entries()).sort((a, b) => b[0] - a[0]);
  const recurringCount = endings.filter((e) => e.days >= 2).length;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-red-950/15 to-[#111827] border border-red-500/20 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.06] flex flex-wrap items-center gap-x-3 gap-y-1">
        <div>
          <h2 className="text-sm md:text-base font-bold text-slate-100">🎯 {title}</h2>
          <div className="text-[0.65rem] md:text-xs text-slate-500 font-mono mt-0.5">
            {windowLabel} · {digits} số cuối
            {latestDate && (
              <span className="text-slate-600"> · (hôm nay {shortDate(latestDate)} không tính)</span>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs md:text-sm font-mono">
            <b className="text-red-400 text-base md:text-lg">{endings.length}</b>
            <span className="text-slate-500"> số</span>
          </span>
          <button
            onClick={() => onCopy(copyList, `${endings.length} số đuôi`)}
            disabled={endings.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📋 Copy {endings.length} số
          </button>
        </div>
      </div>

      {/* Legend strip — only when K ≥ 2 so there's day-count variety */}
      {carryK >= 2 && dayCountGroups.length > 0 && (
        <div className="px-5 py-2 border-b border-white/[0.04] flex flex-wrap gap-3 text-[0.65rem] md:text-xs font-mono text-slate-400">
          {dayCountGroups.map(([days, count]) => (
            <span key={days}>
              <b className={days >= 2 ? "text-red-400" : "text-slate-500"}>×{days}</b> ngày: {count} số
            </span>
          ))}
          {recurringCount > 0 && (
            <span className="ml-auto text-red-400">
              ✨ <b>{recurringCount}</b> số xổ ≥2 ngày (xổ đi xổ lại)
            </span>
          )}
        </div>
      )}

      {/* Numbers grid */}
      <div className="px-5 py-4">
        {endings.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm italic">
            — Không có dữ liệu trong {carryK} ngày này —
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {endings.map((e) => (
              <span
                key={e.ending}
                className={`inline-flex items-baseline gap-0.5 px-2 py-1 rounded font-mono border ${
                  e.days >= 4
                    ? "text-base md:text-lg font-bold bg-red-500/25 border-red-400 text-red-200 shadow-[0_0_12px_-3px_rgba(239,68,68,0.5)]"
                    : e.days === 3
                    ? "text-sm md:text-base font-bold bg-red-500/18 border-red-500/55 text-red-300"
                    : e.days === 2
                    ? "text-sm md:text-[0.95rem] font-bold bg-red-500/10 border-red-500/35 text-red-300"
                    : "text-[0.78rem] md:text-[0.85rem] bg-white/[0.02] border-white/[0.06] text-slate-400"
                }`}
                title={e.dateList.join(", ")}
              >
                {e.ending}
                {e.days >= 2 && (
                  <sup className="text-[0.55rem] font-bold text-red-200">×{e.days}</sup>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
