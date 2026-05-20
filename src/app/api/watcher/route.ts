/**
 * GET /api/watcher?region=xsmn&numbers=12,36,89,21
 *
 * For each watched lô returns:
 *   - days_since_last (from lo_status)
 *   - last_appeared_date
 *   - consecutive_days streak
 *   - last_7_days appearance counts (array of {date, count}, oldest → newest)
 *   - total_30d total appearances in last 30 days
 *   - hot_score heuristic
 *
 * Used by Watcher page to track "heat" of user-picked numbers.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DayCount {
  date: string;
  count: number;
}

interface NumberHeat {
  lo_number: string;
  days_since_last: number | null;
  last_appeared_date: string | null;
  consecutive_days: number;
  current_limit: number;
  last_7_days: DayCount[];
  total_30d: number;
  total_appearances_30d: number;
  heat: "hot" | "warm" | "cold" | "frozen";
}

function heatLabel(daysSinceLast: number | null, consecutive: number, total30d: number): NumberHeat["heat"] {
  if (consecutive >= 2) return "hot";       // đang về liên tiếp
  if (daysSinceLast === null) return "frozen"; // chưa thấy bao giờ
  if (daysSinceLast === 0) return "warm";      // về hôm nay
  if (daysSinceLast <= 2 && total30d >= 5) return "warm";
  if (daysSinceLast >= 7) return "frozen";
  if (total30d >= 6) return "warm";
  return "cold";
}

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const rawNumbers = url.searchParams.get("numbers") ?? "";
    const numbers = rawNumbers
      .split(",")
      .map((n) => n.trim().padStart(2, "0"))
      .filter((n) => /^\d{2}$/.test(n));

    if (numbers.length === 0) {
      return NextResponse.json({ status: "success", region, items: [] });
    }

    // Pull statuses for all watched numbers in one query
    const placeholders = numbers.map(() => "?").join(",");
    const statuses = await query<{
      lo_number: string;
      last_appeared_date: string | null;
      days_since_last: number | null;
      consecutive_days: number;
      current_limit: number;
    }>(
      `SELECT lo_number, last_appeared_date, days_since_last, consecutive_days, current_limit
       FROM lo_status
       WHERE region = ? AND lo_number IN (${placeholders})`,
      [region, ...numbers]
    );
    const statusMap = new Map(statuses.map((s) => [s.lo_number, s]));

    // Pull last 30 days of lo_daily for those numbers, ordered ASC
    const cutoff30 = new Date();
    cutoff30.setDate(cutoff30.getDate() - 30);
    const cutoff30Str = cutoff30.toISOString().slice(0, 10);
    const dailyRows = await query<{ date: string; lo_number: string; count: number }>(
      `SELECT date, lo_number, count FROM lo_daily
       WHERE region = ? AND lo_number IN (${placeholders}) AND date >= ?
       ORDER BY date ASC`,
      [region, ...numbers, cutoff30Str]
    );
    // Group by lo_number → { date: count }
    const dailyByLo = new Map<string, Map<string, number>>();
    for (const r of dailyRows) {
      if (!dailyByLo.has(r.lo_number)) dailyByLo.set(r.lo_number, new Map());
      dailyByLo.get(r.lo_number)!.set(r.date, r.count);
    }

    // Build last 7 distinct calendar dates that have data for the region.
    // We want the same date axis across all watched numbers.
    const distinctDates = await query<{ date: string }>(
      `SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT 7`,
      [region]
    );
    const last7 = distinctDates.map((d) => d.date).reverse(); // oldest → newest

    const items: NumberHeat[] = numbers.map((lo) => {
      const st = statusMap.get(lo);
      const loDaily = dailyByLo.get(lo);
      const last7Days: DayCount[] = last7.map((d) => ({
        date: d,
        count: loDaily?.get(d) ?? 0,
      }));
      const total30 = loDaily ? Array.from(loDaily.values()).reduce((s, n) => s + n, 0) : 0;
      const totalApp30 = loDaily ? Array.from(loDaily.values()).filter((n) => n > 0).length : 0;

      return {
        lo_number: lo,
        days_since_last: st?.days_since_last ?? null,
        last_appeared_date: st?.last_appeared_date ?? null,
        consecutive_days: st?.consecutive_days ?? 0,
        current_limit: st?.current_limit ?? 200,
        last_7_days: last7Days,
        total_30d: total30,             // total occurrences (counts multi-hits)
        total_appearances_30d: totalApp30, // distinct days
        heat: heatLabel(st?.days_since_last ?? null, st?.consecutive_days ?? 0, totalApp30),
      };
    });

    return NextResponse.json({
      status: "success",
      region,
      reference_dates: last7,
      items,
    });
  } catch (err) {
    return jsonError(err);
  }
}
