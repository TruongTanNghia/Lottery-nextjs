/**
 * Daily auto-scrape — triggered by Vercel Cron (configured in vercel.json).
 *
 * Schedule: 12:00 UTC = 19:00 VN time (after all 3 regions release).
 * Scrapes 2 days (yesterday + today) for safety, then recalcs.
 *
 * Auth: Vercel sends Authorization: Bearer ${CRON_SECRET} automatically.
 */
import { NextResponse } from "next/server";
import { checkCronAuth, ensureDb, jsonError } from "@/lib/api-utils";
import { scrapeAllRegionsRange } from "@/lib/scraper";
import { recalculateAllFromHistory } from "@/lib/limit-engine";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!checkCronAuth(req)) {
      return NextResponse.json({ status: "unauthorized" }, { status: 401 });
    }
    await ensureDb();

    console.log("[Cron] Daily scrape started at", new Date().toISOString());
    const counts = await scrapeAllRegionsRange(2, 1500);
    await recalculateAllFromHistory();
    const total = Object.values(counts).reduce((s, n) => s + n, 0);

    return NextResponse.json({
      status: "success",
      message: `Scraped ${total} day-records across regions`,
      counts,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(err);
  }
}
