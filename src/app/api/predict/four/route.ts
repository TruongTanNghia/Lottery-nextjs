/**
 * GET /api/predict/four?window=180
 *
 * 4-digit ("4 càng") prediction — COMBINED across all 3 miền.
 * Search space 0000-9999 filtered to numbers that actually appeared
 * as G.DB in the window (~1190 / 10000 candidates typically).
 *
 * Source: G.DB (Đặc Biệt) from ANY region — XSMN has 3-4 ĐB/day,
 * XSMT 2-3/day, XSMB 1/day → ~6-8 ĐB/day combined.
 *
 * The `region` query param is accepted but IGNORED for this endpoint
 * (combined mode is the only mode for 4 càng — see prediction-four.ts
 * rationale).
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError } from "@/lib/api-utils";
import { predictFourDigitCombined } from "@/lib/prediction-four";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const window = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "180"), 14), 360);

    const result = await predictFourDigitCombined(window);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
