"use client";

/**
 * "Cuốn Chiếu" page — Số Xổ Lại in past K days.
 *
 * Window = K MOST RECENT scraped days (typically yesterday and back).
 *   K=1 → hôm qua (latest scraped — current "today" usually hasn't drawn yet)
 *   K=2 → hôm qua + hôm kia
 *   K=N → N ngày gần nhất
 *
 * "Số xổ lại" = ending appearing ≥ 2 times TOTAL across all prizes in window.
 *
 * Note on "hôm nay": at time of viewing, today's draw typically hasn't run
 * yet — so the latest scraped date IS effectively yesterday's data. We do
 * NOT exclude it. Earlier rev wrongly excluded latest, making K=1 show the
 * date 2 days back. Fixed.
 */

import { useEffect, useMemo, useState } from "react";
import type { Region } from "@/lib/types";
import { useToast } from "./Toast";

type Digits = 3 | 4;

const SPACE_SIZE: Record<Digits, number> = { 3: 1000, 4: 10000 };

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
  count: number;       // total times this ending appeared across all prizes in window
  days: number;        // # of distinct days within window it appeared in
  dateList: string[];  // sorted asc dates — for tooltip
  hitOnLatest: boolean; // did this ending also appear on the LATEST day of the window?
                       // (= dùng để check model trúng trên ngày mới nhất)
}

export default function RollingPage({ region: _region }: { region: Region }) {
  void _region; // page always uses 3 miền regardless of nav region

  const toast = useToast();

  // Controls
  const [digits, setDigits] = useState<Digits>(3);
  const [carryK, setCarryK] = useState(1);
  const [regions, setRegions] = useState({ xsmn: true, xsmb: true, xsmt: true });
  // "recurring" — chỉ số ra ≥2 lần (xổ đi xổ lại)
  // "all"       — toàn bộ số đuôi (dedup) trong K ngày, không lọc
  const [mode, setMode] = useState<"recurring" | "all">("recurring");
  // Số ngày backtest cho khối thống kê theo ngày (theo yêu cầu khách)
  const [backtestDays, setBacktestDays] = useState(30);

  // Data state
  const [cache, setCache] = useState<Partial<Record<Region, ApiResponse>>>({});
  const [loading, setLoading] = useState(true);

  async function loadAll(daysWanted?: number) {
    setLoading(true);
    try {
      const fetchN = Math.max(daysWanted ?? backtestDays, 14) + 5;
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

  // Re-fetch khi user tăng backtestDays vượt qua cache hiện có.
  useEffect(() => {
    const have = Math.max(
      cache.xsmn?.data.length ?? 0,
      cache.xsmb?.data.length ?? 0,
      cache.xsmt?.data.length ?? 0
    );
    if (have > 0 && have < backtestDays + carryK) loadAll(backtestDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backtestDays, carryK]);

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
  // (window = K MOST RECENT scraped days, INCLUDING the latest).
  const result = useMemo(() => {
    if (perDateEndings.size === 0) return null;
    const sortedDates = Array.from(perDateEndings.keys()).sort(); // asc
    if (sortedDates.length < 1) return { windowDates: [], endings: [] as EndingHit[] };

    const windowDates = sortedDates.slice(-carryK);
    if (windowDates.length === 0) return { windowDates, endings: [] as EndingHit[] };

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

    // totalDistinct = số đuôi khác nhau trong cửa sổ (pre-filter, dùng để tính %)
    const totalDistinct = totals.size;

    // Ngày mới nhất trong cửa sổ — dùng làm "kết quả thực tế" để check.
    // Khách hỏi: "trong số xổ lại này, model trúng được bao nhiêu con?"
    // → coi mỗi recurring ending có "trúng" nếu nó cũng xuất hiện trên ngày
    // mới nhất (= chứng tỏ pattern xổ lại vẫn còn active ở ngày gần đây nhất).
    const latestDate = windowDates[windowDates.length - 1];
    const latestEndings = perDateEndings.get(latestDate);
    const latestSet =
      latestEndings ? (digits === 3 ? latestEndings.d3 : latestEndings.d4) : new Map<string, number>();

    // Filter depends on mode:
    //   recurring → chỉ count ≥ 2 (xổ đi xổ lại)
    //   all       → tất cả đuôi (deduped — count ≥ 1)
    const endings: EndingHit[] = [];
    let hitsOnLatest = 0;
    for (const [ending, count] of totals) {
      if (mode === "recurring" && count < 2) continue;
      const dateList = days.get(ending) ?? [];
      const hit = latestSet.has(ending);
      if (hit) hitsOnLatest++;
      endings.push({ ending, count, days: dateList.length, dateList, hitOnLatest: hit });
    }
    // Sort: trúng trên latest lên đầu, sau đó count desc, ending asc
    endings.sort(
      (a, b) =>
        Number(b.hitOnLatest) - Number(a.hitOnLatest) ||
        b.count - a.count ||
        a.ending.localeCompare(b.ending)
    );

    return { windowDates, endings, totalDistinct, latestDate, hitsOnLatest };
  }, [perDateEndings, digits, carryK, mode]);

  // Per-day backtest rows — mỗi ngày D check vs cửa sổ D-K..D-1.
  // Tracks BOTH metrics per day:
  //   • Full endings: candidate = all distinct đuôi trong window (cũ)
  //   • Số xổ lại:    candidate = đuôi count ≥ 2 trong window (mới - theo yêu cầu khách)
  const backtestRows = useMemo(() => {
    if (perDateEndings.size === 0) return [];
    const sortedDates = Array.from(perDateEndings.keys()).sort(); // asc
    const out: {
      date: string;
      trung: number;
      total: number;
      trungPct: number;
      loaiDung: number;
      loaiDungPct: number;
      appearedOnD: number;
      // Số xổ lại metrics
      recurringSize: number;
      recurringHits: number;
      recurringTrungPct: number;
      xoLaiRate: number;       // recurring / total (% đuôi là xổ lại)
    }[] = [];

    for (let i = carryK; i < sortedDates.length; i++) {
      const targetDate = sortedDates[i];

      // Aggregate counts across D-K..D-1 (need counts to detect recurring).
      const totals = new Map<string, number>();
      for (let k = 1; k <= carryK; k++) {
        const prev = perDateEndings.get(sortedDates[i - k]);
        if (!prev) continue;
        const src = digits === 3 ? prev.d3 : prev.d4;
        for (const [tail, c] of src) {
          totals.set(tail, (totals.get(tail) ?? 0) + c);
        }
      }
      const target = perDateEndings.get(targetDate)!;
      const targetSet = digits === 3 ? target.d3 : target.d4;

      // Full endings stat (cũ)
      const candidateSet = new Set(totals.keys());
      let trung = 0;
      for (const c of candidateSet) {
        if (targetSet.has(c)) trung++;
      }
      const total = candidateSet.size;
      const trungPct = total === 0 ? 0 : trung / total;

      // Số xổ lại stat (mới) — đuôi count ≥ 2 trong window → dự đoán cho D
      let recurringSize = 0;
      let recurringHits = 0;
      for (const [tail, c] of totals) {
        if (c < 2) continue;
        recurringSize++;
        if (targetSet.has(tail)) recurringHits++;
      }
      const recurringTrungPct = recurringSize === 0 ? 0 : recurringHits / recurringSize;
      const xoLaiRate = total === 0 ? 0 : recurringSize / total;

      out.push({
        date: targetDate,
        trung,
        total,
        trungPct,
        loaiDung: total - trung,
        loaiDungPct: 1 - trungPct,
        appearedOnD: targetSet.size,
        recurringSize,
        recurringHits,
        recurringTrungPct,
        xoLaiRate,
      });
    }
    // Lấy backtestDays ngày gần nhất, sort mới → cũ.
    return out.slice(-backtestDays).reverse();
  }, [perDateEndings, digits, carryK, backtestDays]);

  // KPI tổng — trung bình tỉ lệ trùng / loại đúng / đuôi/ngày.
  const kpi = useMemo(() => {
    if (backtestRows.length === 0) return null;
    const trungs = backtestRows.map((r) => r.trungPct);
    const avgTrung = trungs.reduce((s, n) => s + n, 0) / trungs.length;
    const variance = trungs.reduce((s, n) => s + (n - avgTrung) ** 2, 0) / trungs.length;
    const stdTrung = Math.sqrt(variance);
    const avgAppeared = backtestRows.reduce((s, r) => s + r.appearedOnD, 0) / backtestRows.length;
    const baselineTrung = avgAppeared / SPACE_SIZE[digits];
    return {
      days: backtestRows.length,
      avgTrung,
      stdTrung,
      avgLoaiDung: 1 - avgTrung,
      avgAppeared,
      baselineTrung,
      baselineLoaiDung: 1 - baselineTrung,
    };
  }, [backtestRows, digits]);

  // KPI cho Số Xổ Lại — theo yêu cầu khách: % tỉ lệ xổ lại, % trúng TB, ngày cao nhất.
  const recurringKpi = useMemo(() => {
    if (backtestRows.length === 0) return null;
    // Chỉ tính trên ngày có dự đoán (recurringSize > 0). Skip ngày rỗng.
    const valid = backtestRows.filter((r) => r.recurringSize > 0);
    if (valid.length === 0) return null;

    const trungs = valid.map((r) => r.recurringTrungPct);
    const avgTrung = trungs.reduce((s, n) => s + n, 0) / trungs.length;
    const variance = trungs.reduce((s, n) => s + (n - avgTrung) ** 2, 0) / trungs.length;
    const stdTrung = Math.sqrt(variance);

    const avgRecurringSize = valid.reduce((s, r) => s + r.recurringSize, 0) / valid.length;
    const avgXoLaiRate = valid.reduce((s, r) => s + r.xoLaiRate, 0) / valid.length;
    const avgAppeared = valid.reduce((s, r) => s + r.appearedOnD, 0) / valid.length;
    const baselineTrung = avgAppeared / SPACE_SIZE[digits];

    // Best day = ngày có % trúng cao nhất
    let bestDay = valid[0];
    for (const r of valid) if (r.recurringTrungPct > bestDay.recurringTrungPct) bestDay = r;
    // Worst day cho cân
    let worstDay = valid[0];
    for (const r of valid) if (r.recurringTrungPct < worstDay.recurringTrungPct) worstDay = r;

    return {
      days: valid.length,
      avgXoLaiRate,
      avgRecurringSize,
      avgTrung,
      stdTrung,
      baselineTrung,
      lift: baselineTrung > 0 ? avgTrung / baselineTrung : 0,
      bestDay,
      worstDay,
    };
  }, [backtestRows, digits]);

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
          options={[1, 2, 3, 5, 7].map((k) => ({ v: k, label: `${k} ngày` }))}
          value={carryK}
          onChange={(v) => setCarryK(v as number)}
        />
        <SegPicker
          options={[
            { v: "recurring", label: "Xổ lại" },
            { v: "all", label: "Toàn bộ" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as "recurring" | "all")}
        />
        <SegPicker
          options={[30, 60, 90, 180].map((n) => ({ v: n, label: `${n}n` }))}
          value={backtestDays}
          onChange={(v) => setBacktestDays(v as number)}
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
          onClick={() => loadAll()}
          disabled={loading}
          className="ml-auto px-2.5 py-1 rounded text-xs font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* ─── 1. Số Xổ Lại (workflow chính - copy nhanh) ──────────────── */}
      {loading ? (
        <div className="px-3 py-12 text-center text-slate-500 text-sm">Đang tải…</div>
      ) : result === null || result.windowDates.length === 0 ? (
        <div className="px-3 py-12 text-center text-slate-500 text-sm">
          Cần ít nhất {carryK} ngày data ở miền đã chọn.
        </div>
      ) : (
        <>
          <ResultBox
            digits={digits}
            carryK={carryK}
            mode={mode}
            windowDates={result.windowDates}
            endings={result.endings}
            totalDistinct={result.totalDistinct ?? 0}
            latestDate={result.latestDate ?? null}
            hitsOnLatest={result.hitsOnLatest ?? 0}
            onCopy={copyText}
          />

          {/* ─── 2. KPI strip ────────────────────────────────────────── */}
          {kpi && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <KPI label="Ngày test" value={kpi.days.toString()} hint={`gộp ${carryK} ngày, ${digits} số`} />
              <KPI
                label="Đuôi/ngày TB"
                value={kpi.avgAppeared.toFixed(1)}
                hint={`/ ${SPACE_SIZE[digits].toLocaleString()} space`}
              />
              <KPI
                label="Tỉ lệ trùng TB"
                value={`${(kpi.avgTrung * 100).toFixed(1)}%`}
                hint={`±${(kpi.stdTrung * 100).toFixed(1)}% std`}
                tone="bad"
              />
              <KPI
                label="Tỉ lệ loại đúng"
                value={`${(kpi.avgLoaiDung * 100).toFixed(1)}%`}
                hint={`baseline random ${(kpi.baselineLoaiDung * 100).toFixed(2)}%`}
                tone="good"
              />
            </div>
          )}

          {/* ─── 3. Sparkline Tỉ Lệ Trùng Theo Ngày ───────────────── */}
          {kpi && backtestRows.length >= 2 && (
            <Sparkline rows={backtestRows} baselineTrung={kpi.baselineTrung} />
          )}

          {/* ─── 4. Thống Kê Số Xổ Lại (khách yêu cầu) ────────────── */}
          {recurringKpi && <RecurringKpiBox kpi={recurringKpi} carryK={carryK} />}

          {/* ─── 5. Thống kê theo ngày ──────────────────────────────── */}
          {backtestRows.length > 0 && <DayStatsList rows={backtestRows} />}
        </>
      )}
    </div>
  );
}

function KPI({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  const valueColor = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-slate-100";
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] px-3 md:px-4 py-2.5 md:py-3">
      <div className="text-[0.6rem] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`text-base md:text-xl font-bold font-mono mt-0.5 ${valueColor}`}>{value}</div>
      {hint && <div className="text-[0.58rem] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function Sparkline({
  rows,
  baselineTrung,
}: {
  rows: { date: string; trungPct: number }[];
  baselineTrung: number;
}) {
  // rows là mới → cũ; reverse để chronological X-axis
  const series = [...rows].reverse();
  const W = 800;
  const H = 110;
  const padX = 10;
  const padY = 12;
  const maxY = Math.max(...series.map((s) => s.trungPct), baselineTrung * 1.5, 0.05);
  const step = (W - 2 * padX) / Math.max(series.length - 1, 1);

  const points = series.map((s, i) => {
    const x = padX + i * step;
    const y = H - padY - (s.trungPct / maxY) * (H - 2 * padY);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const baselineY = H - padY - (baselineTrung / maxY) * (H - 2 * padY);
  // Polygon fill under the line — gentle gradient
  const fillPath =
    `M ${padX},${H - padY} ` +
    points.map((p, i) => (i === 0 ? `L ${p}` : `L ${p}`)).join(" ") +
    ` L ${(padX + (series.length - 1) * step).toFixed(1)},${H - padY} Z`;

  return (
    <div className="rounded-2xl bg-[#111827] border border-white/[0.06] px-4 md:px-5 py-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs md:text-sm font-bold text-slate-200">📈 Tỉ Lệ Trùng Theo Ngày</h3>
        <div className="flex gap-3 text-[0.6rem] md:text-[0.65rem] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-red-400" />
            Thực tế
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-px border-t border-dashed border-slate-500" />
            Baseline ngẫu nhiên
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 md:h-28" preserveAspectRatio="none">
        <defs>
          <linearGradient id="rollingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(239 68 68)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="rgb(239 68 68)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#rollingFill)" />
        <line
          x1={padX}
          y1={baselineY}
          x2={W - padX}
          y2={baselineY}
          stroke="rgb(100 116 139)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="rgb(248 113 113)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {series.map((s, i) => {
          const x = padX + i * step;
          const y = H - padY - (s.trungPct / maxY) * (H - 2 * padY);
          return <circle key={i} cx={x} cy={y} r={1.8} fill="rgb(248 113 113)" />;
        })}
      </svg>
      <div className="flex justify-between text-[0.55rem] md:text-[0.6rem] text-slate-600 mt-1 font-mono">
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function RecurringKpiBox({
  kpi,
  carryK,
}: {
  kpi: {
    days: number;
    avgXoLaiRate: number;
    avgRecurringSize: number;
    avgTrung: number;
    stdTrung: number;
    baselineTrung: number;
    lift: number;
    bestDay: { date: string; recurringHits: number; recurringSize: number; recurringTrungPct: number };
    worstDay: { date: string; recurringHits: number; recurringSize: number; recurringTrungPct: number };
  };
  carryK: number;
}) {
  const tone = kpi.lift > 1.1 ? "good" : kpi.lift < 0.9 ? "bad" : undefined;
  return (
    <div className="rounded-2xl bg-gradient-to-br from-red-950/25 to-[#111827] border border-red-500/30 overflow-hidden">
      <div className="px-5 py-3 border-b border-white/[0.08]">
        <h2 className="text-sm md:text-base font-bold text-slate-100">
          🎯 Thống Kê Số Xổ Lại — Backtest {kpi.days} ngày
        </h2>
        <div className="text-[0.65rem] md:text-xs text-slate-500 font-mono mt-0.5">
          Mỗi ngày D: số xổ lại trong {carryK} ngày trước (D-{carryK}..D-1) → dự đoán → check vs D
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-3">
        <KPI
          label="Tỉ lệ xổ lại TB"
          value={`${(kpi.avgXoLaiRate * 100).toFixed(1)}%`}
          hint={`~${kpi.avgRecurringSize.toFixed(1)} số/ngày`}
        />
        <KPI
          label="% Trúng TB"
          value={`${(kpi.avgTrung * 100).toFixed(1)}%`}
          hint={`±${(kpi.stdTrung * 100).toFixed(1)}% std · baseline ${(kpi.baselineTrung * 100).toFixed(1)}%`}
          tone={tone}
        />
        <KPI
          label="Ngày trúng cao nhất"
          value={shortDate(kpi.bestDay.date)}
          hint={`${kpi.bestDay.recurringHits}/${kpi.bestDay.recurringSize} = ${(kpi.bestDay.recurringTrungPct * 100).toFixed(1)}%`}
          tone="good"
        />
        <KPI
          label="Ngày trúng thấp nhất"
          value={shortDate(kpi.worstDay.date)}
          hint={`${kpi.worstDay.recurringHits}/${kpi.worstDay.recurringSize} = ${(kpi.worstDay.recurringTrungPct * 100).toFixed(1)}%`}
          tone="bad"
        />
      </div>
    </div>
  );
}

function DayStatsList({
  rows,
}: {
  rows: {
    date: string;
    trung: number;
    total: number;
    trungPct: number;
    loaiDung: number;
    loaiDungPct: number;
    recurringSize: number;
    recurringHits: number;
    recurringTrungPct: number;
  }[];
}) {
  return (
    <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <h2 className="text-sm font-bold">📊 Thống Kê Theo Ngày</h2>
        <span className="text-[0.65rem] text-slate-500 font-mono">{rows.length} ngày · mới → cũ</span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {rows.map((r) => (
          <div
            key={r.date}
            className="px-5 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs md:text-sm hover:bg-white/[0.02]"
          >
            <span className="font-mono font-bold text-slate-200 min-w-[5.5rem]">{shortDate(r.date)}</span>

            <span className="font-mono">
              <span className="text-slate-500">Trùng</span>
              <b className="ml-1 text-red-400">
                {r.trung}/{r.total}
              </b>
              <span className="ml-1 text-red-400/80">({(r.trungPct * 100).toFixed(1)}%)</span>
            </span>

            <span className="font-mono">
              <span className="text-slate-500">Loại đúng</span>
              <b className="ml-1 text-emerald-400">{r.loaiDung}</b>
              <span className="ml-1 text-emerald-400/80">({(r.loaiDungPct * 100).toFixed(1)}%)</span>
            </span>

            {/* Xổ lại stat — only when there were predictions that day */}
            {r.recurringSize > 0 && (
              <span className="font-mono px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30">
                <span className="text-slate-500">Xổ lại</span>
                <b className="ml-1 text-red-300">
                  {r.recurringHits}/{r.recurringSize}
                </b>
                <span className="ml-1 text-red-300/80">({(r.recurringTrungPct * 100).toFixed(1)}%)</span>
              </span>
            )}

            {/* Mini bar — green base, red overlay = trùng% */}
            <div className="ml-auto w-28 md:w-40 h-1.5 rounded-full bg-emerald-500/15 overflow-hidden">
              <div
                className="h-full bg-red-500/75"
                style={{ width: `${Math.min(r.trungPct * 100, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
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
  mode,
  windowDates,
  endings,
  totalDistinct,
  latestDate,
  hitsOnLatest,
  onCopy,
}: {
  digits: Digits;
  carryK: number;
  mode: "recurring" | "all";
  windowDates: string[];
  endings: EndingHit[];
  totalDistinct: number;
  latestDate: string | null;
  hitsOnLatest: number;
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
    <div
      className={`rounded-2xl overflow-hidden ${
        mode === "recurring"
          ? "bg-gradient-to-br from-red-950/15 to-[#111827] border border-red-500/20"
          : "bg-gradient-to-br from-cyan-950/15 to-[#111827] border border-cyan-500/20"
      }`}
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.06] flex flex-wrap items-center gap-x-3 gap-y-1">
        <div>
          <h2 className="text-sm md:text-base font-bold text-slate-100">
            {mode === "recurring" ? "🎯 Số Xổ Lại" : "📋 Toàn Bộ Số Đuôi"} — {carryK} ngày {carryK === 1 ? "(hôm qua)" : "gần nhất"}
          </h2>
          <div className="text-[0.65rem] md:text-xs text-slate-500 font-mono mt-0.5">
            {windowLabel} · {digits} số cuối
            {mode === "recurring" && (
              <span className="text-slate-600"> · đuôi ra ≥2 lần</span>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs md:text-sm font-mono text-right">
            <span className="block">
              <b className={`text-base md:text-lg ${mode === "recurring" ? "text-red-400" : "text-cyan-400"}`}>
                {endings.length}
              </b>
              <span className="text-slate-500"> {mode === "recurring" ? "số xổ lại" : "số đuôi"}</span>
            </span>
            <span className="block text-[0.62rem] md:text-[0.65rem] text-slate-500">
              {mode === "recurring"
                ? totalDistinct > 0
                  ? `${((endings.length / totalDistinct) * 100).toFixed(1)}% (${endings.length}/${totalDistinct} đuôi)`
                  : "—"
                : `${((endings.length / SPACE_SIZE[digits]) * 100).toFixed(1)}% / ${SPACE_SIZE[digits].toLocaleString()} space`}
            </span>
          </span>
          <button
            onClick={() =>
              onCopy(
                copyList,
                `${endings.length} ${mode === "recurring" ? "số xổ lại" : "số đuôi"}`
              )
            }
            disabled={endings.length === 0}
            className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === "recurring" ? "bg-red-600 hover:bg-red-500" : "bg-cyan-600 hover:bg-cyan-500"
            }`}
          >
            📋 Copy {endings.length} số
          </button>
        </div>
      </div>

      {/* Trúng on latest day + legend ngắn */}
      {(latestDate || countGroups.length > 0) && (
        <div className="px-5 py-2 border-b border-white/[0.04] flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.65rem] md:text-xs font-mono">
          {latestDate && endings.length > 0 && (
            <span
              className={`px-2 py-0.5 rounded border font-bold ${
                hitsOnLatest > 0
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                  : "bg-slate-500/10 border-slate-500/30 text-slate-400"
              }`}
            >
              ✓ Trên {shortDate(latestDate)}: trúng {hitsOnLatest}/{endings.length}
              <span className="ml-1 opacity-80">
                ({((hitsOnLatest / Math.max(endings.length, 1)) * 100).toFixed(1)}%)
              </span>
            </span>
          )}
          {countGroups.map(([count, num]) => (
            <span key={count} className="text-slate-400">
              <b className="text-red-400">×{count}</b>: {num} số
            </span>
          ))}
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
            {endings.map((e) => {
              // count=1 chip chỉ xuất hiện ở mode "all" — slate trung tính.
              // count≥2 luôn đỏ, color theo bậc.
              const cls =
                e.count >= 5
                  ? "text-base md:text-lg font-bold bg-red-500/30 border-red-400 text-red-100 shadow-[0_0_14px_-3px_rgba(239,68,68,0.6)]"
                  : e.count === 4
                  ? "text-base font-bold bg-red-500/22 border-red-400/80 text-red-200 shadow-[0_0_10px_-3px_rgba(239,68,68,0.4)]"
                  : e.count === 3
                  ? "text-sm md:text-base font-bold bg-red-500/16 border-red-500/55 text-red-300"
                  : e.count === 2
                  ? "text-sm md:text-[0.95rem] font-bold bg-red-500/10 border-red-500/40 text-red-300"
                  : "text-[0.78rem] md:text-[0.85rem] bg-white/[0.03] border-white/[0.08] text-slate-400";
              const ringCls = e.hitOnLatest
                ? "ring-2 ring-emerald-400/70 ring-offset-1 ring-offset-[#111827]"
                : "";
              return (
                <span
                  key={e.ending}
                  className={`inline-flex items-baseline gap-0.5 px-2 py-1 rounded font-mono border ${cls} ${ringCls}`}
                  title={`${e.count} lần · ${e.days} ngày · ${
                    e.hitOnLatest ? "✓ trúng trên ngày mới nhất" : "không trúng trên ngày mới nhất"
                  } · ${e.dateList.join(", ")}`}
                >
                  {e.ending}
                  {e.count >= 2 && (
                    <sup className="text-[0.55rem] font-bold text-red-200">×{e.count}</sup>
                  )}
                  {e.hitOnLatest && <span className="ml-0.5 text-emerald-300 text-[0.6rem]">✓</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
