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

// Per-region config keys. The original single "schedule" key meant editing one
// region silently rewrote all three — the regions have different draw counts
// (27 vs 18 numbers a day) so they need different limits.
const scheduleKey = (region: Region) => `schedule:${region}`;
const LEGACY_KEY = "schedule";

const _scheduleCache = new Map<Region, { value: Schedule; ts: number }>();
const SCHEDULE_TTL_MS = 30_000; // re-read DB at most every 30s

export async function loadSchedule(region: Region): Promise<Schedule> {
  const cached = _scheduleCache.get(region);
  if (cached && Date.now() - cached.ts < SCHEDULE_TTL_MS) {
    return cached.value;
  }
  // Fall back to the shared key so a region never loses its settings before
  // it has been saved individually.
  const raw = (await getConfigValue(scheduleKey(region))) ?? (await getConfigValue(LEGACY_KEY));
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
  _scheduleCache.set(region, { value, ts: Date.now() });
  return value;
}

export async function saveSchedule(region: Region, cfg: Schedule): Promise<void> {
  const payload = {
    base: Object.fromEntries(Object.entries(cfg.base).map(([k, v]) => [String(k), Number(v)])),
    min_limit: Number(cfg.min_limit),
    consecutive: Object.fromEntries(
      Object.entries(cfg.consecutive).map(([k, v]) => [String(k), Number(v)])
    ),
    consecutive_reset_after: Number(cfg.consecutive_reset_after),
  };
  await setConfigValue(scheduleKey(region), JSON.stringify(payload));
  _scheduleCache.delete(region);
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
  const schedule = await loadSchedule(region);
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

  for (const rgn of regions) {
    // Each region carries its own schedule now — must be read inside the loop.
    const schedule = await loadSchedule(rgn);
    const resetAfter = schedule.consecutive_reset_after;

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

// ─────────────────────────────────────────────
// Rhythm ("nhịp") — which lô are worth watching
// ─────────────────────────────────────────────
//
// The operator only wants to watch numbers that come back on a steady beat,
// and only once that beat is due. A lô that drops in at random gaps carries no
// signal for them, so it stays off the watchlist.
//
// Steady = the gaps between appearances cluster tightly, measured by the
// coefficient of variation (sd / mean). Tuned on 180 days of real data: ≥3 gaps
// with CV ≤ 0.5 leaves ~5-13 lô per region, which is a watchlist a person can
// actually act on. Looser settings return half the board.
export const RHYTHM_WINDOW_DRAWS = 30;
export const RHYTHM_MIN_GAPS = 3;
export const RHYTHM_MAX_CV = 0.5;
/** A watched lô takes half the money a normal one would. */
export const TRACKED_LIMIT_FACTOR = 0.5;

export interface Rhythm {
  appearances: number;
  mean_gap: number;
  cv: number;
  draws_since_last: number;
  regular: boolean;
  due: boolean;
}

// ── Top-N watchlist ──────────────────────────────────────────
// The operator also wants the hottest (or coldest) lô of the last few draws
// on half money. That selection drives real limits, so it lives on the server
// — keeping it in the browser would make the board, the 100-lô grid and the
// copied bet string disagree with each other.
export const TOP_WINDOW_DRAWS = 7;

export interface TopConfig {
  size: number;
  dir: "cold" | "hot";
  enabled: boolean;
}

const DEFAULT_TOP: TopConfig = { size: 10, dir: "hot", enabled: true };
const topKey = (region: Region) => `top:${region}`;

export async function loadTopConfig(region: Region): Promise<TopConfig> {
  const raw = await getConfigValue(topKey(region));
  if (!raw) return DEFAULT_TOP;
  try {
    const p = JSON.parse(raw);
    return {
      size: Math.min(Math.max(Number(p.size) || DEFAULT_TOP.size, 0), 100),
      dir: p.dir === "cold" ? "cold" : "hot",
      enabled: p.enabled !== false,
    };
  } catch {
    return DEFAULT_TOP;
  }
}

export async function saveTopConfig(region: Region, cfg: TopConfig): Promise<void> {
  await setConfigValue(
    topKey(region),
    JSON.stringify({
      size: Math.min(Math.max(Number(cfg.size) || 0, 0), 100),
      dir: cfg.dir === "cold" ? "cold" : "hot",
      enabled: cfg.enabled !== false,
    })
  );
}

const EMPTY_RHYTHM: Rhythm = {
  appearances: 0,
  mean_gap: 0,
  cv: 0,
  draws_since_last: RHYTHM_WINDOW_DRAWS,
  regular: false,
  due: false,
};

/**
 * Gaps are counted in DRAWS, not calendar days — a skipped draw would otherwise
 * inflate every gap and make a steady lô look erratic.
 */
async function computeRhythms(
  region: Region
): Promise<{ rhythms: Map<string, Rhythm>; recentHits: Map<string, number> }> {
  const rows = await query<{ date: string; lo_number: string }>(
    `SELECT date, lo_number FROM lo_daily
     WHERE region = ? AND date > date((SELECT MAX(date) FROM lo_daily WHERE region = ?), ?)
     ORDER BY date ASC`,
    [region, region, `-${RHYTHM_WINDOW_DRAWS + 5} day`]
  );

  const byDate = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, new Set());
    byDate.get(r.date)!.add(r.lo_number);
  }
  const all = [...byDate.keys()].sort();
  const draws = all.slice(-RHYTHM_WINDOW_DRAWS);

  // Same pass gives the short-window hit counts the Top-N board ranks on.
  const recentHits = new Map<string, number>();
  for (let i = 0; i < 100; i++) recentHits.set(String(i).padStart(2, "0"), 0);
  for (const d of all.slice(-TOP_WINDOW_DRAWS)) {
    for (const lo of byDate.get(d)!) recentHits.set(lo, (recentHits.get(lo) ?? 0) + 1);
  }

  const out = new Map<string, Rhythm>();
  for (let i = 0; i < 100; i++) {
    const lo = String(i).padStart(2, "0");
    const at: number[] = [];
    draws.forEach((d, k) => {
      if (byDate.get(d)!.has(lo)) at.push(k);
    });

    if (at.length === 0) {
      out.set(lo, { ...EMPTY_RHYTHM, draws_since_last: draws.length });
      continue;
    }

    const sinceLast = draws.length - 1 - at[at.length - 1];
    const gaps: number[] = [];
    for (let k = 1; k < at.length; k++) gaps.push(at[k] - at[k - 1]);

    if (gaps.length < RHYTHM_MIN_GAPS) {
      out.set(lo, { ...EMPTY_RHYTHM, appearances: at.length, draws_since_last: sinceLast });
      continue;
    }

    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
    const cv = mean > 0 ? sd / mean : Infinity;
    const regular = cv <= RHYTHM_MAX_CV;

    out.set(lo, {
      appearances: at.length,
      mean_gap: Math.round(mean * 10) / 10,
      cv: Math.round(cv * 100) / 100,
      draws_since_last: sinceLast,
      regular,
      // Due once it has been quiet at least as long as its own usual gap.
      due: regular && sinceLast >= Math.floor(mean),
    });
  }
  return { rhythms: out, recentHits };
}

export interface LimitSummaryItem extends LoStatus {
  appearance_count: number;
  category: "hot_streak" | "consecutive" | "just_hit" | "recent" | "cooling" | "cold";
  base_limit: number;
  consecutive_penalty: number | null;
  bet_cost_vnd: number;
  win_per_hit_vnd: number;
  rhythm: Rhythm;
  /** On a watchlist (steady beat and due, or inside Top-N) → limit halved. */
  tracked: boolean;
  in_top: boolean;
  /** Hits over the short Top-N window. */
  recent_hits: number;
  /** What the limit would be without the watchlist discount. */
  limit_before_tracking: number;
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
  const schedule = await loadSchedule(region);
  const { rhythms, recentHits } = await computeRhythms(region);
  const topCfg = await loadTopConfig(region);

  // Rank exactly like the Top board does, so the two never disagree. Ties are
  // broken by how long the lô has been quiet, then by number.
  const topSet = new Set<string>();
  if (topCfg.enabled && topCfg.size > 0) {
    const ranked = allStatus
      .map((s) => ({
        lo: s.lo_number,
        hits: recentHits.get(s.lo_number) ?? 0,
        quiet: rhythms.get(s.lo_number)?.draws_since_last ?? 0,
      }))
      .sort((a, b) => {
        const primary = topCfg.dir === "cold" ? a.hits - b.hits : b.hits - a.hits;
        if (primary !== 0) return primary;
        const secondary = topCfg.dir === "cold" ? b.quiet - a.quiet : a.quiet - b.quiet;
        return secondary || a.lo.localeCompare(b.lo);
      })
      .slice(0, topCfg.size);
    for (const r of ranked) topSet.add(r.lo);
  }

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
    const scheduled = calculateEffectiveLimit(days, consec, schedule);

    // Watchlist discount is applied last, on top of the schedule and the
    // consecutive cap, so it always reads as exactly half of the cell above it.
    // A lô on BOTH lists is still halved once — never quartered.
    const rhythm = rhythms.get(status.lo_number) ?? EMPTY_RHYTHM;
    const inTop = topSet.has(status.lo_number);
    const tracked = rhythm.due || inTop;
    const liveLimit = tracked ? Math.round(scheduled * TRACKED_LIMIT_FACTOR) : scheduled;

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
      rhythm,
      tracked,
      in_top: inTop,
      recent_hits: recentHits.get(status.lo_number) ?? 0,
      limit_before_tracking: scheduled,
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
