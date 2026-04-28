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
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30"), 1), 90);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const data = await query<{ date: string; lo_number: string; count: number }>(
      `SELECT date, lo_number, count FROM lo_daily
       WHERE date >= ? AND region = ?
       ORDER BY date DESC, lo_number ASC`,
      [cutoffStr, region]
    );

    return NextResponse.json({ status: "success", region, data });
  } catch (err) {
    return jsonError(err);
  }
}
