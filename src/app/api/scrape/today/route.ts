import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { scrapeToday } from "@/lib/scraper";
import { updateAllLoStatus } from "@/lib/limit-engine";

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
      const today = new Date().toISOString().slice(0, 10);
      await updateAllLoStatus(today, region);
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
