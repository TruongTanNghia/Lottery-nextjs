/**
 * GET/PUT /api/bets?region=xsmn&date=2026-08-18
 *
 * The book for one draw: points taken per lô. Everything on the exposure page
 * is computed from this, and nothing else in the app writes it — the lottery
 * tables record what was drawn, this records what was accepted.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { getBetDates, getBets, getLoAppearedOnDate, query, saveBets } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rejects anything that is not a real YYYY-MM-DD, so a typo cannot create a book. */
function validateDate(raw: string | null): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ApiError(400, "Thiếu hoặc sai ngày (YYYY-MM-DD)");
  }
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new ApiError(400, `Ngày không tồn tại: ${raw}`);
  }
  return raw;
}

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const date = validateDate(url.searchParams.get("date"));

    // The draw itself, when it has already happened — that turns the exposure
    // view into a settled result instead of a forecast.
    const appeared = await getLoAppearedOnDate(date, region);
    const counts = await query<{ lo_number: string; count: number }>(
      "SELECT lo_number, count FROM lo_daily WHERE date = ? AND region = ?",
      [date, region]
    );

    return NextResponse.json({
      status: "success",
      region,
      date,
      points: await getBets(date, region),
      drawn: Object.fromEntries(counts.map((c) => [c.lo_number, Number(c.count)])),
      hasDraw: appeared.size > 0,
      dates: await getBetDates(region),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const date = validateDate(url.searchParams.get("date"));

    const body = await req.json();
    if (!body || typeof body.points !== "object" || body.points === null) {
      throw new ApiError(400, "Cần { points: { \"27\": 50, ... } }");
    }

    const points: Record<string, number> = {};
    for (const [lo, v] of Object.entries(body.points)) {
      if (!/^\d{2}$/.test(lo)) throw new ApiError(400, `Lô không hợp lệ: ${lo}`);
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `Số điểm không hợp lệ ở lô ${lo}`);
      if (n > 0) points[lo] = n;
    }

    const saved = await saveBets(date, region, points);
    return NextResponse.json({ status: "success", region, date, saved });
  } catch (err) {
    return jsonError(err);
  }
}
