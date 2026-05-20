/**
 * GET /api/predict/pair?region=xsmn&window=60&top_n=25&top_k=30
 *
 * Đá pair prediction. Combines top-N from VIP with pair co-occurrence boost.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { predictPair } from "@/lib/prediction-pair";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const window = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "60"), 7), 180);
    const topN = Math.min(Math.max(parseInt(url.searchParams.get("top_n") ?? "25"), 10), 40);
    const topK = Math.min(Math.max(parseInt(url.searchParams.get("top_k") ?? "30"), 10), 60);

    const result = await predictPair(region, window, topN, topK);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
