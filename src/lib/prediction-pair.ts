/**
 * PAIR prediction ("Đá" / lô xiên 2).
 *
 * Bet on 2 lo numbers — both must come in the same draw to win.
 * Pair probability is roughly P(A) × P(B), boosted when A & B historically
 * co-occur in the same draw more often than independence would predict.
 *
 * Pipeline:
 *   1. Run VIP prediction → get probabilities + per-model picks for each lo
 *   2. Restrict to top N lo (default 25) → C(25,2) = 300 candidate pairs
 *   3. Score each pair = geo_mean(p_A, p_B) × (1 + cooccur_boost)
 *   4. Return top K pairs
 */
import { type Region } from "./db";
import { predictVip } from "./prediction";

type DateMap = Record<string, Record<string, number>>;

async function loadHistoryLo(region: Region, days: number, endDate?: string): Promise<DateMap> {
  const { query } = await import("./db");
  let rows: { date: string; lo_number: string; count: number }[];
  if (endDate) {
    const [ey, em, ed] = endDate.split("-").map(Number);
    const endMs = Date.UTC(ey, em - 1, ed);
    const startStr = new Date(endMs - days * 86_400_000).toISOString().slice(0, 10);
    rows = await query<{ date: string; lo_number: string; count: number }>(
      `SELECT date, lo_number, count FROM lo_daily
       WHERE region = ? AND date >= ? AND date < ? ORDER BY date ASC`,
      [region, startStr, endDate]
    );
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    rows = await query<{ date: string; lo_number: string; count: number }>(
      `SELECT date, lo_number, count FROM lo_daily
       WHERE region = ? AND date >= ? ORDER BY date ASC`,
      [region, cutoffStr]
    );
  }
  const out: DateMap = {};
  for (const r of rows) {
    if (!out[r.date]) out[r.date] = {};
    out[r.date][r.lo_number] = r.count;
  }
  return out;
}

/** Get distinct lô that appeared on a specific date (for pair-hit checking). */
async function getLoOnDate(region: Region, date: string): Promise<Set<string>> {
  const { query } = await import("./db");
  const rows = await query<{ lo_number: string }>(
    `SELECT DISTINCT lo_number FROM lo_daily WHERE region = ? AND date = ?`,
    [region, date]
  );
  return new Set(rows.map((r) => r.lo_number));
}

function buildPairCooccurrence(history: DateMap): Map<string, number> {
  // Map<"lo_A|lo_B" (sorted), # of days both came in same draw>
  const cooccur = new Map<string, number>();
  for (const date of Object.keys(history)) {
    const losToday = Object.keys(history[date]);
    if (losToday.length < 2) continue;
    losToday.sort();
    for (let i = 0; i < losToday.length; i++) {
      for (let j = i + 1; j < losToday.length; j++) {
        const key = `${losToday[i]}|${losToday[j]}`;
        cooccur.set(key, (cooccur.get(key) ?? 0) + 1);
      }
    }
  }
  return cooccur;
}

export interface PairItem {
  rank: number;
  lo_a: string;
  lo_b: string;
  combined_prob: number;       // geo mean × 100 (%)
  p_a: number;
  p_b: number;
  cooccur_days: number;        // # days both came together
  cooccur_lift: number;        // observed / expected (1.0 = independence)
  pair_score: number;
}

export interface PairResult {
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  top_n_source: number;
  pairs: PairItem[];
}

export async function predictPair(
  region: Region,
  windowDays: number = 60,
  topNSource: number = 35,    // Wider pool — was 25, now 35 → C(35,2)=595 candidates
  topKReturn: number = 30,
  endDate?: string
): Promise<PairResult> {
  // 1) VIP probabilities (pass endDate for backtest mode)
  const vip = await predictVip(region, windowDays, endDate);
  if (vip.warning || vip.final.length === 0) {
    return {
      region,
      window_days: windowDays,
      days_available: vip.days_available,
      warning: vip.warning ?? "Không có VIP prediction",
      top_n_source: topNSource,
      pairs: [],
    };
  }

  // 2) Restrict to top N lo from VIP
  const sourceLos = vip.final.slice(0, topNSource);
  const probMap = new Map<string, number>(
    sourceLos.map((p) => [p.lo_number, p.probability / 100]) // convert % → 0-1
  );

  // 3) Pair co-occurrence from history (data BEFORE endDate when backtesting)
  const history = await loadHistoryLo(region, windowDays, endDate);
  const totalDays = Object.keys(history).length;
  const cooccur = buildPairCooccurrence(history);

  // Recent (last 7 days) co-occurrence — pairs that came together RECENTLY
  // are far more predictive than distant history
  const sortedDates = Object.keys(history).sort();
  const recentDates = sortedDates.slice(-7);
  const recentHistory: DateMap = {};
  for (const d of recentDates) recentHistory[d] = history[d];
  const recentCooccur = buildPairCooccurrence(recentHistory);

  // Per-lo solo appearance days (for expected co-occurrence calc)
  const soloDays = new Map<string, number>();
  const recentSoloDays = new Map<string, number>();
  for (const date of Object.keys(history)) {
    for (const lo of Object.keys(history[date])) {
      soloDays.set(lo, (soloDays.get(lo) ?? 0) + 1);
    }
  }
  for (const date of recentDates) {
    for (const lo of Object.keys(history[date] ?? {})) {
      recentSoloDays.set(lo, (recentSoloDays.get(lo) ?? 0) + 1);
    }
  }
  const recentDayCount = recentDates.length;

  // 4) Generate pairs from top N source
  const candidatePairs: PairItem[] = [];
  for (let i = 0; i < sourceLos.length; i++) {
    for (let j = i + 1; j < sourceLos.length; j++) {
      const a = sourceLos[i].lo_number;
      const b = sourceLos[j].lo_number;
      const [loA, loB] = [a, b].sort();
      const pA = probMap.get(loA) ?? 0;
      const pB = probMap.get(loB) ?? 0;
      const geoMean = Math.sqrt(pA * pB);

      const coocDays = cooccur.get(`${loA}|${loB}`) ?? 0;
      // Expected co-occurrence under independence
      const pADaily = (soloDays.get(loA) ?? 0) / Math.max(1, totalDays);
      const pBDaily = (soloDays.get(loB) ?? 0) / Math.max(1, totalDays);
      const expected = Math.max(0.5, pADaily * pBDaily * totalDays);

      // Bayesian-smoothed lift: blend observed with "1.0" prior
      // Prevents extreme lift on rare pairs (1 cooccur / 0.1 expected → 10×)
      const PRIOR_STRENGTH = 1.0;
      const rawLift = coocDays / expected;
      const smoothedLift =
        (coocDays + PRIOR_STRENGTH * expected) / (expected + PRIOR_STRENGTH * expected);
      const cappedLift = Math.min(2.5, smoothedLift);

      // Recent pair boost — last 7 days carry strong signal
      const recentCoocDays = recentCooccur.get(`${loA}|${loB}`) ?? 0;
      const rA = (recentSoloDays.get(loA) ?? 0) / Math.max(1, recentDayCount);
      const rB = (recentSoloDays.get(loB) ?? 0) / Math.max(1, recentDayCount);
      const recentExpected = Math.max(0.3, rA * rB * recentDayCount);
      const recentLift = recentCoocDays / recentExpected;
      const recentBoost = Math.min(2.0, recentLift); // cap at 2×

      // Heat alignment: bonus if BOTH lô have been active in last 7 days
      const recentDaysA = recentSoloDays.get(loA) ?? 0;
      const recentDaysB = recentSoloDays.get(loB) ?? 0;
      const heatScore = (recentDaysA + recentDaysB) / (2 * Math.max(1, recentDayCount));
      // 0 = both cold, 1 = both hot every day

      // New pair score formula:
      //   base 40% individual prob (geo mean)
      //   + 30% cooccurrence lift (smoothed, capped)
      //   + 20% recent pair lift (last 7d signal)
      //   + 10% heat alignment (both lo active recently)
      const pairScore =
        geoMean *
        (0.40 +
          0.30 * cappedLift +
          0.20 * recentBoost +
          0.10 * heatScore);

      candidatePairs.push({
        rank: 0,
        lo_a: loA,
        lo_b: loB,
        combined_prob: Math.round(geoMean * 100 * 10000) / 10000,
        p_a: Math.round(pA * 100 * 10000) / 10000,
        p_b: Math.round(pB * 100 * 10000) / 10000,
        cooccur_days: coocDays,
        cooccur_lift: Math.round(rawLift * 100) / 100,
        pair_score: Math.round(pairScore * 100 * 10000) / 10000,
      });
    }
  }

  candidatePairs.sort((a, b) => b.pair_score - a.pair_score);
  const topPairs = candidatePairs.slice(0, topKReturn);
  topPairs.forEach((p, i) => { p.rank = i + 1; });

  return {
    region,
    window_days: windowDays,
    days_available: vip.days_available,
    top_n_source: topNSource,
    pairs: topPairs,
  };
}

// ─────────────────────────────────────────────
// BACKTEST: replay pair predictions across last N days
// ─────────────────────────────────────────────

export interface PairBacktestDay {
  date: string;
  predicted_pairs: Array<{ lo_a: string; lo_b: string }>;
  actual_lo_count: number;
  actual_total_pairs: number;
  hits: number;
  hit_pairs: Array<{ lo_a: string; lo_b: string }>;
  hit_rate_pct: number;
  coverage_pct: number;
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
}

export interface PairBacktestResult {
  region: Region;
  days_window: number;
  top_k: number;
  payout_per_hit_vnd: number;
  cost_per_pick_vnd: number;
  // Hit stats
  total_predicted: number;
  total_hits: number;
  total_actual_pairs: number;
  hit_rate_pct: number;
  coverage_pct: number;
  days_with_at_least_one_hit: number;
  // Money
  total_cost_vnd: number;
  total_win_vnd: number;
  total_profit_vnd: number;
  roi_pct: number;
  break_even_hits_per_day: number;
  // Per-day
  days: PairBacktestDay[];
}

const POINT_COST_VND_PAIR = 23_000;

export async function backtestPair(
  region: Region,
  days: number = 14,
  topK: number = 30,
  windowDays: number = 60,
  topNSource: number = 35,
  payoutMultiplier: number = 17  // win = multiplier × cost when pair hits
): Promise<PairBacktestResult> {
  const { query } = await import("./db");
  const dateRows = await query<{ date: string }>(
    `SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT ?`,
    [region, days]
  );
  const dates = dateRows.map((r) => r.date).reverse();

  const winPerHit = POINT_COST_VND_PAIR * payoutMultiplier;
  const dayResults: PairBacktestDay[] = [];

  for (const date of dates) {
    const r = await predictPair(region, windowDays, topNSource, topK, date);
    if (r.warning || r.pairs.length === 0) continue;

    const actualLo = await getLoOnDate(region, date);
    const actualCount = actualLo.size;
    const actualTotalPairs = (actualCount * (actualCount - 1)) / 2;

    const predicted = r.pairs.map((p) => ({ lo_a: p.lo_a, lo_b: p.lo_b }));
    const hitPairs = predicted.filter(
      (p) => actualLo.has(p.lo_a) && actualLo.has(p.lo_b)
    );

    const cost = topK * POINT_COST_VND_PAIR;
    const win = hitPairs.length * winPerHit;
    const profit = win - cost;

    dayResults.push({
      date,
      predicted_pairs: predicted,
      actual_lo_count: actualCount,
      actual_total_pairs: actualTotalPairs,
      hits: hitPairs.length,
      hit_pairs: hitPairs,
      hit_rate_pct: topK > 0 ? Math.round((hitPairs.length / topK) * 10000) / 100 : 0,
      coverage_pct: actualTotalPairs > 0
        ? Math.round((hitPairs.length / actualTotalPairs) * 10000) / 100
        : 0,
      cost_vnd: cost,
      win_vnd: win,
      profit_vnd: profit,
    });
  }

  const totalPredicted = dayResults.length * topK;
  const totalHits = dayResults.reduce((s, d) => s + d.hits, 0);
  const totalActual = dayResults.reduce((s, d) => s + d.actual_total_pairs, 0);
  const daysWithHit = dayResults.filter((d) => d.hits > 0).length;
  const hitRate = totalPredicted > 0 ? (totalHits / totalPredicted) * 100 : 0;
  const coverage = totalActual > 0 ? (totalHits / totalActual) * 100 : 0;

  const totalCost = dayResults.reduce((s, d) => s + d.cost_vnd, 0);
  const totalWin = dayResults.reduce((s, d) => s + d.win_vnd, 0);
  const totalProfit = totalWin - totalCost;
  const roi = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const breakEvenHits = payoutMultiplier > 0 ? topK / payoutMultiplier : 0;

  return {
    region,
    days_window: days,
    top_k: topK,
    payout_per_hit_vnd: winPerHit,
    cost_per_pick_vnd: POINT_COST_VND_PAIR,
    total_predicted: totalPredicted,
    total_hits: totalHits,
    total_actual_pairs: totalActual,
    hit_rate_pct: Math.round(hitRate * 100) / 100,
    coverage_pct: Math.round(coverage * 100) / 100,
    days_with_at_least_one_hit: daysWithHit,
    total_cost_vnd: totalCost,
    total_win_vnd: totalWin,
    total_profit_vnd: totalProfit,
    roi_pct: Math.round(roi * 100) / 100,
    break_even_hits_per_day: Math.round(breakEvenHits * 100) / 100,
    days: dayResults,
  };
}
