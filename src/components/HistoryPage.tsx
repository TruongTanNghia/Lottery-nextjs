"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import { REGION_LABELS, type Region } from "@/lib/types";
import { useToast } from "./Toast";

type ViewMode = "normal" | "last2" | "last3" | "last4";

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

const PRIZE_LABELS: Record<string, string> = {
  "G.DB": "ĐB",
  "G.1": "G1",
  "G.2": "G2",
  "G.3": "G3",
  "G.4": "G.4",
  "G.5": "G.5",
  "G.6": "G.6",
  "G.7": "G.7",
  "G.8": "G.8",
};

function transformNumber(num: string, mode: ViewMode): string {
  if (mode === "last2") return num.slice(-2);
  if (mode === "last3") return num.slice(-3);
  if (mode === "last4") return num.slice(-4);
  return num;
}

// Extract distinct last-N-digit endings from a province block array.
// Used by "loại bỏ" strategy: aggregate across days/regions then dedup + sort asc.
// Numbers shorter than N digits are skipped (no valid suffix).
function extractEndings(blocks: ProvinceBlock[], digits: 3 | 4): string[] {
  const set = new Set<string>();
  for (const prov of blocks) {
    for (const prize of prov.prizes) {
      for (const num of prize.numbers) {
        if (num.length >= digits) set.add(num.slice(-digits));
      }
    }
  }
  return Array.from(set).sort();
}

export default function HistoryPage({ region }: { region: Region }) {
  const toast = useToast();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("normal");
  const [days, setDays] = useState(45);
  const [rescraping, setRescraping] = useState(false);
  const [rescrapeStatus, setRescrapeStatus] = useState("");
  const [healthChecking, setHealthChecking] = useState(false);

  // ─── "Loại bỏ" strategy: aggregate 3/4-digit endings across regions+days ───
  const [aggDays, setAggDays] = useState(7);
  const [aggRegions, setAggRegions] = useState({ xsmn: true, xsmb: true, xsmt: true });
  const [aggCache, setAggCache] = useState<Partial<Record<Region, ApiResponse>>>({});
  const [aggLoading, setAggLoading] = useState(false);

  async function fetchAggregatedRegions() {
    setAggLoading(true);
    try {
      // Fetch all 3 regions in parallel — request enough days that aggDays + any
      // user re-tweak fits without re-fetching. Cap at 45 to match max selector.
      const fetchN = Math.max(aggDays, 45);
      const responses = await Promise.all(
        (["xsmn", "xsmb", "xsmt"] as const).map((r) =>
          fetch(`/api/results/history-full?region=${r}&days=${fetchN}`).then((res) => res.json())
        )
      );
      setAggCache({ xsmn: responses[0], xsmb: responses[1], xsmt: responses[2] });
      toast.show("success", "Đã tải data 3 miền");
    } catch {
      toast.show("error", "Lỗi khi tải data 3 miền");
    } finally {
      setAggLoading(false);
    }
  }

  // Per-date endings map: date → { last3, last4 } across selected regions.
  // Used both by the top-panel aggregate AND per-day copy buttons in each DayCard.
  const perDateEndings = useMemo(() => {
    const map = new Map<string, { last3: string[]; last4: string[] }>();
    if (!aggCache.xsmn && !aggCache.xsmb && !aggCache.xsmt) return map;

    // Collect all distinct dates across enabled regions
    const datesSet = new Set<string>();
    for (const r of ["xsmn", "xsmb", "xsmt"] as const) {
      if (!aggRegions[r]) continue;
      const d = aggCache[r]?.data ?? [];
      for (const day of d) datesSet.add(day.date);
    }

    for (const date of datesSet) {
      const blocks: ProvinceBlock[] = [];
      for (const r of ["xsmn", "xsmb", "xsmt"] as const) {
        if (!aggRegions[r]) continue;
        const day = aggCache[r]?.data.find((d) => d.date === date);
        if (day) blocks.push(...day.provinces);
      }
      map.set(date, {
        last3: extractEndings(blocks, 3),
        last4: extractEndings(blocks, 4),
      });
    }
    return map;
  }, [aggCache, aggRegions]);

  // Aggregate across last aggDays for the top panel
  const aggregated = useMemo(() => {
    if (perDateEndings.size === 0) return null;
    // Sort dates desc, take first aggDays
    const recentDates = Array.from(perDateEndings.keys()).sort().reverse().slice(0, aggDays);
    const set3 = new Set<string>();
    const set4 = new Set<string>();
    for (const date of recentDates) {
      const e = perDateEndings.get(date);
      if (!e) continue;
      for (const s of e.last3) set3.add(s);
      for (const s of e.last4) set4.add(s);
    }
    return {
      last3: Array.from(set3).sort(),
      last4: Array.from(set4).sort(),
      datesCovered: recentDates,
    };
  }, [perDateEndings, aggDays]);

  async function copyAggList(arr: string[], label: string) {
    if (arr.length === 0) return;
    try {
      await navigator.clipboard.writeText(arr.join(", "));
      toast.show("success", `Copy ${arr.length} số ${label} đã ra`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  async function runHealthCheck() {
    setHealthChecking(true);
    try {
      const res = await fetch("/api/diagnostic");
      const j = await res.json();
      if (!res.ok) {
        toast.show("error", `Lỗi: ${j.detail ?? res.statusText}`);
        return;
      }

      const s = j.summary;
      const isHealthy = j.health === "healthy";

      const lines: string[] = [
        `XSMN: ${s.total_dates_xsmn} ngày`,
        `XSMB: ${s.total_dates_xsmb} ngày`,
        `XSMT: ${s.total_dates_xsmt} ngày`,
      ];
      if (s.total_anomalies > 0) lines.push(`⚠️ ${s.total_anomalies} anomalies`);
      if (s.total_placeholder_provinces > 0)
        lines.push(`⚠️ ${s.total_placeholder_provinces} placeholder provinces`);

      const message = (isHealthy ? "✅ DB sạch! " : "⚠️ DB có vấn đề. ") + lines.join(" • ");
      toast.show(isHealthy ? "success" : "error", message);

      // Log full details to console for inspection
      console.log("=== /api/diagnostic ===", j);
      if (!isHealthy) {
        for (const region of ["xsmn", "xsmb", "xsmt"] as const) {
          const det = j.details[region];
          if (det.anomalies.length > 0) {
            console.warn(`${region.toUpperCase()} anomalies:`, det.anomalies);
          }
          if (det.placeholder_provinces.length > 0) {
            console.warn(`${region.toUpperCase()} placeholders:`, det.placeholder_provinces);
          }
        }
      }
    } catch (err) {
      toast.show("error", `Lỗi: ${err instanceof Error ? err.message : err}`);
    } finally {
      setHealthChecking(false);
    }
  }

  function reload() {
    setLoading(true);
    fetch(`/api/results/history-full?region=${region}&days=${days}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, days]);

  async function fullRescrape() {
    if (
      !confirm(
        "🔁 QUÉT LẠI TỪ ĐẦU?\n\nSẽ XÓA TOÀN BỘ data đã scrape rồi crawl lại 30 ngày từ xsmn.mobi với parser mới.\n\nMất ~3-5 phút. Tiếp tục?"
      )
    )
      return;

    setRescraping(true);
    let resetOk = false;
    let scrapeAttempts = 0;
    let scrapeOk = 0;

    try {
      // Step 1: wipe
      setRescrapeStatus("1/5: Xóa data cũ...");
      const r0 = await fetch("/api/reset-data", { method: "POST" });
      if (!r0.ok) {
        const errBody = await r0.text();
        throw new Error(`Reset failed (${r0.status}): ${errBody.slice(0, 100)}`);
      }
      resetOk = true;

      // Step 2-4: chunked scrape with retry on failure
      const chunks = [10, 20, 30];
      for (let i = 0; i < chunks.length; i++) {
        const d = chunks[i];
        setRescrapeStatus(`${i + 2}/5: Scrape ${d} ngày...`);
        scrapeAttempts++;

        let attempted = false;
        for (let retry = 0; retry < 2; retry++) {
          try {
            const r = await fetch(`/api/scrape/all?days=${d}`, { method: "POST" });
            if (r.ok) {
              scrapeOk++;
              attempted = true;
              break;
            }
            console.warn(`Scrape ${d} ngày fail attempt ${retry + 1}: ${r.status}`);
            await new Promise((res) => setTimeout(res, 2000));
          } catch (e) {
            console.warn(`Scrape ${d} ngày exception attempt ${retry + 1}:`, e);
            await new Promise((res) => setTimeout(res, 2000));
          }
        }
        if (!attempted) {
          console.warn(`Scrape ${d} ngày bỏ qua sau 2 lần thử`);
        }
      }

      // Step 5: recalc
      setRescrapeStatus("5/5: Tính lại hạn mức...");
      const r4 = await fetch("/api/recalculate", { method: "POST" });
      if (!r4.ok) console.warn(`Recalc failed: ${r4.status}`);

      // Bonus: auto health check
      setRescrapeStatus("Verify...");
      const diag = await fetch("/api/diagnostic");
      const dj = await diag.json();
      const healthy = dj.health === "healthy";
      const summary =
        `XSMN ${dj.summary?.total_dates_xsmn ?? 0}d, ` +
        `XSMB ${dj.summary?.total_dates_xsmb ?? 0}d, ` +
        `XSMT ${dj.summary?.total_dates_xsmt ?? 0}d` +
        (dj.summary?.total_anomalies ? ` • ${dj.summary.total_anomalies} anomalies` : "") +
        (dj.summary?.total_placeholder_provinces
          ? ` • ${dj.summary.total_placeholder_provinces} placeholder`
          : "");

      if (healthy) {
        toast.show("success", `✅ DB sạch! ${summary}`);
      } else {
        toast.show("error", `⚠️ Vẫn có vấn đề: ${summary}`);
        console.warn("Diagnostic details:", dj);
      }
      reload();
    } catch (err) {
      toast.show(
        "error",
        `Lỗi: ${err instanceof Error ? err.message : err}` +
          (resetOk ? ` (reset OK, ${scrapeOk}/${scrapeAttempts} scrapes OK)` : "")
      );
    } finally {
      setRescraping(false);
      setRescrapeStatus("");
    }
  }

  if (loading) {
    return <div className="text-center py-20 text-slate-500">Đang tải lịch sử...</div>;
  }

  if (!data || !data.data || data.data.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        Chưa có dữ liệu lịch sử cho {REGION_LABELS[region]}. Bấm 🔄 Cập nhật để scrape data.
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-indigo-900/25 to-blue-900/15 border border-indigo-500/30 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
              📑 Lịch Sử {data.days} Ngày — {REGION_LABELS[region]}
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              Hiển thị toàn bộ data từng đài cho từng ngày — verify trực quan
            </p>
            <p className="text-[0.7rem] md:text-xs text-slate-400 mt-1">
              {data.total_dates} ngày • {data.total_rows} kết quả
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={7}>7 ngày</option>
              <option value={15}>15 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={45}>45 ngày</option>
            </select>
            <div className="flex gap-1 p-1 rounded bg-[#1a2332] border border-slate-600">
              {(["normal", "last2", "last3", "last4"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setView(m)}
                  className={`px-3 py-1 text-xs rounded font-semibold transition-colors ${
                    view === m
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {m === "normal" ? "Số đầy đủ" : m === "last2" ? "2 số cuối" : m === "last3" ? "3 số cuối" : "4 số cuối"}
                </button>
              ))}
            </div>
            <button
              onClick={runHealthCheck}
              disabled={healthChecking}
              title="Kiểm tra DB count vs expected"
              className="px-3 py-1.5 text-xs rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-semibold disabled:opacity-50"
            >
              {healthChecking ? "⏳" : "🩺 Check DB"}
            </button>
            <button
              onClick={fullRescrape}
              disabled={rescraping}
              title="Xóa toàn bộ data và scrape lại 30 ngày"
              className="px-3 py-1.5 text-xs rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 font-semibold disabled:opacity-50"
            >
              {rescraping ? "⏳ " + rescrapeStatus : "🔁 Quét lại từ đầu"}
            </button>
          </div>
        </div>
      </section>

      {/* "Loại bỏ" aggregation panel — top panel for cross-region copy */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-rose-900/20 via-orange-900/15 to-amber-900/10 border border-amber-500/40 p-4">
        <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
          🎯 Chiến Thuật Loại Bỏ — Số Đuôi Đã Ra (3 miền)
        </h3>
        <p className="text-[0.7rem] text-slate-400 mt-0.5">
          Gộp tất cả giải ≥3/4 chữ của các miền chọn, dedup + sắp tăng. Copy → dán vào model lọc để bỏ các số "vừa ra".
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
          <div>
            <label className="text-[0.6rem] text-slate-400 uppercase font-semibold">N ngày gần nhất</label>
            <select
              value={aggDays}
              onChange={(e) => setAggDays(parseInt(e.target.value))}
              className="w-full mt-0.5 px-2 py-1 rounded text-xs bg-[#1a2332] border border-slate-600 text-slate-100"
            >
              <option value={1}>1 ngày</option>
              <option value={3}>3 ngày</option>
              <option value={7}>7 ngày</option>
              <option value={14}>14 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={45}>45 ngày</option>
            </select>
          </div>
          <div>
            <label className="text-[0.6rem] text-slate-400 uppercase font-semibold">Miền (cộng dồn)</label>
            <div className="flex gap-2 mt-1">
              {(["xsmn", "xsmb", "xsmt"] as const).map((r) => (
                <label key={r} className="flex items-center gap-1 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aggRegions[r]}
                    onChange={(e) => setAggRegions((prev) => ({ ...prev, [r]: e.target.checked }))}
                    className="accent-amber-500"
                  />
                  {r === "xsmn" ? "MN" : r === "xsmb" ? "MB" : "MT"}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2 flex items-end gap-2">
            <button
              onClick={fetchAggregatedRegions}
              disabled={aggLoading}
              className="px-3 py-1.5 text-xs rounded bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold disabled:opacity-40"
            >
              {aggLoading ? "⏳ Đang tải..." : aggregated ? "🔄 Tải lại" : "🎯 Tính loại bỏ"}
            </button>
            {aggregated && (
              <span className="text-[0.7rem] text-slate-400">
                Đã gộp {aggregated.datesCovered.length} ngày × {Object.values(aggRegions).filter(Boolean).length} miền
              </span>
            )}
          </div>
        </div>

        {aggregated && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-lg bg-amber-500/10 border border-amber-400/40 p-3">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div>
                  <div className="text-[0.6rem] text-slate-400 uppercase font-semibold">3 số cuối đã ra</div>
                  <div className="font-mono font-extrabold text-lg text-amber-300">
                    {aggregated.last3.length}<span className="text-[0.7rem] text-slate-500">/1000 ({(aggregated.last3.length / 10).toFixed(1)}%)</span>
                  </div>
                </div>
                <button
                  onClick={() => copyAggList(aggregated.last3, "3 chân")}
                  className="px-3 py-1.5 text-xs rounded bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold"
                >
                  📋 Copy
                </button>
              </div>
              <div className="text-[0.65rem] font-mono text-slate-300 max-h-16 overflow-y-auto">
                {aggregated.last3.slice(0, 30).join(", ")}
                {aggregated.last3.length > 30 && <span className="text-slate-500"> … +{aggregated.last3.length - 30}</span>}
              </div>
            </div>
            <div className="rounded-lg bg-fuchsia-500/10 border border-fuchsia-400/40 p-3">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div>
                  <div className="text-[0.6rem] text-slate-400 uppercase font-semibold">4 số cuối đã ra</div>
                  <div className="font-mono font-extrabold text-lg text-fuchsia-300">
                    {aggregated.last4.length}<span className="text-[0.7rem] text-slate-500">/10000 ({(aggregated.last4.length / 100).toFixed(2)}%)</span>
                  </div>
                </div>
                <button
                  onClick={() => copyAggList(aggregated.last4, "4 càng")}
                  className="px-3 py-1.5 text-xs rounded bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold"
                >
                  📋 Copy
                </button>
              </div>
              <div className="text-[0.65rem] font-mono text-slate-300 max-h-16 overflow-y-auto">
                {aggregated.last4.slice(0, 25).join(", ")}
                {aggregated.last4.length > 25 && <span className="text-slate-500"> … +{aggregated.last4.length - 25}</span>}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Per-day blocks */}
      <div className="space-y-3 md:space-y-4">
        {data.data.map((day) => (
          <DayCard
            key={day.date}
            day={day}
            view={view}
            endings={perDateEndings.get(day.date) ?? null}
            onCopy={copyAggList}
          />
        ))}
      </div>
    </>
  );
}

function DayCard({
  day,
  view,
  endings,
  onCopy,
}: {
  day: DayBlock;
  view: ViewMode;
  endings: { last3: string[]; last4: string[] } | null;
  onCopy: (arr: string[], label: string) => void;
}) {
  const provinceCount = day.provinces.length;

  const prizeOrder = ["G.DB", "G.1", "G.2", "G.3", "G.4", "G.5", "G.6", "G.7", "G.8"];
  const prizeSet = new Set<string>();
  for (const p of day.provinces) for (const pr of p.prizes) prizeSet.add(pr.prize_type);
  const prizes = prizeOrder.filter((p) => prizeSet.has(p));

  function getNumbers(prizeType: string, provinceName: string): string[] {
    const prov = day.provinces.find((p) => p.name === provinceName);
    if (!prov) return [];
    const pr = prov.prizes.find((x) => x.prize_type === prizeType);
    return pr?.numbers ?? [];
  }

  // Total numbers per province (for verification)
  function totalNumbers(provName: string): number {
    const prov = day.provinces.find((p) => p.name === provName);
    if (!prov) return 0;
    return prov.prizes.reduce((s, pr) => s + pr.numbers.length, 0);
  }

  const chipBase = "inline-block px-1.5 py-0.5 rounded font-mono font-bold leading-none border";
  const chipColor: Record<ViewMode, string> = {
    normal: "bg-white/[0.04] border-white/[0.08] text-slate-100",
    last2: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    last3: "bg-amber-500/10 border-amber-500/30 text-amber-300",
    last4: "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300",
  };

  return (
    <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm md:text-base font-bold">
          {formatDate(day.date)}{" "}
          <span className="text-slate-500 font-mono text-xs">({day.date})</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {endings && (
            <>
              <button
                onClick={() => onCopy(endings.last3, `3 chân ngày ${day.date}`)}
                title={`Copy ${endings.last3.length} số 3 cuối đã ra ngày này (gộp các miền chọn)`}
                className="px-2 py-0.5 text-[0.65rem] rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-bold font-mono"
              >
                📋 3c·{endings.last3.length}
              </button>
              <button
                onClick={() => onCopy(endings.last4, `4 càng ngày ${day.date}`)}
                title={`Copy ${endings.last4.length} số 4 cuối đã ra ngày này (gộp các miền chọn)`}
                className="px-2 py-0.5 text-[0.65rem] rounded bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-400/40 text-fuchsia-200 font-bold font-mono"
              >
                📋 4c·{endings.last4.length}
              </button>
            </>
          )}
          <span className="text-[0.7rem] text-slate-400">
            {provinceCount} đài •{" "}
            {day.provinces.map((p) => `${p.name}(${totalNumbers(p.name)})`).join(" / ")}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead>
            <tr className="bg-[#0f1623] border-b border-white/[0.06]">
              <th className="px-2 md:px-3 py-2 text-left text-[0.7rem] font-semibold text-amber-400 uppercase tracking-wide w-12 md:w-14">
                Giải
              </th>
              {day.provinces.map((p) => (
                <th
                  key={p.name}
                  className="px-2 md:px-3 py-2 text-center text-[0.72rem] font-semibold text-slate-200 border-l border-white/[0.04]"
                >
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prizes.map((prize) => (
              <tr key={prize} className="border-b border-white/[0.03] hover:bg-white/[0.01]">
                <td className="px-2 md:px-3 py-2 font-bold text-amber-300 text-[0.72rem] align-top">
                  {PRIZE_LABELS[prize] ?? prize}
                </td>
                {day.provinces.map((prov) => {
                  const nums = getNumbers(prize, prov.name);
                  const isDB = prize === "G.DB";
                  return (
                    <td
                      key={prov.name}
                      className="px-2 md:px-3 py-2 text-center border-l border-white/[0.04] align-top"
                    >
                      <div className="flex flex-wrap justify-center gap-1">
                        {nums.map((n, i) => (
                          <span
                            key={i}
                            className={`${chipBase} ${chipColor[view]} ${
                              isDB
                                ? "text-sm md:text-base px-2 py-1"
                                : "text-[0.72rem] md:text-xs"
                            }`}
                          >
                            {transformNumber(n, view)}
                          </span>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
