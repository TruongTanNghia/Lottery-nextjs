/**
 * GET /api/sim/criteria?region=xsmn&capital=5000000&days=30&top_n=10
 *
 * Plays by CONSENSUS BUCKETS (5+, 4, 3, 2 models agree).
 * Returns per-bucket P&L breakdown so user can see which criterion pays.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { simulatePlayerByCriteria } from "@/lib/simulation";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const capital = Math.max(parseInt(url.searchParams.get("capital") ?? "5000000"), 100_000);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30"), 3), 60);
    const topN = Math.min(Math.max(parseInt(url.searchParams.get("top_n") ?? "10"), 5), 20);

    const result = await simulatePlayerByCriteria(region, capital, days, topN);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
