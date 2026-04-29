"use client";

import { useCallback, useEffect, useState } from "react";
import { REGION_ICONS, REGION_LABELS, type Region } from "@/lib/types";
import { useToast } from "./Toast";

const REGIONS: Region[] = ["xsmn", "xsmb", "xsmt"];

interface TodayData {
  date: string;
  region: string;
  province_count: number;
  total_numbers: number;
  unique_lo_count: number;
  by_province: Record<string, { province: string; prize_type: string; number: string; lo_number: string }[]>;
  unique_lo: string[];
}

interface RegionState {
  data: TodayData | null;
  loading: boolean;
  scraping: boolean;
  lastScraped: number | null;   // timestamp ms
  scrapeMs: number | null;
  error: string | null;
}

const initialState: RegionState = {
  data: null,
  loading: true,
  scraping: false,
  lastScraped: null,
  scrapeMs: null,
  error: null,
};

export default function TodayPage() {
  const toast = useToast();
  const [states, setStates] = useState<Record<Region, RegionState>>({
    xsmn: { ...initialState },
    xsmb: { ...initialState },
    xsmt: { ...initialState },
  });
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadRegion = useCallback(async (region: Region) => {
    setStates((s) => ({ ...s, [region]: { ...s[region], loading: true, error: null } }));
    try {
      const res = await fetch(`/api/realtime/today?region=${region}`);
      const j = await res.json();
      if (j.status === "success") {
        setStates((s) => ({ ...s, [region]: { ...s[region], data: j.data, loading: false, error: null } }));
      } else {
        setStates((s) => ({ ...s, [region]: { ...s[region], loading: false, error: j.detail ?? "load failed" } }));
      }
    } catch (err) {
      setStates((s) => ({ ...s, [region]: { ...s[region], loading: false, error: String(err) } }));
    }
  }, []);

  const scrapeRegion = useCallback(
    async (region: Region) => {
      setStates((s) => ({ ...s, [region]: { ...s[region], scraping: true, error: null } }));
      try {
        const res = await fetch(`/api/realtime/today?region=${region}`, { method: "POST" });
        const j = await res.json();
        if (j.status === "success") {
          setStates((s) => ({
            ...s,
            [region]: {
              ...s[region],
              data: j.data,
              scraping: false,
              lastScraped: Date.now(),
              scrapeMs: j.timing_ms?.scrape ?? null,
              error: null,
            },
          }));
          const cnt = j.data.unique_lo_count;
          toast.show("success", `${REGION_LABELS[region]}: ${cnt} lô về (${j.timing_ms?.scrape}ms)`);
        } else {
          setStates((s) => ({ ...s, [region]: { ...s[region], scraping: false, error: j.detail ?? "scrape failed" } }));
          toast.show("error", `${REGION_LABELS[region]}: ${j.detail ?? "scrape failed"}`);
        }
      } catch (err) {
        setStates((s) => ({ ...s, [region]: { ...s[region], scraping: false, error: String(err) } }));
        toast.show("error", `${REGION_LABELS[region]}: ${err}`);
      }
    },
    [toast]
  );

  const scrapeAll = useCallback(async () => {
    await Promise.all(REGIONS.map((r) => scrapeRegion(r)));
  }, [scrapeRegion]);

  // Initial load
  useEffect(() => {
    REGIONS.forEach(loadRegion);
  }, [loadRegion]);

  // Auto-refresh every 60s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => scrapeAll(), 60_000);
    return () => clearInterval(t);
  }, [autoRefresh, scrapeAll]);

  const today = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border border-emerald-500/30 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
              📡 Real-time Hôm Nay
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1 capitalize">{today}</p>
            <p className="text-[0.7rem] md:text-xs text-slate-400 mt-1">
              Bấm "Lấy data" cho từng miền hoặc "Quét tất cả" — force fetch xsmn.mobi không phụ thuộc cache.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-3 h-3"
              />
              Auto refresh mỗi 60s
            </label>
            <button
              onClick={scrapeAll}
              disabled={REGIONS.some((r) => states[r].scraping)}
              className="px-4 py-1.5 text-xs rounded-md bg-emerald-500 hover:bg-emerald-400 text-white font-bold disabled:opacity-50 transition-colors"
            >
              ⚡ Quét tất cả 3 miền
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
        {REGIONS.map((region) => {
          const state = states[region];
          return (
            <RegionCard
              key={region}
              region={region}
              state={state}
              onScrape={() => scrapeRegion(region)}
              onReload={() => loadRegion(region)}
            />
          );
        })}
      </div>
    </>
  );
}

interface RegionCardProps {
  region: Region;
  state: RegionState;
  onScrape: () => void;
  onReload: () => void;
}

function RegionCard({ region, state, onScrape, onReload }: RegionCardProps) {
  const { data, loading, scraping, lastScraped, scrapeMs, error } = state;

  return (
    <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden flex flex-col">
      <div className="px-4 md:px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
          <span className="text-xl">{REGION_ICONS[region]}</span>
          {REGION_LABELS[region]}
        </h3>
        <div className="flex gap-1.5">
          <button
            onClick={onReload}
            disabled={loading || scraping}
            className="px-2.5 py-1 text-[0.7rem] rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 disabled:opacity-50"
            title="Reload from DB"
          >
            ↻
          </button>
          <button
            onClick={onScrape}
            disabled={scraping}
            className="px-3 py-1 text-[0.7rem] rounded bg-blue-500 hover:bg-blue-400 text-white font-semibold disabled:opacity-50"
          >
            {scraping ? "⏳ Đang lấy..." : "📡 Lấy data"}
          </button>
        </div>
      </div>

      <div className="p-4 md:p-5 flex-1">
        {loading && !data ? (
          <div className="text-center py-6 text-slate-500 text-sm">Đang tải...</div>
        ) : error ? (
          <div className="text-center py-6 text-red-400 text-sm">⚠️ {error}</div>
        ) : !data || data.total_numbers === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            Chưa có data hôm nay. Bấm <span className="text-blue-400">📡 Lấy data</span> để force scrape.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Stat label="Tỉnh" value={String(data.province_count)} />
              <Stat label="Tổng số" value={String(data.total_numbers)} />
              <Stat label="Lô unique" value={String(data.unique_lo_count)} valueClass="text-emerald-400" />
            </div>

            <h4 className="text-xs text-slate-400 mb-2 font-semibold">
              Lô về hôm nay:{" "}
              <span className="text-slate-500 font-normal">
                ({data.unique_lo_count} unique / {data.total_numbers} tổng — lô có ×N là về nhiều lần)
              </span>
            </h4>
            <div className="flex flex-wrap gap-1 mb-4">
              {(() => {
                const counts: Record<string, number> = {};
                for (const rows of Object.values(data.by_province)) {
                  for (const r of rows) counts[r.lo_number] = (counts[r.lo_number] ?? 0) + 1;
                }
                return data.unique_lo.map((lo) => {
                  const c = counts[lo] ?? 1;
                  const dup = c > 1;
                  return (
                    <span
                      key={lo}
                      title={dup ? `Lô ${lo} về ${c} lần hôm nay` : `Lô ${lo}`}
                      className={`px-2 py-0.5 rounded font-mono font-semibold text-xs ${
                        dup
                          ? "bg-amber-500/20 border border-amber-400/50 text-amber-200"
                          : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                      }`}
                    >
                      {lo}
                      {dup && <span className="ml-0.5 text-[0.65rem]">×{c}</span>}
                    </span>
                  );
                });
              })()}
            </div>

            <details className="text-xs">
              <summary className="text-slate-400 cursor-pointer hover:text-slate-200">
                Chi tiết theo tỉnh ({data.province_count})
              </summary>
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(data.by_province).map(([prov, results]) => (
                  <div key={prov} className="px-2 py-1.5 rounded bg-white/[0.02]">
                    <div className="text-slate-300 font-semibold mb-1">{prov}</div>
                    <div className="flex flex-wrap gap-1">
                      {results.map((r, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded text-[0.65rem] font-mono bg-white/[0.05] text-slate-400"
                          title={`${r.prize_type}: ${r.number}`}
                        >
                          {r.number}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </div>

      {lastScraped && (
        <div className="px-4 py-2 border-t border-white/[0.06] text-[0.65rem] text-slate-500 flex justify-between">
          <span>Scrape gần nhất: {new Date(lastScraped).toLocaleTimeString("vi-VN")}</span>
          {scrapeMs && <span>{scrapeMs}ms</span>}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, valueClass = "text-slate-100" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="px-2 py-1.5 rounded bg-white/[0.03] border border-white/[0.06]">
      <div className="text-[0.6rem] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-base font-extrabold font-mono ${valueClass}`}>{value}</div>
    </div>
  );
}
