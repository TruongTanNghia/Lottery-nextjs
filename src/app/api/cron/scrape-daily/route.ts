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
import { recalculateAllFromHistory, updateAllLoStatus } from "@/lib/limit-engine";
import { cleanupOldData, query, VALID_REGIONS, rebuildLoDaily } from "@/lib/db";
import { computeAndSaveModelPerformance } from "@/lib/prediction";

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

    // Guard against lo_daily drifting away from the đài rule.
    //
    // New draws are filtered as they are written, but a rule change leaves
    // every earlier day counted the old way — and nothing complains, because
    // a wrong hit count still looks like a perfectly ordinary number. That is
    // exactly how the board came to count every đài against a price built for
    // two, losing 57% a draw in silence. Cheap to check, so check nightly.
    const rebuilt: Record<string, number> = {};
    for (const region of VALID_REGIONS) {
      const expected = region === "xsmb" ? 27 : 36;
      const rows = await query<{ tb: number }>(
        `SELECT AVG(t) AS tb FROM (
           SELECT SUM(count) AS t FROM lo_daily WHERE region = ? GROUP BY date
         )`,
        [region]
      );
      const actual = Number(rows[0]?.tb ?? 0);
      if (actual > 0 && Math.abs(actual - expected) > 0.5) {
        console.warn(
          `[Cron] ${region}: đang đếm ${actual.toFixed(1)} lần trúng/kỳ, đáng lẽ ${expected} — dựng lại lo_daily`
        );
        const r = await rebuildLoDaily(region);
        await recalculateAllFromHistory(region);
        rebuilt[region] = r.days;
      }
    }

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

    // Rolling 180-day window — Đá + 3 Chân need a lot more data to be
    // accurate (sparse spaces). VIP only uses up to 90 days so the extra
    // data doesn't disturb it.
    const deleted = await cleanupOldData(180);
    console.log(`[Cron] Cleanup deleted ${deleted} stale rows`);

    // Compute model performance for the latest scraped date per region
    // (Used by /api/predict/adaptive for self-tuning weights.)
    const t2 = Date.now();
    const perfResults: Record<string, number> = {};
    for (const region of VALID_REGIONS) {
      const latestRow = await query<{ date: string }>(
        "SELECT MAX(date) as date FROM lo_daily WHERE region = ?",
        [region]
      );
      const latestDate = latestRow[0]?.date;
      if (latestDate) {
        const r = await computeAndSaveModelPerformance(region, latestDate, 10, 60);
        perfResults[region] = r.saved;
      } else {
        perfResults[region] = 0;
      }
    }
    const perfMs = Date.now() - t2;
    console.log(`[Cron] Model performance computed in ${perfMs}ms:`, perfResults);

    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return NextResponse.json({
      status: "success",
      message: `Scraped ${total}, recalc ${recalcMs}ms, cleanup ${deleted}, perf ${perfMs}ms`,
      counts,
      cleanup_deleted: deleted,
      rebuilt,
      performance_saved: perfResults,
      timing_ms: { scrape: scrapeMs, recalc: recalcMs, perf: perfMs, total: scrapeMs + recalcMs + perfMs },
      ran_at: startedAt,
    });
  } catch (err) {
    return jsonError(err);
  }
}
