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

function extractEndings(blocks: ProvinceBlock[], digits: Digits): Set<string> {
  const set = new Set<string>();
  for (const prov of blocks) {
    for (const prize of prov.prizes) {
      for (const num of prize.numbers) {
        if (num.length >= digits) set.add(num.slice(-digits));
      }
    }
  }
  return set;
}

interface DayPairRow {
  date: string;             // target day D (yyyy-mm-dd)
  candidates: string[];     // sorted endings carried over from D-K..D-1
  appeared: string[];       // sorted endings observed on D
  hits: string[];           // candidates ∩ appeared (= loại sai)
  misses: string[];         // candidates \ appeared (= loại đúng)
  overlapPct: number;       // hits.length / candidates.length
  missPct: number;          // 1 - overlapPct
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
  const [expanded, setExpanded] = useState<string | null>(null);

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

  // Per-date endings (3 digits + 4 digits) honoring the active region toggles.
  // Recomputes when regions or cached payload change — cheap because cache
  // is JSON already in memory.
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
      map.set(date, { d3: extractEndings(blocks, 3), d4: extractEndings(blocks, 4) });
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
      const candidateSet = new Set<string>();
      for (let k = 1; k <= carryK; k++) {
        const prev = perDateEndings.get(sortedDates[i - k]);
        if (!prev) continue;
        const src = digits === 3 ? prev.d3 : prev.d4;
        for (const s of src) candidateSet.add(s);
      }
      const target = perDateEndings.get(targetDate)!;
      const appeared = digits === 3 ? target.d3 : target.d4;

      const hits: string[] = [];
      const misses: string[] = [];
      for (const c of candidateSet) {
        if (appeared.has(c)) hits.push(c);
        else misses.push(c);
      }
      hits.sort();
      misses.sort();

      const candidates = Array.from(candidateSet).sort();
      const overlapPct = candidates.length === 0 ? 0 : hits.length / candidates.length;

      out.push({
        date: targetDate,
        candidates,
        appeared: Array.from(appeared).sort(),
        hits,
        misses,
        overlapPct,
        missPct: 1 - overlapPct,
      });
    }
    // Take the most recent backtestDays rows
    return out.slice(-backtestDays).reverse();
  }, [perDateEndings, digits, carryK, backtestDays]);

  // Aggregate KPIs
  const kpi = useMemo(() => {
    if (rows.length === 0) return null;
    const overlaps = rows.map((r) => r.overlapPct);
    const avg = overlaps.reduce((s, n) => s + n, 0) / overlaps.length;
    const variance = overlaps.reduce((s, n) => s + (n - avg) ** 2, 0) / overlaps.length;
    const std = Math.sqrt(variance);

    // Baseline: if you pick a random candidate set of size = avg(|candidates|)
    // from the space, expected overlap % = (avg|appeared|) / SPACE_SIZE.
    const avgAppeared = rows.reduce((s, r) => s + r.appeared.length, 0) / rows.length;
    const avgCand = rows.reduce((s, r) => s + r.candidates.length, 0) / rows.length;
    const baselineOverlap = avgAppeared / SPACE_SIZE[digits];

    return {
      days: rows.length,
      avgOverlap: avg,
      stdOverlap: std,
      avgMiss: 1 - avg,
      avgCandidates: avgCand,
      avgAppeared,
      baselineOverlap,
      // lift > 1 → eliminating these is BETTER than random; < 1 → worse
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
    <div className="space-y-4 md:space-y-6">
      {/* ─── Header / Intro ─────────────────────────────────────────────── */}
      <section className="rounded-2xl bg-gradient-to-br from-cyan-950/60 to-[#111827] border border-cyan-500/20 px-5 md:px-7 py-4 md:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
              🌀 Cuốn Chiếu — Đối Chiếu Hôm Qua vs Hôm Nay
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1">
              Lấy đuôi {digits === 3 ? "3" : "4"} chữ của <b>{carryK} ngày trước</b> làm tập "loại bỏ" → check trên ngày hiện tại có bao nhiêu số <b>trùng (loại sai)</b> vs <b>không trùng (loại đúng)</b>.
            </p>
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-700 hover:bg-cyan-600 text-white disabled:opacity-50"
          >
            {loading ? "Đang tải..." : "🔄 Tải lại"}
          </button>
        </div>
      </section>

      {/* ─── Controls ───────────────────────────────────────────────────── */}
      <section className="rounded-2xl bg-[#111827] border border-white/[0.06] p-4 md:p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
          {/* Mode */}
          <div>
            <div className="text-[0.62rem] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
              Chế độ
            </div>
            <div className="inline-flex p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              {([3, 4] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDigits(d)}
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    digits === d
                      ? "bg-cyan-600 text-white"
                      : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {d} số cuối
                </button>
              ))}
            </div>
          </div>

          {/* Backtest days */}
          <div>
            <div className="text-[0.62rem] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
              N ngày backtest
            </div>
            <div className="inline-flex p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              {[10, 20, 30, 45].map((n) => (
                <button
                  key={n}
                  onClick={() => setBacktestDays(n)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold ${
                    backtestDays === n
                      ? "bg-cyan-600 text-white"
                      : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Carry K */}
          <div>
            <div className="text-[0.62rem] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
              Gộp K ngày trước
            </div>
            <div className="inline-flex p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              {[1, 2, 3, 5].map((k) => (
                <button
                  key={k}
                  onClick={() => setCarryK(k)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold ${
                    carryK === k
                      ? "bg-cyan-600 text-white"
                      : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Region toggles */}
          <div>
            <div className="text-[0.62rem] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
              Miền (cộng dồn)
            </div>
            <div className="inline-flex p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06] gap-0.5">
              {(["xsmn", "xsmb", "xsmt"] as const).map((r) => {
                const labels = { xsmn: "MN", xsmb: "MB", xsmt: "MT" };
                const colors = {
                  xsmn: "bg-blue-600 text-white",
                  xsmb: "bg-rose-600 text-white",
                  xsmt: "bg-amber-600 text-white",
                };
                return (
                  <button
                    key={r}
                    onClick={() => setRegions((s) => ({ ...s, [r]: !s[r] }))}
                    className={`px-2.5 py-1 rounded text-xs font-semibold ${
                      regions[r] ? colors[r] : "text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    {labels[r]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ─── KPI strip ──────────────────────────────────────────────────── */}
      {loading ? (
        <section className="rounded-2xl bg-[#111827] border border-white/[0.06] p-8 text-center text-slate-400 text-sm">
          Đang tải dữ liệu 3 miền...
        </section>
      ) : kpi === null ? (
        <section className="rounded-2xl bg-[#111827] border border-white/[0.06] p-8 text-center text-slate-400 text-sm">
          Chưa đủ dữ liệu. Cần ít nhất {carryK + 1} ngày có data ở miền đã chọn.
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPI
              label="Ngày test"
              value={kpi.days.toString()}
              hint={`Gộp K=${carryK} ngày, ${digits} số cuối`}
            />
            <KPI
              label="Đuôi/ngày TB"
              value={kpi.avgAppeared.toFixed(1)}
              hint={`/${SPACE_SIZE[digits].toLocaleString()} space`}
            />
            <KPI
              label="Tỉ lệ trùng (loại sai)"
              value={`${(kpi.avgOverlap * 100).toFixed(1)}%`}
              hint={`±${(kpi.stdOverlap * 100).toFixed(1)}% std`}
              tone="bad"
            />
            <KPI
              label="Tỉ lệ loại đúng"
              value={`${(kpi.avgMiss * 100).toFixed(1)}%`}
              hint={`Baseline ngẫu nhiên: ${((1 - kpi.baselineOverlap) * 100).toFixed(2)}%`}
              tone="good"
            />
            <KPI
              label="Lift vs random"
              value={kpi.missLift === 0 ? "—" : `×${kpi.missLift.toFixed(3)}`}
              hint={kpi.missLift > 1.02 ? "Tốt hơn ngẫu nhiên" : kpi.missLift < 0.98 ? "Tệ hơn ngẫu nhiên" : "Ngang ngẫu nhiên"}
              tone={kpi.missLift > 1.02 ? "good" : kpi.missLift < 0.98 ? "bad" : undefined}
            />
          </section>

          {/* ─── Sparkline ───────────────────────────────────────────────── */}
          <Sparkline rows={rows} baselineOverlap={kpi.baselineOverlap} />

          {/* ─── Day pair table ─────────────────────────────────────────── */}
          <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-sm font-bold">📋 Bảng Cuốn Chiếu — Mỗi Hàng = 1 Cặp Ngày</h2>
              <span className="text-[0.62rem] text-slate-500 font-mono">
                D-{carryK}..D-1 → D
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm">
                <thead className="bg-white/[0.02] text-[0.62rem] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Ngày D</th>
                    <th className="text-right px-3 py-2 font-semibold">#Cand</th>
                    <th className="text-right px-3 py-2 font-semibold">#Đuôi D</th>
                    <th className="text-right px-3 py-2 font-semibold">Trùng</th>
                    <th className="text-right px-3 py-2 font-semibold">% Trùng</th>
                    <th className="text-right px-3 py-2 font-semibold">Loại đúng</th>
                    <th className="text-center px-3 py-2 font-semibold">⏵</th>
                    <th className="text-center px-3 py-2 font-semibold">Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = expanded === r.date;
                    const overlapColor =
                      r.overlapPct > kpi.baselineOverlap * 1.5
                        ? "text-red-400"
                        : r.overlapPct > kpi.baselineOverlap * 1.05
                        ? "text-amber-400"
                        : "text-emerald-400";
                    return (
                      <FragmentRow
                        key={r.date}
                        row={r}
                        isOpen={isOpen}
                        overlapColor={overlapColor}
                        digits={digits}
                        onToggle={() => setExpanded(isOpen ? null : r.date)}
                        onCopy={(text, label) => copyText(text, label)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────

function KPI({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  const valueColor =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-white";
  return (
    <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-3 md:p-4">
      <div className="text-[0.62rem] uppercase tracking-wider text-slate-500 font-semibold">
        {label}
      </div>
      <div className={`text-lg md:text-2xl font-bold font-mono mt-1 ${valueColor}`}>
        {value}
      </div>
      {hint && <div className="text-[0.62rem] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function Sparkline({
  rows,
  baselineOverlap,
}: {
  rows: DayPairRow[];
  baselineOverlap: number;
}) {
  // rows are newest-first; reverse for chronological X-axis
  const series = [...rows].reverse();
  if (series.length < 2) return null;

  const W = 800;
  const H = 80;
  const padX = 8;
  const padY = 10;
  const maxY = Math.max(...series.map((s) => s.overlapPct), baselineOverlap * 2, 0.01);
  const step = (W - 2 * padX) / Math.max(series.length - 1, 1);

  const points = series.map((s, i) => {
    const x = padX + i * step;
    const y = H - padY - (s.overlapPct / maxY) * (H - 2 * padY);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const baselineY = H - padY - (baselineOverlap / maxY) * (H - 2 * padY);

  return (
    <section className="rounded-2xl bg-[#111827] border border-white/[0.06] px-4 md:px-5 py-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-slate-300">📈 Tỉ Lệ Trùng Theo Ngày</h3>
        <div className="flex gap-3 text-[0.62rem] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-0.5 bg-cyan-400" />
            Thực tế
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-0.5 bg-slate-500 border-t border-dashed" />
            Baseline ngẫu nhiên
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16 md:h-20" preserveAspectRatio="none">
        <line
          x1={padX}
          y1={baselineY}
          x2={W - padX}
          y2={baselineY}
          stroke="rgb(100 116 139)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="rgb(34 211 238)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {series.map((s, i) => {
          const x = padX + i * step;
          const y = H - padY - (s.overlapPct / maxY) * (H - 2 * padY);
          return <circle key={i} cx={x} cy={y} r={1.5} fill="rgb(34 211 238)" />;
        })}
      </svg>
      <div className="flex justify-between text-[0.55rem] text-slate-600 mt-1">
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </section>
  );
}

function FragmentRow({
  row,
  isOpen,
  overlapColor,
  digits,
  onToggle,
  onCopy,
}: {
  row: DayPairRow;
  isOpen: boolean;
  overlapColor: string;
  digits: Digits;
  onToggle: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <>
      <tr className="border-t border-white/[0.04] hover:bg-white/[0.02]">
        <td className="px-4 py-2.5 font-mono">
          <div className="font-semibold text-slate-200">{formatDate(row.date)}</div>
          <div className="text-[0.62rem] text-slate-500">{row.date}</div>
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-slate-400">{row.candidates.length}</td>
        <td className="px-3 py-2.5 text-right font-mono text-slate-400">{row.appeared.length}</td>
        <td className={`px-3 py-2.5 text-right font-mono font-bold ${overlapColor}`}>
          {row.hits.length}
        </td>
        <td className={`px-3 py-2.5 text-right font-mono font-bold ${overlapColor}`}>
          {(row.overlapPct * 100).toFixed(1)}%
        </td>
        <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-400">
          {row.misses.length}
        </td>
        <td className="px-3 py-2.5 text-center">
          <button
            onClick={onToggle}
            className="px-2 py-0.5 rounded text-[0.65rem] font-semibold bg-white/[0.04] hover:bg-white/[0.08] text-slate-300"
          >
            {isOpen ? "▾" : "▸"}
          </button>
        </td>
        <td className="px-3 py-2.5 text-center">
          <button
            onClick={() => onCopy(row.misses.join(", "), `${row.misses.length} số "loại đúng"`)}
            className="px-2 py-0.5 rounded text-[0.65rem] font-semibold bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400"
            title="Copy danh sách 'loại đúng' (= candidate không trùng)"
          >
            ✅ {row.misses.length}
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-black/20">
          <td colSpan={8} className="px-4 py-3 space-y-3">
            <DetailBlock
              title={`Candidate (D-${1}..D-${row.candidates.length === 0 ? "?" : "K"})`}
              numbers={row.candidates}
              color="text-slate-300"
              onCopy={() => onCopy(row.candidates.join(", "), "candidate")}
            />
            <DetailBlock
              title={`Trùng (loại SAI) — ${row.hits.length} số`}
              numbers={row.hits}
              color="text-red-400"
              onCopy={() => onCopy(row.hits.join(", "), "số trùng")}
            />
            <DetailBlock
              title={`Loại ĐÚNG — ${row.misses.length} số (= candidate không xuất hiện trên D)`}
              numbers={row.misses}
              color="text-emerald-400"
              onCopy={() => onCopy(row.misses.join(", "), "số loại đúng")}
            />
            <DetailBlock
              title={`Tất cả đuôi xuất hiện trên D — ${row.appeared.length} số`}
              numbers={row.appeared}
              color="text-cyan-400"
              onCopy={() => onCopy(row.appeared.join(", "), "đuôi D")}
            />
            <div className="text-[0.62rem] text-slate-500 italic">
              Mode {digits} số cuối · Space {SPACE_SIZE[digits].toLocaleString()} ·{" "}
              Loại đúng = {row.misses.length}/{row.candidates.length} ={" "}
              <b className="text-emerald-400">{(row.missPct * 100).toFixed(1)}%</b>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailBlock({
  title,
  numbers,
  color,
  onCopy,
}: {
  title: string;
  numbers: string[];
  color: string;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className={`text-[0.65rem] uppercase tracking-wider font-semibold ${color}`}>{title}</div>
        {numbers.length > 0 && (
          <button
            onClick={onCopy}
            className="px-2 py-0.5 rounded text-[0.6rem] font-semibold bg-white/[0.04] hover:bg-white/[0.08] text-slate-300"
          >
            Copy
          </button>
        )}
      </div>
      {numbers.length === 0 ? (
        <div className="text-xs text-slate-600 italic">— Không có —</div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {numbers.map((n) => (
            <span
              key={n}
              className={`px-1.5 py-0.5 rounded text-[0.65rem] font-mono font-semibold bg-white/[0.03] border border-white/[0.06] ${color}`}
            >
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
