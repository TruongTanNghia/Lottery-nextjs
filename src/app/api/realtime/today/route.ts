/**
 * GET  /api/realtime/today?region=xsmn
 *   Returns today's results currently in DB (no scraping).
 *
 * POST /api/realtime/today?region=xsmn
 *   Force-scrapes today for the region (bypasses isDateScraped cache),
 *   then updates lo_status, then returns the results.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { scrapeTodayForce } from "@/lib/scraper";
import { updateAllLoStatus } from "@/lib/limit-engine";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface ResultRow {
  province: string;
  prize_type: string;
  number: string;
  lo_number: string;
}

async function getTodayResults(region: string) {
  const today = todayStr();
  const rows = await query<ResultRow>(
    `SELECT province, prize_type, number, lo_number FROM lottery_results
     WHERE date = ? AND region = ?
     ORDER BY province, prize_type`,
    [today, region]
  );
  // Group by province
  const byProvince: Record<string, ResultRow[]> = {};
  for (const r of rows) {
    if (!byProvince[r.province]) byProvince[r.province] = [];
    byProvince[r.province].push(r);
  }
  // Unique 2-digit lô numbers that came out
  const loSet = new Set(rows.map((r) => r.lo_number));
  return {
    date: today,
    region,
    province_count: Object.keys(byProvince).length,
    total_numbers: rows.length,
    unique_lo_count: loSet.size,
    by_province: byProvince,
    unique_lo: Array.from(loSet).sort(),
  };
}

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const data = await getTodayResults(region);
    return NextResponse.json({ status: "success", data });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));

    const t0 = Date.now();
    const scraped = await scrapeTodayForce(region);
    const scrapeMs = Date.now() - t0;

    // Update lo_status for today
    const t1 = Date.now();
    await updateAllLoStatus(todayStr(), region);
    const recalcMs = Date.now() - t1;

    const data = await getTodayResults(region);
    return NextResponse.json({
      status: "success",
      scraped: !!scraped,
      timing_ms: { scrape: scrapeMs, recalc: recalcMs },
      data,
    });
  } catch (err) {
    return jsonError(err);
  }
}
