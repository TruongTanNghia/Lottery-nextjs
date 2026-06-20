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
 * Card design — ONE row of hôm-qua numbers per card.
 *   • Header: date pair + trùng/total + percentage + per-card copy
 *   • Body: full hôm-qua list, sorted asc; overlap (trùng) chips glow red
 *   • Click card body to multi-select; the sticky bar at top unions trùng
 *
 * No "Nay" row, no "Còn lại" toggle — the single hôm-qua row IS the copy
 * target. Overlap is highlighted in-place by color (red = also ra hôm nay).
 */
function DayPairCard({
  row,
  isSelected,
  onToggleSelect,
  onCopy,
}: {
  row: DayPairRow;
  isSelected: boolean;
  onToggleSelect: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  const overlap = new Set(row.hits);
  const prevList = Array.from(row.candidateCounts.keys()).sort();

  return (
    <div
      onClick={onToggleSelect}
      className={`rounded-xl cursor-pointer transition-all ${
        isSelected
          ? "bg-cyan-950/30 border border-cyan-400/60 shadow-[0_0_0_3px_rgba(34,211,238,0.08)]"
          : "bg-[#111827] border border-white/[0.06] hover:border-white/[0.15]"
      }`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          {/* Visual select indicator */}
          <span
            className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
              isSelected
                ? "bg-cyan-500 border-cyan-400 text-white"
                : "border-white/[0.15] text-transparent"
            } text-[0.55rem] font-bold`}
          >
            ✓
          </span>
          <span className="font-mono text-sm md:text-[0.95rem] font-bold text-slate-100">
            {shortDate(row.prevDate)}
            <span className="mx-1.5 text-slate-500">→</span>
            {shortDate(row.date)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[0.7rem] md:text-xs font-mono">
          <span className="px-1.5 py-0.5 rounded bg-red-500/12 text-red-300 border border-red-500/25">
            trùng <b>{row.hits.length}</b>
            <span className="text-red-400/70">/{prevList.length}</span>
            <span className="ml-1 text-red-400/80">({(row.overlapPct * 100).toFixed(1)}%)</span>
          </span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            loại đúng <b>{row.misses.length}</b>
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onCopy(prevList.join(", "), `${prevList.length} số hôm qua`);
          }}
          className="ml-auto px-2.5 py-1 rounded text-[0.7rem] font-semibold bg-white/[0.04] hover:bg-cyan-600 hover:text-white text-slate-300 border border-white/[0.06]"
          title="Copy toàn bộ số hôm qua (1 dòng dưới)"
        >
          📋 Copy {prevList.length}
        </button>
      </div>

      {/* Body — 1 row of hôm qua numbers (sorted asc), trùng = red */}
      <div className="px-4 py-3">
        {prevList.length === 0 ? (
          <div className="text-xs text-slate-600 italic">— không có dữ liệu hôm qua —</div>
        ) : (
          <div className="flex flex-wrap gap-x-2.5 gap-y-1 font-mono leading-relaxed">
            {prevList.map((n) => {
              const c = row.candidateCounts.get(n) ?? 0;
              const isHit = overlap.has(n);
              return (
                <span
                  key={n}
                  className={
                    isHit
                      ? "text-sm md:text-[0.95rem] font-bold text-red-400"
                      : "text-[0.78rem] md:text-[0.85rem] text-slate-500"
                  }
                >
                  {n}
                  {c > 1 && (
                    <sup className={`ml-0.5 text-[0.55rem] ${isHit ? "text-red-300" : "text-slate-600"}`}>
                      ×{c}
                    </sup>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
