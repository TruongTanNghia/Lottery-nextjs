"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
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

const WINDOW = 7;

/** Mirrors RHYTHM_MAX_QUIET on the server — shown in the subtitle only. */
const MAX_QUIET = 2;

export default function TrackingBoard({ limits, recent, region, onChanged }: Props) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(true);
  const [halve, setHalve] = useState(true);
  const [saving, setSaving] = useState(false);

  // Both switches drive real limits, so they live on the server per region.
  useEffect(() => {
    fetch(`/api/config/watch?region=${region}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.data) return;
        setEnabled(d.data.enabled);
        setHalve(d.data.halve);
      })
      .catch(() => void 0);
  }, [region]);

  async function persist(next: { enabled?: boolean; halve?: boolean }) {
    const cfg = { enabled, halve, ...next };
    setEnabled(cfg.enabled);
    setHalve(cfg.halve);
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
      toast.show("error", `Lỗi lưu: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  // Last 7 DRAW dates, not calendar days — a missed scrape must not silently
  // shorten the rhythm or shift every lô's pattern by a column.
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
      <section className="plate rise rise-2">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">👁️ Đang Theo Dõi</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Nhịp đều &amp; chưa về ≤ {MAX_QUIET} kỳ
              {enabled ? (halve ? " — hạn mức đã giảm 50%" : " — không giảm hạn mức") : " — đang tắt"}
            </p>
          </div>
          <span className="numeric inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-sm font-bold bg-[rgba(249,115,22,0.18)] border border-[rgba(249,115,22,0.45)] text-[#ffab6b]">
            {tracking.length}
          </span>
        </div>

        {/* Two independent switches: watch the beat, and cut the money. */}
        <div className="flex flex-wrap items-center gap-2 px-3 md:px-4 pt-3">
          <Switch
            label="Theo dõi"
            on={enabled}
            disabled={saving}
            onToggle={() => persist({ enabled: !enabled })}
          />
          <Switch
            label="Chia đôi tiền"
            on={halve}
            disabled={saving || !enabled}
            onToggle={() => persist({ halve: !halve })}
          />
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
      </section>

    </div>
  );
}

/** Labelled ON/OFF pill — reads at a glance which state it is in. */
function Switch({
  label,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        on
          ? "bg-[rgba(16,185,129,0.18)] border-[rgba(16,185,129,0.55)] text-[#4ade9f]"
          : "bg-white/[0.06] border-[var(--hairline)] text-[var(--text-muted)]"
      }`}
    >
      <span
        className={`w-8 h-4 rounded-full relative transition-colors ${
          on ? "bg-[#10b981]" : "bg-[#3a4a63]"
        }`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
            on ? "left-[1.15rem]" : "left-0.5"
          }`}
        />
      </span>
      {label}: {on ? "BẬT" : "TẮT"}
    </button>
  );
}

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
              <div className="hidden sm:flex justify-center gap-[3px] mt-1 font-normal normal-case tracking-normal text-[0.5rem]">
                {dayLabels.map((d) => (
                  <span key={d} className="w-5 text-center">
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
                  <div className="flex justify-center gap-[3px]">
                    {pat.map((v, i) => (
                      <span
                        key={i}
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
