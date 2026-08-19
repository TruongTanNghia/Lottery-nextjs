/**
 * GET/PUT /api/config/stations?region=xsmn
 *
 * Which đài count toward the lô board. Turning this on or off changes what
 * every past day counted as, so the PUT also replays lo_daily and the whole
 * limit history rather than leaving the board disagreeing with its own rule.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { query, rebuildLoDaily } from "@/lib/db";
import { recalculateAllFromHistory } from "@/lib/limit-engine";
import {
  loadStationConfig,
  saveStationConfig,
  weekdayOf,
  WEEKDAYS,
  type ExcludeMap,
  type Weekday,
} from "@/lib/stations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));

    // The weekly draw schedule is read back out of the results rather than
    // hard-coded: if a province is ever added or moved, the screen follows the
    // data instead of quietly showing a list that stopped being true.
    const rows = await query<{ date: string; province: string }>(
      `SELECT DISTINCT date, province FROM lottery_results
       WHERE region = ? AND date >= date('now', '-60 day')`,
      [region]
    );
    const schedule: Record<string, string[]> = {};
    for (const r of rows) {
      const wd = weekdayOf(r.date);
      (schedule[wd] ??= []).includes(r.province) || schedule[wd].push(r.province);
    }
    for (const wd of Object.keys(schedule)) schedule[wd].sort();

    return NextResponse.json({
      status: "success",
      region,
      data: await loadStationConfig(region),
      schedule,
    });
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

    // Only accept real weekday keys and string province names; anything else
    // would silently exclude nothing and look like it worked.
    const exclude: ExcludeMap = {};
    if (body.exclude && typeof body.exclude === "object") {
      for (const [k, v] of Object.entries(body.exclude)) {
        if (!WEEKDAYS.includes(k as Weekday)) throw new ApiError(400, `Thứ không hợp lệ: ${k}`);
        if (!Array.isArray(v)) throw new ApiError(400, `Danh sách đài của ${k} phải là mảng`);
        exclude[k as Weekday] = v.map(String);
      }
    }

    const cfg = { enabled: body.enabled === true, exclude };
    await saveStationConfig(region, cfg);

    // lo_daily is derived, so it is rebuilt from the raw draws; the limits are
    // then replayed from that. Both are needed — skipping either leaves the
    // board on numbers the new rule never produced.
    const rebuilt = await rebuildLoDaily(region);
    await recalculateAllFromHistory(region);

    return NextResponse.json({ status: "success", region, data: cfg, rebuilt });
  } catch (err) {
    return jsonError(err);
  }
}
