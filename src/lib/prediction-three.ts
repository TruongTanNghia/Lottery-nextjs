/**
 * 3-DIGIT prediction ("3 chân" / "ba càng").
 *
 * Data source: last 3 digits of each prize in `lottery_results.number`.
 * Search space: 000-999 (1000 numbers vs 100 for normal lô).
 *
 * Models (lean ensemble — sparser data than 2-digit, fewer signals reliable):
 *   - Frequency: rolling 60-day appearance rate
 *   - Recency: EWMA (half-life 10d)
 *   - DayOfWeek: pattern per weekday
 *   - Temperature: z-score hot vs avg
 */
import { query, type Region } from "./db";

type DateMap = Record<string, Record<string, number>>;

const ALL_THREE = Array.from({ length: 1000 }, (_, i) => String(i).padStart(3, "0"));

async function loadThreeHistory(
  region: Region,
  days: number,
  endDate?: string
): Promise<DateMap> {
  let rows: { date: string; number: string }[];
  if (endDate) {
    const [ey, em, ed] = endDate.split("-").map(Number);
    const endMs = Date.UTC(ey, em - 1, ed);
    const startStr = new Date(endMs - days * 86_400_000).toISOString().slice(0, 10);
    rows = await query<{ date: string; number: string }>(
      `SELECT date, number FROM lottery_results
       WHERE region = ? AND date >= ? AND date < ? AND LENGTH(number) >= 3`,
      [region, startStr, endDate]
    );
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    rows = await query<{ date: string; number: string }>(
      `SELECT date, number FROM lottery_results
       WHERE region = ? AND date >= ? AND LENGTH(number) >= 3`,
      [region, cutoffStr]
    );
  }
  const out: DateMap = {};
  for (const r of rows) {
    const three = r.number.slice(-3).padStart(3, "0");
    if (!out[r.date]) out[r.date] = {};
    out[r.date][three] = (out[r.date][three] ?? 0) + 1;
  }
  return out;
}

/** Load 2-digit lô history (for modelLoBorrow which borrows from denser data). */
async function loadLoHistory(
  region: Region,
  days: number,
  endDate?: string
): Promise<Record<string, Record<string, number>>> {
  let rows: { date: string; lo_number: string; count: number }[];
  if (endDate) {
    const [ey, em, ed] = endDate.split("-").map(Number);
    const endMs = Date.UTC(ey, em - 1, ed);
    const startStr = new Date(endMs - days * 86_400_000).toISOString().slice(0, 10);
    rows = await query<{ date: string; lo_number: string; count: number }>(
      `SELECT date, lo_number, count FROM lo_daily
       WHERE region = ? AND date >= ? AND date < ?`,
      [region, startStr, endDate]
    );
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    rows = await query<{ date: string; lo_number: string; count: number }>(
      `SELECT date, lo_number, count FROM lo_daily
       WHERE region = ? AND date >= ?`,
      [region, cutoffStr]
    );
  }
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!out[r.date]) out[r.date] = {};
    out[r.date][r.lo_number] = r.count;
  }
  return out;
}

/**
 * Per-3-digit occurrence counts on a specific date.
 * Some prizes share last 3 digits → multiplicity matters for money calc
 * (each appearance pays separately for 3 càng).
 */
async function getThreeDigitOccurrencesOnDate(region: Region, date: string): Promise<Map<string, number>> {
  const rows = await query<{ number: string }>(
    `SELECT number FROM lottery_results
     WHERE region = ? AND date = ? AND LENGTH(number) >= 3`,
    [region, date]
  );
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r.number.slice(-3).padStart(3, "0");
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function emptyScores(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of ALL_THREE) out[n] = 0;
  return out;
}

function normalize(scores: Record<string, number>): Record<string, number> {
  const vals = Object.values(scores);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min;
  const out: Record<string, number> = {};
  if (range < 1e-12) {
    for (const n of ALL_THREE) out[n] = 0;
    return out;
  }
  for (const n of ALL_THREE) out[n] = (scores[n] - min) / range;
  return out;
}

function softmax(scores: Record<string, number>, T: number): Record<string, number> {
  const expScores: Record<string, number> = {};
  let sum = 0;
  const maxS = Math.max(...Object.values(scores));
  for (const n of ALL_THREE) {
    const e = Math.exp((scores[n] - maxS) / T);
    expScores[n] = e;
    sum += e;
  }
  const out: Record<string, number> = {};
  for (const n of ALL_THREE) out[n] = expScores[n] / sum;
  return out;
}

/**
 * Frequency model with Laplace smoothing — critical for 3-digit because
 * many of the 1000 numbers never appear in 60 days (sparse data).
 * Smoothing prevents 0-prob and dampens noise on rare numbers.
 */
function modelFrequency(history: DateMap, alpha: number = 1.5): Record<string, number> {
  const counts = emptyScores();
  const dates = Object.keys(history);
  if (dates.length === 0) return counts;
  for (const date of dates) {
    for (const [num, c] of Object.entries(history[date])) {
      counts[num] = (counts[num] ?? 0) + c;
    }
  }
  // Laplace: (count + alpha) / (days + alpha × space_size)
  const denom = dates.length + alpha;
  for (const n of ALL_THREE) counts[n] = (counts[n] + alpha / 1000) / denom;
  return counts;
}

function modelRecency(history: DateMap, halfLife: number = 10): Record<string, number> {
  const counts = emptyScores();
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return counts;
  const decay = Math.log(2) / halfLife;
  const todayIdx = dates.length - 1;
  for (let i = 0; i < dates.length; i++) {
    const ageInDays = todayIdx - i;
    const weight = Math.exp(-decay * ageInDays);
    for (const [num, c] of Object.entries(history[dates[i]])) {
      counts[num] = (counts[num] ?? 0) + weight * c;
    }
  }
  return counts;
}

function modelDayOfWeek(history: DateMap): Record<string, number> {
  const counts = emptyScores();
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return counts;
  const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");
  const tomorrow = new Date(lastDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDow = tomorrow.getDay();
  let matchingDays = 0;
  for (const date of dates) {
    const d = new Date(date + "T00:00:00");
    if (d.getDay() !== targetDow) continue;
    matchingDays++;
    for (const [num, c] of Object.entries(history[date])) {
      counts[num] = (counts[num] ?? 0) + c;
    }
  }
  if (matchingDays === 0) return emptyScores();
  for (const n of ALL_THREE) counts[n] /= matchingDays;
  return counts;
}

function modelTemperature(history: DateMap): Record<string, number> {
  // Compare 7-day rolling rate vs 30-day baseline → positive = hotter than usual
  const dates = Object.keys(history).sort();
  if (dates.length < 8) return emptyScores();
  const recent = dates.slice(-7);
  const all = dates;

  const recentCount = emptyScores();
  for (const d of recent) {
    for (const [num, c] of Object.entries(history[d])) {
      recentCount[num] = (recentCount[num] ?? 0) + c;
    }
  }
  const recentRate: Record<string, number> = {};
  for (const n of ALL_THREE) recentRate[n] = recentCount[n] / recent.length;

  const totalCount = emptyScores();
  for (const d of all) {
    for (const [num, c] of Object.entries(history[d])) {
      totalCount[num] = (totalCount[num] ?? 0) + c;
    }
  }
  const baseRate: Record<string, number> = {};
  for (const n of ALL_THREE) baseRate[n] = totalCount[n] / all.length;

  const out: Record<string, number> = {};
  for (const n of ALL_THREE) {
    out[n] = recentRate[n] - baseRate[n]; // can be negative
  }
  return out;
}

/**
 * Streak model: 3-digit numbers that appeared in last K consecutive days
 * get a boost. Real-life: "hot streak" effect — extremely rare in 1000-space,
 * so when it happens it's a strong signal.
 */
function modelStreak(history: DateMap, lookback: number = 5): Record<string, number> {
  const out = emptyScores();
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return out;
  const recent = dates.slice(-lookback);
  for (const n of ALL_THREE) {
    let streak = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      if ((history[recent[i]]?.[n] ?? 0) > 0) streak++;
      else break;
    }
    // Boost grows nonlinearly with streak
    out[n] = streak * streak;
  }
  return out;
}

/**
 * Position-Frequency: decompose 3-digit "ABC" into 3 independent digits.
 *   score("ABC") = freq_pos0(A) × freq_pos1(B) × freq_pos2(C)
 * Per-digit-per-position has ~50-100× more observations than per-3-digit,
 * giving a MUCH denser, smoother signal in the sparse 1000-space.
 * This is the highest-leverage upgrade for 3-digit accuracy.
 */
function modelDigitFrequency(history: DateMap): Record<string, number> {
  // posCount[position][digit] = appearance count
  const posCount: number[][] = [
    Array(10).fill(0),
    Array(10).fill(0),
    Array(10).fill(0),
  ];
  let totalObservations = 0;
  for (const date of Object.keys(history)) {
    for (const [num, c] of Object.entries(history[date])) {
      // num is "ABC" format (already padded)
      const a = Number(num[0]);
      const b = Number(num[1]);
      const c2 = Number(num[2]);
      posCount[0][a] += c;
      posCount[1][b] += c;
      posCount[2][c2] += c;
      totalObservations += c;
    }
  }
  if (totalObservations === 0) return emptyScores();
  // Normalize per-position to rates with Laplace smoothing (alpha=2)
  const rates: number[][] = posCount.map((row) => {
    const sum = row.reduce((s, v) => s + v, 0);
    return row.map((v) => (v + 2) / (sum + 20));
  });
  // Score each candidate "ABC"
  const out = emptyScores();
  for (const n of ALL_THREE) {
    const a = Number(n[0]);
    const b = Number(n[1]);
    const c = Number(n[2]);
    out[n] = rates[0][a] * rates[1][b] * rates[2][c];
  }
  return out;
}

/**
 * 2-digit Lô Borrowing: leverage existing dense 2-digit lô data.
 *   For "ABC", the lô (last 2 digits) is "BC".
 *   If "BC" is hot recently as lô → boost "ABC".
 *   Borrows signal from a MUCH denser data space (100 vs 1000).
 */
function modelLoBorrow(
  loHistory: Record<string, Record<string, number>>,
  halfLife: number = 7
): Record<string, number> {
  const loDates = Object.keys(loHistory).sort();
  if (loDates.length === 0) return emptyScores();

  // EWMA score per 2-digit lô
  const loScore: Record<string, number> = {};
  for (let i = 0; i < 100; i++) loScore[String(i).padStart(2, "0")] = 0;
  const decay = Math.log(2) / halfLife;
  const todayIdx = loDates.length - 1;
  for (let i = 0; i < loDates.length; i++) {
    const ageDays = todayIdx - i;
    const w = Math.exp(-decay * ageDays);
    for (const [lo, c] of Object.entries(loHistory[loDates[i]])) {
      loScore[lo] = (loScore[lo] ?? 0) + w * c;
    }
  }

  // Score each 3-digit "ABC" by its lô "BC" score
  const out = emptyScores();
  for (const n of ALL_THREE) {
    const lo = n.slice(1); // last 2 digits = lô
    out[n] = loScore[lo] ?? 0;
  }
  return out;
}

/**
 * Pair-Decomposition: score "ABC" by frequency of (first-2 "AB") × (last-2 "BC").
 * Captures pairwise digit CORRELATIONS that the independence-based
 * modelDigitFrequency misses. Both pair-frequencies are dense (100-space
 * vs 1000-space) → much smoother signal.
 *
 * Why "first-2" is new info:
 *   - last-2 frequency overlaps with modelLoBorrow (both reflect lô patterns)
 *   - first-2 frequency = how often a 3-digit prize starts with this prefix
 *     (e.g., is "12_" a common prefix? Independent of digitFreq[0]×digitFreq[1])
 */
function modelPairFreq(history: DateMap): Record<string, number> {
  const firstTwoCount: Record<string, number> = {};
  const lastTwoCount: Record<string, number> = {};

  for (const date of Object.keys(history)) {
    for (const [num, c] of Object.entries(history[date])) {
      const firstTwo = num.slice(0, 2);
      const lastTwo = num.slice(1, 3);
      firstTwoCount[firstTwo] = (firstTwoCount[firstTwo] ?? 0) + c;
      lastTwoCount[lastTwo] = (lastTwoCount[lastTwo] ?? 0) + c;
    }
  }

  // Laplace smoothing on each pair-position (alpha=1 per 100 cells)
  const sumFirst = Object.values(firstTwoCount).reduce((s, v) => s + v, 0) + 100;
  const sumLast = Object.values(lastTwoCount).reduce((s, v) => s + v, 0) + 100;

  const out = emptyScores();
  for (const n of ALL_THREE) {
    const firstTwo = n.slice(0, 2);
    const lastTwo = n.slice(1, 3);
    const f = ((firstTwoCount[firstTwo] ?? 0) + 1) / sumFirst;
    const l = ((lastTwoCount[lastTwo] ?? 0) + 1) / sumLast;
    out[n] = f * l;
  }
  return out;
}

/**
 * Bayesian shrinkage toward uniform — caps confidence for sparse 1000-space.
 */
function applyShrinkage(scores: Record<string, number>, shrink: number): Record<string, number> {
  if (shrink <= 0) return scores;
  const vals = Object.values(scores);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const out: Record<string, number> = {};
  for (const n of ALL_THREE) out[n] = (1 - shrink) * scores[n] + shrink * avg;
  return out;
}

// Per-region tuning — leverages each region's data characteristics
interface ThreeRegionParams {
  weights: Record<string, number>;
  softmaxT: number;
  recencyHalfLife: number;
  shrinkage: number;
}
// Per-region weights — now includes digitFreq (position-decomposition, dense)
// and loBorrow (borrows from denser 2-digit lo signal). These two carry the
// bulk of the new accuracy uplift.
// Per-region weights now include pairFreq (pairwise digit decomposition).
// Softer softmax T + slightly more shrinkage → broader top-K coverage
// in the sparse 1000-space (trade peak confidence for better hit count).
const REGION_PARAMS: Record<"xsmn" | "xsmb" | "xsmt", ThreeRegionParams> = {
  xsmn: {
    weights: {
      frequency: 0.08,        // direct count is sparse — minimal weight
      recency: 0.12,
      dayOfWeek: 0.07,
      temperature: 0.06,
      streak: 0.05,
      digitFreq: 0.20,        // per-position digit (independence)
      loBorrow: 0.22,         // 2-digit lô borrowing (denser space)
      pairFreq: 0.20,         // NEW: pairwise digit correlations
    },
    softmaxT: 0.16, recencyHalfLife: 10, shrinkage: 0.08,
  },
  xsmb: {
    // 27 prizes/day → more data per draw; DoW useless (1 đài)
    weights: {
      frequency: 0.10,
      recency: 0.12,
      dayOfWeek: 0.02,
      temperature: 0.06,
      streak: 0.08,
      digitFreq: 0.20,
      loBorrow: 0.22,
      pairFreq: 0.20,
    },
    softmaxT: 0.18, recencyHalfLife: 12, shrinkage: 0.15,
  },
  xsmt: {
    // Province rotation → DoW critical; less data per day
    weights: {
      frequency: 0.06,
      recency: 0.08,
      dayOfWeek: 0.20,        // still important for MT
      temperature: 0.04,
      streak: 0.04,
      digitFreq: 0.20,
      loBorrow: 0.22,
      pairFreq: 0.16,
    },
    softmaxT: 0.22, recencyHalfLife: 6, shrinkage: 0.22,
  },
};

function getThreeParams(region: Region): ThreeRegionParams {
  return REGION_PARAMS[region] ?? REGION_PARAMS.xsmn;
}

export interface ThreeDigitItem {
  rank: number;
  number: string;
  probability: number;
  composite_score: number;
  breakdown: Record<string, number>;
}

export interface ThreeModelTopPick {
  rank: number;
  number: string;
  norm_score: number;
}

export interface ThreeModelBreakdown {
  key: string;
  label: string;
  question: string;
  weight: number;
  top_picks: ThreeModelTopPick[];   // top N picks for this model
}

export interface ThreeConsensusItem {
  number: string;
  appearances_in_top: number;
  models: string[];
}

export interface ThreeDigitResult {
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  weights: Record<string, number>;
  predictions: ThreeDigitItem[];
  total_models: number;
  consensus_threshold: number;
  models: ThreeModelBreakdown[];
  consensus: ThreeConsensusItem[];      // ≥ threshold model agree
  controversial: ThreeConsensusItem[];  // exactly 2-4 model agree
}

const MODEL_META: Record<string, { label: string; question: string }> = {
  frequency: { label: "Tần suất", question: "Số nào về NHIỀU NHẤT?" },
  recency: { label: "Gần đây (EWMA)", question: "Số nào về nhiều GẦN ĐÂY?" },
  dayOfWeek: { label: "Cùng thứ", question: "Số nào hay về vào THỨ này?" },
  temperature: { label: "Hot vs base", question: "Số nào ĐANG HOT hơn trung bình?" },
  streak: { label: "Liên tiếp", question: "Số đang về LIÊN TIẾP có nên đánh tiếp?" },
  digitFreq: { label: "Vị trí chữ số", question: "Mỗi vị trí (trăm/chục/đơn vị) hay là số nào?" },
  loBorrow: { label: "Mượn lô 2 chữ", question: "Lô 2 chữ số đuôi (BC) đang hot?" },
  pairFreq: { label: "Cặp 2 chữ số", question: "Cặp đầu (AB) + cặp đuôi (BC) có tần suất cao?" },
};

// Per-region consensus threshold (similar tier structure as VIP)
const CONSENSUS_THRESHOLD: Record<Region, number> = {
  xsmn: 5,  // 5/8 model agree → consensus
  xsmb: 4,  // 4/8
  xsmt: 3,  // 3/8 (matches MT being structurally harder)
};

export async function predictThreeDigit(
  region: Region,
  windowDays: number = 120,   // 3 Chân needs dense data (1000-space); bumped 60→120
  endDate?: string  // For backtest: use only data strictly BEFORE this date
): Promise<ThreeDigitResult> {
  const history = await loadThreeHistory(region, windowDays, endDate);
  const daysAvailable = Object.keys(history).length;
  const params = getThreeParams(region);

  if (daysAvailable < 5) {
    return {
      region,
      window_days: windowDays,
      days_available: daysAvailable,
      warning: "Cần ít nhất 5 ngày dữ liệu",
      weights: params.weights,
      predictions: [],
      total_models: 8,
      consensus_threshold: CONSENSUS_THRESHOLD[region],
      models: [],
      consensus: [],
      controversial: [],
    };
  }

  // Load denser 2-digit lô history (used by loBorrow model)
  const loHistory = await loadLoHistory(region, windowDays, endDate);

  const raw: Record<string, Record<string, number>> = {
    frequency: modelFrequency(history),
    recency: modelRecency(history, params.recencyHalfLife),
    dayOfWeek: modelDayOfWeek(history),
    temperature: modelTemperature(history),
    streak: modelStreak(history),
    digitFreq: modelDigitFrequency(history),
    loBorrow: modelLoBorrow(loHistory, params.recencyHalfLife),
    pairFreq: modelPairFreq(history),
  };
  const norm: Record<string, Record<string, number>> = {};
  for (const [k, m] of Object.entries(raw)) norm[k] = normalize(m);

  const composite = emptyScores();
  for (const [k, m] of Object.entries(norm)) {
    const w = params.weights[k] ?? 0;
    for (const n of ALL_THREE) composite[n] += w * m[n];
  }
  const smoothed = applyShrinkage(composite, params.shrinkage);
  const probs = softmax(smoothed, params.softmaxT);

  const items: ThreeDigitItem[] = ALL_THREE.map((num) => ({
    rank: 0,
    number: num,
    probability: Math.round(probs[num] * 100 * 10000) / 10000,
    composite_score: Math.round(composite[num] * 10000) / 10000,
    breakdown: Object.fromEntries(
      Object.entries(norm).map(([k, m]) => [k, Math.round(m[num] * 10000) / 10000])
    ),
  }));
  items.sort((a, b) => b.probability - a.probability);
  items.forEach((p, i) => { p.rank = i + 1; });

  // Per-model top 10 breakdown (mirror of VIP's per-model cards)
  const TOP_PER_MODEL = 10;
  const models: ThreeModelBreakdown[] = Object.entries(norm).map(([key, scores]) => {
    const ranked = ALL_THREE
      .map((n) => ({ number: n, norm_score: scores[n] }))
      .sort((a, b) => b.norm_score - a.norm_score)
      .slice(0, TOP_PER_MODEL)
      .map((p, idx) => ({ rank: idx + 1, ...p, norm_score: Math.round(p.norm_score * 10000) / 10000 }));
    return {
      key,
      label: MODEL_META[key]?.label ?? key,
      question: MODEL_META[key]?.question ?? "",
      weight: params.weights[key] ?? 0,
      top_picks: ranked,
    };
  });

  // Consensus: which numbers appear in ≥ threshold models' top 10
  const topSetsByModel: Record<string, Set<string>> = {};
  for (const m of models) {
    topSetsByModel[m.key] = new Set(m.top_picks.map((p) => p.number));
  }
  const appearancesPerNum: Record<string, string[]> = {};
  for (const n of ALL_THREE) {
    appearancesPerNum[n] = [];
    for (const [k, set] of Object.entries(topSetsByModel)) {
      if (set.has(n)) appearancesPerNum[n].push(k);
    }
  }
  const allRanked = Object.entries(appearancesPerNum)
    .map(([n, ms]) => ({ number: n, appearances_in_top: ms.length, models: ms }))
    .filter((x) => x.appearances_in_top > 0)
    .sort((a, b) => b.appearances_in_top - a.appearances_in_top);

  const threshold = CONSENSUS_THRESHOLD[region];
  const consensus = allRanked.filter((x) => x.appearances_in_top >= threshold);
  // Controversial buckets always 2-4 model agree (overlap with consensus is OK)
  const controversial = allRanked.filter((x) => x.appearances_in_top >= 2 && x.appearances_in_top <= 4);

  return {
    region,
    window_days: windowDays,
    days_available: daysAvailable,
    weights: params.weights,
    predictions: items,
    total_models: 8,
    consensus_threshold: threshold,
    models,
    consensus,
    controversial,
  };
}

// ─────────────────────────────────────────────
// BACKTEST: replay top-K 3-digit predictions across last N days
// ─────────────────────────────────────────────

export interface ThreeBacktestDay {
  date: string;
  predicted_top: string[];
  actual_count: number;       // distinct 3-digit numbers that came that day
  hits: number;               // # of top_k picks that appeared (distinct)
  hit_picks: string[];
  total_occurrences: number;  // sum of appearance counts on hit picks (multi-hits)
  hit_rate_pct: number;
  coverage_pct: number;
  // Money (if bet 1 điểm per pick)
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
}

export interface ThreeTierStat {
  range_start: number;
  range_end: number;
  label: string;
  picks_per_day: number;
  total_predicted: number;
  total_hits: number;
  total_occurrences: number;
  hit_rate_pct: number;
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
  roi_pct: number;
  // Unique 3-digit numbers that hit at least once in this tier across the backtest
  hit_numbers: Array<{ number: string; days_hit: number; total_occ: number }>;
}

export interface ThreeBacktestResult {
  region: Region;
  days_window: number;
  top_k: number;
  total_models: number;
  baseline_pct: number;
  payout_per_hit_vnd: number;
  cost_per_pick_vnd: number;
  // Aggregate hit stats
  total_predicted: number;
  total_hits: number;
  total_occurrences: number;
  total_actual: number;
  hit_rate_pct: number;
  coverage_pct: number;
  lift_vs_baseline: number;
  // Aggregate money
  total_cost_vnd: number;
  total_win_vnd: number;
  total_profit_vnd: number;
  roi_pct: number;
  break_even_occurrences_per_day: number;
  // Per-tier breakdown (chunks of 10)
  tiers: ThreeTierStat[];
  // Per-day
  days: ThreeBacktestDay[];
}

function buildTiers(topK: number): Array<{ start: number; end: number; label: string }> {
  const out: Array<{ start: number; end: number; label: string }> = [];
  for (let start = 1; start <= topK; start += 10) {
    const end = Math.min(start + 9, topK);
    out.push({ start, end, label: `Top ${start}-${end}` });
  }
  return out;
}

// Cost per điểm bet (matches existing limit-engine constants)
const POINT_COST_VND_THREE = 23_000;

export async function backtestThreeDigit(
  region: Region,
  days: number = 14,
  topK: number = 30,
  windowDays: number = 60,
  payoutVnd: number = 600_000  // VND won per appearance (3 chân ratio)
): Promise<ThreeBacktestResult> {
  const dateRows = await query<{ date: string }>(
    `SELECT DISTINCT date FROM lottery_results
     WHERE region = ? AND LENGTH(number) >= 3
     ORDER BY date DESC LIMIT ?`,
    [region, days]
  );
  const dates = dateRows.map((r) => r.date).reverse();

  const dayResults: ThreeBacktestDay[] = [];

  // Tier accumulators (chunks of 10 within topK)
  const tierDefs = buildTiers(topK);
  const tierAcc: Map<number, {
    hits: number;
    occ: number;
    daysCounted: number;
    hitMap: Map<string, { days: number; occ: number }>;  // number → days_hit + total_occ
  }> = new Map();
  for (const t of tierDefs) tierAcc.set(t.start, { hits: 0, occ: 0, daysCounted: 0, hitMap: new Map() });

  for (const date of dates) {
    const r = await predictThreeDigit(region, windowDays, date);
    if (r.warning || r.predictions.length === 0) continue;

    const topPicks = r.predictions.slice(0, topK).map((p) => p.number);
    const occMap = await getThreeDigitOccurrencesOnDate(region, date);
    const hitPicks = topPicks.filter((n) => (occMap.get(n) ?? 0) > 0);
    const totalOcc = hitPicks.reduce((s, n) => s + (occMap.get(n) ?? 0), 0);

    const hit = hitPicks.length;
    const actualCount = occMap.size;
    const cost = topK * POINT_COST_VND_THREE;
    const win = totalOcc * payoutVnd;
    const profit = win - cost;

    // Per-tier accumulation (also track which numbers hit + how often)
    for (const t of tierDefs) {
      const tierPicks = topPicks.slice(t.start - 1, t.end);
      let tHits = 0;
      let tOcc = 0;
      const acc = tierAcc.get(t.start)!;
      for (const n of tierPicks) {
        const c = occMap.get(n) ?? 0;
        if (c > 0) {
          tHits++;
          tOcc += c;
          const prev = acc.hitMap.get(n);
          if (prev) {
            prev.days++;
            prev.occ += c;
          } else {
            acc.hitMap.set(n, { days: 1, occ: c });
          }
        }
      }
      acc.hits += tHits;
      acc.occ += tOcc;
      acc.daysCounted++;
    }

    dayResults.push({
      date,
      predicted_top: topPicks,
      actual_count: actualCount,
      hits: hit,
      hit_picks: hitPicks,
      total_occurrences: totalOcc,
      hit_rate_pct: topK > 0 ? Math.round((hit / topK) * 10000) / 100 : 0,
      coverage_pct: actualCount > 0 ? Math.round((hit / actualCount) * 10000) / 100 : 0,
      cost_vnd: cost,
      win_vnd: win,
      profit_vnd: profit,
    });
  }

  // Finalize tier stats
  const tiers: ThreeTierStat[] = tierDefs.map((t) => {
    const acc = tierAcc.get(t.start)!;
    const picksPerDay = t.end - t.start + 1;
    const totalPred = picksPerDay * acc.daysCounted;
    const tCost = totalPred * POINT_COST_VND_THREE;
    const tWin = acc.occ * payoutVnd;
    const tProfit = tWin - tCost;
    const hitNumbers = Array.from(acc.hitMap.entries())
      .map(([n, v]) => ({ number: n, days_hit: v.days, total_occ: v.occ }))
      .sort((a, b) => b.total_occ - a.total_occ || b.days_hit - a.days_hit);
    return {
      range_start: t.start,
      range_end: t.end,
      label: t.label,
      picks_per_day: picksPerDay,
      total_predicted: totalPred,
      total_hits: acc.hits,
      total_occurrences: acc.occ,
      hit_rate_pct: totalPred > 0 ? Math.round((acc.hits / totalPred) * 10000) / 100 : 0,
      cost_vnd: tCost,
      win_vnd: tWin,
      profit_vnd: tProfit,
      roi_pct: tCost > 0 ? Math.round((tProfit / tCost) * 10000) / 100 : 0,
      hit_numbers: hitNumbers,
    };
  });

  const totalPredicted = dayResults.length * topK;
  const totalHits = dayResults.reduce((s, d) => s + d.hits, 0);
  const totalOcc = dayResults.reduce((s, d) => s + d.total_occurrences, 0);
  const totalActual = dayResults.reduce((s, d) => s + d.actual_count, 0);
  const baseline = (topK / 1000) * 100;
  const hitRate = totalPredicted > 0 ? (totalHits / totalPredicted) * 100 : 0;
  const coverage = totalActual > 0 ? (totalHits / totalActual) * 100 : 0;

  const totalCost = dayResults.reduce((s, d) => s + d.cost_vnd, 0);
  const totalWin = dayResults.reduce((s, d) => s + d.win_vnd, 0);
  const totalProfit = totalWin - totalCost;
  const roi = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const breakEvenOcc = payoutVnd > 0 ? (topK * POINT_COST_VND_THREE) / payoutVnd : 0;

  return {
    region,
    days_window: days,
    top_k: topK,
    total_models: 4,
    baseline_pct: Math.round(baseline * 100) / 100,
    payout_per_hit_vnd: payoutVnd,
    cost_per_pick_vnd: POINT_COST_VND_THREE,
    total_predicted: totalPredicted,
    total_hits: totalHits,
    total_occurrences: totalOcc,
    total_actual: totalActual,
    hit_rate_pct: Math.round(hitRate * 100) / 100,
    coverage_pct: Math.round(coverage * 100) / 100,
    lift_vs_baseline: baseline > 0 ? Math.round((hitRate / baseline) * 100) / 100 : 0,
    total_cost_vnd: totalCost,
    total_win_vnd: totalWin,
    total_profit_vnd: totalProfit,
    roi_pct: Math.round(roi * 100) / 100,
    break_even_occurrences_per_day: Math.round(breakEvenOcc * 100) / 100,
    tiers,
    days: dayResults,
  };
}
