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
  query,
  setConfigValue,
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

// All-UTC arithmetic on purpose. Building the date in local time and reading it
// back with toISOString() shifts the result by a day for any positive UTC offset
// — in UTC+7 this returned the day BEFORE yesterday, so `lastDate === prevDate`
// never matched and every streak collapsed to 1. Correct on Vercel (UTC), wrong
// anywhere else, which silently corrupted lo_status on local recalcs.
function previousDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

// Calendar gap in days between two YYYY-MM-DD strings (end - start, clamped ≥ 0).
function daysBetween(endDate: string, startDate: string): number {
  const [y1, m1, d1] = endDate.split("-").map(Number);
  const [y2, m2, d2] = startDate.split("-").map(Number);
  const ms = Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export async function updateAllLoStatus(targetDate: string, region: Region): Promise<void> {
  const { getDb, getAllLoStatus } = await import("./db");
  const db = getDb();

  const appearedToday = await getLoAppearedOnDate(targetDate, region);
  const schedule = await loadSchedule();
  const resetAfter = schedule.consecutive_reset_after;

  // 1 round-trip to read all 100 lô status at once
  const allStatus = await getAllLoStatus(region);
  const byLo = new Map(allStatus.map((s) => [s.lo_number, s]));

  const updates: { sql: string; args: (string | number | null)[] }[] = [];
  const prevDate = previousDate(targetDate);

  for (let i = 0; i < 100; i++) {
    const lo = String(i).padStart(2, "0");
    const current = byLo.get(lo);

    let daysSince = current?.days_since_last ?? 0;
    let consec = current?.consecutive_days ?? 0;
    let lastDate: string | null = current?.last_appeared_date ?? null;

    // Idempotency guard: if lo_status already reflects a date ≥ targetDate,
    // this is a stale re-process (cron's "last 3 dates" overlap). Skip — otherwise
    // we'd inflate days_since_last by re-running `+= 1` and potentially clobber
    // consec by failing the `lastDate === prevDate` check.
    if (lastDate && lastDate >= targetDate) continue;

    if (appearedToday.has(lo)) {
      if (lastDate === prevDate) consec += 1;
      else consec = 1;
      if (consec > resetAfter) consec = 1;
      daysSince = 0;
      lastDate = targetDate;
    } else {
      // Compute calendar gap (idempotent) instead of `daysSince += 1` (drifts on re-process).
      daysSince = lastDate ? daysBetween(targetDate, lastDate) : daysSince + 1;
      // Missing this draw ENDS the streak. Leaving consec untouched froze the
      // old run forever: a lô that went 4 days then stopped kept reporting
      // "🔥 4 ngày liên tiếp" and kept the consecutive cap on its limit.
      consec = 0;
    }

    const newLimit = calculateEffectiveLimit(daysSince, consec, schedule);

    updates.push({
      sql: `UPDATE lo_status SET last_appeared_date = ?, days_since_last = ?,
            consecutive_days = ?, current_limit = ?, updated_at = CURRENT_TIMESTAMP
            WHERE lo_number = ? AND region = ?`,
      args: [lastDate, daysSince, consec, newLimit, lo, region],
    });
  }

  // Batched as 1 round-trip. Empty array (all 100 skipped) is a no-op — short-circuit.
  if (updates.length > 0) await db.batch(updates, "write");
}

/**
 * Full replay of lo_status from lo_daily.
 *
 * Runs the whole history in memory and touches the DB exactly twice per region
 * (1 read + 1 batched write). The previous version called updateAllLoStatus per
 * date — ~3 round-trips × ~180 dates × 3 regions — which blew past the 60s
 * function limit and left whichever region it died on half-recalculated
 * (observed: xsmb stuck 4 months behind while xsmt was never reached).
 *
 * Per-lô rules are identical to updateAllLoStatus.
 */
export async function recalculateAllFromHistory(region?: Region): Promise<void> {
  const regions: Region[] = region ? [region] : [...VALID_REGIONS];
  const { query, getDb } = await import("./db");

  const schedule = await loadSchedule();
  const resetAfter = schedule.consecutive_reset_after;

  for (const rgn of regions) {
    const rows = await query<{ date: string; lo_number: string }>(
      "SELECT date, lo_number FROM lo_daily WHERE region = ? ORDER BY date ASC",
      [rgn]
    );
    if (rows.length === 0) continue;

    const appearedByDate = new Map<string, Set<string>>();
    for (const r of rows) {
      let set = appearedByDate.get(r.date);
      if (!set) {
        set = new Set<string>();
        appearedByDate.set(r.date, set);
      }
      set.add(r.lo_number);
    }
    const dates = [...appearedByDate.keys()].sort();

    // Fresh state per region — equivalent to the old "reset to NULL" statement.
    const state = new Map<string, { last: string | null; days: number; consec: number }>();
    for (let i = 0; i < 100; i++) {
      state.set(String(i).padStart(2, "0"), { last: null, days: 0, consec: 0 });
    }

    for (const date of dates) {
      const appeared = appearedByDate.get(date)!;
      const prevDate = previousDate(date);

      for (const [lo, st] of state) {
        if (st.last && st.last >= date) continue;   // same idempotency guard

        if (appeared.has(lo)) {
          st.consec = st.last === prevDate ? st.consec + 1 : 1;
          if (st.consec > resetAfter) st.consec = 1;
          st.days = 0;
          st.last = date;
        } else {
          st.days = st.last ? daysBetween(date, st.last) : st.days + 1;
          st.consec = 0;   // streak ends on a miss — same rule as updateAllLoStatus
        }
      }
    }

    const db = getDb();
    await db.batch(
      [...state].map(([lo, st]) => ({
        sql: `UPDATE lo_status SET last_appeared_date = ?, days_since_last = ?,
              consecutive_days = ?, current_limit = ?, updated_at = CURRENT_TIMESTAMP
              WHERE lo_number = ? AND region = ?`,
        args: [
          st.last,
          st.days,
          st.consec,
          calculateEffectiveLimit(st.days, st.consec, schedule),
          lo,
          rgn,
        ],
      })),
      "write"
    );
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

  // Anchor on the latest draw we have, NOT the server clock. A bet is placed
  // for the next draw, so "0 ngày" must mean "came out in the most recent
  // draw" — that is also the anchor updateAllLoStatus used, so the numbers
  // shown here match lo_status instead of drifting a day ahead of it.
  //
  // Anchoring on today() silently shifted every lô by one tier once the day
  // rolled over before results were published: the "0 ngày (mới về)" bucket
  // was always empty, schedule.base[0] never applied, and 21-26 lô per region
  // got the wrong limit.
  const latest = await query<{ date: string }>(
    "SELECT MAX(date) AS date FROM lo_daily WHERE region = ?",
    [region]
  );
  const anchor = latest[0]?.date ?? new Date().toISOString().slice(0, 10);
  const anchorDt = new Date(anchor + "T00:00:00");
  const counts = await getAppearanceCounts(region, anchor, APPEARANCE_WINDOW_DAYS);
  const schedule = await loadSchedule();

  return allStatus.map((status) => {
    const lastDate = status.last_appeared_date;
    let days: number;
    if (lastDate) {
      const diffMs = anchorDt.getTime() - new Date(lastDate + "T00:00:00").getTime();
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
