/**
 * GET /api/predict/four/backtest?region=xsmn&days=14&top_k=100&window=180&payout=6500000
 *
 * Replays last N days of 4-càng predictions. Heavy compute (10K-space × N days × 8 models).
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { backtestFourDigit } from "@/lib/prediction-four";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "14"), 3), 30);
    const topK = Math.min(Math.max(parseInt(url.searchParams.get("top_k") ?? "100"), 10), 300);
    const window = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "180"), 14), 360);
    const payout = Math.min(Math.max(parseInt(url.searchParams.get("payout") ?? "6500000"), 1_000_000), 20_000_000);

    const result = await backtestFourDigit(region, days, topK, window, payout);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
