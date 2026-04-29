/**
 * Daily auto-scrape — triggered by Vercel Cron (configured in vercel.json).
 *
 * Schedule: 12:00 UTC = 19:00 VN time (after all 3 regions release).
 * Strategy:
 *   1. Scrape last 2 days (yesterday + today) for safety
 *   2. Update lo_status only for the 2 most recent dates per region
 *      (incremental — much faster than full history recalc)
 *
 * Auth: Vercel sends Authorization: Bearer ${CRON_SECRET} automatically.
 */
import { NextResponse } from "next/server";
import { checkCronAuth, ensureDb, jsonError } from "@/lib/api-utils";
import { scrapeAllRegionsRange } from "@/lib/scraper";
import { updateAllLoStatus } from "@/lib/limit-engine";
import { cleanupOldData, query, VALID_REGIONS } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!checkCronAuth(req)) {
      return NextResponse.json({ status: "unauthorized" }, { status: 401 });
    }
    await ensureDb();

    const startedAt = new Date().toISOString();
    console.log(`[Cron] Daily scrape started at ${startedAt}`);

    const t0 = Date.now();
    const counts = await scrapeAllRegionsRange(2, 600);
    const scrapeMs = Date.now() - t0;
    console.log(`[Cron] Scrape done in ${scrapeMs}ms — counts:`, counts);

    // Incremental recalc: only the 2 most recent dates per region (fast)
    const t1 = Date.now();
    for (const region of VALID_REGIONS) {
      const recent = await query<{ date: string }>(
        "SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT 3",
        [region]
      );
      // Process in chronological order (oldest first → days_since_last increments correctly)
      for (const { date } of recent.reverse()) {
        await updateAllLoStatus(date, region);
      }
    }
    const recalcMs = Date.now() - t1;
    console.log(`[Cron] Recalc done in ${recalcMs}ms`);

    // Trim to rolling 45-day window
    const deleted = await cleanupOldData(45);
    console.log(`[Cron] Cleanup deleted ${deleted} stale rows`);

    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return NextResponse.json({
      status: "success",
      message: `Scraped ${total} day-records, recalc ${recalcMs}ms, cleanup ${deleted} rows`,
      counts,
      cleanup_deleted: deleted,
      timing_ms: { scrape: scrapeMs, recalc: recalcMs, total: scrapeMs + recalcMs },
      ran_at: startedAt,
    });
  } catch (err) {
    return jsonError(err);
  }
}
