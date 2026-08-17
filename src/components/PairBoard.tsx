"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import type { LimitItem, Region } from "@/lib/types";

interface Props {
  limits: LimitItem[];
  region: Region;
  onChanged: () => void;
}

export default function PairBoard({ limits, region, onChanged }: Props) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/config/pair?region=${region}`)
      .then((r) => r.json())
      .then((d) => d.data && setEnabled(d.data.enabled))
      .catch(() => void 0);
  }, [region]);

  async function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic — a switch that waits reads as broken
    setSaving(true);
    try {
      const res = await fetch(`/api/config/pair?region=${region}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      onChanged();
    } catch (err) {
      setEnabled(!next);
      toast.show("error", `Lỗi lưu: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  // One row per pair, not per lô — 15 and 51 are the same finding.
  const pairs = useMemo(() => {
    const byLo = new Map(limits.map((l) => [l.lo_number, l]));
    const seen = new Set<string>();
    const out: { a: LimitItem; b: LimitItem }[] = [];
    for (const l of limits) {
      if (!l.in_pair || !l.pair_with) continue;
      const key = [l.lo_number, l.pair_with].sort().join("-");
      if (seen.has(key)) continue;
      const other = byLo.get(l.pair_with);
      if (!other) continue;
      seen.add(key);
      out.push(
        l.lo_number < other.lo_number ? { a: l, b: other } : { a: other, b: l }
      );
    }
    return out.sort(
      (x, y) =>
        (y.a.limit_before_tracking ?? 0) - (x.a.limit_before_tracking ?? 0) ||
        x.a.lo_number.localeCompare(y.a.lo_number)
    );
  }, [limits]);

  const totalCut = pairs.reduce(
    (s, p) =>
      s +
      ((p.a.limit_before_tracking ?? p.a.current_limit) - p.a.current_limit) +
      ((p.b.limit_before_tracking ?? p.b.current_limit) - p.b.current_limit),
    0
  );

  return (
    <section className="plate rise rise-4 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">🔁 Cặp Đảo Cùng Tiền</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            15↔51 cùng mức tiền → chia đôi cả hai
          </p>
        </div>
        <span className="numeric inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-sm font-bold bg-[rgba(167,139,250,0.18)] border border-[rgba(167,139,250,0.45)] text-[#c4b5fd]">
          {pairs.length}
        </span>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors active:scale-[0.97] ${
              enabled
                ? "bg-[rgba(16,185,129,0.18)] border-[rgba(16,185,129,0.55)] text-[#4ade9f]"
                : "bg-white/[0.06] border-[var(--hairline)] text-[var(--text-muted)]"
            }`}
          >
            <span
              className={`w-8 h-4 rounded-full relative transition-colors ${
                enabled ? "bg-[#10b981]" : "bg-[#3a4a63]"
              }`}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                  enabled ? "left-[1.15rem]" : "left-0.5"
                }`}
              />
            </span>
            Cặp đảo: {enabled ? "BẬT" : "TẮT"}
          </button>
          {saving && <span className="text-[0.65rem] text-[var(--text-muted)]">đang lưu…</span>}
        </div>

        {!enabled ? (
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">
            Đang tắt — cặp đảo không bị giảm tiền
          </div>
        ) : pairs.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">
            Không có cặp đảo nào cùng mức tiền
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-2 py-2 text-left font-bold">Cặp</th>
                  <th className="px-2 py-2 text-right font-bold">Tiền gốc</th>
                  <th className="px-2 py-2 text-right font-bold">Sau chia</th>
                  <th className="px-2 py-2 text-right font-bold">Tổng ôm</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map(({ a, b }) => (
                  <tr
                    key={`${a.lo_number}-${b.lo_number}`}
                    className="border-t border-[var(--hairline)] hover:bg-white/[0.06]"
                  >
                    <td className="px-2 py-2">
                      <span className="numeric text-base font-bold text-white">{a.lo_number}</span>
                      <span className="mx-1.5 text-[var(--text-muted)]">↔</span>
                      <span className="numeric text-base font-bold text-white">{b.lo_number}</span>
                    </td>
                    <td className="px-2 py-2 text-right numeric text-[var(--text-muted)]">
                      {a.limit_before_tracking ?? a.current_limit}n
                    </td>
                    <td className="px-2 py-2 text-right numeric font-bold text-[#c4b5fd]">
                      {a.current_limit}n
                    </td>
                    <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                      {a.current_limit + b.current_limit}n
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[0.7rem] text-[var(--text-muted)] text-right">
              {pairs.length} cặp — giảm tổng{" "}
              <strong className="text-[#c4b5fd]">{totalCut}n</strong> tiền nhận vào
            </div>
          </>
        )}
      </div>
    </section>
  );
}
