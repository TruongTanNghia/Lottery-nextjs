/**
 * POST /api/backfill-performance?region=xsmn&days=14&top_n=10
 *
 * Backfills model_performance table by replaying each of 9 models on
 * historical days (using only data BEFORE each target). Use this to
 * bootstrap adaptive predictions on a fresh DB.
 *
 * Auth: middleware (logged-in admin session).
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { backfillModelPerformance } from "@/lib/prediction";
import { VALID_REGIONS } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const regionParam = url.searchParams.get("region");
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "14"), 1), 30);
    const topN = Math.min(Math.max(parseInt(url.searchParams.get("top_n") ?? "10"), 5), 50);

    const regions = regionParam ? [validateRegion(regionParam)] : [...VALID_REGIONS];
    const out: Record<string, number> = {};

    for (const region of regions) {
      const r = await backfillModelPerformance(region, days, topN);
      out[region] = r.days_processed;
    }

    return NextResponse.json({
      status: "success",
      message: `Backfilled ${days} days × 9 models`,
      days_processed_per_region: out,
    });
  } catch (err) {
    return jsonError(err);
  }
}
