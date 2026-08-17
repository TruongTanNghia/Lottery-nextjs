/**
 * GET/PUT /api/config/pair?region=xsmn
 *
 * On/off for the mirror-pair rule (15↔51 on the same price → both halved).
 * Per region, like every other limit switch.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { loadPairConfig, savePairConfig } from "@/lib/limit-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    return NextResponse.json({ status: "success", region, data: await loadPairConfig(region) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    const body = await req.json();
    if (!body || typeof body !== "object") throw new ApiError(400, "Body must be JSON");

    const cfg = { enabled: body.enabled !== false };
    // No recalculate needed: getLimitSummary applies the rule on read.
    await savePairConfig(region, cfg);
    return NextResponse.json({ status: "success", region, data: cfg });
  } catch (err) {
    return jsonError(err);
  }
}
