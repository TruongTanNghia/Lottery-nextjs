/**
 * GET /api/predict/vip?region=xsmn&window=30
 *
 * Advanced 9-model prediction with per-model top 10 + consensus analysis.
 * Default window = 30 days (recent-focus per user preference).
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { predictVip } from "@/lib/prediction";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const window = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "30"), 7), 180);

    const result = await predictVip(region, window);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
