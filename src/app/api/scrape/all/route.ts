/**
 * POST /api/scrape/all?days=N
 *
 * Scrapes only. Does NOT recalc lo_status (call /api/recalculate after).
 * Splitting these into 2 API calls gives each its own Vercel 60s budget.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError } from "@/lib/api-utils";
import { scrapeAllRegionsRange } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "5"), 1), 30);

    const counts = await scrapeAllRegionsRange(days, 600);

    return NextResponse.json({
      status: "success",
      message: `Scraped ${days} days for all 3 regions. Now POST /api/recalculate to update limits.`,
      counts,
    });
  } catch (err) {
    return jsonError(err);
  }
}
