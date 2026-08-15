/**
 * GET/PUT /api/config/top?region=xsmn
 *
 * Which lô sit on the Top-N watchlist is a money decision — those limits get
 * halved — so the selection is stored per region rather than in the browser.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { loadTopConfig, saveTopConfig, type TopConfig } from "@/lib/limit-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    return NextResponse.json({ status: "success", region, data: await loadTopConfig(region) });
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

    const cfg: TopConfig = {
      size: Number(body.size ?? 10),
      dir: body.dir === "cold" ? "cold" : "hot",
      enabled: body.enabled !== false,
    };
    if (!Number.isFinite(cfg.size) || cfg.size < 0 || cfg.size > 100) {
      throw new ApiError(400, "size phải trong khoảng 0-100");
    }

    // No recalculate needed: getLimitSummary applies the discount on read.
    await saveTopConfig(region, cfg);
    return NextResponse.json({ status: "success", region, data: cfg });
  } catch (err) {
    return jsonError(err);
  }
}
