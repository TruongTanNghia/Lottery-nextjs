/**
 * POST /api/scrape/all?days=N
 *
 * NOTE: Vercel function timeout = 60s (Hobby), so practical max ≈ 5-7 days
 *       per call. For 30-day backfill, call repeatedly with smaller chunks
 *       OR use the cron endpoint which only does 2 days at a time.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError } from "@/lib/api-utils";
import { scrapeAllRegionsRange } from "@/lib/scraper";
import { recalculateAllFromHistory } from "@/lib/limit-engine";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "5"), 1), 30);

    const counts = await scrapeAllRegionsRange(days, 1500);
    await recalculateAllFromHistory();

    return NextResponse.json({
      status: "success",
      message: `Scraped ${days} days for all 3 regions`,
      counts,
    });
  } catch (err) {
    return jsonError(err);
  }
}
