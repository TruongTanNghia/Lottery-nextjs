import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import {
  APPEARANCE_WINDOW_DAYS,
  calculateEffectiveLimit,
  loadSchedule,
} from "@/lib/limit-engine";
import { getAppearanceCounts, getLoStatus, query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ lo: string }> }
) {
  try {
    await ensureDb();
    const { lo } = await ctx.params;
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));

    if (!/^\d{2}$/.test(lo)) {
      throw new ApiError(400, "Lô number must be 2 digits (00-99)");
    }

    const status = await getLoStatus(lo, region);
    if (!status) throw new ApiError(404, `Lô ${lo} not found for region ${region}`);

    const history = await query<{ date: string; count: number }>(
      `SELECT date, count FROM lo_daily WHERE lo_number = ? AND region = ?
       ORDER BY date DESC LIMIT 30`,
      [lo, region]
    );

    const today = new Date().toISOString().slice(0, 10);
    const todayDt = new Date(today + "T00:00:00");
    const counts = await getAppearanceCounts(region, today, APPEARANCE_WINDOW_DAYS);
    const sched = await loadSchedule();

    let daysLive: number;
    if (status.last_appeared_date) {
      const diff = todayDt.getTime() - new Date(status.last_appeared_date + "T00:00:00").getTime();
      daysLive = Math.max(0, Math.floor(diff / 86_400_000));
    } else {
      daysLive = APPEARANCE_WINDOW_DAYS;
    }
    const liveLimit = calculateEffectiveLimit(daysLive, status.consecutive_days, sched);

    return NextResponse.json({
      status: "success",
      region,
      data: {
        ...status,
        days_since_last: daysLive,
        current_limit: liveLimit,
        appearance_count: counts[lo] ?? 0,
        appearance_window_days: APPEARANCE_WINDOW_DAYS,
        history,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
