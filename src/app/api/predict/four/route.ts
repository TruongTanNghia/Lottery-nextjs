/**
 * GET /api/predict/four?region=xsmn&window=180
 *
 * 4-digit ("4 càng") prediction. Search space 0000-9999. Source: G.DB only.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { predictFourDigit } from "@/lib/prediction-four";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const window = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "180"), 14), 360);

    const result = await predictFourDigit(region, window);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
