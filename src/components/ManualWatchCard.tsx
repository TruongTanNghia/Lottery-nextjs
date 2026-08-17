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

export default function ManualWatchCard({ limits, recent, region, onChanged }: Props) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [halve, setHalve] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/config/manual?region=${region}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.data) return;
        setSaved(d.data.los);
        setText(d.data.los.join(" "));
        setHalve(d.data.halve);
      })
      .catch(() => void 0);
  }, [region]);

  const { dates, hitBy } = useMemo(() => {
    const byDate = new Map<string, Set<string>>();
    for (const r of recent) {
      if (!byDate.has(r.date)) byDate.set(r.date, new Set());
      byDate.get(r.date)!.add(r.lo_number);
    }
    return { dates: [...byDate.keys()].sort().slice(-WINDOW), hitBy: byDate };
  }, [recent]);

  const byLo = useMemo(() => new Map(limits.map((l) => [l.lo_number, l])), [limits]);
  const rows = saved.map((lo) => ({ lo, item: byLo.get(lo) }));

  const dirty = text.trim() !== saved.join(" ");

  async function persist(next: { los?: string; halve?: boolean }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/config/manual?region=${region}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          los: next.los ?? text,
          halve: next.halve ?? halve,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setSaved(d.data.los);
      setText(d.data.los.join(" "));
      setHalve(d.data.halve);
      onChanged();
      toast.show("success", `Đang theo dõi tay ${d.data.los.length} lô`);
    } catch (err) {
      toast.show("error", `Lỗi lưu: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  const totalCut = rows.reduce(
    (s, r) =>
      s + ((r.item?.limit_before_tracking ?? r.item?.current_limit ?? 0) - (r.item?.current_limit ?? 0)),
    0
  );

  return (
    <section className="plate rise rise-4">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">✍️ Theo Dõi Tay</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Gõ số lô muốn theo dõi — {halve ? "hạn mức tự giảm 50%" : "chỉ xem, không giảm tiền"}
          </p>
        </div>
        <span className="numeric inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-sm font-bold bg-[rgba(77,166,255,0.18)] border border-[rgba(77,166,255,0.45)] text-[#8fd0ff]">
          {saved.length}
        </span>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") persist({ los: text });
            }}
            placeholder="VD: 12 34 56  hoặc  12,34,56"
            inputMode="numeric"
            className="numeric flex-1 min-w-[12rem] px-3 py-2 rounded-lg bg-[#0e1a2e] border border-[var(--hairline)] text-white text-sm focus:border-[var(--hairline-hot)] focus:outline-none"
          />
          <button
            onClick={() => persist({ los: text })}
            disabled={saving || !dirty}
            className="btn-chrome px-4 py-2 rounded-lg text-sm"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
          {saved.length > 0 && (
            <button
              onClick={() => persist({ los: "" })}
              disabled={saving}
              className="btn-ghost px-3 py-2 rounded-lg text-xs"
            >
              Xoá hết
            </button>
          )}
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-[#c2d4ea] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={halve}
            disabled={saving}
            onChange={(e) => persist({ halve: e.target.checked })}
            className="accent-emerald-500"
          />
          Chia đôi tiền các lô này
        </label>

        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">
            Chưa theo dõi lô nào — gõ số vào ô trên rồi bấm Lưu
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-2 py-2 text-left font-bold">Lô</th>
                  <th className="px-2 py-2 text-center font-bold">
                    Nhịp {dates.length} kỳ
                    <div className="hidden sm:flex justify-center gap-[3px] mt-1 font-normal normal-case tracking-normal text-[0.5rem]">
                      {dates.map((d) => (
                        <span key={d} className="w-5 text-center">
                          {d.slice(8, 10)}
                        </span>
                      ))}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-right font-bold">Chưa về</th>
                  <th className="px-2 py-2 text-right font-bold">Hạn mức</th>
                  <th className="px-2 py-2 text-right font-bold" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ lo, item }) => (
                  <tr key={lo} className="border-t border-[var(--hairline)] hover:bg-white/[0.06]">
                    <td className="px-2 py-2">
                      <span className="numeric text-base font-bold text-white">{lo}</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-center gap-[3px]">
                        {dates.map((d) => {
                          const hit = hitBy.get(d)?.has(lo);
                          return (
                            <span
                              key={d}
                              title={`${d.slice(8, 10)}/${d.slice(5, 7)} — ${hit ? "về" : "không về"}`}
                              className={`w-5 h-5 rounded-[3px] ${
                                hit
                                  ? "bg-[#10b981] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                                  : "bg-[#0e1a2e] border border-[rgba(150,185,235,0.18)]"
                              }`}
                            />
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right numeric font-bold text-[#ffab6b]">
                      {item ? `${item.days_since_last}d` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {item &&
                        item.limit_before_tracking !== undefined &&
                        item.limit_before_tracking !== item.current_limit && (
                          <span className="numeric text-[0.7rem] text-[var(--text-muted)] line-through mr-1.5">
                            {item.limit_before_tracking}n
                          </span>
                        )}
                      <span className={`numeric font-bold ${halve ? "text-[#ffd24a]" : "text-white"}`}>
                        {item ? `${item.current_limit}n` : "—"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => persist({ los: saved.filter((x) => x !== lo).join(" ") })}
                        disabled={saving}
                        title={`Bỏ theo dõi lô ${lo}`}
                        className="text-[var(--text-muted)] hover:text-[#ff6b78] px-1"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {halve && totalCut > 0 && (
              <div className="text-[0.7rem] text-[var(--text-muted)] text-right">
                Giảm tổng <strong className="text-[#ffd24a]">{totalCut}n</strong> tiền nhận vào
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
