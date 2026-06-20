"use client";

/**
 * "Cuốn Chiếu" page — Rolling overlap analysis between consecutive draw days.
 *
 * For each consecutive day pair (D-K..D-1 → D):
 *   - Candidate set = distinct 3/4-digit endings from the previous K days
 *   - Hit set      = candidates that DID appear on D (eliminating them = miss)
 *   - Miss set     = candidates that did NOT appear on D (eliminating them = good)
 *
 * KPIs over the N-day backtest:
 *   - Avg overlap %       (= % of yesterday's endings that repeated today)
 *   - Avg elimination %   (= 1 - overlap, the "loại đúng" rate)
 *   - Baseline expectation (random) for comparison
 *   - Lift                (actual elimination rate ÷ baseline)
 *
 * Default K=1 (D-1 → D, true "cuốn chiếu") with optional K=2/3/5 to test
 * carrying multi-day candidate pools.
 *
 * Region toggle (MN/MB/MT) controls which prize blocks contribute to BOTH
 * the candidate set and the appeared set. Defaults to all 3 miền on, matching
 * the customer's "gộp 3 đài" workflow.
 */

import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
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
 * Count how many times each N-digit ending appears across all prize numbers
 * in the given province blocks. Returns Map<ending, count> — count>1 when the
 * same ending repeats across multiple prizes (or appears twice in one prize
 * row, common in MN/MT G.7 / lô tail patterns).
 *
 * "nhớ làm cho chính xác" — every prize number contributes EXACTLY ONE event
 * to its tail. No dedup at extraction time so we can render ×N in the UI.
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

interface DayPairRow {
  date: string;                          // target day D (yyyy-mm-dd)
  prevDate: string;                      // immediate previous day (D-1) — for display
  candidateCounts: Map<string, number>;  // counts aggregated over D-K..D-1
  targetCounts: Map<string, number>;     // counts on D
  hits: string[];                        // candidates ∩ target (= loại sai)
  misses: string[];                      // candidates \ target (= loại đúng)
  overlapPct: number;                    // hits.length / candidates.length
  missPct: number;                       // 1 - overlapPct
}

const SPACE_SIZE: Record<Digits, number> = { 3: 1000, 4: 10000 };

export default function RollingPage({ region: _region }: { region: Region }) {
  // We use `_region` only to match the standard page signature — this view
  // always loads all 3 miền (the customer's workflow is cross-region).
  void _region;

  const toast = useToast();

  // Controls
  const [digits, setDigits] = useState<Digits>(3);
  const [backtestDays, setBacktestDays] = useState(30);
  const [carryK, setCarryK] = useState(1);
  const [regions, setRegions] = useState({ xsmn: true, xsmb: true, xsmt: true });
  const [showMuted, setShowMuted] = useState(false);

  // Multi-select: clicking a card toggles it; the sticky bar at top
  // unions the `hits` (số trùng) across all selected days and exposes a Copy.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggleSelect(date: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }
  function clearSelect() {
    setSelected(new Set());
  }

  // Data state
  const [cache, setCache] = useState<Partial<Record<Region, ApiResponse>>>({});
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      // We need backtestDays + carryK (max 5) days of history to compute every row.
      const fetchN = Math.max(backtestDays + 5, 45);
      const [a, b, c] = await Promise.all(
        (["xsmn", "xsmb", "xsmt"] as const).map((r) =>
          fetch(`/api/results/history-full?region=${r}&days=${fetchN}`).then((res) => res.json())
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

  // Per-date endings (3 digits + 4 digits) — with counts so we can render ×N.
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

  // Build the rolling rows: for each day D (newest backtestDays), gather endings
  // from D-K..D-1 as candidates, then check against D.
  const rows = useMemo<DayPairRow[]>(() => {
    if (perDateEndings.size === 0) return [];
    const sortedDates = Array.from(perDateEndings.keys()).sort(); // asc
    const out: DayPairRow[] = [];

    for (let i = carryK; i < sortedDates.length; i++) {
      const targetDate = sortedDates[i];

      // Aggregate counts across D-1..D-K. When same ending appears on multiple
      // carry days, sum its occurrences (so a number that hit twice on D-1 AND
      // once on D-2 shows ×3 on the candidate strip — true to source).
      const candidateCounts = new Map<string, number>();
      for (let k = 1; k <= carryK; k++) {
        const prev = perDateEndings.get(sortedDates[i - k]);
        if (!prev) continue;
        const src = digits === 3 ? prev.d3 : prev.d4;
        for (const [tail, c] of src) {
          candidateCounts.set(tail, (candidateCounts.get(tail) ?? 0) + c);
        }
      }
      const target = perDateEndings.get(targetDate)!;
      const targetCounts = digits === 3 ? target.d3 : target.d4;

      const hits: string[] = [];
      const misses: string[] = [];
      for (const c of candidateCounts.keys()) {
        if (targetCounts.has(c)) hits.push(c);
        else misses.push(c);
      }
      hits.sort();
      misses.sort();

      const candNum = candidateCounts.size;
      const overlapPct = candNum === 0 ? 0 : hits.length / candNum;

      out.push({
        date: targetDate,
        prevDate: sortedDates[i - 1],
        candidateCounts,
        targetCounts,
        hits,
        misses,
        overlapPct,
        missPct: 1 - overlapPct,
      });
    }
    // Take the most recent backtestDays rows
    return out.slice(-backtestDays).reverse();
  }, [perDateEndings, digits, carryK, backtestDays]);

  // Union of trùng across selected day cards — auto-dedup, sorted asc.
  const selectedUnion = useMemo(() => {
    if (selected.size === 0) return [] as string[];
    const set = new Set<string>();
    for (const r of rows) {
      if (!selected.has(r.date)) continue;
      for (const h of r.hits) set.add(h);
    }
    return Array.from(set).sort();
  }, [rows, selected]);

  // Aggregate KPIs
  const kpi = useMemo(() => {
    if (rows.length === 0) return null;
    const overlaps = rows.map((r) => r.overlapPct);
    const avg = overlaps.reduce((s, n) => s + n, 0) / overlaps.length;
    const variance = overlaps.reduce((s, n) => s + (n - avg) ** 2, 0) / overlaps.length;
    const std = Math.sqrt(variance);

    const avgAppeared = rows.reduce((s, r) => s + r.targetCounts.size, 0) / rows.length;
    const avgCand = rows.reduce((s, r) => s + r.candidateCounts.size, 0) / rows.length;
    const baselineOverlap = avgAppeared / SPACE_SIZE[digits];

    return {
      days: rows.length,
      avgOverlap: avg,
      stdOverlap: std,
      avgMiss: 1 - avg,
      avgCandidates: avgCand,
      avgAppeared,
      baselineOverlap,
      missLift: baselineOverlap > 0 ? (1 - avg) / (1 - baselineOverlap) : 0,
    };
  }, [rows, digits]);

  // ── Reload when fetch window changes (backtestDays grew) ─────────────────
  useEffect(() => {
    const haveDays = Math.max(
      cache.xsmn?.data.length ?? 0,
      cache.xsmb?.data.length ?? 0,
      cache.xsmt?.data.length ?? 0
    );
    if (haveDays > 0 && haveDays < backtestDays + carryK) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backtestDays, carryK]);

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.show("success", `Đã copy ${label}`),
      () => toast.show("error", "Lỗi copy")
    );
  }

  return (
    <div className="space-y-3">
      {/* ─── Single compact control bar ─────────────────────────────── */}
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
          options={[30, 60, 90, 180].map((n) => ({ v: n, label: `${n}n` }))}
          value={backtestDays}
          onChange={(v) => setBacktestDays(v as number)}
        />
        <SegPicker
          options={[1, 2, 3, 5].map((k) => ({ v: k, label: `K=${k}` }))}
          value={carryK}
          onChange={(v) => setCarryK(v as number)}
        />
        <button
          onClick={() => setShowMuted((s) => !s)}
          className={`px-2 py-0.5 rounded text-xs font-semibold border ${
            showMuted
              ? "bg-slate-700 text-slate-200 border-slate-600"
              : "bg-white/[0.03] text-slate-500 border-white/[0.06] hover:text-slate-300"
          }`}
          title={showMuted ? "Ẩn dòng còn lại" : "Hiện dòng còn lại (mờ)"}
        >
          {showMuted ? "Ẩn còn lại" : "+ Còn lại"}
        </button>
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

      {/* ─── Single-line KPI summary ────────────────────────────────── */}
      {loading ? (
        <div className="px-3 py-8 text-center text-slate-500 text-sm">Đang tải...</div>
      ) : kpi === null ? (
        <div className="px-3 py-8 text-center text-slate-500 text-sm">
          Chưa đủ dữ liệu ({carryK + 1}+ ngày).
        </div>
      ) : (
        <>
          <div className="px-3 py-2 text-[0.7rem] md:text-xs text-slate-400 font-mono flex flex-wrap gap-x-4 gap-y-1">
            <span>{kpi.days} ngày</span>
            <span>
              Trùng TB <b className="text-red-400">{(kpi.avgOverlap * 100).toFixed(1)}%</b>
            </span>
            <span>
              Loại đúng <b className="text-emerald-400">{(kpi.avgMiss * 100).toFixed(1)}%</b>
            </span>
            <span className="text-slate-500">
              (random {((1 - kpi.baselineOverlap) * 100).toFixed(1)}%)
            </span>
          </div>

          {/* ─── Sticky union bar — shown only when user selects ──── */}
          {selected.size > 0 && (
            <div className="sticky top-[100px] md:top-[112px] z-30 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-cyan-950/95 border border-cyan-500/40 backdrop-blur shadow-lg">
              <span className="text-xs font-semibold text-cyan-200">
                ✓ {selected.size} ngày
              </span>
              <span className="text-xs font-mono text-cyan-300">
                {selectedUnion.length} số trùng (gộp)
              </span>
              <button
                onClick={() =>
                  copyText(selectedUnion.join(", "), `${selectedUnion.length} số trùng từ ${selected.size} ngày`)
                }
                className="ml-auto px-2.5 py-1 rounded text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white"
                disabled={selectedUnion.length === 0}
              >
                Copy {selectedUnion.length} số
              </button>
              <button
                onClick={clearSelect}
                className="px-2 py-1 rounded text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
          )}

          {/* ─── Day pair cards ─────────────────────────────────────── */}
          <div className="space-y-2">
            {rows.map((r) => (
              <DayPairCard
                key={r.date}
                row={r}
                carryK={carryK}
                showMuted={showMuted}
                isSelected={selected.has(r.date)}
                onToggleSelect={() => toggleSelect(r.date)}
                onCopy={copyText}
              />
            ))}
          </div>
        </>
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

// ──────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────

function shortDate(d: string): string {
  const [, m, day] = d.split("-").map(Number);
  const dt = new Date(d + "T00:00:00Z");
  const dow = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][dt.getUTCDay()];
  return `${dow} ${day}/${m}`;
}

/**
 * Minimal card — header line + the red "trùng" row only by default.
 * Click anywhere on the card body to toggle multi-select.
 * "showMuted" prop adds a dim "Qua" row of non-overlapping ones from D-1
 * (the user's "+Còn lại" toggle).
 */
function DayPairCard({
  row,
  carryK,
  showMuted,
  isSelected,
  onToggleSelect,
  onCopy,
}: {
  row: DayPairRow;
  carryK: number;
  showMuted: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  const overlap = new Set(row.hits);
  const prevList = Array.from(row.candidateCounts.keys()).sort();
  const nonHits = prevList.filter((n) => !overlap.has(n));

  return (
    <div
      onClick={onToggleSelect}
      className={`rounded-lg px-3 py-2 cursor-pointer transition-colors ${
        isSelected
          ? "bg-cyan-950/40 border border-cyan-500/60"
          : "bg-[#111827] border border-white/[0.05] hover:border-white/[0.12]"
      }`}
    >
      {/* Header line — minimal: dates + count + percentage */}
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-mono text-sm font-bold text-slate-200">
          {shortDate(row.prevDate)} → {shortDate(row.date)}
        </span>
        <span className="text-[0.7rem] font-mono text-slate-500">
          {row.hits.length}/{prevList.length} ({(row.overlapPct * 100).toFixed(1)}%)
        </span>
      </div>

      {/* RED row — số trùng. The whole point. */}
      {row.hits.length === 0 ? (
        <div className="text-[0.7rem] text-slate-600 italic">— không trùng số nào —</div>
      ) : (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-sm md:text-base font-bold text-red-400 leading-relaxed">
          {row.hits.map((n) => {
            const cToday = row.targetCounts.get(n) ?? 0;
            const cPrev = row.candidateCounts.get(n) ?? 0;
            const maxC = Math.max(cToday, cPrev);
            return (
              <span key={n}>
                {n}
                {maxC > 1 && <sup className="ml-0.5 text-[0.55rem] text-red-300">×{maxC}</sup>}
              </span>
            );
          })}
        </div>
      )}

      {/* Optional muted row — only when user explicitly toggles it on */}
      {showMuted && nonHits.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-white/[0.04] flex flex-wrap gap-x-1.5 gap-y-0.5 font-mono text-[0.7rem] text-slate-600 leading-relaxed">
          <span className="text-[0.55rem] uppercase mr-0.5 text-slate-700">
            {carryK === 1 ? "Qua" : `−${carryK}n`}
          </span>
          {nonHits.map((n) => {
            const c = row.candidateCounts.get(n) ?? 0;
            return (
              <span key={n}>
                {n}
                {c > 1 && <sup className="ml-0.5 text-[0.5rem] text-slate-700">×{c}</sup>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
