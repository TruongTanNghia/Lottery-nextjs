/**
 * GET /api/predict/three?region=xsmn&window=60
 *
 * 3-digit ("3 chân") prediction. Search space 000-999.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { predictThreeDigit } from "@/lib/prediction-three";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const window = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "60"), 7), 180);

    const result = await predictThreeDigit(region, window);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
