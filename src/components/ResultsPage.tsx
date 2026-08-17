"use client";

import { useEffect, useMemo, useState } from "react";
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
  const wd = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
  return { wd, dm: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`, y };
}

/** Prize number with its last two digits — the lô — carried in a pill. */
function Num({ n, big }: { n: string; big?: boolean }) {
  const head = n.slice(0, -2);
  const tail = n.slice(-2);
  return (
    <span className="numeric inline-flex items-baseline whitespace-nowrap">
      <span className={big ? "text-[var(--chrome-300)]" : "text-[var(--text-secondary)]"}>{head}</span>
      <span
        className={`font-bold text-[#04251a] bg-[#34e6a8] rounded px-1 ml-0.5 ${
          big ? "text-[1.35rem] leading-tight" : "text-[0.82rem]"
        }`}
      >
        {tail}
      </span>
    </span>
  );
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
        <div className="plate-hd flex-wrap">
          <div>
            <h2 className="plate-title">📋 Kết Quả Đã Cào — {REGION_LABELS[region]}</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Đúng những gì máy lưu · <span className="text-[#34e6a8] font-bold">hai số xanh</span> là lô
            </p>
          </div>
          <div className="flex gap-1.5">
            {DAY_CHOICES.map((n) => (
              <button
                key={n}
                onClick={() => setDays(n)}
                className={`numeric px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  days === n
                    ? "bg-[#10b981] text-[#04251a]"
                    : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.18]"
                }`}
              >
                {n} ngày
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

      {!loading && data?.map((day, i) => <DayCard key={day.date} day={day} region={region} idx={i} />)}
    </>
  );
}

function DayCard({ day, region, idx }: { day: DayResult; region: Region; idx: number }) {
  const { wd, dm, y } = fmtDate(day.date);
  // Detail is opt-in. The full prize tables are for checking a suspicion, not
  // for reading every day — leaving them open buried the one line that matters.
  const [open, setOpen] = useState(false);

  // Every distinct lô that landed that day — the line the board is built from.
  const los = useMemo(() => {
    const s = new Set<string>();
    for (const p of day.provinces) for (const pr of p.prizes) for (const n of pr.numbers) s.add(n.slice(-2));
    return [...s].sort();
  }, [day]);

  return (
    <section className={`plate mb-3 md:mb-4 rise rise-${Math.min(idx + 1, 4)}`}>
      <div className="plate-hd flex-wrap gap-2">
        <div className="flex items-baseline gap-2.5">
          <span className="chrome text-lg leading-none">{dm}</span>
          <span className="eyebrow">
            {wd} · {y} · {day.provinces.length} tỉnh · {los.length} lô
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setOpen((o) => !o)}
            className="btn-ghost px-3 py-1.5 rounded-lg text-xs"
          >
            {open ? "Ẩn bảng giải" : "Xem bảng giải"}
          </button>
          <a
            href={sourceUrl(region, day.date)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost px-3 py-1.5 rounded-lg text-xs"
          >
            Trang gốc ↗
          </a>
        </div>
      </div>

      {/* The headline: which lô landed. */}
      <div className="px-3 md:px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {los.map((lo) => (
            <span
              key={lo}
              className="numeric text-sm font-bold text-[#04251a] bg-[#34e6a8] rounded-md px-2 py-1"
            >
              {lo}
            </span>
          ))}
        </div>
      </div>

      {open && (
      <div className="p-3 md:p-4 pt-0 grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {day.provinces.map((p) => {
          const db = p.prizes.find((x) => x.prize_type === "G.DB");
          const rest = p.prizes.filter((x) => x.prize_type !== "G.DB");
          return (
            <div
              key={p.name}
              className="rounded-xl border border-[var(--hairline)] bg-[rgba(255,255,255,0.035)] overflow-hidden"
            >
              <div className="px-3 py-2 bg-[rgba(255,255,255,0.05)] border-b border-[var(--hairline)]">
                <span className="text-xs font-bold text-white">{p.name}</span>
              </div>

              {db && (
                <div className="px-3 py-2.5 flex items-center justify-between gap-2 bg-[rgba(245,197,66,0.07)] border-b border-[var(--hairline)]">
                  <span className="eyebrow text-[#ffd24a]">Đặc biệt</span>
                  {db.numbers.map((n, k) => (
                    <Num key={k} n={n} big />
                  ))}
                </div>
              )}

              <table className="w-full text-xs">
                <tbody>
                  {rest.map((pr, ri) => (
                    <tr
                      key={pr.prize_type}
                      className={ri % 2 ? "bg-[rgba(255,255,255,0.025)]" : ""}
                    >
                      <td className="py-1.5 pl-3 pr-2 align-middle text-[var(--text-muted)] font-bold whitespace-nowrap w-10">
                        {pr.prize_type}
                      </td>
                      <td className="py-1.5 pr-3">
                        <div className="flex flex-wrap gap-x-2.5 gap-y-1 justify-end">
                          {pr.numbers.map((n, k) => (
                            <Num key={`${n}-${k}`} n={n} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}
