import { NextResponse } from "next/server";
import { ensureDb, jsonError } from "@/lib/api-utils";
import { getScrapedDates, type Region } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = url.searchParams.get("region") as Region | null;

    const dates = await getScrapedDates(region ?? undefined);
    const byRegion: Record<string, { dates: string[]; count: number; latest: string | null }> = {};
    for (const entry of dates) {
      if (!byRegion[entry.region]) {
        byRegion[entry.region] = { dates: [], count: 0, latest: null };
      }
      byRegion[entry.region].dates.push(entry.date);
    }
    for (const r of Object.keys(byRegion)) {
      byRegion[r].count = byRegion[r].dates.length;
      byRegion[r].latest = byRegion[r].dates[0] ?? null;
    }

    return NextResponse.json({
      status: "success",
      by_region: byRegion,
      total_records: dates.length,
    });
  } catch (err) {
    return jsonError(err);
  }
}
