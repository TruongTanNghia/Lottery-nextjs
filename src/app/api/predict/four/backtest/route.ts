/**
 * GET /api/predict/four/backtest?days=14&top_k=100&window=180&payout=6500000
 *
 * Replays last N days of COMBINED 4-càng predictions across all 3 miền.
 * Heavy: ~30-50s for 14 days × filtered ~1200 pool × 8 models.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError } from "@/lib/api-utils";
import { backtestFourDigitCombined } from "@/lib/prediction-four";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "14"), 3), 30);
    const topK = Math.min(Math.max(parseInt(url.searchParams.get("top_k") ?? "100"), 10), 300);
    const window = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "180"), 14), 360);
    const payout = Math.min(Math.max(parseInt(url.searchParams.get("payout") ?? "6500000"), 1_000_000), 20_000_000);

    const result = await backtestFourDigitCombined(days, topK, window, payout);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
