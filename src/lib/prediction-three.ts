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

/** Distinct 3-digit numbers that appeared on a specific date. */
async function getThreeDigitsOnDate(region: Region, date: string): Promise<Set<string>> {
  const rows = await query<{ number: string }>(
    `SELECT DISTINCT number FROM lottery_results
     WHERE region = ? AND date = ? AND LENGTH(number) >= 3`,
    [region, date]
  );
  return new Set(rows.map((r) => r.number.slice(-3).padStart(3, "0")));
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

function modelFrequency(history: DateMap): Record<string, number> {
  const counts = emptyScores();
  const dates = Object.keys(history);
  if (dates.length === 0) return counts;
  for (const date of dates) {
    for (const [num, c] of Object.entries(history[date])) {
      counts[num] = (counts[num] ?? 0) + c;
    }
  }
  for (const n of ALL_THREE) counts[n] /= dates.length;
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

export interface ThreeDigitItem {
  rank: number;
  number: string;
  probability: number;
  composite_score: number;
  breakdown: Record<string, number>;
}

export interface ThreeDigitResult {
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  weights: Record<string, number>;
  predictions: ThreeDigitItem[];
}

const WEIGHTS: Record<string, number> = {
  frequency: 0.40,
  recency: 0.30,
  dayOfWeek: 0.15,
  temperature: 0.15,
};

export async function predictThreeDigit(
  region: Region,
  windowDays: number = 60,
  endDate?: string  // For backtest: use only data strictly BEFORE this date
): Promise<ThreeDigitResult> {
  const history = await loadThreeHistory(region, windowDays, endDate);
  const daysAvailable = Object.keys(history).length;

  if (daysAvailable < 5) {
    return {
      region,
      window_days: windowDays,
      days_available: daysAvailable,
      warning: "Cần ít nhất 5 ngày dữ liệu",
      weights: WEIGHTS,
      predictions: [],
    };
  }

  const raw: Record<string, Record<string, number>> = {
    frequency: modelFrequency(history),
    recency: modelRecency(history),
    dayOfWeek: modelDayOfWeek(history),
    temperature: modelTemperature(history),
  };
  const norm: Record<string, Record<string, number>> = {};
  for (const [k, m] of Object.entries(raw)) norm[k] = normalize(m);

  const composite = emptyScores();
  for (const [k, m] of Object.entries(norm)) {
    const w = WEIGHTS[k] ?? 0;
    for (const n of ALL_THREE) composite[n] += w * m[n];
  }
  // Softer softmax — 1000-space is very sparse, need diffuse distribution
  const probs = softmax(composite, 0.10);

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

  return {
    region,
    window_days: windowDays,
    days_available: daysAvailable,
    weights: WEIGHTS,
    predictions: items,
  };
}

// ─────────────────────────────────────────────
// BACKTEST: replay top-K 3-digit predictions across last N days
// ─────────────────────────────────────────────

export interface ThreeBacktestDay {
  date: string;
  predicted_top: string[];
  actual_count: number;       // distinct 3-digit numbers that came that day
  hits: number;               // # of top_k picks that appeared
  hit_picks: string[];
  hit_rate_pct: number;       // hits / top_k × 100 (accuracy of our picks)
  coverage_pct: number;       // hits / actual_count × 100 (how much of actual we captured)
}

export interface ThreeBacktestResult {
  region: Region;
  days_window: number;
  top_k: number;
  total_models: number;       // for label
  baseline_pct: number;       // random expectation: top_k/1000 × 100
  // Aggregate
  total_predicted: number;    // sum of top_k across days
  total_hits: number;
  total_actual: number;       // sum of actual_count
  hit_rate_pct: number;       // total_hits / total_predicted × 100
  coverage_pct: number;       // total_hits / total_actual × 100
  lift_vs_baseline: number;   // hit_rate / baseline (1.0 = same as random)
  // Per-day
  days: ThreeBacktestDay[];
}

export async function backtestThreeDigit(
  region: Region,
  days: number = 14,
  topK: number = 30,
  windowDays: number = 60
): Promise<ThreeBacktestResult> {
  const dateRows = await query<{ date: string }>(
    `SELECT DISTINCT date FROM lottery_results
     WHERE region = ? AND LENGTH(number) >= 3
     ORDER BY date DESC LIMIT ?`,
    [region, days]
  );
  const dates = dateRows.map((r) => r.date).reverse();

  const dayResults: ThreeBacktestDay[] = [];

  for (const date of dates) {
    const r = await predictThreeDigit(region, windowDays, date);
    if (r.warning || r.predictions.length === 0) continue;

    const topPicks = r.predictions.slice(0, topK).map((p) => p.number);
    const actual = await getThreeDigitsOnDate(region, date);
    const hitPicks = topPicks.filter((n) => actual.has(n));

    const hit = hitPicks.length;
    const actualCount = actual.size;

    dayResults.push({
      date,
      predicted_top: topPicks,
      actual_count: actualCount,
      hits: hit,
      hit_picks: hitPicks,
      hit_rate_pct: topK > 0 ? Math.round((hit / topK) * 10000) / 100 : 0,
      coverage_pct: actualCount > 0 ? Math.round((hit / actualCount) * 10000) / 100 : 0,
    });
  }

  const totalPredicted = dayResults.length * topK;
  const totalHits = dayResults.reduce((s, d) => s + d.hits, 0);
  const totalActual = dayResults.reduce((s, d) => s + d.actual_count, 0);
  const baseline = (topK / 1000) * 100; // % chance a random pick is in actual
  const hitRate = totalPredicted > 0 ? (totalHits / totalPredicted) * 100 : 0;
  const coverage = totalActual > 0 ? (totalHits / totalActual) * 100 : 0;

  return {
    region,
    days_window: days,
    top_k: topK,
    total_models: 4,
    baseline_pct: Math.round(baseline * 100) / 100,
    total_predicted: totalPredicted,
    total_hits: totalHits,
    total_actual: totalActual,
    hit_rate_pct: Math.round(hitRate * 100) / 100,
    coverage_pct: Math.round(coverage * 100) / 100,
    lift_vs_baseline: baseline > 0 ? Math.round((hitRate / baseline) * 100) / 100 : 0,
    days: dayResults,
  };
}
