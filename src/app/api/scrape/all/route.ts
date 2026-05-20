/**
 * POST /api/scrape/all?days=N
 *
 * Scrapes only. Does NOT recalc lo_status (call /api/recalculate after).
 * Splitting these into 2 API calls gives each its own Vercel 60s budget.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError } from "@/lib/api-utils";
import { scrapeAllRegionsRange } from "@/lib/scraper";
import { cleanupOldData } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "5"), 1), 30);
    const offset = Math.min(Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0), 365);

    const counts = await scrapeAllRegionsRange(days, 600, offset);

    // Maintain rolling 180-day window (skip when backfilling old data)
    const skipCleanup = url.searchParams.get("skip_cleanup") === "1" || offset > 0;
    const deleted = skipCleanup ? 0 : await cleanupOldData(180);

    return NextResponse.json({
      status: "success",
      message: `Scraped ${days} days (offset ${offset}) for all 3 regions.`,
      counts,
      cleanup_deleted: deleted,
      offset,
    });
  } catch (err) {
    return jsonError(err);
  }
}
