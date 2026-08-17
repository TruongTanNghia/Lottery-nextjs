"use client";

import { useEffect, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";

interface Prize {
  prize_type: string;
  numbers: string[];
}
interface Province {
  name: string;
  prizes: Prize[];
}
interface DayResult {
  date: string;
  provinces: Province[];
}

const DAY_CHOICES = [3, 7, 15, 30] as const;

/** The page each draw was scraped from, so it can be compared in one click. */
function sourceUrl(region: Region, date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `https://xsmn.mobi/${region}-${d}-${m}-${y}.html`;
}

function fmtDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export default function ResultsPage({ region }: { region: Region }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<DayResult[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/results/history-full?region=${region}&days=${days}`)
      .then((r) => r.json())
      .then((d) => setData(d.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [region, days]);

  return (
    <>
      <section className="plate rise rise-1 mb-4 md:mb-6">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">📋 Kết Quả Đã Cào — {REGION_LABELS[region]}</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Đúng những gì máy lưu. Bấm ngày để mở trang gốc mà đối chiếu.
            </p>
          </div>
          <div className="flex gap-1.5">
            {DAY_CHOICES.map((n) => (
              <button
                key={n}
                onClick={() => setDays(n)}
                className={`numeric px-2.5 py-1.5 text-xs font-bold rounded transition-colors ${
                  days === n
                    ? "bg-[#10b981] text-[#04251a]"
                    : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.18]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading && (
        <div className="py-12 text-center text-sm text-[var(--text-muted)]">Đang tải…</div>
      )}

      {!loading && data?.length === 0 && (
        <div className="plate p-10 text-center text-sm text-[var(--text-muted)]">
          Chưa có kết quả nào cho {REGION_LABELS[region]}
        </div>
      )}

      {!loading &&
        data?.map((day, i) => (
          <section key={day.date} className={`plate mb-4 rise rise-${Math.min(i + 1, 4)}`}>
            <div className="plate-hd">
              <h3 className="plate-title numeric">{fmtDate(day.date)}</h3>
              <a
                href={sourceUrl(region, day.date)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost px-3 py-1.5 rounded-lg text-xs"
              >
                Mở trang gốc ↗
              </a>
            </div>

            <div className="p-3 md:p-4 overflow-x-auto">
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(day.provinces.length, 4)}, minmax(11rem, 1fr))`,
                }}
              >
                {day.provinces.map((p) => (
                  <div key={p.name} className="min-w-[11rem]">
                    <div className="text-xs font-bold text-white mb-2 pb-1.5 border-b border-[var(--hairline)]">
                      {p.name}
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {p.prizes.map((pr) => (
                          <tr key={pr.prize_type} className="align-top">
                            <td className="py-1 pr-2 text-[var(--text-muted)] whitespace-nowrap">
                              {pr.prize_type}
                            </td>
                            <td className="py-1">
                              <div className="flex flex-wrap gap-x-2 gap-y-1 justify-end">
                                {pr.numbers.map((n, k) => (
                                  <span key={`${n}-${k}`} className="numeric text-white">
                                    {n.slice(0, -2)}
                                    {/* last two digits are the lô — the only part that matters */}
                                    <strong className="text-[#4ade9f]">{n.slice(-2)}</strong>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
    </>
  );
}
