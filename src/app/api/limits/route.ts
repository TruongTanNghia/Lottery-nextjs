import { NextResponse } from "next/server";
import { ensureDb, jsonError, REGION_LABELS, validateRegion } from "@/lib/api-utils";
import {
  APPEARANCE_WINDOW_DAYS,
  COST_MULTIPLIER,
  loadSchedule,
  PRICE_PER_POINT,
  POINT_VALUE,
  WIN_MULTIPLIER,
  getLimitSummary,
} from "@/lib/limit-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));

    const [summary, sched] = await Promise.all([getLimitSummary(region), loadSchedule()]);

    return NextResponse.json({
      status: "success",
      region,
      region_label: REGION_LABELS[region],
      data: summary,
      config: {
        point_value: POINT_VALUE,
        win_multiplier: WIN_MULTIPLIER,
        min_limit: sched.min_limit,
        base_schedule: Object.fromEntries(
          Object.entries(sched.base).map(([k, v]) => [String(k), v])
        ),
        consecutive_limits: Object.fromEntries(
          Object.entries(sched.consecutive).map(([k, v]) => [String(k), v])
        ),
        consecutive_reset_after: sched.consecutive_reset_after,
        price_per_point: PRICE_PER_POINT,
        cost_multiplier: COST_MULTIPLIER[region],
        appearance_window_days: APPEARANCE_WINDOW_DAYS,
      },
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(err);
  }
}
