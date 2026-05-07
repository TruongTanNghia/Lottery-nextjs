/**
 * GET /api/predict/adaptive/scorecard?region=xsmn&days=14&top_n=10&perf=14
 *
 * Returns:
 *   - per-day predicted top N vs actual lô (with profit/loss)
 *   - per-model leaderboard with break-even comparison
 *   - auto strategy recommendation
 *
 * Uses POINT_VALUE=23,000đ and WIN_MULTIPLIER=80 (player view).
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { getAdaptiveScorecard } from "@/lib/prediction";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "14"), 3), 30);
    const topN = Math.min(Math.max(parseInt(url.searchParams.get("top_n") ?? "10"), 5), 20);
    const perf = Math.min(Math.max(parseInt(url.searchParams.get("perf") ?? "14"), 3), 30);

    const result = await getAdaptiveScorecard(region, days, topN, perf);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
