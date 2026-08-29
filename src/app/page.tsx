"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import LoDetailModal from "@/components/LoDetailModal";
import LoGrid from "@/components/LoGrid";
import ManualWatchCard from "@/components/ManualWatchCard";
import PairBoard from "@/components/PairBoard";
import ResultsPage from "@/components/ResultsPage";
import RegionTabs from "@/components/RegionTabs";
import ScheduleEditor from "@/components/ScheduleEditor";
import ScrapeProgressModal from "@/components/ScrapeProgressModal";
import BacktestPanel from "@/components/BacktestPanel";
import SlotPanel from "@/components/SlotPanel";
import StreakCopyCard from "@/components/StreakCopyCard";
import StaleBanner from "@/components/StaleBanner";
import StationBoard from "@/components/StationBoard";
import ExposurePage from "@/components/ExposurePage";
import StrategyLab from "@/components/StrategyLab";
import SimAiPage from "@/components/SimAiPage";
import TopBoard from "@/components/TopBoard";
import TrackingBoard from "@/components/TrackingBoard";
import { ToastProvider, useToast } from "@/components/Toast";
import AccuracyPage from "@/components/AccuracyPage";
import HistoryPage from "@/components/HistoryPage";
import PredictionPage from "@/components/PredictionPage";
import PredictionPairPage from "@/components/PredictionPairPage";
import PredictionThreePage from "@/components/PredictionThreePage";
import PredictionVipPage from "@/components/PredictionVipPage";
import VipBoardPage from "@/components/VipBoardPage";
import PredictionFourPage from "@/components/PredictionFourPage";
import SimPage from "@/components/SimPage";
import TodayPage from "@/components/TodayPage";
import WatcherPage from "@/components/WatcherPage";
import RollingPage from "@/components/RollingPage";
import { formatDate } from "@/lib/format";
import {
  REGION_LABELS,
  type ChartData,
  type ConfigPayload,
  type LimitItem,
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
  const [view, setView] = useState<"dashboard" | "exposure" | "lab" | "simai" | "results" | "prediction" | "today" | "accuracy" | "history" | "vip" | "sim" | "watcher" | "pair" | "three" | "four" | "golden" | "rolling">("dashboard");

  const [limits, setLimits] = useState<LimitItem[]>([]);
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  /** Bumped whenever the schedule or đài rule changes, so the replay re-runs. */
  const [lanTinhLai, setLanTinhLai] = useState(0);
  const [consecutive, setConsecutive] = useState<{ lo_number: string; consecutive_days: number; current_limit: number }[]>([]);
  const [recent, setRecent] = useState<{ date: string; lo_number: string; count: number }[]>([]);
  const [scrapedDays, setScrapedDays] = useState<number | null>(null);
  const [latestScraped, setLatestScraped] = useState<string | null>(null);
  const [tabBadges, setTabBadges] = useState<Record<Region, number>>({ xsmn: 0, xsmb: 0, xsmt: 0 });

  // Only true while switching regions — NOT for the 5-minute background
  // refresh, which must never throw an overlay over what you are reading.
  const [switchingTo, setSwitchingTo] = useState<Region | null>(null);
  const [status, setStatus] = useState<"loading" | "connected" | "error">("loading");
  const [statusText, setStatusText] = useState("Đang kết nối...");
  const [lastUpdate, setLastUpdate] = useState("--:--");
  const [openLo, setOpenLo] = useState<string | null>(null);

  // Scrape progress modal state
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [scrapeStatusText, setScrapeStatusText] = useState("");
  const [regionStatus, setRegionStatus] = useState({ xsmn: "⏳", xsmb: "⏳", xsmt: "⏳" });
  const [isDedupeRunning, setIsDedupeRunning] = useState(false);
  const [isQuickUpdating, setIsQuickUpdating] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ current: number; total: number; status: string } | null>(null);

  const loadAll = useCallback(async () => {
    setStatus("loading");
    setStatusText(`Đang tải ${REGION_LABELS[region]}...`);
    try {
      // Chart data is no longer fetched — the chart was replaced by the manual
      // watchlist, and that endpoint replayed profit for every day in the range
      // on each dashboard load.
      const [limitsRes, consecRes, recentRes, statusRes] = await Promise.allSettled([
        fetch(`/api/limits?region=${region}`).then((r) => r.json()),
        fetch(`/api/consecutive?region=${region}`).then((r) => r.json()),
        // 22 calendar days so the last 15 DRAW dates are always covered even if
        // a scrape was missed or a region skipped a day.
        fetch(`/api/results/lo-daily?region=${region}&days=22`).then((r) => r.json()),
        fetch(`/api/scrape/status`).then((r) => r.json()),
      ]);

      if (limitsRes.status === "fulfilled") {
        setLimits(limitsRes.value.data ?? []);
        setConfig(limitsRes.value.config ?? null);
      }
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
    } finally {
      // Only lift the cover for the region this run actually loaded. Tapping
      // two tabs quickly would otherwise let the first load uncover a board
      // the second is still fetching.
      setSwitchingTo((cur) => (cur === region ? null : cur));
    }
  }, [region]);

  function changeRegion(r: Region) {
    if (r === region) return;
    // Cover the screen until the new region's numbers are in. Without it the
    // old region's board stays up for a second or two under the new tab —
    // easy to read the wrong region's limits and act on them.
    setSwitchingTo(r);
    setRegion(r);
  }

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadAll]);

  async function handleBackfill() {
    if (backfillProgress) return;
    if (!confirm(
      "📦 Backfill 180 ngày — sẽ chạy 6 chunk × 30 ngày (~3-5 phút).\n" +
      "Ngày đã có sẽ skip. Recalc + cleanup chạy sau khi xong hết.\n\nTiếp tục?"
    )) return;

    const CHUNKS = [
      { days: 30, offset: 0 },
      { days: 30, offset: 30 },
      { days: 30, offset: 60 },
      { days: 30, offset: 90 },
      { days: 30, offset: 120 },
      { days: 30, offset: 150 },
    ];

    setBackfillProgress({ current: 0, total: CHUNKS.length, status: "Bắt đầu..." });
    let totalScraped = 0;

    try {
      for (let i = 0; i < CHUNKS.length; i++) {
        const c = CHUNKS[i];
        setBackfillProgress({
          current: i + 1,
          total: CHUNKS.length,
          status: `Chunk ${i + 1}: ngày ${c.offset + 1}-${c.offset + c.days} trước...`,
        });
        const res = await fetch(`/api/scrape/all?days=${c.days}&offset=${c.offset}`, { method: "POST" });
        if (!res.ok) {
          toast.show("error", `Chunk ${i + 1} fail (HTTP ${res.status}) — dừng backfill`);
          break;
        }
        const j = await res.json();
        const chunkCount = Object.values(j.counts ?? {}).reduce((s: number, n) => s + (n as number), 0);
        totalScraped += chunkCount;
      }

      // Final recalc to update lo_status for all the new data
      setBackfillProgress({ current: CHUNKS.length, total: CHUNKS.length, status: "Đang recalc lo_status..." });
      await fetch("/api/recalculate", { method: "POST" });

      toast.show("success", `Backfill xong — scrape ${totalScraped} ngày mới across 3 miền`);
      await loadAll();
    } catch (err) {
      toast.show("error", `Lỗi backfill: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBackfillProgress(null);
    }
  }

  async function handleScrape() {
    const daysInput = window.prompt(
      "Scrape bao nhiêu ngày? (1-180 — DB giữ rolling 180 ngày)\n• 5 = an toàn Vercel free tier (~15s)\n• 10 = OK (~25s)\n• 30+ = có thể timeout 60s, gọi nhiều lần thay thế\n• 180 = full backfill (gọi nhiều lần 30 ngày)\n\nNgày đã có sẽ skip. Sau scrape DB tự xóa data > 180 ngày.\nTip: Đá + 3 Chân cần >= 90 ngày để accuracy ngon.",
      "30"
    );
    if (!daysInput) return;
    const days = Math.min(Math.max(parseInt(daysInput) || 5, 1), 180);

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

  /**
   * One-tap "lấy kết quả mới nhất" — the daily action.
   *
   * handleScrape prompts for a day count and re-crawls 30 days, which is the
   * wrong shape for the thing done every evening: pull the draw that just
   * happened and re-price the board. Two days of overlap covers a missed run.
   */
  async function handleQuickUpdate() {
    if (isQuickUpdating || isScraping) return;
    setIsQuickUpdating(true);
    try {
      // force=1: the newest day is re-read even when already stored. Provinces
      // publish hours apart, so pressing this at 17:00 and again at 20:00 must
      // pick up whatever came out in between.
      const res = await fetch("/api/scrape/all?days=2&force=1", { method: "POST" });
      if (!res.ok) {
        toast.show("error", `Không lấy được KQ (HTTP ${res.status})`);
        return;
      }
      await res.json();

      const recalcRes = await fetch("/api/recalculate", { method: "POST" });
      if (!recalcRes.ok) {
        toast.show("error", "Đã lấy KQ nhưng tính lại hạn mức lỗi — bấm lại giúp em");
        return;
      }

      await loadAll();

      // Report the draw actually on the board, not a count of "new" days —
      // a forced re-read always reports 1 and told the user nothing.
      const st = await fetch("/api/scrape/status").then((r) => r.json());
      const latest = st?.by_region?.[region]?.latest;
      const todayVN = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      toast.show(
        latest === todayVN ? "success" : "info",
        latest === todayVN
          ? `Đã có KQ hôm nay (${latest.slice(8, 10)}/${latest.slice(5, 7)}) — hạn mức đã tính lại`
          : `KQ mới nhất vẫn là ${latest?.slice(8, 10)}/${latest?.slice(5, 7)} — chưa xổ hoặc chưa công bố`
      );
    } catch (err) {
      toast.show("error", `Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsQuickUpdating(false);
    }
  }

  async function handleDedupe() {
    if (!confirm("Quét và xóa data bị scrape lặp lại?\n\nViệc này KHÔNG mất data thật — chỉ xóa các dòng duplicate do bấm Refresh nhiều lần.")) return;
    setIsDedupeRunning(true);
    try {
      const res = await fetch("/api/dedupe", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        toast.show("error", `Lỗi: ${j.detail ?? res.statusText}`);
        return;
      }
      if (j.duplicates_found === 0) {
        toast.show("success", "DB đã sạch — không có duplicate nào.");
      } else {
        toast.show(
          "success",
          `Đã dọn ${j.duplicates_found} ngày bị lặp, xóa ${j.total_rows_removed} rows duplicate.`
        );
      }
      await loadAll();
    } catch (err) {
      toast.show("error", `Lỗi: ${err instanceof Error ? err.message : err}`);
    } finally {
      setIsDedupeRunning(false);
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
        latestScraped={latestScraped}
        lastUpdate={lastUpdate}
        status={status}
        statusText={statusText}
        onScrape={handleScrape}
        isScraping={isScraping}
        onQuickUpdate={handleQuickUpdate}
        isQuickUpdating={isQuickUpdating}
        onDedupe={handleDedupe}
        isDedupeRunning={isDedupeRunning}
        onBackfill={handleBackfill}
        backfillProgress={backfillProgress}
      />
      {switchingTo && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[rgba(4,9,26,0.88)] backdrop-blur-sm">
          <span className="relative flex w-14 h-14">
            <span className="absolute inset-0 rounded-full border-2 border-[var(--hairline)]" />
            <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#4da6ff] animate-spin" />
          </span>
          <div className="text-center">
            <div className="chrome text-lg">{REGION_LABELS[switchingTo]}</div>
            <div className="eyebrow mt-1">Đang tải hạn mức…</div>
          </div>
        </div>
      )}

      <RegionTabs
        current={region}
        onChange={changeRegion}
        view={view}
        onViewChange={setView}
        badges={tabBadges}
      />

      <main className="max-w-[1600px] mx-auto px-3 sm:px-5 md:px-7 py-3 md:py-6">
        {/* Above every view: a stale board is wrong on the results page too. */}
        <StaleBanner
          latestScraped={latestScraped}
          onUpdate={handleQuickUpdate}
          isUpdating={isQuickUpdating}
        />
        {view === "dashboard" ? (
          <>
            {/* The two things touched every session lead: set the money, then
                copy the bet string. Per-region settings also sit right under
                the region tabs so the wrong region is hard to edit. */}
            <section className="plate rise rise-1 mb-4 md:mb-6">
              <ScheduleEditor
                region={region}
                onSaved={() => {
                  toast.show("success", `Đã lưu hạn mức ${REGION_LABELS[region]} + tính lại`);
                  setLanTinhLai((n) => n + 1);
                  loadAll();
                }}
              />
            </section>
            <StationBoard
              region={region}
              onChanged={() => {
                setLanTinhLai((n) => n + 1);
                loadAll();
              }}
            />
            <StreakCopyCard limits={limits} region={region} />

            {/* Một câu hỏi, một chỗ trả lời. StatsBar cũng đề "Lãi / Lỗ 30 kỳ"
                nhưng đứng yên ở 30 trong khi khối dưới đổi theo 60/90/120 — hai
                con số khác nhau dưới cùng một cái tên là cách chắc chắn nhất để
                người đọc tin nhầm con số. Khối dò lại đã có đủ bốn ô đó. */}
            <BacktestPanel region={region} key={`bt-${region}-${lanTinhLai}`} />
            <SlotPanel region={region} key={`slot-${region}-${lanTinhLai}`} />
            <TrackingBoard
              limits={limits}
              recent={recent}
              region={region}
              onChanged={loadAll}
            />
            <TopBoard limits={limits} recent={recent} region={region} onChanged={loadAll} />
            <PairBoard limits={limits} region={region} onChanged={loadAll} />

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 md:gap-6 items-start">
              <section className="plate rise rise-3">
                <div className="plate-hd">
                  <h2 className="plate-title">
                    Bảng Hạn Mức 100 Lô · {REGION_LABELS[region]}
                  </h2>
                  {/* Legend mirrors LoGrid's relative tiers, so it stays true
                      whatever numbers the schedule produces. */}
                  <div className="hidden md:flex items-center gap-3 text-[0.62rem]">
                    <div className="flex items-center gap-1.5">
                      {(["1", "2", "3", "4", "5"] as const).map((t) => (
                        <span
                          key={t}
                          className="w-4 h-2.5 rounded-sm"
                          style={{
                            background: { "1": "#f4525f", "2": "#fb8b3c", "3": "#f5c542", "4": "#a8e34a", "5": "#22e3a0" }[t],
                            opacity: 0.85,
                          }}
                        />
                      ))}
                      <span className="eyebrow ml-1">Thấp → Cao</span>
                    </div>
                    <span className="eyebrow px-2 py-0.5 rounded border border-[var(--hairline)] text-[var(--chrome-500)]">
                      Chặn
                    </span>
                  </div>
                </div>
                <LoGrid data={limits} onCellClick={setOpenLo} />
              </section>

              <aside className="space-y-4 md:space-y-6">
                <section className="plate rise rise-4">
                  <div className="plate-hd">
                    <h2 className="plate-title">🔥 Lô Về Liên Tiếp</h2>
                    <span className="numeric inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-bold bg-[rgba(245,197,66,0.14)] border border-[rgba(245,197,66,0.3)] text-[#f5c542]">
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

                <ManualWatchCard
                  limits={limits}
                  recent={recent}
                  region={region}
                  onChanged={loadAll}
                />

                <section className="plate rise rise-4">
                  <div className="plate-hd">
                    <h2 className="plate-title">📋 Kết Quả Gần Đây</h2>
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
        ) : view === "exposure" ? (
          <ExposurePage region={region} />
        ) : view === "lab" ? (
          <StrategyLab region={region} />
        ) : view === "simai" ? (
          <SimAiPage region={region} />
        ) : view === "results" ? (
          <ResultsPage region={region} />
        ) : view === "prediction" ? (
          <PredictionPage region={region} />
        ) : view === "vip" ? (
          <PredictionVipPage region={region} latestScraped={latestScraped} />
        ) : view === "golden" ? (
          <VipBoardPage region={region} />
        ) : view === "pair" ? (
          <PredictionPairPage region={region} />
        ) : view === "three" ? (
          <PredictionThreePage region={region} />
        ) : view === "four" ? (
          <PredictionFourPage region={region} />
        ) : view === "sim" ? (
          <SimPage region={region} />
        ) : view === "watcher" ? (
          <WatcherPage region={region} />
        ) : view === "rolling" ? (
          <RollingPage region={region} />
        ) : view === "today" ? (
          <TodayPage />
        ) : view === "accuracy" ? (
          <AccuracyPage region={region} />
        ) : (
          <HistoryPage region={region} />
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
