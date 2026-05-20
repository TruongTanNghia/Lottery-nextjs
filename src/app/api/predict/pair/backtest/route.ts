/**
 * GET /api/predict/pair/backtest?region=xsmn&days=14&top_k=30&window=60&top_n=25
 *
 * Replays Đá pair prediction across last N days. A pair "hits" when BOTH
 * lô in the pair appeared in the actual draw that day.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { backtestPair } from "@/lib/prediction-pair";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "14"), 3), 30);
    const topK = Math.min(Math.max(parseInt(url.searchParams.get("top_k") ?? "30"), 5), 60);
    const window = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "60"), 7), 180);
    const topNSource = Math.min(Math.max(parseInt(url.searchParams.get("top_n") ?? "25"), 10), 40);

    const result = await backtestPair(region, days, topK, window, topNSource);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
