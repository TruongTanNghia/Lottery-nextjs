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
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "5"), 1), 45);

    const counts = await scrapeAllRegionsRange(days, 600);

    // Maintain rolling 45-day window: trim anything older than 45 days
    const deleted = await cleanupOldData(45);

    return NextResponse.json({
      status: "success",
      message: `Scraped ${days} days for all 3 regions. Now POST /api/recalculate to update limits.`,
      counts,
      cleanup_deleted: deleted,
    });
  } catch (err) {
    return jsonError(err);
  }
}
