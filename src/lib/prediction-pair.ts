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
  recent_boost: number;        // recent-pair lift (capped)
  heat_score: number;          // both-lo activity in recent window (0-1)
  pair_score: number;
}

export interface PairComponentBreakdown {
  key: string;                 // "combined" | "cooccur" | "recent" | "heat"
  label: string;
  question: string;
  weight: number;              // weight in final score formula
  top_picks: Array<{ rank: number; lo_a: string; lo_b: string; value: number }>;
}

export interface PairConsensusItem {
  lo_a: string;
  lo_b: string;
  appearances_in_top: number;  // # of components where this pair is in top 10
  components: string[];        // which components agreed
}

export interface PairResult {
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  top_n_source: number;
  pairs: PairItem[];
  total_components: number;             // 4 (combined/cooccur/recent/heat)
  consensus_threshold: number;          // ≥ this many components agree → consensus
  components: PairComponentBreakdown[];
  consensus: PairConsensusItem[];
  controversial: PairConsensusItem[];
}

// Component labels for the UI
const COMPONENT_META: Record<string, { label: string; question: string }> = {
  combined: { label: "Xác suất cá nhân", question: "Cặp nào có 2 lô cá nhân mạnh nhất?" },
  cooccur: { label: "Đồng xuất hiện", question: "Cặp nào hay về CÙNG NGÀY trong lịch sử?" },
  recent: { label: "Gần đây", question: "Cặp nào đang HOT trong 7-10 ngày gần?" },
  heat: { label: "Đều nóng", question: "Cặp nào cả 2 lô đều ĐANG NÓNG?" },
};

// Per-region consensus threshold (out of 4 components)
const PAIR_CONSENSUS_THRESHOLD: Record<Region, number> = {
  xsmn: 3,  // 3/4 components agree
  xsmb: 2,  // 2/4 (looser since MB struggles)
  xsmt: 3,  // 3/4 (MT works well, keep strict)
};

// ─────────────────────────────────────────────
// Per-region pair scoring params — each region has different draw structure
//
// MT (working well — KEEP AS IS per user):
//   2-3 provinces rotate BY day-of-week. Pair cooccur reflects real
//   province pairings → lift is informative.
//
// MN (under-performing — needs tighter focus):
//   21+ provinces/day, each with 18 prizes. Most "cooccur" is just
//   different provinces drawing same day → low lift signal.
//   → Rely MORE on individual probability (high w_g), LESS on lift.
//   → Tighter source pool to focus on strongest picks.
//
// MB (under-performing — needs recency focus):
//   1 province × 27 prizes/day. ALL 27 lo cooccur every day → baseline
//   cooccurrence is high → distinguishing signal weaker.
//   → Heavier reliance on RECENT pair patterns (less ancient noise).
//   → Higher prior to dampen overinflated lifts.
// ─────────────────────────────────────────────
interface PairRegionParams {
  weights: { geoMean: number; cooccurLift: number; recentBoost: number; heatAlignment: number };
  priorStrength: number;       // Bayesian smoothing strength on lift
  cooccurLiftCap: number;      // Cap smoothed cooccur lift
  recentBoostCap: number;      // Cap recent-pair lift
  recentDays: number;          // How far back "recent" extends
}

const PAIR_REGION_PARAMS: Record<Region, PairRegionParams> = {
  xsmn: {
    // High geoMean weight — trust individual VIP probability more than cooccur
    weights: { geoMean: 0.55, cooccurLift: 0.18, recentBoost: 0.17, heatAlignment: 0.10 },
    priorStrength: 1.5,
    cooccurLiftCap: 2.0,
    recentBoostCap: 1.8,
    recentDays: 7,
  },
  xsmb: {
    // Heavier recent weight, high prior, longer recent window
    weights: { geoMean: 0.45, cooccurLift: 0.18, recentBoost: 0.27, heatAlignment: 0.10 },
    priorStrength: 1.5,
    cooccurLiftCap: 2.0,
    recentBoostCap: 2.0,
    recentDays: 10,
  },
  xsmt: {
    // CURRENT formula — user said working OK
    weights: { geoMean: 0.40, cooccurLift: 0.30, recentBoost: 0.20, heatAlignment: 0.10 },
    priorStrength: 1.0,
    cooccurLiftCap: 2.5,
    recentBoostCap: 2.0,
    recentDays: 7,
  },
};

export async function predictPair(
  region: Region,
  windowDays: number = 120,   // Đá needs dense pair-cooccurrence data; bumped 60→120
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
      total_components: 4,
      consensus_threshold: PAIR_CONSENSUS_THRESHOLD[region],
      components: [],
      consensus: [],
      controversial: [],
    };
  }

  // 2) Region-specific tuning
  const params = PAIR_REGION_PARAMS[region] ?? PAIR_REGION_PARAMS.xsmt;

  // 3) Restrict to top N lo from VIP
  const sourceLos = vip.final.slice(0, topNSource);
  const probMap = new Map<string, number>(
    sourceLos.map((p) => [p.lo_number, p.probability / 100]) // convert % → 0-1
  );

  // 4) Pair co-occurrence from history (data BEFORE endDate when backtesting)
  const history = await loadHistoryLo(region, windowDays, endDate);
  const totalDays = Object.keys(history).length;
  const cooccur = buildPairCooccurrence(history);

  // Recent co-occurrence — region-specific window (MN/MT 7d, MB 10d)
  const sortedDates = Object.keys(history).sort();
  const recentDates = sortedDates.slice(-params.recentDays);
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

  // 5) Generate pairs from top N source
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
      const pADaily = (soloDays.get(loA) ?? 0) / Math.max(1, totalDays);
      const pBDaily = (soloDays.get(loB) ?? 0) / Math.max(1, totalDays);
      const expected = Math.max(0.5, pADaily * pBDaily * totalDays);

      // Bayesian-smoothed lift with region-specific prior strength
      const rawLift = coocDays / expected;
      const smoothedLift =
        (coocDays + params.priorStrength * expected) /
        (expected + params.priorStrength * expected);
      const cappedLift = Math.min(params.cooccurLiftCap, smoothedLift);

      // Recent pair boost
      const recentCoocDays = recentCooccur.get(`${loA}|${loB}`) ?? 0;
      const rA = (recentSoloDays.get(loA) ?? 0) / Math.max(1, recentDayCount);
      const rB = (recentSoloDays.get(loB) ?? 0) / Math.max(1, recentDayCount);
      const recentExpected = Math.max(0.3, rA * rB * recentDayCount);
      const recentLift = recentCoocDays / recentExpected;
      const recentBoost = Math.min(params.recentBoostCap, recentLift);

      // Heat alignment
      const recentDaysA = recentSoloDays.get(loA) ?? 0;
      const recentDaysB = recentSoloDays.get(loB) ?? 0;
      const heatScore = (recentDaysA + recentDaysB) / (2 * Math.max(1, recentDayCount));

      // Region-specific score formula
      const w = params.weights;
      const pairScore =
        geoMean *
        (w.geoMean +
          w.cooccurLift * cappedLift +
          w.recentBoost * recentBoost +
          w.heatAlignment * heatScore);

      candidatePairs.push({
        rank: 0,
        lo_a: loA,
        lo_b: loB,
        combined_prob: Math.round(geoMean * 100 * 10000) / 10000,
        p_a: Math.round(pA * 100 * 10000) / 10000,
        p_b: Math.round(pB * 100 * 10000) / 10000,
        cooccur_days: coocDays,
        cooccur_lift: Math.round(rawLift * 100) / 100,
        recent_boost: Math.round(recentBoost * 100) / 100,
        heat_score: Math.round(heatScore * 1000) / 1000,
        pair_score: Math.round(pairScore * 100 * 10000) / 10000,
      });
    }
  }

  candidatePairs.sort((a, b) => b.pair_score - a.pair_score);
  const topPairs = candidatePairs.slice(0, topKReturn);
  topPairs.forEach((p, i) => { p.rank = i + 1; });

  // Per-component top 10 — rank candidates by EACH score component separately
  const COMP_TOP = 10;
  const sortAndTake = (key: "combined" | "cooccur" | "recent" | "heat") => {
    const accessor = (p: PairItem) => {
      if (key === "combined") return p.combined_prob;
      if (key === "cooccur") return p.cooccur_lift;
      if (key === "recent") return p.recent_boost;
      return p.heat_score;
    };
    return [...candidatePairs]
      .sort((a, b) => accessor(b) - accessor(a))
      .slice(0, COMP_TOP)
      .map((p, idx) => ({
        rank: idx + 1,
        lo_a: p.lo_a,
        lo_b: p.lo_b,
        value: accessor(p),
      }));
  };

  const compWeights: Record<string, number> = {
    combined: params.weights.geoMean,
    cooccur: params.weights.cooccurLift,
    recent: params.weights.recentBoost,
    heat: params.weights.heatAlignment,
  };

  const components: PairComponentBreakdown[] = (["combined", "cooccur", "recent", "heat"] as const).map(
    (key) => ({
      key,
      label: COMPONENT_META[key].label,
      question: COMPONENT_META[key].question,
      weight: compWeights[key],
      top_picks: sortAndTake(key),
    })
  );

  // Consensus: pairs in top-10 of ≥ N components
  const pairKey = (p: { lo_a: string; lo_b: string }) => `${p.lo_a}|${p.lo_b}`;
  const appearancesPerPair = new Map<string, { lo_a: string; lo_b: string; comps: string[] }>();
  for (const c of components) {
    for (const p of c.top_picks) {
      const key = pairKey(p);
      const entry = appearancesPerPair.get(key);
      if (entry) entry.comps.push(c.key);
      else appearancesPerPair.set(key, { lo_a: p.lo_a, lo_b: p.lo_b, comps: [c.key] });
    }
  }
  const allRanked = Array.from(appearancesPerPair.values())
    .map((e) => ({
      lo_a: e.lo_a,
      lo_b: e.lo_b,
      appearances_in_top: e.comps.length,
      components: e.comps,
    }))
    .sort((a, b) => b.appearances_in_top - a.appearances_in_top);

  const threshold = PAIR_CONSENSUS_THRESHOLD[region];
  const consensus = allRanked.filter((x) => x.appearances_in_top >= threshold);
  // Controversial = pairs in exactly 2 components (interesting overlap but not consensus)
  const controversial = allRanked.filter(
    (x) => x.appearances_in_top === (threshold === 3 ? 2 : 1)
  );

  return {
    region,
    window_days: windowDays,
    days_available: vip.days_available,
    top_n_source: topNSource,
    pairs: topPairs,
    total_components: 4,
    consensus_threshold: threshold,
    components,
    consensus,
    controversial,
  };
}

// ─────────────────────────────────────────────
// COLD pair prediction ("gambler's overdue" — anti-hot strategy)
//
// Hot strategy picks pairs from VIP-ranked top N (frequent/streaking lô).
// Cold flips it: pick the N coldest lô (longest since last appearance),
// then score C(N,2) pairs by how "overdue" they collectively are.
//
// User rationale (XSMB):
//   • ~25 lô/day × ~30 days = ~10,500 pair-events / month
//   • Unique pairs in 100 numbers: C(100,2) = 4,950
//   • Average: each pair returns ~2.1× / month → cold pairs are "due"
// ─────────────────────────────────────────────

const COLD_COMPONENT_META: Record<string, { label: string; question: string }> = {
  solo_cold: { label: "Cả 2 đều nguội", question: "Cặp nào cả 2 lô lâu chưa về nhất?" },
  pair_overdue: { label: "Cặp lâu chưa cùng về", question: "Cặp nào lâu chưa về CÙNG buổi nhất?" },
  balanced: { label: "Cân bằng nguội", question: "Cặp nào không bị 1 con quá nóng kéo lại?" },
  underseen: { label: "Thiếu nợ kỳ vọng", question: "Cặp nào về ÍT hơn kỳ vọng thống kê?" },
};

// Per-region weights for cold scoring (4 components sum to ~1)
const COLD_REGION_PARAMS: Record<Region, {
  weights: { solo: number; pairOverdue: number; balance: number; underseen: number };
}> = {
  xsmn: { weights: { solo: 0.35, pairOverdue: 0.30, balance: 0.20, underseen: 0.15 } },
  xsmb: { weights: { solo: 0.30, pairOverdue: 0.35, balance: 0.20, underseen: 0.15 } }, // MB tilts to pair-level overdue
  xsmt: { weights: { solo: 0.35, pairOverdue: 0.30, balance: 0.20, underseen: 0.15 } },
};

// Same consensus threshold as hot version
const COLD_CONSENSUS_THRESHOLD: Record<Region, number> = {
  xsmn: 3,
  xsmb: 2,
  xsmt: 3,
};

export async function predictPairCold(
  region: Region,
  windowDays: number = 30,
  topNSource: number = 30,      // pick 30 coldest lô → C(30,2) = 435 candidate pairs
  topKReturn: number = 30,
  endDate?: string
): Promise<PairResult> {
  const params = COLD_REGION_PARAMS[region];

  // 1) Load history within window
  const history = await loadHistoryLo(region, windowDays, endDate);
  const sortedDates = Object.keys(history).sort();
  const totalDays = sortedDates.length;

  if (totalDays < 7) {
    return {
      region,
      window_days: windowDays,
      days_available: totalDays,
      warning: `Cần ít nhất 7 ngày data, hiện có ${totalDays}`,
      top_n_source: topNSource,
      pairs: [],
      total_components: 4,
      consensus_threshold: COLD_CONSENSUS_THRESHOLD[region],
      components: [],
      consensus: [],
      controversial: [],
    };
  }

  // 2) Per-lo stats: last_seen_index, solo_days, appearances
  const lastSeenIdx = new Map<string, number>(); // index in sortedDates (higher = more recent)
  const soloDays = new Map<string, number>();
  for (let i = 0; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    for (const lo of Object.keys(history[date])) {
      lastSeenIdx.set(lo, i);
      soloDays.set(lo, (soloDays.get(lo) ?? 0) + 1);
    }
  }

  // days_since_last for each of the 100 lô (relative to end of window)
  // If lo never appeared in window: days = totalDays (max coldness)
  const allLos = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
  const coldness = new Map<string, number>();
  for (const lo of allLos) {
    const idx = lastSeenIdx.get(lo);
    if (idx === undefined) coldness.set(lo, totalDays);
    else coldness.set(lo, totalDays - 1 - idx);
  }

  // 3) Pick top N coldest lô
  const sourceLos = allLos
    .slice()
    .sort((a, b) => (coldness.get(b)! - coldness.get(a)!) || a.localeCompare(b))
    .slice(0, topNSource);

  // 4) Build pair-level co-occurrence within window
  const cooccur = buildPairCooccurrence(history);
  // Pair last-seen index (most recent day they appeared together)
  const pairLastSeen = new Map<string, number>();
  for (let i = 0; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    const losToday = Object.keys(history[date]).sort();
    for (let a = 0; a < losToday.length; a++) {
      for (let b = a + 1; b < losToday.length; b++) {
        pairLastSeen.set(`${losToday[a]}|${losToday[b]}`, i);
      }
    }
  }

  // 5) Generate candidate pairs from cold source pool
  const candidatePairs: PairItem[] = [];
  for (let i = 0; i < sourceLos.length; i++) {
    for (let j = i + 1; j < sourceLos.length; j++) {
      const [loA, loB] = [sourceLos[i], sourceLos[j]].sort();
      const dA = coldness.get(loA)!;
      const dB = coldness.get(loB)!;

      // Component 1: solo coldness — geometric mean of days since last, normalized
      // Use sqrt to dampen extreme values (e.g. lo unseen all window)
      const soloCold = Math.sqrt(dA * dB) / Math.max(1, totalDays); // 0-1

      // Component 2: pair-level overdue — days since this pair last co-occurred
      const pairIdx = pairLastSeen.get(`${loA}|${loB}`);
      const pairDaysSince = pairIdx === undefined ? totalDays : totalDays - 1 - pairIdx;
      const pairOverdue = pairDaysSince / Math.max(1, totalDays); // 0-1

      // Component 3: balance — penalize if one lo is much "hotter" than the other
      // ratio = min/max, then we want HIGH ratio (similar coldness)
      const balance = Math.min(dA, dB) / Math.max(1, Math.max(dA, dB)); // 0-1

      // Component 4: underseen — gambler's fallacy "due to come"
      // Each pair's expected co-occurrence in window = ~totalDays × (avg lo per day / 100)^2
      // Simpler: use solo appearance rates
      const pA = (soloDays.get(loA) ?? 0) / Math.max(1, totalDays);
      const pB = (soloDays.get(loB) ?? 0) / Math.max(1, totalDays);
      const expected = pA * pB * totalDays;
      const actual = cooccur.get(`${loA}|${loB}`) ?? 0;
      const deficit = Math.max(0, expected - actual);
      const underseen = expected > 0.5 ? Math.min(1, deficit / expected) : 0; // 0-1

      // For UI compatibility, fill in PairItem fields (treating cold metrics as if they were the hot ones)
      // Keep types same — but values mean different things in cold mode
      const w = params.weights;
      const coldScore =
        w.solo * soloCold +
        w.pairOverdue * pairOverdue +
        w.balance * balance +
        w.underseen * underseen;

      candidatePairs.push({
        rank: 0,
        lo_a: loA,
        lo_b: loB,
        // Reuse fields with different semantics for cold mode:
        combined_prob: Math.round(soloCold * 100 * 100) / 100,  // % "solo coldness"
        p_a: dA,    // days since A last seen
        p_b: dB,    // days since B last seen
        cooccur_days: actual,            // # days pair appeared (lower = more overdue)
        cooccur_lift: Math.round(pairDaysSince * 10) / 10, // days since pair last cooccurred
        recent_boost: Math.round(balance * 100) / 100,    // balance metric
        heat_score: Math.round(underseen * 1000) / 1000,  // underseen ratio
        pair_score: Math.round(coldScore * 100 * 100) / 100, // 0-100 score
      });
    }
  }

  candidatePairs.sort((a, b) => b.pair_score - a.pair_score);
  const topPairs = candidatePairs.slice(0, topKReturn);
  topPairs.forEach((p, i) => { p.rank = i + 1; });

  // Per-component top 10
  const COMP_TOP = 10;
  const sortAndTake = (key: "solo_cold" | "pair_overdue" | "balanced" | "underseen") => {
    const accessor = (p: PairItem) => {
      if (key === "solo_cold") return p.combined_prob;   // soloCold metric
      if (key === "pair_overdue") return p.cooccur_lift; // pairDaysSince
      if (key === "balanced") return p.recent_boost;     // balance
      return p.heat_score;                                // underseen
    };
    return [...candidatePairs]
      .sort((a, b) => accessor(b) - accessor(a))
      .slice(0, COMP_TOP)
      .map((p, idx) => ({
        rank: idx + 1,
        lo_a: p.lo_a,
        lo_b: p.lo_b,
        value: accessor(p),
      }));
  };

  const compWeights: Record<string, number> = {
    solo_cold: params.weights.solo,
    pair_overdue: params.weights.pairOverdue,
    balanced: params.weights.balance,
    underseen: params.weights.underseen,
  };

  const components: PairComponentBreakdown[] = (["solo_cold", "pair_overdue", "balanced", "underseen"] as const).map((key) => ({
    key,
    label: COLD_COMPONENT_META[key].label,
    question: COLD_COMPONENT_META[key].question,
    weight: compWeights[key],
    top_picks: sortAndTake(key),
  }));

  // Consensus across components
  const pairKey = (p: { lo_a: string; lo_b: string }) => `${p.lo_a}|${p.lo_b}`;
  const appearancesPerPair = new Map<string, { lo_a: string; lo_b: string; comps: string[] }>();
  for (const c of components) {
    for (const p of c.top_picks) {
      const key = pairKey(p);
      const entry = appearancesPerPair.get(key);
      if (entry) entry.comps.push(c.key);
      else appearancesPerPair.set(key, { lo_a: p.lo_a, lo_b: p.lo_b, comps: [c.key] });
    }
  }
  const allRanked = Array.from(appearancesPerPair.values())
    .map((e) => ({
      lo_a: e.lo_a,
      lo_b: e.lo_b,
      appearances_in_top: e.comps.length,
      components: e.comps,
    }))
    .sort((a, b) => b.appearances_in_top - a.appearances_in_top);

  const threshold = COLD_CONSENSUS_THRESHOLD[region];
  const consensus = allRanked.filter((x) => x.appearances_in_top >= threshold);
  const controversial = allRanked.filter(
    (x) => x.appearances_in_top === (threshold === 3 ? 2 : 1)
  );

  return {
    region,
    window_days: windowDays,
    days_available: totalDays,
    top_n_source: topNSource,
    pairs: topPairs,
    total_components: 4,
    consensus_threshold: threshold,
    components,
    consensus,
    controversial,
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

export interface PairTierStat {
  range_start: number;
  range_end: number;
  label: string;
  picks_per_day: number;
  total_predicted: number;
  total_hits: number;
  hit_rate_pct: number;
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
  roi_pct: number;
  // Unique pairs that hit at least once in this tier
  hit_pairs: Array<{ lo_a: string; lo_b: string; days_hit: number }>;
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
  // Per-tier
  tiers: PairTierStat[];
  // Per-day
  days: PairBacktestDay[];
}

function buildPairTiers(topK: number): Array<{ start: number; end: number; label: string }> {
  const out: Array<{ start: number; end: number; label: string }> = [];
  for (let start = 1; start <= topK; start += 10) {
    const end = Math.min(start + 9, topK);
    out.push({ start, end, label: `Top ${start}-${end}` });
  }
  return out;
}

const POINT_COST_VND_PAIR = 23_000;

export async function backtestPair(
  region: Region,
  days: number = 14,
  topK: number = 30,
  windowDays: number = 60,
  topNSource: number = 35,
  payoutMultiplier: number = 17,  // win = multiplier × cost when pair hits
  mode: "hot" | "cold" = "hot"
): Promise<PairBacktestResult> {
  const predictor = mode === "cold" ? predictPairCold : predictPair;
  const { query } = await import("./db");
  const dateRows = await query<{ date: string }>(
    `SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT ?`,
    [region, days]
  );
  const dates = dateRows.map((r) => r.date).reverse();

  const winPerHit = POINT_COST_VND_PAIR * payoutMultiplier;
  const dayResults: PairBacktestDay[] = [];

  // Tier accumulators (chunks of 10 within topK)
  const tierDefs = buildPairTiers(topK);
  const tierAcc: Map<number, {
    hits: number;
    daysCounted: number;
    hitMap: Map<string, { lo_a: string; lo_b: string; days: number }>;  // "loA|loB" → days hit
  }> = new Map();
  for (const t of tierDefs) tierAcc.set(t.start, { hits: 0, daysCounted: 0, hitMap: new Map() });

  for (const date of dates) {
    const r = await predictor(region, windowDays, topNSource, topK, date);
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

    // Per-tier accumulation (track which pairs hit + how many days)
    for (const t of tierDefs) {
      const tierPairs = predicted.slice(t.start - 1, t.end);
      let tHits = 0;
      const acc = tierAcc.get(t.start)!;
      for (const p of tierPairs) {
        if (actualLo.has(p.lo_a) && actualLo.has(p.lo_b)) {
          tHits++;
          const key = `${p.lo_a}|${p.lo_b}`;
          const prev = acc.hitMap.get(key);
          if (prev) prev.days++;
          else acc.hitMap.set(key, { lo_a: p.lo_a, lo_b: p.lo_b, days: 1 });
        }
      }
      acc.hits += tHits;
      acc.daysCounted++;
    }

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

  // Finalize tier stats
  const tiers: PairTierStat[] = tierDefs.map((t) => {
    const acc = tierAcc.get(t.start)!;
    const picksPerDay = t.end - t.start + 1;
    const totalPred = picksPerDay * acc.daysCounted;
    const tCost = totalPred * POINT_COST_VND_PAIR;
    const tWin = acc.hits * winPerHit;
    const tProfit = tWin - tCost;
    const hitPairsList = Array.from(acc.hitMap.values())
      .map((v) => ({ lo_a: v.lo_a, lo_b: v.lo_b, days_hit: v.days }))
      .sort((a, b) => b.days_hit - a.days_hit);
    return {
      range_start: t.start,
      range_end: t.end,
      label: t.label,
      picks_per_day: picksPerDay,
      total_predicted: totalPred,
      total_hits: acc.hits,
      hit_rate_pct: totalPred > 0 ? Math.round((acc.hits / totalPred) * 10000) / 100 : 0,
      cost_vnd: tCost,
      win_vnd: tWin,
      profit_vnd: tProfit,
      roi_pct: tCost > 0 ? Math.round((tProfit / tCost) * 10000) / 100 : 0,
      hit_pairs: hitPairsList,
    };
  });

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
    tiers,
    days: dayResults,
  };
}
