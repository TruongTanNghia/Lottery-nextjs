"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";
import Switch from "./Switch";
import ThuGon from "./ThuGon";
import type { Region } from "@/lib/types";

const WEEK = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

interface Cfg {
  enabled: boolean;
  exclude: Record<string, string[]>;
  excludePrizes: string[];
}

interface Prize {
  type: string;
  count: number;
}

const STAKE: Record<string, number> = { xsmn: 27000, xsmt: 27000, xsmb: 20250 };
const WIN = 75000;

const vnd = (n: number) => Math.round(n).toLocaleString("vi-VN") + "đ";

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
  const [cfg, setCfg] = useState<Cfg>({ enabled: false, exclude: {}, excludePrizes: [] });
  const [schedule, setSchedule] = useState<Record<string, string[]>>({});
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [perDraw, setPerDraw] = useState(2);
  const [saving, setSaving] = useState(false);
  const cfgRef = useRef<Cfg>({ enabled: false, exclude: {}, excludePrizes: [] });

  useEffect(() => {
    fetch(`/api/config/stations?region=${region}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.data) return;
        const next: Cfg = { ...d.data, excludePrizes: d.data.excludePrizes ?? [] };
        setCfg(next);
        cfgRef.current = next;
        setSchedule(d.schedule ?? {});
        setPrizes(d.prizes ?? []);
        setPerDraw(d.stationsPerDraw ?? 2);
      })
      .catch(() => void 0);
  }, [region]);

  async function toggle() {
    await apply({ enabled: !cfgRef.current.enabled });
  }

  /** Flipping a prize tier changes what counts as a hit — same road as a đài. */
  async function togglePrize(type: string) {
    const cur = cfgRef.current.excludePrizes ?? [];
    await apply({
      excludePrizes: cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type],
    });
  }

  async function apply(patch: Partial<Cfg>) {
    const prev = cfgRef.current;
    const next = { ...prev, ...patch };
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
      toast.show("success", "Đã lưu + tính lại toàn bộ lịch sử");
      onChanged();
    } catch (err) {
      cfgRef.current = prev;
      setCfg(prev);
      toast.show("error", `Lỗi: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  // Positions still counting, and therefore the margin. Everything about the
  // money follows from this one number.
  const viTri = prizes
    .filter((p) => !cfg.excludePrizes.includes(p.type))
    .reduce((s, p) => s + p.count * perDraw, 0);
  const gia = STAKE[region];
  const bien = gia > 0 ? (gia - (viTri / 100) * WIN) / gia : 0;

  const days = WEEK.filter((d) => (schedule[d] ?? []).length > 0);
  const totalDropped = days.reduce((s, d) => s + (cfg.exclude[d] ?? []).length, 0);

  return (
    <ThuGon
      khoa={`dai-${region}`}
      tieuDe="📻 Đài Tính Kết Quả"
      phu={
        cfg.enabled
          ? `Đang bỏ ${totalDropped} lượt đài mỗi tuần — chỉ đài giữ lại mới tính là lô về`
          : "Đang tính TẤT CẢ đài — bật để chỉ tính 2 đài mỗi ngày"
      }
    >

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

        {/* Giải tính kết quả — the margin lever */}
        {prizes.length > 0 && (
          <div className="pt-3 border-t border-[var(--hairline)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <div>
                <div className="text-sm font-bold text-white">🎯 Giải Tính Là &ldquo;Về&rdquo;</div>
                <div className="text-[0.7rem] text-[var(--text-muted)]">
                  Bỏ tick một giải = giải đó không tính trúng — đây là thứ DUY NHẤT đổi được biên
                  lợi nhuận mà không đụng tới giá
                </div>
              </div>
              <div
                className={`px-3 py-1.5 rounded-lg border text-center ${
                  bien > 0.001
                    ? "bg-[rgba(16,185,129,0.16)] border-[rgba(16,185,129,0.5)]"
                    : "bg-[rgba(220,38,38,0.16)] border-[rgba(248,113,113,0.5)]"
                }`}
              >
                <div className="eyebrow">Biên lợi nhuận</div>
                <div
                  className={`numeric text-lg font-bold ${
                    bien > 0.001 ? "text-[#7ff0c0]" : "text-[#ffb4b4]"
                  }`}
                >
                  {(bien * 100).toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {prizes.map((p) => {
                const off = cfg.excludePrizes.includes(p.type);
                return (
                  <button
                    key={p.type}
                    onClick={() => togglePrize(p.type)}
                    title={`${p.type}: ${p.count} số/đài × ${perDraw} đài = ${p.count * perDraw} vị trí`}
                    className={`px-2.5 py-1.5 rounded-md border text-xs font-bold transition-colors ${
                      off
                        ? "bg-[rgba(220,38,38,0.16)] border-[rgba(248,113,113,0.45)] text-[#ff9d9d] line-through"
                        : "bg-[rgba(16,185,129,0.14)] border-[rgba(16,185,129,0.4)] text-[#7ff0c0]"
                    }`}
                  >
                    {p.type}{" "}
                    <span className="numeric opacity-70">×{p.count * perDraw}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-2 text-[0.7rem] text-[var(--text-muted)] leading-relaxed">
              Đang tính <strong className="numeric text-white">{viTri}</strong> vị trí giải/kỳ → 1 lô
              về TB <strong className="numeric">{(viTri / 100).toFixed(2)}</strong> lần → kỳ vọng
              trả <strong className="numeric">{vnd((viTri / 100) * WIN)}</strong>/điểm, đang thu{" "}
              <strong className="numeric">{vnd(gia)}</strong>.
              {bien > 0.001 && (
                <>
                  <br />
                  <span className="text-[#7ff0c0]">
                    Sổ cân bằng → lãi đúng {(bien * 100).toFixed(2)}% mỗi kỳ, không kỳ nào lỗ.
                  </span>
                </>
              )}
              <br />
              <span className="text-[#ffd24a]">
                ⚠️ Đây là đổi điều khoản với khách, không phải phí ẩn — phải báo người đánh biết
                giải nào không tính.
              </span>
            </div>
          </div>
        )}

        <p className="text-[0.65rem] text-[var(--text-muted)] leading-relaxed">
          Mọi thay đổi ở đây <strong>tính lại toàn bộ lịch sử</strong> — kết quả gốc vẫn giữ
          nguyên, chỉ đổi cách đếm lô về. Mất vài giây.
        </p>
      </div>
    </ThuGon>
  );
}
