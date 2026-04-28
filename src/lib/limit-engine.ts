/**
 * Limit Engine — port of backend/limit_engine.py
 *
 * Schedule (per official spec):
 *   - Base: 200 - 20 × days_since_last (floor MIN_LIMIT)
 *   - Day 0=200, 1=180, 2=160, ..., 9=20, 10+=10
 *   - Consec cap: 2→150, 3→100, 4→50, >4 → reset
 *   - Schedule editable from UI, persisted in lottery_config
 */
import {
  getAllLoStatus,
  getAppearanceCounts,
  getConfigValue,
  getLoAppearedOnDate,
  getLoStatus,
  setConfigValue,
  updateLoStatus,
  type LoStatus,
  type Region,
  VALID_REGIONS,
} from "./db";

export const APPEARANCE_WINDOW_DAYS = 30;

export const POINT_VALUE = 23000;
export const WIN_MULTIPLIER = 80;
export const PRICE_PER_POINT = 75;
export const COST_MULTIPLIER: Record<Region, number> = {
  xsmn: 18,
  xsmt: 18,
  xsmb: 27,
};

export interface Schedule {
  base: Record<number, number>;
  min_limit: number;
  consecutive: Record<number, number>;
  consecutive_reset_after: number;
}

const DEFAULT_SCHEDULE: Schedule = {
  base: { 0: 200, 1: 180, 2: 160, 3: 140, 4: 120, 5: 100, 6: 80, 7: 60, 8: 40, 9: 20 },
  min_limit: 10,
  consecutive: { 2: 150, 3: 100, 4: 50 },
  consecutive_reset_after: 4,
};

let _scheduleCache: { value: Schedule; ts: number } | null = null;
const SCHEDULE_TTL_MS = 30_000; // re-read DB at most every 30s

export async function loadSchedule(): Promise<Schedule> {
  if (_scheduleCache && Date.now() - _scheduleCache.ts < SCHEDULE_TTL_MS) {
    return _scheduleCache.value;
  }
  const raw = await getConfigValue("schedule");
  let value: Schedule = DEFAULT_SCHEDULE;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      value = {
        base: Object.fromEntries(
          Object.entries(parsed.base ?? {}).map(([k, v]) => [Number(k), Number(v)])
        ),
        min_limit: Number(parsed.min_limit ?? DEFAULT_SCHEDULE.min_limit),
        consecutive: Object.fromEntries(
          Object.entries(parsed.consecutive ?? {}).map(([k, v]) => [Number(k), Number(v)])
        ),
        consecutive_reset_after: Number(
          parsed.consecutive_reset_after ?? DEFAULT_SCHEDULE.consecutive_reset_after
        ),
      };
    } catch {
      value = DEFAULT_SCHEDULE;
    }
  }
  _scheduleCache = { value, ts: Date.now() };
  return value;
}

export async function saveSchedule(cfg: Schedule): Promise<void> {
  const payload = {
    base: Object.fromEntries(Object.entries(cfg.base).map(([k, v]) => [String(k), Number(v)])),
    min_limit: Number(cfg.min_limit),
    consecutive: Object.fromEntries(
      Object.entries(cfg.consecutive).map(([k, v]) => [String(k), Number(v)])
    ),
    consecutive_reset_after: Number(cfg.consecutive_reset_after),
  };
  await setConfigValue("schedule", JSON.stringify(payload));
  _scheduleCache = null; // invalidate
}

// ─────────────────────────────────────────────
// Limit calculation
// ─────────────────────────────────────────────

export function calculateBaseLimit(daysSinceLast: number, schedule: Schedule): number {
  return schedule.base[daysSinceLast] ?? schedule.min_limit;
}

export function calculateConsecutiveLimit(consecutiveDays: number, schedule: Schedule): number | null {
  if (consecutiveDays > schedule.consecutive_reset_after) return null;
  return schedule.consecutive[consecutiveDays] ?? null;
}

export function calculateEffectiveLimit(
  daysSinceLast: number,
  consecutiveDays: number,
  schedule: Schedule
): number {
  const base = calculateBaseLimit(daysSinceLast, schedule);
  const cap = calculateConsecutiveLimit(consecutiveDays, schedule);
  if (cap !== null) return Math.min(base, cap);
  return base;
}

// ─────────────────────────────────────────────
// Pricing helpers (Thu / Bù)
// ─────────────────────────────────────────────

export function getBetCost(points: number, region: Region): number {
  return points * COST_MULTIPLIER[region] * PRICE_PER_POINT;
}

export function getWinAmount(points: number, occurrences: number = 1): number {
  return points * PRICE_PER_POINT * occurrences;
}

// ─────────────────────────────────────────────
// Daily updater (called by scrape + recalc)
// ─────────────────────────────────────────────

function previousDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function updateAllLoStatus(targetDate: string, region: Region): Promise<void> {
  const appearedToday = await getLoAppearedOnDate(targetDate, region);
  const schedule = await loadSchedule();
  const resetAfter = schedule.consecutive_reset_after;

  for (let i = 0; i < 100; i++) {
    const lo = String(i).padStart(2, "0");
    const current = await getLoStatus(lo, region);

    let daysSince = current?.days_since_last ?? 0;
    let consec = current?.consecutive_days ?? 0;
    let lastDate: string | null = current?.last_appeared_date ?? null;

    if (appearedToday.has(lo)) {
      if (lastDate === previousDate(targetDate)) consec += 1;
      else consec = 1;
      if (consec > resetAfter) consec = 1;
      daysSince = 0;
      lastDate = targetDate;
    } else {
      daysSince += 1;
    }

    const newLimit = calculateEffectiveLimit(daysSince, consec, schedule);
    await updateLoStatus({
      loNumber: lo,
      region,
      lastAppearedDate: lastDate,
      daysSinceLast: daysSince,
      consecutiveDays: consec,
      currentLimit: newLimit,
    });
  }
}

export async function recalculateAllFromHistory(region?: Region): Promise<void> {
  const regions: Region[] = region ? [region] : [...VALID_REGIONS];

  for (const rgn of regions) {
    const { query } = await import("./db");
    const dates = await query<{ date: string }>(
      "SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date ASC",
      [rgn]
    );
    if (dates.length === 0) continue;

    // Reset all lô statuses
    const { exec } = await import("./db");
    await exec(
      `UPDATE lo_status SET last_appeared_date = NULL, days_since_last = 0,
       consecutive_days = 0, current_limit = 200 WHERE region = ?`,
      [rgn]
    );

    for (const { date } of dates) {
      await updateAllLoStatus(date, rgn);
    }
  }
}

// ─────────────────────────────────────────────
// Live summary (compute days_since_last on the fly so it's always current)
// ─────────────────────────────────────────────

export interface LimitSummaryItem extends LoStatus {
  appearance_count: number;
  category: "hot_streak" | "consecutive" | "just_hit" | "recent" | "cooling" | "cold";
  base_limit: number;
  consecutive_penalty: number | null;
  bet_cost_vnd: number;
  win_per_hit_vnd: number;
}

function categorize(consec: number, days: number): LimitSummaryItem["category"] {
  if (consec >= 4) return "hot_streak";
  if (consec >= 2) return "consecutive";
  if (days === 0) return "just_hit";
  if (days <= 3) return "recent";
  if (days <= 7) return "cooling";
  return "cold";
}

export async function getLimitSummary(region: Region): Promise<LimitSummaryItem[]> {
  const allStatus = await getAllLoStatus(region);
  const today = new Date().toISOString().slice(0, 10);
  const todayDt = new Date(today + "T00:00:00");
  const counts = await getAppearanceCounts(region, today, APPEARANCE_WINDOW_DAYS);
  const schedule = await loadSchedule();

  return allStatus.map((status) => {
    const lastDate = status.last_appeared_date;
    let days: number;
    if (lastDate) {
      const diffMs = todayDt.getTime() - new Date(lastDate + "T00:00:00").getTime();
      days = Math.max(0, Math.floor(diffMs / 86_400_000));
    } else {
      days = APPEARANCE_WINDOW_DAYS;
    }

    const consec = status.consecutive_days;
    const liveLimit = calculateEffectiveLimit(days, consec, schedule);

    return {
      ...status,
      days_since_last: days,
      current_limit: liveLimit,
      appearance_count: counts[status.lo_number] ?? 0,
      category: categorize(consec, days),
      base_limit: calculateBaseLimit(days, schedule),
      consecutive_penalty: calculateConsecutiveLimit(consec, schedule),
      bet_cost_vnd: getBetCost(liveLimit, region),
      win_per_hit_vnd: getWinAmount(liveLimit, 1),
    };
  });
}

export async function getConsecutiveLos(region: Region) {
  const all = await getAllLoStatus(region);
  return all
    .filter((s) => s.consecutive_days >= 2)
    .map((s) => ({
      lo_number: s.lo_number,
      consecutive_days: s.consecutive_days,
      current_limit: s.current_limit,
      last_appeared_date: s.last_appeared_date,
    }))
    .sort((a, b) => b.consecutive_days - a.consecutive_days);
}
