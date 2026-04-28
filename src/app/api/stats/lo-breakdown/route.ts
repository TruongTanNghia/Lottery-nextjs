/**
 * GET /api/stats/lo-breakdown?region=xsmn&days=30
 * Returns per-lô profit breakdown over the last N days.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { query } from "@/lib/db";
import { COST_MULTIPLIER, PRICE_PER_POINT } from "@/lib/limit-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30"), 1), 90);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const costMult = COST_MULTIPLIER[region];

    const limits = await query<{ lo_number: string; current_limit: number }>(
      "SELECT lo_number, current_limit FROM lo_status WHERE region = ? ORDER BY lo_number",
      [region]
    );

    const appearances = await query<{ lo_number: string; appear_days: number; total_count: number }>(
      `SELECT lo_number, COUNT(*) as appear_days, SUM(count) as total_count
       FROM lo_daily
       WHERE region = ? AND date >= ?
       GROUP BY lo_number`,
      [region, cutoffStr]
    );
    const appMap = new Map(appearances.map((a) => [a.lo_number, a]));

    const totalDaysRows = await query<{ n: number }>(
      "SELECT COUNT(DISTINCT date) as n FROM lo_daily WHERE region = ? AND date >= ?",
      [region, cutoffStr]
    );
    const totalDays = totalDaysRows[0]?.n ?? 0;

    const data = limits.map((l) => {
      const a = appMap.get(l.lo_number);
      const appearDays = a?.appear_days ?? 0;
      const totalCount = a?.total_count ?? 0;
      const cost = l.current_limit * costMult * PRICE_PER_POINT * totalDays;
      const win = l.current_limit * PRICE_PER_POINT * totalCount;
      return {
        lo_number: l.lo_number,
        limit_points: l.current_limit,
        appear_days: appearDays,
        total_appearances: totalCount,
        total_bet: cost,
        total_win: win,
        net_profit: win - cost,
      };
    });

    data.sort((a, b) => b.net_profit - a.net_profit);
    return NextResponse.json({ status: "success", region, data });
  } catch (err) {
    return jsonError(err);
  }
}
