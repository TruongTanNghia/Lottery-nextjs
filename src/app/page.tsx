"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import LoDetailModal from "@/components/LoDetailModal";
import LoGrid from "@/components/LoGrid";
import NextDrawCard from "@/components/NextDrawCard";
import PricingCard from "@/components/PricingCard";
import ProfitChart from "@/components/ProfitChart";
import RegionTabs from "@/components/RegionTabs";
import ScheduleEditor from "@/components/ScheduleEditor";
import ScrapeProgressModal from "@/components/ScrapeProgressModal";
import StatsBar from "@/components/StatsBar";
import { ToastProvider, useToast } from "@/components/Toast";
import PredictionPage from "@/components/PredictionPage";
import { formatDate } from "@/lib/format";
import {
  REGION_LABELS,
  type ChartData,
  type ConfigPayload,
  type LimitItem,
  type ProfitStats,
  type Region,
} from "@/lib/types";

const REFRESH_MS = 5 * 60 * 1000;

export default function HomePage() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  );
}

function Dashboard() {
  const toast = useToast();

  const [region, setRegion] = useState<Region>("xsmn");
  const [view, setView] = useState<"dashboard" | "prediction">("dashboard");

  const [limits, setLimits] = useState<LimitItem[]>([]);
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [profit, setProfit] = useState<ProfitStats | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [chartDays, setChartDays] = useState(7);
  const [consecutive, setConsecutive] = useState<{ lo_number: string; consecutive_days: number; current_limit: number }[]>([]);
  const [recent, setRecent] = useState<{ date: string; lo_number: string; count: number }[]>([]);
  const [scrapedDays, setScrapedDays] = useState<number | null>(null);
  const [latestScraped, setLatestScraped] = useState<string | null>(null);
  const [tabBadges, setTabBadges] = useState<Record<Region, number>>({ xsmn: 0, xsmb: 0, xsmt: 0 });

  const [status, setStatus] = useState<"loading" | "connected" | "error">("loading");
  const [statusText, setStatusText] = useState("Đang kết nối...");
  const [lastUpdate, setLastUpdate] = useState("--:--");
  const [openLo, setOpenLo] = useState<string | null>(null);

  // Scrape progress modal state
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [scrapeStatusText, setScrapeStatusText] = useState("");
  const [regionStatus, setRegionStatus] = useState({ xsmn: "⏳", xsmb: "⏳", xsmt: "⏳" });

  const loadAll = useCallback(async () => {
    setStatus("loading");
    setStatusText(`Đang tải ${REGION_LABELS[region]}...`);
    try {
      const [limitsRes, profitRes, chartRes, consecRes, recentRes, statusRes] = await Promise.allSettled([
        fetch(`/api/limits?region=${region}`).then((r) => r.json()),
        fetch(`/api/stats/profit?region=${region}&days=30`).then((r) => r.json()),
        fetch(`/api/stats/profit/chart?region=${region}&days=${chartDays}`).then((r) => r.json()),
        fetch(`/api/consecutive?region=${region}`).then((r) => r.json()),
        fetch(`/api/results/lo-daily?region=${region}&days=7`).then((r) => r.json()),
        fetch(`/api/scrape/status`).then((r) => r.json()),
      ]);

      if (limitsRes.status === "fulfilled") {
        setLimits(limitsRes.value.data ?? []);
        setConfig(limitsRes.value.config ?? null);
      }
      if (profitRes.status === "fulfilled") setProfit(profitRes.value.data ?? null);
      if (chartRes.status === "fulfilled") setChartData(chartRes.value.data ?? null);
      if (consecRes.status === "fulfilled") setConsecutive(consecRes.value.data ?? []);
      if (recentRes.status === "fulfilled") setRecent(recentRes.value.data ?? []);
      if (statusRes.status === "fulfilled") {
        const byRegion = statusRes.value.by_region ?? {};
        setScrapedDays(byRegion[region]?.count ?? 0);
        setLatestScraped(byRegion[region]?.latest ?? null);
        setTabBadges({
          xsmn: byRegion.xsmn?.count ?? 0,
          xsmb: byRegion.xsmb?.count ?? 0,
          xsmt: byRegion.xsmt?.count ?? 0,
        });
      }

      setStatus("connected");
      setStatusText(`${REGION_LABELS[region]} — Đã kết nối`);
      setLastUpdate(
        new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
      );
    } catch (err) {
      console.error("loadAll error:", err);
      setStatus("error");
      setStatusText("Lỗi kết nối");
    }
  }, [region, chartDays]);

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadAll]);

  async function handleScrape() {
    const daysInput = window.prompt(
      "Scrape bao nhiêu ngày? (1-7 cho Vercel free tier)\n• 3 = an toàn (~12s)\n• 5 = ổn (~20s)\n• 7+ = có thể timeout 60s\n\nMỗi lần scrape các ngày đã có sẽ được skip — gọi nhiều lần để có nhiều data.",
      "5"
    );
    if (!daysInput) return;
    const days = Math.min(Math.max(parseInt(daysInput) || 5, 1), 30);

    setIsScraping(true);
    setScrapeProgress(5);
    setScrapeStatusText(`Bước 1/2: Crawl 3 miền (${days} ngày)...`);
    setRegionStatus({ xsmn: "⏳", xsmb: "⏳", xsmt: "⏳" });

    const estimatedMs = days * 3500;
    const tickMs = 1000;
    const tickIncrement = (60 - 5) / (estimatedMs / tickMs);
    let progress = 5;
    const interval = setInterval(() => {
      progress = Math.min(progress + tickIncrement, 60);
      setScrapeProgress(progress);
      if (progress > 20) setRegionStatus((r) => ({ ...r, xsmn: "✅" }));
      if (progress > 35) setRegionStatus((r) => ({ ...r, xsmb: "✅" }));
      if (progress > 50) setRegionStatus((r) => ({ ...r, xsmt: "✅" }));
    }, tickMs);

    try {
      // Step 1: Scrape (no DB recalc)
      const res = await fetch(`/api/scrape/all?days=${days}`, { method: "POST" });
      clearInterval(interval);

      if (!res.ok) {
        const txt = await res.text();
        toast.show("error", `Lỗi scrape: ${txt.slice(0, 100)}`);
        return;
      }
      const body = await res.json();

      setScrapeProgress(65);
      setRegionStatus({ xsmn: "✅", xsmb: "✅", xsmt: "✅" });
      setScrapeStatusText("Bước 2/2: Tính lại hạn mức từ data mới...");

      // Step 2: Recalc lo_status (separate request → its own 60s budget)
      const recalcRes = await fetch(`/api/recalculate`, { method: "POST" });
      if (!recalcRes.ok) {
        toast.show("error", "Recalc lỗi — data đã save nhưng limits có thể chưa update. Bấm Cập nhật lại.");
        return;
      }

      setScrapeProgress(100);
      setScrapeStatusText("Hoàn tất! Đang tải lại UI...");
      await new Promise((r) => setTimeout(r, 600));
      await loadAll();

      const totalDays = body.counts ? Object.values<number>(body.counts).reduce((s, n) => s + n, 0) : 0;
      toast.show("success", `Cập nhật xong — ${totalDays} day-records + limits đã recalc`);
    } catch (err) {
      clearInterval(interval);
      toast.show("error", `Lỗi: ${err instanceof Error ? err.message : err}`);
    } finally {
      setIsScraping(false);
      setScrapeProgress(0);
    }
  }

  const recentByDate = useMemo(() => {
    const groups: Record<string, { lo_number: string; count: number }[]> = {};
    for (const r of recent) {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push({ lo_number: r.lo_number, count: r.count });
    }
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 5);
  }, [recent]);

  return (
    <>
      <Header
        scrapedDays={scrapedDays}
        lastUpdate={lastUpdate}
        status={status}
        statusText={statusText}
        onScrape={handleScrape}
        isScraping={isScraping}
      />
      <RegionTabs
        current={region}
        onChange={setRegion}
        view={view}
        onViewChange={setView}
        badges={tabBadges}
      />

      <main className="max-w-[1600px] mx-auto px-3 sm:px-5 md:px-7 py-3 md:py-6">
        {view === "dashboard" ? (
          <>
            <NextDrawCard
              region={region}
              latestScraped={latestScraped}
              onSeeAll={() => setView("prediction")}
            />
            <StatsBar stats={profit} />

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 md:gap-6 items-start">
              <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                  <h2 className="text-sm font-bold">
                    📊 Bảng Hạn Mức 100 Lô (00–99) — {REGION_LABELS[region]}
                  </h2>
                  <div className="hidden md:flex flex-wrap gap-2 text-[0.65rem] font-semibold font-mono">
                    {[200, 150, 100, 50, 10].map((v) => (
                      <span
                        key={v}
                        className="px-2.5 py-0.5 rounded"
                        style={{
                          background:
                            v === 200
                              ? "rgba(16,185,129,0.15)"
                              : v === 150
                              ? "rgba(245,158,11,0.15)"
                              : v === 100
                              ? "rgba(250,204,21,0.15)"
                              : v === 50
                              ? "rgba(239,68,68,0.12)"
                              : "rgba(127,29,29,0.2)",
                          color:
                            v === 200
                              ? "#10b981"
                              : v === 150
                              ? "#f59e0b"
                              : v === 100
                              ? "#facc15"
                              : v === 50
                              ? "#ef4444"
                              : "#fca5a5",
                        }}
                      >
                        {v === 50 ? "≤50đ" : `${v}đ`}
                      </span>
                    ))}
                  </div>
                </div>
                <LoGrid data={limits} onCellClick={setOpenLo} />
                <ScheduleEditor
                  onSaved={() => {
                    toast.show("success", "Đã lưu schedule + recalc");
                    loadAll();
                  }}
                />
                <PricingCard region={region} config={config} />
              </section>

              <aside className="space-y-6">
                <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                    <h2 className="text-sm font-bold">🔥 Lô Về Liên Tiếp</h2>
                    <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-bold font-mono bg-amber-500/15 text-amber-500">
                      {consecutive.length}
                    </span>
                  </div>
                  <div className="p-4 max-h-72 overflow-y-auto">
                    {consecutive.length === 0 ? (
                      <div className="text-center py-7 text-slate-500 text-sm">Không có lô nào về liên tiếp</div>
                    ) : (
                      consecutive.map((c) => (
                        <div
                          key={c.lo_number}
                          onClick={() => setOpenLo(c.lo_number)}
                          className="flex items-center justify-between px-3.5 py-2.5 mb-1.5 rounded bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] cursor-pointer"
                        >
                          <span className="font-mono font-bold text-amber-500 text-base">{c.lo_number}</span>
                          <span className="text-sm font-semibold flex items-center gap-1">
                            <span>{"🔥".repeat(Math.min(c.consecutive_days, 4))}</span>
                            {c.consecutive_days} ngày
                          </span>
                          <span className="font-mono font-semibold text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-500">
                            {c.current_limit}đ
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
                  <ProfitChart data={chartData} days={chartDays} onDaysChange={setChartDays} />
                </section>

                <section className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/[0.06]">
                    <h2 className="text-sm font-bold">📋 Kết Quả Gần Đây</h2>
                  </div>
                  <div className="p-4 max-h-96 overflow-y-auto">
                    {recentByDate.length === 0 ? (
                      <div className="text-center py-7 text-slate-500 text-sm">Chưa có dữ liệu.</div>
                    ) : (
                      recentByDate.map(([date, los]) => (
                        <div key={date} className="mb-3.5">
                          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5 pl-1">
                            {formatDate(date)}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {los.map((l, i) => (
                              <span
                                key={i}
                                onClick={() => setOpenLo(l.lo_number)}
                                className={`px-2 py-0.5 rounded text-xs font-mono font-semibold cursor-pointer ${
                                  l.count > 1
                                    ? "bg-blue-500/12 border border-blue-500/25 text-blue-400"
                                    : "bg-white/[0.03] border border-white/[0.06] text-slate-400"
                                }`}
                              >
                                {l.lo_number}
                                {l.count > 1 ? `×${l.count}` : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </>
        ) : (
          <PredictionPage region={region} />
        )}
      </main>

      <LoDetailModal lo={openLo} region={region} config={config} onClose={() => setOpenLo(null)} />
      <ScrapeProgressModal
        open={isScraping}
        progress={scrapeProgress}
        statusText={scrapeStatusText}
        regionStatus={regionStatus}
      />
    </>
  );
}
