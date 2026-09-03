"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "./Toast";
import ThuGon from "./ThuGon";
import Switch from "./Switch";
import type { LimitItem, Region } from "@/lib/types";

interface DailyRow {
  date: string;
  lo_number: string;
  count: number;
}

interface Props {
  limits: LimitItem[];
  recent: DailyRow[];
  region: Region;
  onChanged: () => void;
}

/** Must equal RHYTHM_WINDOW_DRAWS — the squares are the evidence for the
 *  "Nhịp ~X kỳ" figure, so they have to cover the same draws it averages. */
const WINDOW = 15;

/** Mirrors RHYTHM_MAX_QUIET on the server — shown in the subtitle only. */
const MAX_QUIET = 2;

/** Tempo bands the operator picks from, in draws between appearances. */
const GAP_RANGES: Array<{ label: string; min: number; max: number }> = [
  { label: "1–2", min: 1, max: 2 },
  { label: "1–3", min: 1, max: 3 },
  { label: "1–4", min: 1, max: 4 },
  { label: "2–4", min: 2, max: 4 },
  { label: "2–5", min: 2, max: 5 },
  { label: "3–6", min: 3, max: 6 },
  { label: "Tất cả", min: 1, max: 15 },
];

export default function TrackingBoard({ limits, recent, region, onChanged }: Props) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(true);
  const [halve, setHalve] = useState(true);
  const [minGap, setMinGap] = useState(1);
  const [maxGap, setMaxGap] = useState(3);
  const [saving, setSaving] = useState(false);

  // Both switches drive real limits, so they live on the server per region.
  useEffect(() => {
    fetch(`/api/config/watch?region=${region}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.data) return;
        setEnabled(d.data.enabled);
        setHalve(d.data.halve);
        setMinGap(d.data.min_gap);
        setMaxGap(d.data.max_gap);
        cfgRef.current = {
          enabled: d.data.enabled,
          halve: d.data.halve,
          min_gap: d.data.min_gap,
          max_gap: d.data.max_gap,
        };
      })
      .catch(() => void 0);
  }, [region]);

  /**
   * Optimistic, and never blocks the next click.
   *
   * The switches used to disable themselves for the whole round-trip, which on
   * a slow request read as a dead button. Two quick taps also fought each
   * other: the second one computed from the state the first had not committed
   * yet, so it toggled straight back. cfgRef holds the truth synchronously.
   */
  const cfgRef = useRef({ enabled, halve, min_gap: minGap, max_gap: maxGap });

  async function persist(next: {
    enabled?: boolean;
    halve?: boolean;
    min_gap?: number;
    max_gap?: number;
  }) {
    const prev = cfgRef.current;
    const cfg = { ...prev, ...next };
    cfgRef.current = cfg;

    setEnabled(cfg.enabled);
    setHalve(cfg.halve);
    setMinGap(cfg.min_gap);
    setMaxGap(cfg.max_gap);
    setSaving(true);
    try {
      const res = await fetch(`/api/config/watch?region=${region}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error(await res.text());
      onChanged(); // limits may have changed
    } catch (err) {
      // Put the switch back where it was so it never lies about what is saved.
      cfgRef.current = prev;
      setEnabled(prev.enabled);
      setHalve(prev.halve);
      setMinGap(prev.min_gap);
      setMaxGap(prev.max_gap);
      toast.show("error", `Lỗi lưu: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  // Last WINDOW DRAW dates, not calendar days — a missed scrape must not
  // silently shorten the rhythm or shift every lô's pattern by a column.
  const { dates, hitBy } = useMemo(() => {
    const byDate = new Map<string, Set<string>>();
    for (const r of recent) {
      if (!byDate.has(r.date)) byDate.set(r.date, new Set());
      byDate.get(r.date)!.add(r.lo_number);
    }
    const all = [...byDate.keys()].sort();
    return { dates: all.slice(-WINDOW), hitBy: byDate };
  }, [recent]);

  const patternOf = (lo: string) => dates.map((d) => (hitBy.get(d)?.has(lo) ? 1 : 0));

  // Rhythm lô only — `tracked` also covers the Top-N discount, and folding
  // those 50 rows in here pushed the table past 55 entries. Top has its own
  // board; this one answers "which numbers are running on a beat right now".
  const tracking = useMemo(
    () =>
      limits
        .filter((l) => l.in_watch)
        .sort(
          (a, b) =>
            (a.rhythm?.cv ?? 1) - (b.rhythm?.cv ?? 1) ||
            a.lo_number.localeCompare(b.lo_number)
        ),
    [limits]
  );

  const dayLabels = dates.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7));

  return (
    <div className="mb-4 md:mb-6">
      {/* ── Đang theo dõi ─────────────────────────────────────── */}
      <ThuGon
        khoa={`theodoi-${region}`}
        className="plate rise rise-2"
        tieuDe="👁️ Đang Theo Dõi"
        phu={
          <>
            Nhịp {minGap}–{maxGap} kỳ · chưa về ≤ {MAX_QUIET} kỳ
            {enabled ? (halve ? " — hạn mức đã giảm 50%" : " — không giảm hạn mức") : " — đang tắt"}
          </>
        }
        phai={
          <span className="numeric inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-sm font-bold bg-[rgba(249,115,22,0.18)] border border-[rgba(249,115,22,0.45)] text-[#ffab6b]">
            {tracking.length}
          </span>
        }
      >

        {/* Two independent switches: watch the beat, and cut the money. */}
        <div className="flex flex-wrap items-center gap-2 px-3 md:px-4 pt-3">
          {/* Never disabled — a switch that ignores a tap reads as broken.
              "Chia đôi" stays settable while tracking is off; it is a stored
              preference, just not in effect yet. */}
          <Switch label="Theo dõi" on={enabled} onToggle={() => persist({ enabled: !enabled })} />
          <Switch
            label="Chia đôi tiền"
            on={halve}
            muted={!enabled}
            onToggle={() => persist({ halve: !halve })}
          />
          {saving && <span className="text-[0.65rem] text-[var(--text-muted)]">đang lưu…</span>}
        </div>

        {/* Tempo band — how many draws apart the lô should be running. */}
        <div className="flex flex-wrap items-center gap-1.5 px-3 md:px-4 pt-2.5">
          <span className="eyebrow mr-1">Nhịp</span>
          {GAP_RANGES.map((g) => {
            const active = minGap === g.min && maxGap === g.max;
            return (
              <button
                key={g.label}
                onClick={() => persist({ min_gap: g.min, max_gap: g.max })}
                className={`px-2.5 py-1 text-xs font-bold rounded transition-colors numeric active:scale-[0.97] ${
                  !enabled ? "opacity-55" : ""
                } ${
                  active
                    ? "bg-[#10b981] text-[#04251a]"
                    : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.18]"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        {enabled ? (
          <Table
            rows={tracking}
            dayLabels={dayLabels}
            patternOf={patternOf}
            empty="Chưa có lô nào vào nhịp — không cần theo dõi kỳ này"
          />
        ) : (
          <div className="py-10 text-center text-sm text-[var(--text-muted)]">
            Đang tắt theo dõi — hạn mức giữ nguyên theo bảng cài tiền
          </div>
        )}
      </ThuGon>

    </div>
  );
}

/** Labelled ON/OFF pill — reads at a glance which state it is in. */
function Table({
  rows,
  dayLabels,
  patternOf,
  empty,
}: {
  rows: LimitItem[];
  dayLabels: string[];
  patternOf: (lo: string) => number[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <div className="py-10 text-center text-sm text-[var(--text-muted)]">{empty}</div>;
  }

  return (
    <div className="max-h-[26rem] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[#1b2d4d]">
          <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
            <th className="px-3 py-2 text-left font-bold">Lô</th>
            <th className="px-2 py-2 text-center font-bold">
              Nhịp {dayLabels.length} kỳ
              <div className="hidden sm:flex justify-center gap-[2px] mt-1 font-normal normal-case tracking-normal text-[0.5rem]">
                {dayLabels.map((d) => (
                  <span key={d} className="w-3.5 md:w-4 text-center">
                    {d.slice(0, 2)}
                  </span>
                ))}
              </div>
            </th>
            <th className="px-2 py-2 text-right font-bold">Nhịp</th>
            <th className="px-2 py-2 text-right font-bold">Chưa về</th>
            <th className="px-3 py-2 text-right font-bold">Hạn mức</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const pat = patternOf(l.lo_number);
            return (
              <tr
                key={l.lo_number}
                className="border-t border-[var(--hairline)] hover:bg-white/[0.06]"
              >
                <td className="px-3 py-2">
                  <span className="numeric text-base font-bold text-white">{l.lo_number}</span>
                </td>
                <td className="px-2 py-2">
                  <div className="flex justify-center gap-[2px]">
                    {pat.map((v, i) => (
                      <span
                        key={i}
                        title={v ? "về" : "không về"}
                        className={`w-3.5 h-3.5 md:w-4 md:h-4 rounded-[2px] ${
                          v
                            ? "bg-[#10b981] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                            : "bg-[#0e1a2e] border border-[rgba(150,185,235,0.18)]"
                        }`}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-2 py-2 text-right">
                  <span
                    className="numeric text-[var(--text-secondary)]"
                    title={`Đều: sai lệch ${((l.rhythm?.cv ?? 0) * 100).toFixed(0)}% · về ${l.rhythm?.appearances ?? 0} lần/30 kỳ`}
                  >
                    ~{l.rhythm?.mean_gap ?? "–"} kỳ
                  </span>
                </td>
                <td className="px-2 py-2 text-right">
                  <span className="numeric font-bold text-[#ffab6b]">
                    {l.rhythm?.draws_since_last ?? l.days_since_last} kỳ
                  </span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {l.tracked && l.limit_before_tracking !== undefined && (
                    <span className="numeric text-[0.7rem] text-[var(--text-muted)] line-through mr-1.5">
                      {l.limit_before_tracking}n
                    </span>
                  )}
                  <span
                    className={`numeric font-bold ${l.tracked ? "text-[#ffd24a]" : "text-white"}`}
                  >
                    {l.current_limit}n
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
