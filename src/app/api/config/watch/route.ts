/**
 * GET/PUT /api/config/watch?region=xsmn
 *
 * Two switches for the rhythm watchlist, per region:
 *   enabled — run the watchlist at all
 *   halve   — whether being on it cuts the limit in half
 * Separate so the board can be watched without touching money.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { loadWatchConfig, saveWatchConfig, type WatchConfig } from "@/lib/limit-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    return NextResponse.json({ status: "success", region, data: await loadWatchConfig(region) });
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

    const cfg: WatchConfig = {
      enabled: body.enabled !== false,
      halve: body.halve !== false,
    };

    // No recalculate needed: getLimitSummary applies both switches on read.
    await saveWatchConfig(region, cfg);
    return NextResponse.json({ status: "success", region, data: cfg });
  } catch (err) {
    return jsonError(err);
  }
}
