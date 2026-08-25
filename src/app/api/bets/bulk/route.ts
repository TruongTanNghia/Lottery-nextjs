/**
 * GET/PUT /api/bets/bulk?region=xsmn
 *
 * Many draws' books at once. The lab is only worth anything once it runs on
 * the money that actually came in, and nobody is going to key in a month of
 * books one day at a time.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { query, saveBets } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));

    const rows = await query<{ date: string; lo_number: string; points: number }>(
      "SELECT date, lo_number, points FROM bets WHERE region = ? ORDER BY date",
      [region]
    );

    const byDate = new Map<string, Record<string, number>>();
    for (const r of rows) {
      let d = byDate.get(r.date);
      if (!d) byDate.set(r.date, (d = {}));
      d[r.lo_number] = Number(r.points);
    }

    return NextResponse.json({
      status: "success",
      region,
      books: [...byDate.entries()].map(([date, points]) => ({ date, points })),
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
    if (!Array.isArray(body?.days)) throw new ApiError(400, "Cần { days: [{ date, points }] }");
    if (body.days.length > 400) throw new ApiError(400, "Tối đa 400 ngày một lượt");

    let saved = 0;
    const dates: string[] = [];
    for (const day of body.days) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day?.date)) throw new ApiError(400, `Ngày sai: ${day?.date}`);

      const points: Record<string, number> = {};
      for (const [lo, v] of Object.entries(day.points ?? {})) {
        if (!/^\d{2}$/.test(lo)) throw new ApiError(400, `Lô sai ở ${day.date}: ${lo}`);
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `Điểm sai ở ${day.date} lô ${lo}`);
        if (n > 0) points[lo] = n;
      }

      // Replaces that draw's book outright — re-pasting a day is a correction,
      // not another customer, and merging would silently double it.
      saved += await saveBets(day.date, region, points);
      dates.push(day.date);
    }

    return NextResponse.json({ status: "success", region, days: dates.length, rows: saved, dates });
  } catch (err) {
    return jsonError(err);
  }
}
