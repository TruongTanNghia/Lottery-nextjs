import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { scrapeToday } from "@/lib/scraper";
import { recalculateAllFromHistory } from "@/lib/limit-engine";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));

    const result = await scrapeToday(region);
    if (result) {
      // Full replay — the result must not depend on how many times, or how
      // early in the draw, this endpoint was hit.
      await recalculateAllFromHistory(region);
    }

    return NextResponse.json({
      status: "success",
      region,
      message: result ? "Scraped + updated" : "No new data",
    });
  } catch (err) {
    return jsonError(err);
  }
}
