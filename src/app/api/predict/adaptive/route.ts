/**
 * GET /api/predict/adaptive?region=xsmn&window=60&perf=14
 *
 * Self-tuning prediction:
 *   - Each model's weight = avg hit_rate over last `perf` days
 *   - Sum normalized so weights sum to 1
 *   - If no perf data yet → equal weights (1/9 each)
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { predictAdaptive } from "@/lib/prediction";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const window = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "60"), 7), 180);
    const perf = Math.min(Math.max(parseInt(url.searchParams.get("perf") ?? "14"), 3), 60);

    const result = await predictAdaptive(region, window, perf);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
