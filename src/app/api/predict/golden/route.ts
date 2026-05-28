/**
 * GET /api/predict/golden?region=xsmn&days=30&bust=1
 *
 * VIP Tổng Hợp "Quãng vàng" — backtests 4 models (lô 2 chân, lô 3 chân,
 * đá nóng, đá lạnh), finds the 2 best-hitting segments per model,
 * and returns aggregated picks for today.
 *
 * Heavy endpoint (~30-60s). Always cached 60 min per region+days unless
 * `bust=1` is passed.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { buildVipBoard } from "@/lib/prediction-golden";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const daysRaw = parseInt(url.searchParams.get("days") ?? "30");
    const days = [14, 30, 60].includes(daysRaw) ? daysRaw : 30;
    const bust = url.searchParams.get("bust") === "1";

    const t0 = Date.now();
    const result = await buildVipBoard(region, days, bust);
    const elapsedMs = Date.now() - t0;

    return NextResponse.json({
      status: "success",
      elapsed_ms: elapsedMs,
      ...result,
    });
  } catch (err) {
    return jsonError(err);
  }
}
