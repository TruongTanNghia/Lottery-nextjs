/**
 * GET /api/predict/three/backtest?region=xsmn&days=14&top_k=30&window=60
 *
 * Replays 3-digit prediction across last N days using data-before-the-day,
 * then compares top-K vs actual 3-digit numbers that came.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { backtestThreeDigit } from "@/lib/prediction-three";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "14"), 3), 30);
    const topK = Math.min(Math.max(parseInt(url.searchParams.get("top_k") ?? "30"), 5), 100);
    const window = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "120"), 7), 180);
    const payout = Math.min(Math.max(parseInt(url.searchParams.get("payout") ?? "600000"), 100_000), 2_000_000);

    const result = await backtestThreeDigit(region, days, topK, window, payout);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
