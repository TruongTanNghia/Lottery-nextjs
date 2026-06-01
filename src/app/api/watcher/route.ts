/**
 * GET /api/watcher?region=xsmn&numbers=12,36,89,21[&date=YYYY-MM-DD]
 *
 * For each watched lô returns:
 *   - days_since_last (number of calendar days from view-date back to last appearance)
 *   - last_appeared_date
 *   - consecutive_days streak (in scrape-date calendar)
 *   - last_7_days appearance counts (ending at view-date, oldest → newest)
 *   - total_30d total appearances in the 30-day window ending at view-date
 *   - heat heuristic label
 *
 * Without `date`: uses lo_status (pre-computed; the "today" view).
 * With `date`: replays from lo_daily anchored at the given date — "time travel" mode.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { query, type Region } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DayCount {
  date: string;
  count: number;
}

type HeatLabel = "hot" | "warm" | "cold" | "frozen";

interface NumberHeat {
  lo_number: string;
  days_since_last: number | null;
  last_appeared_date: string | null;
  consecutive_days: number;
  current_limit: number;
  last_7_days: DayCount[];
  total_30d: number;
  total_appearances_30d: number;
  heat: HeatLabel;
}

function heatLabel(daysSinceLast: number | null, consecutive: number, total30d: number): HeatLabel {
  if (consecutive >= 2) return "hot";
  if (daysSinceLast === null) return "frozen";
  if (daysSinceLast === 0) return "warm";
  if (daysSinceLast <= 2 && total30d >= 5) return "warm";
  if (daysSinceLast >= 7) return "frozen";
  if (total30d >= 6) return "warm";
  return "cold";
}

function daysBetween(endDate: string, lastDate: string): number {
  const [y1, m1, d1] = endDate.split("-").map(Number);
  const [y2, m2, d2] = lastDate.split("-").map(Number);
  const ms = Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function subtractDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
}

/** "Today" mode — current pre-computed state from lo_status. */
async function currentMode(region: Region, numbers: string[]): Promise<NextResponse> {
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

  const cutoff30 = subtractDays(new Date().toISOString().slice(0, 10), 30);
  const dailyRows = await query<{ date: string; lo_number: string; count: number }>(
    `SELECT date, lo_number, count FROM lo_daily
     WHERE region = ? AND lo_number IN (${placeholders}) AND date >= ?
     ORDER BY date ASC`,
    [region, ...numbers, cutoff30]
  );
  const dailyByLo = new Map<string, Map<string, number>>();
  for (const r of dailyRows) {
    if (!dailyByLo.has(r.lo_number)) dailyByLo.set(r.lo_number, new Map());
    dailyByLo.get(r.lo_number)!.set(r.date, r.count);
  }

  const distinctDates = await query<{ date: string }>(
    `SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT 7`,
    [region]
  );
  const last7 = distinctDates.map((d) => d.date).reverse();

  const items: NumberHeat[] = numbers.map((lo) => {
    const st = statusMap.get(lo);
    const loDaily = dailyByLo.get(lo);
    const last7Days: DayCount[] = last7.map((d) => ({ date: d, count: loDaily?.get(d) ?? 0 }));
    const total30 = loDaily ? Array.from(loDaily.values()).reduce((s, n) => s + n, 0) : 0;
    const totalApp30 = loDaily ? Array.from(loDaily.values()).filter((n) => n > 0).length : 0;
    return {
      lo_number: lo,
      days_since_last: st?.days_since_last ?? null,
      last_appeared_date: st?.last_appeared_date ?? null,
      consecutive_days: st?.consecutive_days ?? 0,
      current_limit: st?.current_limit ?? 200,
      last_7_days: last7Days,
      total_30d: total30,
      total_appearances_30d: totalApp30,
      heat: heatLabel(st?.days_since_last ?? null, st?.consecutive_days ?? 0, totalApp30),
    };
  });

  return NextResponse.json({
    status: "success",
    region,
    view_date: null,
    reference_dates: last7,
    items,
  });
}

/** "Time-travel" mode — anchored at viewDate, replayed from lo_daily. */
async function historicalMode(region: Region, numbers: string[], viewDate: string): Promise<NextResponse> {
  const placeholders = numbers.map(() => "?").join(",");

  // Distinct scrape dates ending at viewDate (newest first). Cap at 60 for streak/last-seen lookback.
  const allDates = await query<{ date: string }>(
    `SELECT DISTINCT date FROM lo_daily
     WHERE region = ? AND date <= ?
     ORDER BY date DESC LIMIT 60`,
    [region, viewDate]
  );
  const datesDesc = allDates.map((d) => d.date);
  if (datesDesc.length === 0) {
    return NextResponse.json({ status: "success", region, view_date: viewDate, reference_dates: [], items: [] });
  }

  // 30-day cutoff for total_30d math, anchored at viewDate.
  const cutoff30 = subtractDays(viewDate, 30);
  const dailyRows = await query<{ date: string; lo_number: string; count: number }>(
    `SELECT date, lo_number, count FROM lo_daily
     WHERE region = ? AND lo_number IN (${placeholders}) AND date >= ? AND date <= ?
     ORDER BY date ASC`,
    [region, ...numbers, cutoff30, viewDate]
  );
  const dailyByLo = new Map<string, Map<string, number>>();
  for (const r of dailyRows) {
    if (!dailyByLo.has(r.lo_number)) dailyByLo.set(r.lo_number, new Map());
    dailyByLo.get(r.lo_number)!.set(r.date, r.count);
  }

  // For last-appeared lookup (may be older than 30 days, up to 60), fetch wider:
  const cutoff60 = subtractDays(viewDate, 60);
  const apsRows = await query<{ lo_number: string; date: string }>(
    `SELECT lo_number, date FROM lo_daily
     WHERE region = ? AND lo_number IN (${placeholders}) AND date >= ? AND date <= ?
     ORDER BY date DESC`,
    [region, ...numbers, cutoff60, viewDate]
  );
  const apsByLo = new Map<string, Set<string>>();
  for (const r of apsRows) {
    if (!apsByLo.has(r.lo_number)) apsByLo.set(r.lo_number, new Set());
    apsByLo.get(r.lo_number)!.add(r.date);
  }

  // current_limit: still read from lo_status (snapshot — limit doesn't have history).
  const lims = await query<{ lo_number: string; current_limit: number }>(
    `SELECT lo_number, current_limit FROM lo_status WHERE region = ? AND lo_number IN (${placeholders})`,
    [region, ...numbers]
  );
  const limMap = new Map(lims.map((l) => [l.lo_number, l.current_limit]));

  // last_7_days strip: 7 most recent scrape dates ending at viewDate.
  const last7 = datesDesc.slice(0, 7).reverse();

  const items: NumberHeat[] = numbers.map((lo) => {
    const apSet = apsByLo.get(lo) ?? new Set<string>();

    // Find last_appeared_date: walk datesDesc, first date in apSet.
    let lastDate: string | null = null;
    for (const d of datesDesc) {
      if (apSet.has(d)) { lastDate = d; break; }
    }
    const daysSinceLast = lastDate === null ? null : daysBetween(viewDate, lastDate);

    // Consecutive streak: starting from lastDate's position in datesDesc, count how many consecutive
    // scrape dates lo appeared in (going further back).
    let consec = 0;
    if (lastDate !== null) {
      const idx = datesDesc.indexOf(lastDate);
      for (let i = idx; i < datesDesc.length; i++) {
        if (apSet.has(datesDesc[i])) consec++;
        else break;
      }
    }

    const loDaily = dailyByLo.get(lo);
    const last7Days: DayCount[] = last7.map((d) => ({ date: d, count: loDaily?.get(d) ?? 0 }));
    const total30 = loDaily ? Array.from(loDaily.values()).reduce((s, n) => s + n, 0) : 0;
    const totalApp30 = loDaily ? Array.from(loDaily.values()).filter((n) => n > 0).length : 0;

    return {
      lo_number: lo,
      days_since_last: daysSinceLast,
      last_appeared_date: lastDate,
      consecutive_days: consec,
      current_limit: limMap.get(lo) ?? 200,
      last_7_days: last7Days,
      total_30d: total30,
      total_appearances_30d: totalApp30,
      heat: heatLabel(daysSinceLast, consec, totalApp30),
    };
  });

  return NextResponse.json({
    status: "success",
    region,
    view_date: viewDate,
    reference_dates: last7,
    items,
  });
}

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const rawNumbers = url.searchParams.get("numbers") ?? "";
    const dateParam = url.searchParams.get("date");

    const numbers = rawNumbers
      .split(",")
      .map((n) => n.trim().padStart(2, "0"))
      .filter((n) => /^\d{2}$/.test(n));

    if (numbers.length === 0) {
      return NextResponse.json({ status: "success", region, view_date: dateParam, items: [], reference_dates: [] });
    }

    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return NextResponse.json({ status: "error", detail: "Invalid date (use YYYY-MM-DD)" }, { status: 400 });
      }
      return historicalMode(region, numbers, dateParam);
    }
    return currentMode(region, numbers);
  } catch (err) {
    return jsonError(err);
  }
}
