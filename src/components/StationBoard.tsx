"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";
import Switch from "./Switch";
import type { Region } from "@/lib/types";

const WEEK = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

interface Cfg {
  enabled: boolean;
  exclude: Record<string, string[]>;
}

/**
 * Which đài count toward the lô board.
 *
 * Read-only on the exclusion list itself: it mirrors the bookie's fixed weekly
 * arrangement, and a mistyped province name here would silently count a draw
 * that should have been dropped. The switch is the part that changes.
 */
export default function StationBoard({
  region,
  onChanged,
}: {
  region: Region;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [cfg, setCfg] = useState<Cfg>({ enabled: false, exclude: {} });
  const [schedule, setSchedule] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const cfgRef = useRef<Cfg>({ enabled: false, exclude: {} });

  useEffect(() => {
    fetch(`/api/config/stations?region=${region}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.data) return;
        setCfg(d.data);
        cfgRef.current = d.data;
        setSchedule(d.schedule ?? {});
      })
      .catch(() => void 0);
  }, [region]);

  async function toggle() {
    const prev = cfgRef.current;
    const next = { ...prev, enabled: !prev.enabled };
    cfgRef.current = next;
    setCfg(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/config/stations?region=${region}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.show(
        "success",
        next.enabled ? "Đã bỏ đài thừa + tính lại toàn bộ" : "Đã tính lại với đủ đài"
      );
      onChanged();
    } catch (err) {
      cfgRef.current = prev;
      setCfg(prev);
      toast.show("error", `Lỗi: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  const days = WEEK.filter((d) => (schedule[d] ?? []).length > 0);
  const totalDropped = days.reduce((s, d) => s + (cfg.exclude[d] ?? []).length, 0);

  return (
    <section className="plate rise rise-2 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">📻 Đài Tính Kết Quả</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {cfg.enabled
              ? `Đang bỏ ${totalDropped} lượt đài mỗi tuần — chỉ đài giữ lại mới tính là lô về`
              : "Đang tính TẤT CẢ đài — bật để chỉ tính 2 đài mỗi ngày"}
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Switch label="Bỏ bớt đài" on={cfg.enabled} onToggle={toggle} />
          {saving && (
            <span className="text-[0.65rem] text-[var(--text-muted)]">
              đang tính lại toàn bộ lịch sử…
            </span>
          )}
        </div>

        {days.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--text-muted)]">Chưa có dữ liệu đài</div>
        ) : (
          <div className="space-y-1.5">
            {days.map((d) => {
              const all = schedule[d] ?? [];
              const dropped = cfg.exclude[d] ?? [];
              const kept = all.filter((p) => !dropped.includes(p));
              return (
                <div key={d} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="numeric w-7 font-bold text-[var(--text-muted)]">{d}</span>
                  {kept.map((p) => (
                    <span
                      key={p}
                      className="px-2 py-1 rounded-md bg-[rgba(16,185,129,0.16)] border border-[rgba(16,185,129,0.4)] text-[#7ff0c0]"
                    >
                      {p}
                    </span>
                  ))}
                  {dropped.map((p) => (
                    <span
                      key={p}
                      className={`px-2 py-1 rounded-md border ${
                        cfg.enabled
                          ? "bg-[rgba(220,38,38,0.14)] border-[rgba(248,113,113,0.4)] text-[#ff9d9d] line-through"
                          : "bg-white/[0.05] border-[var(--hairline)] text-[var(--text-muted)]"
                      }`}
                    >
                      {p}
                    </span>
                  ))}
                  {cfg.enabled && (
                    <span className="text-[0.65rem] text-[var(--text-muted)] ml-1">
                      còn {kept.length} đài
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[0.65rem] text-[var(--text-muted)] leading-relaxed">
          Bật/tắt sẽ <strong>tính lại toàn bộ lịch sử</strong> — kết quả gốc vẫn giữ nguyên, chỉ
          đổi cách đếm lô về. Mất vài giây.
        </p>
      </div>
    </section>
  );
}
