/**
 * GET /api/results/history-full?region=xsmn&days=45
 *
 * Returns ALL lottery_results for the region over the last N days,
 * grouped by date → province → prize_type → list of numbers.
 *
 * Use this for visual verification (Lịch Sử page).
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Row {
  date: string;
  province: string;
  prize_type: string;
  number: string;
  lo_number: string;
}

const PRIZE_ORDER: Record<string, number> = {
  "G.DB": 0,
  "G.1": 1,
  "G.2": 2,
  "G.3": 3,
  "G.4": 4,
  "G.5": 5,
  "G.6": 6,
  "G.7": 7,
  "G.8": 8,
};

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "45"), 1), 90);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const rows = await query<Row>(
      `SELECT date, province, prize_type, number, lo_number
       FROM lottery_results
       WHERE region = ? AND date >= ?
       ORDER BY date DESC, province, prize_type, id`,
      [region, cutoffStr]
    );

    // Group: date → province → prize_type → numbers[]
    type PrizeMap = Record<string, string[]>;
    type ProvinceMap = Record<string, PrizeMap>;
    const byDate: Record<string, ProvinceMap> = {};

    for (const r of rows) {
      if (!byDate[r.date]) byDate[r.date] = {};
      if (!byDate[r.date][r.province]) byDate[r.date][r.province] = {};
      if (!byDate[r.date][r.province][r.prize_type]) {
        byDate[r.date][r.province][r.prize_type] = [];
      }
      byDate[r.date][r.province][r.prize_type].push(r.number);
    }

    // Convert to ordered array with provinces sorted alphabetically
    const data = Object.entries(byDate)
      .sort((a, b) => b[0].localeCompare(a[0])) // date DESC
      .map(([date, provinces]) => ({
        date,
        provinces: Object.entries(provinces)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, prizes]) => ({
            name,
            prizes: Object.entries(prizes)
              .sort(([a], [b]) => (PRIZE_ORDER[a] ?? 99) - (PRIZE_ORDER[b] ?? 99))
              .map(([prize_type, numbers]) => ({ prize_type, numbers })),
          })),
      }));

    return NextResponse.json({
      status: "success",
      region,
      days,
      total_dates: data.length,
      total_rows: rows.length,
      data,
    });
  } catch (err) {
    return jsonError(err);
  }
}
