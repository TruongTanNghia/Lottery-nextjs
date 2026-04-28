import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);

    let results = await query(
      `SELECT * FROM lottery_results WHERE date = ? AND region = ? ORDER BY province, prize_type`,
      [today, region]
    );

    if (results.length === 0) {
      const r2 = await query(
        `SELECT * FROM lottery_results WHERE date = ? AND region = ? ORDER BY province, prize_type`,
        [yStr, region]
      );
      if (r2.length > 0) {
        return NextResponse.json({
          status: "success",
          date: yStr,
          region,
          data: r2,
          note: "Showing yesterday's results",
        });
      }
      return NextResponse.json({
        status: "success",
        date: today,
        region,
        data: [],
        note: "No results yet",
      });
    }

    return NextResponse.json({ status: "success", date: today, region, data: results });
  } catch (err) {
    return jsonError(err);
  }
}
