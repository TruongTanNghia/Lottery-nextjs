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

async function loadHistoryLo(region: Region, days: number): Promise<DateMap> {
  const { query } = await import("./db");
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const rows = await query<{ date: string; lo_number: string; count: number }>(
    `SELECT date, lo_number, count FROM lo_daily
     WHERE region = ? AND date >= ? ORDER BY date ASC`,
    [region, cutoffStr]
  );
  const out: DateMap = {};
  for (const r of rows) {
    if (!out[r.date]) out[r.date] = {};
    out[r.date][r.lo_number] = r.count;
  }
  return out;
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
  topNSource: number = 25,
  topKReturn: number = 30
): Promise<PairResult> {
  // 1) VIP probabilities
  const vip = await predictVip(region, windowDays);
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

  // 3) Pair co-occurrence from history
  const history = await loadHistoryLo(region, windowDays);
  const totalDays = Object.keys(history).length;
  const cooccur = buildPairCooccurrence(history);

  // Per-lo solo appearance days (for expected co-occurrence calc)
  const soloDays = new Map<string, number>();
  for (const date of Object.keys(history)) {
    for (const lo of Object.keys(history[date])) {
      soloDays.set(lo, (soloDays.get(lo) ?? 0) + 1);
    }
  }

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
      // Expected co-occurrence under independence:
      //   p(A on day) × p(B on day) × totalDays
      const pADaily = (soloDays.get(loA) ?? 0) / Math.max(1, totalDays);
      const pBDaily = (soloDays.get(loB) ?? 0) / Math.max(1, totalDays);
      const expected = Math.max(0.5, pADaily * pBDaily * totalDays);
      const lift = coocDays / expected;

      // Pair score: combined probability boosted by cooccurrence lift
      // Cap lift at 3× to avoid noise on rare pairs
      const cappedLift = Math.min(3, lift);
      const pairScore = geoMean * (0.7 + 0.3 * cappedLift);

      candidatePairs.push({
        rank: 0,
        lo_a: loA,
        lo_b: loB,
        combined_prob: Math.round(geoMean * 100 * 10000) / 10000,
        p_a: Math.round(pA * 100 * 10000) / 10000,
        p_b: Math.round(pB * 100 * 10000) / 10000,
        cooccur_days: coocDays,
        cooccur_lift: Math.round(lift * 100) / 100,
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
