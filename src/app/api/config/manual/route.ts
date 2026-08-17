/**
 * GET/PUT /api/config/manual?region=xsmn
 *
 * Lô the operator types in by hand. Stored per region because it halves real
 * limits — the board, the 100-lô grid and the copied bet string all read the
 * same number.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import {
  loadManualConfig,
  parseLoList,
  saveManualConfig,
  type ManualConfig,
} from "@/lib/limit-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    return NextResponse.json({ status: "success", region, data: await loadManualConfig(region) });
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

    // Accept either a raw typed string or an array — the input box sends text.
    const los = Array.isArray(body.los)
      ? parseLoList(body.los.join(" "))
      : parseLoList(String(body.los ?? ""));

    if (los.length > 100) throw new ApiError(400, "Tối đa 100 lô");

    const cfg: ManualConfig = { los, halve: body.halve !== false };
    // No recalculate needed: getLimitSummary applies the discount on read.
    await saveManualConfig(region, cfg);
    return NextResponse.json({ status: "success", region, data: cfg });
  } catch (err) {
    return jsonError(err);
  }
}
