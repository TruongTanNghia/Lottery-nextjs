/**
 * GET /api/history/hits?region=xsmn
 *
 * Every counted draw as "which lô landed, how many times". Small enough to
 * hand to the browser whole (about 180 draws × 30 lô), which lets the strategy
 * lab re-run a backtest on every click without another round trip.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));

    // lo_daily already has the đài rule applied, so this is exactly what the
    // limit board counts as a hit — the lab and the board cannot disagree.
    const rows = await query<{ date: string; lo_number: string; count: number }>(
      "SELECT date, lo_number, count FROM lo_daily WHERE region = ? ORDER BY date",
      [region]
    );

    const byDate = new Map<string, Record<string, number>>();
    for (const r of rows) {
      let d = byDate.get(r.date);
      if (!d) byDate.set(r.date, (d = {}));
      d[r.lo_number] = Number(r.count);
    }

    return NextResponse.json({
      status: "success",
      region,
      draws: [...byDate.entries()].map(([date, hits]) => ({ date, hits })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
