"use client";

/**
 * "Cuốn Chiếu" page — Số Xổ Lại in past K days.
 *
 * Latest scraped date D = "hôm nay" (excluded from output).
 * Window = K days BEFORE today: {D-K, ..., D-1}.
 *
 * "Số xổ lại" = ending appearing ≥ 2 times TOTAL across all prizes in the
 * window. Works uniformly for any K:
 *   K=1 → "xổ lại" within hôm qua (đuôi ra ≥2 lần trong cùng ngày)
 *   K=2 → "xổ lại" across hôm qua + hôm kia (any combination of days/prizes)
 *   K=N → "xổ lại" anywhere in the N-day window
 *
 * Singles (count=1) are filtered out — user explicitly wanted only the
 * recurring red chips, no gray context noise.
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

/**
 * Count appearances of each N-digit ending across all prize numbers in the
 * given province blocks. Multi-count when ending repeats (within or across
 * provinces). Customer wants ×N badge to be accurate.
 */
function extractEndingsCounts(blocks: ProvinceBlock[], digits: Digits): Map<string, number> {
  const m = new Map<string, number>();
  for (const prov of blocks) {
    for (const prize of prov.prizes) {
      for (const num of prize.numbers) {
        if (num.length >= digits) {
          const tail = num.slice(-digits);
          m.set(tail, (m.get(tail) ?? 0) + 1);
        }
      }
    }
  }
  return m;
}

interface EndingHit {
  ending: string;
  count: number;      // total times this ending appeared across all prizes in window
  days: number;       // # of distinct days within window it appeared in
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

  // Per-date endings WITH counts (so we can sum totals across the window).
  const perDateEndings = useMemo(() => {
    const map = new Map<string, { d3: Map<string, number>; d4: Map<string, number> }>();
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
        d3: extractEndingsCounts(blocks, 3),
        d4: extractEndingsCounts(blocks, 4),
      });
    }
    return map;
  }, [cache, regions]);

  // "Số xổ lại" = ending with total count ≥ 2 across the K-day window
  // (window = K days BEFORE the latest scraped date).
  const result = useMemo(() => {
    if (perDateEndings.size === 0) return null;
    const sortedDates = Array.from(perDateEndings.keys()).sort(); // asc
    if (sortedDates.length < 2) return { latestDate: null, windowDates: [], endings: [] as EndingHit[] };

    const latestDate = sortedDates[sortedDates.length - 1];
    const windowDates = sortedDates.slice(-(carryK + 1), -1);
    if (windowDates.length === 0) return { latestDate, windowDates, endings: [] as EndingHit[] };

    // For each ending: sum total count + collect distinct days within window.
    const totals = new Map<string, number>();
    const days = new Map<string, string[]>();
    for (const date of windowDates) {
      const e = perDateEndings.get(date);
      if (!e) continue;
      const src = digits === 3 ? e.d3 : e.d4;
      for (const [tail, c] of src) {
        totals.set(tail, (totals.get(tail) ?? 0) + c);
        if (!days.has(tail)) days.set(tail, []);
        days.get(tail)!.push(date);
      }
    }

    // Filter to recurring only (count ≥ 2). Sort by count desc, then ending asc.
    const endings: EndingHit[] = [];
    for (const [ending, count] of totals) {
      if (count < 2) continue;
      const dateList = days.get(ending) ?? [];
      endings.push({ ending, count, days: dateList.length, dateList });
    }
    endings.sort((a, b) => b.count - a.count || a.ending.localeCompare(b.ending));

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
          options={[1, 2, 3, 5].map((k) => ({ v: k, label: `${k} ngày` }))}
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

  const windowLabel =
    windowDates.length === 1
      ? shortDate(windowDates[0])
      : `${shortDate(windowDates[0])} → ${shortDate(windowDates[windowDates.length - 1])}`;

  // Legend by total count — bucket the ×N badges so user sees distribution.
  const byCount = new Map<number, number>();
  for (const e of endings) byCount.set(e.count, (byCount.get(e.count) ?? 0) + 1);
  const countGroups = Array.from(byCount.entries()).sort((a, b) => b[0] - a[0]);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-red-950/15 to-[#111827] border border-red-500/20 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.06] flex flex-wrap items-center gap-x-3 gap-y-1">
        <div>
          <h2 className="text-sm md:text-base font-bold text-slate-100">
            🎯 Số Xổ Lại — {carryK} ngày {carryK === 1 ? "(hôm qua)" : "gần nhất"}
          </h2>
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
            <span className="text-slate-500"> số xổ lại</span>
          </span>
          <button
            onClick={() => onCopy(copyList, `${endings.length} số xổ lại`)}
            disabled={endings.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📋 Copy {endings.length} số
          </button>
        </div>
      </div>

      {/* Legend — distribution of recur counts */}
      {countGroups.length > 0 && (
        <div className="px-5 py-2 border-b border-white/[0.04] flex flex-wrap gap-3 text-[0.65rem] md:text-xs font-mono text-slate-400">
          {countGroups.map(([count, num]) => (
            <span key={count}>
              <b className="text-red-400">×{count}</b>: {num} số
            </span>
          ))}
        </div>
      )}

      {/* Numbers grid — chỉ chip đỏ, không gray. */}
      <div className="px-5 py-4">
        {endings.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm italic">
            — Không có số nào xổ lại trong {carryK} ngày này —
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {endings.map((e) => (
              <span
                key={e.ending}
                className={`inline-flex items-baseline gap-0.5 px-2 py-1 rounded font-mono font-bold border ${
                  e.count >= 5
                    ? "text-base md:text-lg bg-red-500/30 border-red-400 text-red-100 shadow-[0_0_14px_-3px_rgba(239,68,68,0.6)]"
                    : e.count === 4
                    ? "text-base bg-red-500/22 border-red-400/80 text-red-200 shadow-[0_0_10px_-3px_rgba(239,68,68,0.4)]"
                    : e.count === 3
                    ? "text-sm md:text-base bg-red-500/16 border-red-500/55 text-red-300"
                    : "text-sm md:text-[0.95rem] bg-red-500/10 border-red-500/40 text-red-300"
                }`}
                title={`${e.count} lần · ${e.days} ngày · ${e.dateList.join(", ")}`}
              >
                {e.ending}
                <sup className="text-[0.55rem] font-bold text-red-200">×{e.count}</sup>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
