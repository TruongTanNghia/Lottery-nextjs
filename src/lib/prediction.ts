/**
 * Probability Prediction Engine — port of backend/prediction.py
 *
 * 7-model statistical ensemble:
 *  1. Frequency       — long-window appearance rate
 *  2. Recency         — EWMA, half-life 7 days
 *  3. Poisson Gap     — overdue probability
 *  4. Markov          — P(lô X | lô set hôm qua)
 *  5. Temperature     — z-score hot vs cold
 *  6. Pair            — co-occurrence
 *  7. Streak          — consecutive boost
 *
 * Final = weighted ensemble → softmax (T=0.15)
 */
import { exec, getLoAppearedOnDate, query, type Region } from "./db";
import { POINT_VALUE, WIN_MULTIPLIER } from "./limit-engine";

type DateMap = Record<string, Record<string, number>>; // date → {lo: count}

const ALL_LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

// ─────────────────────────────────────────────
// Per-region tuning. MN baseline preserved bit-for-bit; MB/MT retuned
// because they perform much worse with one-size-fits-all params.
//
//   MB: 27 lô/draw, daily, single province → more data per day, stable.
//       Lean on frequency/markov; day-of-week meaningless (always same province).
//
//   MT: 18 lô/draw, 2-3 provinces rotating BY DAY-OF-WEEK → DoW is THE key signal.
//       Recency is misleading (provinces change), streak/markov weaker cross-day.
//
//   For weak regions also: softer softmax + shrinkage toward uniform to
//   avoid placing too much confidence in noisy patterns.
// ─────────────────────────────────────────────
interface RegionParams {
  vipWeights: Record<string, number>;
  baseWeights: Record<string, number>;
  softmaxT: number;
  recencyHalfLife: number;
  shrinkage: number;
}
const REGION_PARAMS: Record<"xsmn" | "xsmb" | "xsmt", RegionParams> = {
  xsmn: {
    vipWeights: {
      frequency: 0.17, recency: 0.22, poisson: 0.13, markov: 0.10,
      temperature: 0.10, pair: 0.09, streak: 0.09, mirror: 0.05, dayOfWeek: 0.05,
      provinceOfDay: 0.00,
    },
    baseWeights: {
      frequency: 0.20, recency: 0.25, poisson: 0.15, markov: 0.10,
      temperature: 0.10, pair: 0.10, streak: 0.10,
    },
    softmaxT: 0.15,
    recencyHalfLife: 7,
    shrinkage: 0,
  },
  xsmb: {
    vipWeights: {
      frequency: 0.22, recency: 0.20, poisson: 0.13, markov: 0.14,
      temperature: 0.10, pair: 0.08, streak: 0.10, mirror: 0.03, dayOfWeek: 0.00,
      provinceOfDay: 0.00,
    },
    baseWeights: {
      frequency: 0.26, recency: 0.22, poisson: 0.15, markov: 0.14,
      temperature: 0.10, pair: 0.08, streak: 0.05,
    },
    softmaxT: 0.20,
    recencyHalfLife: 10,
    shrinkage: 0.15,
  },
  xsmt: {
    // Province-of-Day is the primary signal (30%) — it's a refinement of
    // dayOfWeek that filters out off-schedule draws. dayOfWeek kept at 10%
    // as a back-up for weekdays with sparse province history.
    vipWeights: {
      frequency: 0.12, recency: 0.10, poisson: 0.08, markov: 0.05,
      temperature: 0.07, pair: 0.08, streak: 0.05, mirror: 0.05, dayOfWeek: 0.10,
      provinceOfDay: 0.30,
    },
    baseWeights: {
      frequency: 0.30, recency: 0.18, poisson: 0.13, markov: 0.05,
      temperature: 0.10, pair: 0.14, streak: 0.10,
    },
    softmaxT: 0.25,
    recencyHalfLife: 5,
    shrinkage: 0.25,
  },
};

/** Pull region-specific params (with type-safe fallback to MN). */
function regionParams(region: Region): RegionParams {
  return REGION_PARAMS[region] ?? REGION_PARAMS.xsmn;
}

/** Bayesian shrinkage toward uniform — caps confidence for noisy regions. */
function applyShrinkage(scores: Record<string, number>, shrink: number): Record<string, number> {
  if (shrink <= 0) return scores;
  const vals = Object.values(scores);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const out: Record<string, number> = {};
  for (const lo of ALL_LOS) out[lo] = (1 - shrink) * scores[lo] + shrink * avg;
  return out;
}

// ─────────────────────────────────────────────
// Data loader
// ─────────────────────────────────────────────

async function loadHistory(
  region: Region,
  days: number = 60,
  endDate?: string   // YYYY-MM-DD; if provided, only data BEFORE this date.
                     // If omitted (forward prediction), use ALL recent data
                     // including today.
): Promise<DateMap> {
  let rows: { date: string; lo_number: string; count: number }[];

  if (endDate) {
    // Historical replay: data strictly BEFORE endDate (don't peek at target day)
    const [ey, em, ed] = endDate.split("-").map(Number);
    const endMs = Date.UTC(ey, em - 1, ed);
    const startMs = endMs - days * 86_400_000;
    const startStr = new Date(startMs).toISOString().slice(0, 10);
    rows = await query<{ date: string; lo_number: string; count: number }>(
      `SELECT date, lo_number, count FROM lo_daily
       WHERE region = ? AND date >= ? AND date < ?
       ORDER BY date ASC`,
      [region, startStr, endDate]
    );
  } else {
    // Forward prediction: include all recent data up to and including today
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    rows = await query<{ date: string; lo_number: string; count: number }>(
      `SELECT date, lo_number, count FROM lo_daily
       WHERE region = ? AND date >= ?
       ORDER BY date ASC`,
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

// Province-level history for MT (and any region we want province granularity).
// Each lottery_results row is a single prize drawing → multiple rows per draw,
// one lo_number per row. We store them all per (date, province) so we can
// count repetitions when computing Province-of-Day frequencies.
type ProvinceMap = Record<string, Record<string, string[]>>;

async function loadProvinceHistory(
  region: Region,
  days: number = 60,
  endDate?: string
): Promise<ProvinceMap> {
  let rows: { date: string; province: string; lo_number: string }[];
  if (endDate) {
    const [ey, em, ed] = endDate.split("-").map(Number);
    const endMs = Date.UTC(ey, em - 1, ed);
    const startStr = new Date(endMs - days * 86_400_000).toISOString().slice(0, 10);
    rows = await query<{ date: string; province: string; lo_number: string }>(
      `SELECT date, province, lo_number FROM lottery_results
       WHERE region = ? AND date >= ? AND date < ?`,
      [region, startStr, endDate]
    );
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    rows = await query<{ date: string; province: string; lo_number: string }>(
      `SELECT date, province, lo_number FROM lottery_results
       WHERE region = ? AND date >= ?`,
      [region, cutoffStr]
    );
  }
  const out: ProvinceMap = {};
  for (const r of rows) {
    if (!out[r.date]) out[r.date] = {};
    if (!out[r.date][r.province]) out[r.date][r.province] = [];
    out[r.date][r.province].push(r.lo_number);
  }
  return out;
}

function emptyScores(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lo of ALL_LOS) out[lo] = 0;
  return out;
}

// ─────────────────────────────────────────────
// Model 1: Frequency
// ─────────────────────────────────────────────

function modelFrequency(history: DateMap): Record<string, number> {
  const totalDays = Math.max(1, Object.keys(history).length);
  const counts = emptyScores();
  for (const day of Object.values(history)) {
    for (const lo of Object.keys(day)) counts[lo] += 1;
  }
  const out: Record<string, number> = {};
  for (const lo of ALL_LOS) out[lo] = counts[lo] / totalDays;
  return out;
}

// ─────────────────────────────────────────────
// Model 2: Recency (EWMA)
// ─────────────────────────────────────────────

function modelRecency(history: DateMap, halfLife: number = 7): Record<string, number> {
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return emptyScores();

  const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");
  const decay = Math.log(2) / halfLife;

  const counts = emptyScores();
  let weightSum = 0;

  for (const dateStr of dates) {
    const d = new Date(dateStr + "T00:00:00");
    const age = (lastDate.getTime() - d.getTime()) / 86_400_000;
    const w = Math.exp(-decay * age);
    weightSum += w;
    for (const lo of Object.keys(history[dateStr])) counts[lo] += w;
  }

  if (weightSum === 0) return emptyScores();
  const out: Record<string, number> = {};
  for (const lo of ALL_LOS) out[lo] = counts[lo] / weightSum;
  return out;
}

// ─────────────────────────────────────────────
// Model 3: Poisson Gap
// ─────────────────────────────────────────────

function modelPoissonGap(history: DateMap): Record<string, number> {
  const base = modelFrequency(history);
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return emptyScores();

  const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");
  const lastSeen: Record<string, Date> = {};
  for (const dateStr of dates) {
    const d = new Date(dateStr + "T00:00:00");
    for (const lo of Object.keys(history[dateStr])) lastSeen[lo] = d;
  }

  const out: Record<string, number> = {};
  for (const lo of ALL_LOS) {
    const rate = base[lo];
    if (rate <= 0) {
      out[lo] = 0;
      continue;
    }
    let gap: number;
    if (lo in lastSeen) {
      gap = (lastDate.getTime() - lastSeen[lo].getTime()) / 86_400_000 + 1;
    } else {
      gap = dates.length;
    }
    out[lo] = 1 - Math.exp(-rate * gap);
  }
  return out;
}

// ─────────────────────────────────────────────
// Model 4: Markov (1-day lag transition)
// ─────────────────────────────────────────────

function modelMarkov(history: DateMap): Record<string, number> {
  const dates = Object.keys(history).sort();
  if (dates.length < 2) return emptyScores();

  const transitions: Record<string, Record<string, number>> = {};
  const fromTotals: Record<string, number> = {};

  for (let i = 0; i < dates.length - 1; i++) {
    const todaySet = Object.keys(history[dates[i]]);
    const nextSet = Object.keys(history[dates[i + 1]]);
    for (const f of todaySet) {
      fromTotals[f] = (fromTotals[f] ?? 0) + 1;
      if (!transitions[f]) transitions[f] = {};
      for (const t of nextSet) {
        transitions[f][t] = (transitions[f][t] ?? 0) + 1;
      }
    }
  }

  const lastSet = Object.keys(history[dates[dates.length - 1]]);
  if (lastSet.length === 0) return emptyScores();

  const sum: Record<string, number> = emptyScores();
  for (const f of lastSet) {
    const denom = fromTotals[f] ?? 0;
    if (denom === 0) continue;
    for (const t of ALL_LOS) {
      sum[t] += (transitions[f]?.[t] ?? 0) / denom;
    }
  }

  const n = lastSet.length;
  const out: Record<string, number> = {};
  for (const lo of ALL_LOS) out[lo] = sum[lo] / n;
  return out;
}

// ─────────────────────────────────────────────
// Model 5: Temperature (z-score)
// ─────────────────────────────────────────────

function modelTemperature(history: DateMap, window: number = 7): Record<string, number> {
  const dates = Object.keys(history).sort();
  if (dates.length === 0) {
    const out: Record<string, number> = {};
    for (const lo of ALL_LOS) out[lo] = 0.5;
    return out;
  }

  const recentDates = dates.slice(-window);
  const recentHistory: DateMap = {};
  for (const d of recentDates) recentHistory[d] = history[d];

  const recentFreq = modelFrequency(recentHistory);
  const baseFreq = modelFrequency(history);

  const baseValues = Object.values(baseFreq);
  const meanB = baseValues.reduce((a, b) => a + b, 0) / baseValues.length;
  const varB =
    baseValues.reduce((sum, x) => sum + Math.pow(x - meanB, 2), 0) /
    Math.max(1, baseValues.length - 1);
  const stdB = varB > 0 ? Math.sqrt(varB) : 1e-9;

  const out: Record<string, number> = {};
  for (const lo of ALL_LOS) {
    const z = (recentFreq[lo] - baseFreq[lo]) / stdB;
    out[lo] = 1 / (1 + Math.exp(-z));
  }
  return out;
}

// ─────────────────────────────────────────────
// Model 6: Pair co-occurrence
// ─────────────────────────────────────────────

function modelPair(history: DateMap): Record<string, number> {
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return emptyScores();

  const coOccur: Record<string, Record<string, number>> = {};
  const appearances: Record<string, number> = {};

  for (const date of dates) {
    const daySet = Object.keys(history[date]);
    for (const lo of daySet) {
      appearances[lo] = (appearances[lo] ?? 0) + 1;
    }
    for (let i = 0; i < daySet.length; i++) {
      for (let j = 0; j < daySet.length; j++) {
        if (i === j) continue;
        if (!coOccur[daySet[i]]) coOccur[daySet[i]] = {};
        coOccur[daySet[i]][daySet[j]] = (coOccur[daySet[i]][daySet[j]] ?? 0) + 1;
      }
    }
  }

  const lastSet = Object.keys(history[dates[dates.length - 1]]);
  if (lastSet.length === 0) return emptyScores();

  const sum: Record<string, number> = emptyScores();
  for (const partner of lastSet) {
    const denom = appearances[partner] ?? 0;
    if (denom === 0) continue;
    for (const lo of ALL_LOS) {
      sum[lo] += (coOccur[partner]?.[lo] ?? 0) / denom;
    }
  }

  const n = lastSet.length;
  const out: Record<string, number> = {};
  for (const lo of ALL_LOS) out[lo] = sum[lo] / n;
  return out;
}

// ─────────────────────────────────────────────
// Model 8: Mirror Pair (kép đảo: 12↔21, 36↔63...)
// ─────────────────────────────────────────────

function mirrorOf(lo: string): string {
  return lo[1] + lo[0];
}

function modelMirror(history: DateMap): Record<string, number> {
  if (Object.keys(history).length === 0) return emptyScores();
  const base = modelFrequency(history);
  // Score for X = freq of mirror(X) — if mirror is hot, boost X
  const out: Record<string, number> = {};
  for (const lo of ALL_LOS) {
    out[lo] = base[mirrorOf(lo)] ?? 0;
  }
  return out;
}

// ─────────────────────────────────────────────
// Model 9: Day-of-Week (lô hay về cùng thứ trong tuần)
// ─────────────────────────────────────────────

function modelDayOfWeek(history: DateMap): Record<string, number> {
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return emptyScores();

  const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");
  const tomorrow = new Date(lastDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDow = tomorrow.getDay(); // 0=Sun ... 6=Sat

  const counts = emptyScores();
  let matchingDays = 0;
  for (const dateStr of dates) {
    const d = new Date(dateStr + "T00:00:00");
    if (d.getDay() !== targetDow) continue;
    matchingDays++;
    for (const lo of Object.keys(history[dateStr])) counts[lo] += 1;
  }

  if (matchingDays === 0) return emptyScores();
  const out: Record<string, number> = {};
  for (const lo of ALL_LOS) out[lo] = counts[lo] / matchingDays;
  return out;
}

// ─────────────────────────────────────────────
// Model 10: Province-of-Day (MT-specific)
//
// MT has 2-3 provinces rotating BY day-of-week. Plain dayOfWeek model is
// noisy because:
//   - With 30 days of data, only ~4 samples per weekday
//   - Off-schedule draws (different province on a given weekday) pollute counts
//
// This model:
//   1. Determines target weekday
//   2. Finds "canonical" provinces — those that appear on ≥40% of matching
//      weekdays (anomalous schedule changes get excluded)
//   3. Counts lô appearances ONLY in (matching weekday × canonical province)
//      draws → more focused signal
//
// For MN/MB this returns zeros (their weight is 0% anyway).
// ─────────────────────────────────────────────

function modelProvinceOfDay(
  provinceHistory: ProvinceMap,
  region: Region
): Record<string, number> {
  const out = emptyScores();
  if (region !== "xsmt") return out;

  const dates = Object.keys(provinceHistory).sort();
  if (dates.length === 0) return out;

  // Target = day AFTER latest date (forward prediction)
  const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");
  const tomorrow = new Date(lastDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDow = tomorrow.getDay();

  // Step 1: matching-weekday dates + per-province frequency
  const matchingDates: string[] = [];
  const provinceFreq = new Map<string, number>();
  for (const date of dates) {
    const d = new Date(date + "T00:00:00");
    if (d.getDay() !== targetDow) continue;
    matchingDates.push(date);
    const provs = Object.keys(provinceHistory[date] ?? {});
    for (const p of provs) provinceFreq.set(p, (provinceFreq.get(p) ?? 0) + 1);
  }
  if (matchingDates.length === 0) return out;

  // Step 2: canonical = provinces drawing on ≥40% of matching weekdays
  const minPresence = Math.max(2, Math.floor(matchingDates.length * 0.4));
  const canonical = new Set<string>();
  for (const [p, c] of provinceFreq.entries()) {
    if (c >= minPresence) canonical.add(p);
  }
  // Fallback when data is sparse: just use all observed provinces
  const useProvinces = canonical.size > 0 ? canonical : new Set(provinceFreq.keys());

  // Step 3: count lô appearances within (matching weekday × canonical province)
  let totalDraws = 0;
  for (const date of matchingDates) {
    const day = provinceHistory[date] ?? {};
    for (const p of useProvinces) {
      const los = day[p];
      if (!los) continue;
      totalDraws++;
      for (const lo of los) out[lo] = (out[lo] ?? 0) + 1;
    }
  }

  if (totalDraws === 0) return out;
  for (const lo of ALL_LOS) out[lo] = (out[lo] ?? 0) / totalDraws;
  return out;
}

// ─────────────────────────────────────────────
// Model 7: Streak boost
// ─────────────────────────────────────────────

function modelStreak(history: DateMap): Record<string, number> {
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return emptyScores();

  const out: Record<string, number> = {};
  for (const lo of ALL_LOS) {
    let streak = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
      if (lo in history[dates[i]]) streak += 1;
      else break;
    }
    if (streak === 0) out[lo] = 0;
    else if (streak === 1) out[lo] = 0.3;
    else if (streak === 2) out[lo] = 0.55;
    else if (streak === 3) out[lo] = 0.75;
    else out[lo] = 0.9;
  }
  return out;
}

// ─────────────────────────────────────────────
// Combine: min-max norm + weighted + softmax
// ─────────────────────────────────────────────

function normalize(scores: Record<string, number>): Record<string, number> {
  const vals = Object.values(scores);
  if (vals.length === 0) return scores;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  if (hi - lo < 1e-12) {
    const out: Record<string, number> = {};
    for (const k of Object.keys(scores)) out[k] = 0.5;
    return out;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) out[k] = (v - lo) / (hi - lo);
  return out;
}

function softmax(scores: Record<string, number>, temperature: number = 0.15): Record<string, number> {
  const T = Math.max(1e-6, temperature);
  const vals = Object.values(scores).map((v) => v / T);
  const maxV = Math.max(...vals);
  const exps = vals.map((v) => Math.exp(v - maxV));
  const sum = exps.reduce((a, b) => a + b, 0);
  const keys = Object.keys(scores);
  const out: Record<string, number> = {};
  keys.forEach((k, i) => {
    out[k] = exps[i] / sum;
  });
  return out;
}

// ─────────────────────────────────────────────
// Public: predict
// ─────────────────────────────────────────────

export interface PredictionItem {
  rank: number;
  lo_number: string;
  probability: number;        // %
  composite_score: number;
  confidence: number;         // %
  breakdown: Record<string, number>;
}

export interface PredictionResult {
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  model_weights?: Record<string, number>;
  top_lift?: number;
  predictions: PredictionItem[];
}

export async function predict(
  region: Region,
  windowDays: number = 60,
  endDate?: string   // YYYY-MM-DD; predictions use data strictly BEFORE this date
): Promise<PredictionResult> {
  const history = await loadHistory(region, windowDays, endDate);
  const daysAvailable = Object.keys(history).length;

  if (daysAvailable < 5) {
    return {
      region,
      window_days: windowDays,
      days_available: daysAvailable,
      warning: "Cần ít nhất 5 ngày dữ liệu để dự đoán",
      predictions: [],
    };
  }

  const params = regionParams(region);
  const models = {
    frequency: modelFrequency(history),
    recency: modelRecency(history, params.recencyHalfLife),
    poisson: modelPoissonGap(history),
    markov: modelMarkov(history),
    temperature: modelTemperature(history),
    pair: modelPair(history),
    streak: modelStreak(history),
  };
  const normModels: Record<string, Record<string, number>> = {};
  for (const [name, m] of Object.entries(models)) {
    normModels[name] = normalize(m);
  }

  // Weighted ensemble using region-specific base weights
  const composite: Record<string, number> = emptyScores();
  for (const [name, m] of Object.entries(normModels)) {
    const w = params.baseWeights[name] ?? 0;
    for (const lo of ALL_LOS) composite[lo] += w * m[lo];
  }

  const smoothed = applyShrinkage(composite, params.shrinkage);
  const probs = softmax(smoothed, params.softmaxT);

  // Confidence from variance across models
  const confidence: Record<string, number> = {};
  for (const lo of ALL_LOS) {
    const scores = Object.values(normModels).map((m) => m[lo]);
    const meanS = scores.reduce((a, b) => a + b, 0) / scores.length;
    const varS = scores.reduce((s, v) => s + Math.pow(v - meanS, 2), 0) / scores.length;
    confidence[lo] = 1 - Math.sqrt(varS);
  }

  const items: PredictionItem[] = ALL_LOS.map((lo) => ({
    rank: 0,
    lo_number: lo,
    probability: Math.round(probs[lo] * 100 * 10000) / 10000,
    composite_score: Math.round(composite[lo] * 10000) / 10000,
    confidence: Math.round(confidence[lo] * 100 * 10) / 10,
    breakdown: Object.fromEntries(
      Object.entries(normModels).map(([k, m]) => [k, Math.round(m[lo] * 10000) / 10000])
    ),
  }));

  items.sort((a, b) => b.probability - a.probability);
  items.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  const topLift = items[0].probability / 1.0; // uniform = 1%

  return {
    region,
    window_days: windowDays,
    days_available: daysAvailable,
    model_weights: params.baseWeights,
    top_lift: Math.round(topLift * 100) / 100,
    predictions: items,
  };
}

// ─────────────────────────────────────────────
// VIP Prediction — 9 models, max parameters, per-model rankings
// ─────────────────────────────────────────────

const MODEL_META: Record<string, { label: string; description: string; question: string }> = {
  frequency: {
    label: "Frequency",
    description: "Tần suất tổng thể trong window",
    question: "Lô nào lâu nay về NHIỀU?",
  },
  recency: {
    label: "Recency EWMA",
    description: "Tần suất ưu tiên gần đây (half-life 7 ngày)",
    question: "Lô nào về nhiều GẦN ĐÂY?",
  },
  poisson: {
    label: "Poisson Gap",
    description: "Xác suất overdue: P = 1 - e^(-rate × gap)",
    question: "Lô nào ĐANG QUÁ HẠN, sắp về?",
  },
  markov: {
    label: "Markov 1-day",
    description: "Transition: P(lô X ngày sau | lô set hôm qua)",
    question: "Sau lô Y, lô nào HAY về tiếp?",
  },
  temperature: {
    label: "Temperature",
    description: "Z-score: (recent - base) / std → sigmoid",
    question: "Lô nào đang HOT vượt baseline?",
  },
  pair: {
    label: "Pair Co-occurrence",
    description: "Co-occurrence với lô của hôm qua",
    question: "Lô nào hay đi CHUNG NHÓM với hôm qua?",
  },
  streak: {
    label: "Streak Boost",
    description: "Boost theo chuỗi liên tiếp (1-4 ngày)",
    question: "Lô đang về LIÊN TIẾP có nên đánh tiếp?",
  },
  mirror: {
    label: "Mirror Pair (kép đảo)",
    description: "Boost X nếu mirror(X) đang hot. VD: 36↔63, 12↔21",
    question: "Lô đảo của số hot có hay về theo?",
  },
  dayOfWeek: {
    label: "Day-of-Week Pattern",
    description: "Tần suất lô về cùng thứ trong tuần (so với target day)",
    question: "Lô nào hay về vào THỨ này?",
  },
  provinceOfDay: {
    label: "Province-of-Day (MT)",
    description: "Tần suất lô theo (thứ × tỉnh thường quay thứ đó) — chỉ MT",
    question: "Tỉnh nào hay quay thứ này, và lô nào hay về ở những tỉnh đó?",
  },
};

export interface ModelTopPick {
  rank: number;
  lo_number: string;
  raw_score: number;       // normalized 0..1
  norm_score: number;      // same as raw_score (kept for clarity)
}

export interface ModelBreakdown {
  key: string;
  label: string;
  description: string;
  question: string;
  weight: number;
  top_picks: ModelTopPick[];   // top 10 of THIS model
}

export interface VipPredictionResult {
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  model_weights: Record<string, number>;
  top_lift?: number;
  // Final ensemble (same as predict() but with 9 models)
  final: PredictionItem[];
  // Per-model rankings
  models: ModelBreakdown[];
  // Consensus: lô numbers appearing in top 10 of >= 5 models
  consensus: { lo_number: string; appearances_in_top10: number; models: string[] }[];
  // Controversial: lô numbers in only 1-2 models' top 10
  controversial: { lo_number: string; appearances_in_top10: number; models: string[] }[];
}

export async function predictVip(
  region: Region,
  windowDays: number = 30,  // 30 ngày gần nhất theo yêu cầu user
  endDate?: string          // If set, use only data strictly BEFORE this date (for backtest)
): Promise<VipPredictionResult> {
  const history = await loadHistory(region, windowDays, endDate);
  const daysAvailable = Object.keys(history).length;
  const params = regionParams(region);
  // Province history loaded only for MT (other regions don't use provinceOfDay)
  const provinceHistory = region === "xsmt"
    ? await loadProvinceHistory(region, windowDays, endDate)
    : {};

  if (daysAvailable < 5) {
    return {
      region,
      window_days: windowDays,
      days_available: daysAvailable,
      warning: "Cần ít nhất 5 ngày dữ liệu để dự đoán VIP",
      model_weights: params.vipWeights,
      final: [],
      models: [],
      consensus: [],
      controversial: [],
    };
  }

  const rawModels = {
    frequency: modelFrequency(history),
    recency: modelRecency(history, params.recencyHalfLife),
    poisson: modelPoissonGap(history),
    markov: modelMarkov(history),
    temperature: modelTemperature(history),
    pair: modelPair(history),
    streak: modelStreak(history),
    mirror: modelMirror(history),
    dayOfWeek: modelDayOfWeek(history),
    provinceOfDay: modelProvinceOfDay(provinceHistory, region),
  };

  const normModels: Record<string, Record<string, number>> = {};
  for (const [name, m] of Object.entries(rawModels)) {
    normModels[name] = normalize(m);
  }

  // Per-model top 10 picks — keep all 9 standard models (even with weight 0,
  // as informational); hide provinceOfDay for non-MT regions (it's MT-specific).
  const models: ModelBreakdown[] = Object.entries(normModels)
    .filter(([key]) => key !== "provinceOfDay" || region === "xsmt")
    .map(([key, scores]) => {
      const ranked = ALL_LOS.map((lo) => ({
        lo_number: lo,
        raw_score: scores[lo],
        norm_score: scores[lo],
      }))
        .sort((a, b) => b.norm_score - a.norm_score)
        .slice(0, 10)
        .map((p, idx) => ({ rank: idx + 1, ...p }));

      return {
        key,
        label: MODEL_META[key]?.label ?? key,
        description: MODEL_META[key]?.description ?? "",
        question: MODEL_META[key]?.question ?? "",
        weight: params.vipWeights[key] ?? 0,
        top_picks: ranked,
      };
    });

  // Final ensemble with region-specific VIP weights
  const composite: Record<string, number> = emptyScores();
  for (const [name, m] of Object.entries(normModels)) {
    const w = params.vipWeights[name] ?? 0;
    for (const lo of ALL_LOS) composite[lo] += w * m[lo];
  }
  const smoothed = applyShrinkage(composite, params.shrinkage);
  const probs = softmax(smoothed, params.softmaxT);

  const confidence: Record<string, number> = {};
  for (const lo of ALL_LOS) {
    const scores = Object.values(normModels).map((m) => m[lo]);
    const meanS = scores.reduce((a, b) => a + b, 0) / scores.length;
    const varS = scores.reduce((s, v) => s + Math.pow(v - meanS, 2), 0) / scores.length;
    confidence[lo] = 1 - Math.sqrt(varS);
  }

  const final: PredictionItem[] = ALL_LOS.map((lo) => ({
    rank: 0,
    lo_number: lo,
    probability: Math.round(probs[lo] * 100 * 10000) / 10000,
    composite_score: Math.round(composite[lo] * 10000) / 10000,
    confidence: Math.round(confidence[lo] * 100 * 10) / 10,
    breakdown: Object.fromEntries(
      Object.entries(normModels).map(([k, m]) => [k, Math.round(m[lo] * 10000) / 10000])
    ),
  }));
  final.sort((a, b) => b.probability - a.probability);
  final.forEach((p, idx) => { p.rank = idx + 1; });

  // Consensus & Controversial
  const top10ByModel: Record<string, Set<string>> = {};
  for (const m of models) {
    top10ByModel[m.key] = new Set(m.top_picks.map((p) => p.lo_number));
  }
  const appearancesPerLo: Record<string, string[]> = {};
  for (const lo of ALL_LOS) {
    appearancesPerLo[lo] = [];
    for (const [modelKey, set] of Object.entries(top10ByModel)) {
      if (set.has(lo)) appearancesPerLo[lo].push(modelKey);
    }
  }
  const allRanked = Object.entries(appearancesPerLo)
    .map(([lo, ms]) => ({ lo_number: lo, appearances_in_top10: ms.length, models: ms }))
    .filter((x) => x.appearances_in_top10 > 0)
    .sort((a, b) => b.appearances_in_top10 - a.appearances_in_top10);

  // Per-region consensus threshold:
  //   MN: ≥ 5/9 model agree (predictions are accurate here, keep strict)
  //   MT: ≥ 3/9 (weaker predictions — relax to surface enough candidates)
  //   MB: ≥ 4/9 (weaker than MN, slightly relaxed)
  const consensusThreshold: Record<Region, number> = { xsmn: 5, xsmt: 3, xsmb: 4 };
  const minAgree = consensusThreshold[region];
  const consensus = allRanked.filter((x) => x.appearances_in_top10 >= minAgree);
  // Partial agreement buckets always include 2, 3, 4 model-agree lô regardless
  // of region's consensus threshold — overlap with Consensus card is intentional
  // (Consensus shows ≥ threshold UNION; partial agreement shows per-count breakdown).
  // 1/9 is still dropped as too noisy.
  const controversial = allRanked.filter(
    (x) => x.appearances_in_top10 >= 2 && x.appearances_in_top10 <= 4
  );

  const topLift = final[0].probability / 1.0;

  return {
    region,
    window_days: windowDays,
    days_available: daysAvailable,
    model_weights: params.vipWeights,
    top_lift: Math.round(topLift * 100) / 100,
    final,
    models,
    consensus,
    controversial,
  };
}

// ─────────────────────────────────────────────
// ADAPTIVE PREDICTION — self-tuning weights from accuracy history
// ─────────────────────────────────────────────

const MODEL_KEYS = [
  "frequency", "recency", "poisson", "markov", "temperature",
  "pair", "streak", "mirror", "dayOfWeek", "provinceOfDay",
] as const;
type ModelKey = (typeof MODEL_KEYS)[number];

function runAllModels(
  history: DateMap,
  provinceHistory: ProvinceMap,
  region: Region,
  recencyHalfLife: number = 7
): Record<ModelKey, Record<string, number>> {
  return {
    frequency: modelFrequency(history),
    recency: modelRecency(history, recencyHalfLife),
    poisson: modelPoissonGap(history),
    markov: modelMarkov(history),
    temperature: modelTemperature(history),
    pair: modelPair(history),
    streak: modelStreak(history),
    mirror: modelMirror(history),
    dayOfWeek: modelDayOfWeek(history),
    provinceOfDay: modelProvinceOfDay(provinceHistory, region),
  };
}

/**
 * For a SINGLE target date, compute each model's top-N prediction using only
 * data BEFORE that date, compare to actual lô, and persist hit rates to DB.
 * Idempotent (PRIMARY KEY date+region+model+top_n + INSERT OR REPLACE).
 *
 * Called by daily cron after scrape: only computes for the freshly scraped day.
 */
export async function computeAndSaveModelPerformance(
  region: Region,
  targetDate: string,
  topN: number = 10,
  windowDays: number = 60
): Promise<{ saved: number; details?: Record<ModelKey, number> }> {
  const history = await loadHistory(region, windowDays, targetDate);
  if (Object.keys(history).length < 5) return { saved: 0 };

  const actual = await getLoAppearedOnDate(targetDate, region);
  if (actual.size === 0) return { saved: 0 };

  const provinceHistory = region === "xsmt"
    ? await loadProvinceHistory(region, windowDays, targetDate)
    : {};
  const baselineRate = actual.size / 100;
  const raw = runAllModels(history, provinceHistory, region, regionParams(region).recencyHalfLife);

  const details: Record<string, number> = {};
  for (const [modelName, scores] of Object.entries(raw) as [ModelKey, Record<string, number>][]) {
    const norm = normalize(scores);
    const topPicks = ALL_LOS
      .map((lo) => ({ lo, score: norm[lo] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map((p) => p.lo);

    const hits = topPicks.filter((lo) => actual.has(lo)).length;
    const hitRate = hits / topN;
    const lift = baselineRate > 0 ? hitRate / baselineRate : 0;

    await exec(
      `INSERT INTO model_performance
        (date, region, model_name, top_n, hit_count, total_lo_appeared, hit_rate, baseline_rate, lift)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, region, model_name, top_n) DO UPDATE SET
         hit_count = excluded.hit_count,
         total_lo_appeared = excluded.total_lo_appeared,
         hit_rate = excluded.hit_rate,
         baseline_rate = excluded.baseline_rate,
         lift = excluded.lift,
         created_at = CURRENT_TIMESTAMP`,
      [
        targetDate, region, modelName, topN,
        hits, actual.size, hitRate, baselineRate, lift,
      ]
    );
    details[modelName] = hitRate;
  }

  return { saved: 9, details: details as Record<ModelKey, number> };
}

/**
 * Backfill performance for last N days (used for initial bootstrap).
 */
export async function backfillModelPerformance(
  region: Region,
  days: number = 14,
  topN: number = 10
): Promise<{ days_processed: number }> {
  const dates = await query<{ date: string }>(
    "SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT ?",
    [region, days]
  );
  if (dates.length === 0) return { days_processed: 0 };

  let processed = 0;
  for (const { date } of dates.reverse()) {
    const r = await computeAndSaveModelPerformance(region, date, topN);
    if (r.saved > 0) processed++;
  }
  return { days_processed: processed };
}

/**
 * Read rolling avg hit rate per model over last N days.
 */
async function getAdaptiveWeights(
  region: Region,
  windowDays: number = 14,
  topN: number = 10,
  offsetDays: number = 0
): Promise<{
  weights: Record<ModelKey, number>;
  raw_hit_rates: Record<ModelKey, number>;
  days_with_data: number;
  avg_lift: number;
}> {
  const endMs = Date.now() - offsetDays * 86_400_000;
  const startMs = endMs - windowDays * 86_400_000;
  const startStr = new Date(startMs).toISOString().slice(0, 10);
  const endStr = new Date(endMs).toISOString().slice(0, 10);

  const rows = await query<{ model_name: string; avg_hit_rate: number; n_days: number }>(
    `SELECT model_name,
            AVG(hit_rate) as avg_hit_rate,
            COUNT(*) as n_days
     FROM model_performance
     WHERE region = ? AND top_n = ? AND date >= ? AND date < ?
     GROUP BY model_name`,
    [region, topN, startStr, endStr]
  );

  const liftRow = await query<{ avg_lift: number; days: number }>(
    `SELECT AVG(lift) as avg_lift, COUNT(DISTINCT date) as days
     FROM model_performance WHERE region = ? AND top_n = ? AND date >= ? AND date < ?`,
    [region, topN, startStr, endStr]
  );

  const rawRates: Record<ModelKey, number> = {} as Record<ModelKey, number>;
  for (const k of MODEL_KEYS) rawRates[k] = 0;

  for (const r of rows) {
    if (MODEL_KEYS.includes(r.model_name as ModelKey)) {
      rawRates[r.model_name as ModelKey] = r.avg_hit_rate ?? 0;
    }
  }

  // Weights = hit_rate normalized so they sum to 1.
  // If no data, fallback to equal weights.
  const totalRate = Object.values(rawRates).reduce((s, v) => s + v, 0);
  const weights: Record<ModelKey, number> = {} as Record<ModelKey, number>;
  if (totalRate > 0) {
    for (const k of MODEL_KEYS) weights[k] = rawRates[k] / totalRate;
  } else {
    for (const k of MODEL_KEYS) weights[k] = 1 / MODEL_KEYS.length;
  }

  return {
    weights,
    raw_hit_rates: rawRates,
    days_with_data: liftRow[0]?.days ?? 0,
    avg_lift: liftRow[0]?.avg_lift ?? 0,
  };
}

export interface AdaptivePredictionResult {
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  // Adaptive weights (sum to 1) — derived from rolling hit rates
  adaptive_weights: Record<ModelKey, number>;
  // Previous period's weights (for "was X%" trend display)
  previous_weights: Record<ModelKey, number>;
  // Raw avg hit rate per model (over performance window)
  raw_hit_rates: Record<ModelKey, number>;
  previous_hit_rates: Record<ModelKey, number>;
  performance_window_days: number;
  performance_days_with_data: number;
  previous_days_with_data: number;
  performance_avg_lift: number;
  using_default: boolean;   // true if not enough perf data → using equal weights
  predictions: PredictionItem[];
}

export async function predictAdaptive(
  region: Region,
  windowDays: number = 60,
  performanceWindow: number = 30
): Promise<AdaptivePredictionResult> {
  const history = await loadHistory(region, windowDays);
  const daysAvailable = Object.keys(history).length;

  if (daysAvailable < 5) {
    return {
      region,
      window_days: windowDays,
      days_available: daysAvailable,
      warning: "Cần ít nhất 5 ngày data để dự đoán",
      adaptive_weights: {} as Record<ModelKey, number>,
      previous_weights: {} as Record<ModelKey, number>,
      raw_hit_rates: {} as Record<ModelKey, number>,
      previous_hit_rates: {} as Record<ModelKey, number>,
      performance_window_days: performanceWindow,
      performance_days_with_data: 0,
      previous_days_with_data: 0,
      performance_avg_lift: 0,
      using_default: true,
      predictions: [],
    };
  }

  const adaptiveCfg = await getAdaptiveWeights(region, performanceWindow, 10, 0);
  const previousCfg = await getAdaptiveWeights(region, performanceWindow, 10, performanceWindow);
  const usingDefault = adaptiveCfg.days_with_data === 0;
  const params = regionParams(region);
  const provinceHistory = region === "xsmt"
    ? await loadProvinceHistory(region, windowDays)
    : {};

  const raw = runAllModels(history, provinceHistory, region, params.recencyHalfLife);
  const normModels: Record<ModelKey, Record<string, number>> = {} as Record<ModelKey, Record<string, number>>;
  for (const k of MODEL_KEYS) normModels[k] = normalize(raw[k]);

  const composite: Record<string, number> = emptyScores();
  for (const k of MODEL_KEYS) {
    const w = adaptiveCfg.weights[k];
    for (const lo of ALL_LOS) composite[lo] += w * normModels[k][lo];
  }

  const smoothed = applyShrinkage(composite, params.shrinkage);
  const probs = softmax(smoothed, params.softmaxT);

  const confidence: Record<string, number> = {};
  for (const lo of ALL_LOS) {
    const scores = MODEL_KEYS.map((k) => normModels[k][lo]);
    const meanS = scores.reduce((a, b) => a + b, 0) / scores.length;
    const varS = scores.reduce((s, v) => s + Math.pow(v - meanS, 2), 0) / scores.length;
    confidence[lo] = 1 - Math.sqrt(varS);
  }

  const predictions: PredictionItem[] = ALL_LOS.map((lo) => ({
    rank: 0,
    lo_number: lo,
    probability: Math.round(probs[lo] * 100 * 10000) / 10000,
    composite_score: Math.round(composite[lo] * 10000) / 10000,
    confidence: Math.round(confidence[lo] * 100 * 10) / 10,
    breakdown: Object.fromEntries(
      MODEL_KEYS.map((k) => [k, Math.round(normModels[k][lo] * 10000) / 10000])
    ),
  }));
  predictions.sort((a, b) => b.probability - a.probability);
  predictions.forEach((p, i) => { p.rank = i + 1; });

  return {
    region,
    window_days: windowDays,
    days_available: daysAvailable,
    adaptive_weights: adaptiveCfg.weights,
    previous_weights: previousCfg.weights,
    raw_hit_rates: adaptiveCfg.raw_hit_rates,
    previous_hit_rates: previousCfg.raw_hit_rates,
    performance_window_days: performanceWindow,
    performance_days_with_data: adaptiveCfg.days_with_data,
    previous_days_with_data: previousCfg.days_with_data,
    performance_avg_lift: Math.round(adaptiveCfg.avg_lift * 100) / 100,
    using_default: usingDefault,
    predictions,
  };
}

// ─────────────────────────────────────────────
// SCORECARD — historical accuracy + profit/loss + per-model recommendations
// ─────────────────────────────────────────────

export interface ScorecardDay {
  date: string;
  predicted_top: string[];
  hits: number;          // # picks that appeared at least once
  total_occurrences: number;  // sum of appearance counts (for win calc)
  actual_lo_count: number;    // total unique lô that appeared
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
  using_default: boolean;
}

export interface ModelScorecardRow {
  key: ModelKey;
  label: string;
  hit_rate_avg: number;       // avg over the window
  hit_rate_recent3: number;   // last 3 days only
  hit_rate_prev3: number;     // 3 days before that
  current_weight: number;
  rank: number;               // 1..9 by hit rate
  status: "good" | "ok" | "bad" | "no_data";
  trend: "up" | "down" | "flat";
  recommendation: string;     // human-readable action
  suggest_mute: boolean;
}

export interface AdaptiveScorecard {
  region: Region;
  days_window: number;
  top_n: number;
  point_value_vnd: number;
  win_multiplier: number;
  break_even_hits_per_day: number;
  baseline_hits_per_day: number;
  // Per-day breakdown (oldest first → newest last)
  days: ScorecardDay[];
  // Aggregate
  total_cost_vnd: number;
  total_win_vnd: number;
  total_profit_vnd: number;
  roi_pct: number;
  avg_hits_per_day: number;
  days_with_data: number;
  // Per-model leaderboard
  models: ModelScorecardRow[];
  // Strategy
  strategy_label: "good" | "neutral" | "bad" | "insufficient";
  strategy_message: string;
  strategy_action: string;
}

const MODEL_LABELS: Record<ModelKey, string> = {
  frequency: "Frequency",
  recency: "Recency",
  poisson: "Poisson Gap",
  markov: "Markov",
  temperature: "Temperature",
  pair: "Pair",
  streak: "Streak",
  mirror: "Mirror",
  dayOfWeek: "Day-of-Week",
  provinceOfDay: "Province-of-Day",
};

export async function getAdaptiveScorecard(
  region: Region,
  days: number = 14,
  topN: number = 10,
  perfWindow: number = 14
): Promise<AdaptiveScorecard> {
  // Get the last `days` distinct dates that have actual lô data
  const dateRows = await query<{ date: string }>(
    "SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT ?",
    [region, days]
  );
  const dates = dateRows.map((r) => r.date).reverse(); // oldest → newest

  const today = new Date();
  const todayMs = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );

  const dayResults: ScorecardDay[] = [];

  for (const date of dates) {
    // Compute weights as they would have been at THAT day (data strictly before)
    const [y, m, d] = date.split("-").map(Number);
    const dateMs = Date.UTC(y, m - 1, d);
    const offsetDays = Math.max(0, Math.floor((todayMs - dateMs) / 86_400_000));

    const cfg = await getAdaptiveWeights(region, perfWindow, topN, offsetDays);
    const usingDefault = cfg.days_with_data === 0;

    // Build prediction for this day using only data BEFORE it
    const history = await loadHistory(region, 60, date);
    if (Object.keys(history).length < 3) continue;

    const sParams = regionParams(region);
    const sProvince = region === "xsmt" ? await loadProvinceHistory(region, 60, date) : {};
    const raw = runAllModels(history, sProvince, region, sParams.recencyHalfLife);
    const norm: Record<ModelKey, Record<string, number>> = {} as Record<ModelKey, Record<string, number>>;
    for (const k of MODEL_KEYS) norm[k] = normalize(raw[k]);

    const composite = emptyScores();
    for (const k of MODEL_KEYS) {
      const w = cfg.weights[k];
      for (const lo of ALL_LOS) composite[lo] += w * norm[k][lo];
    }
    const smoothedComp = applyShrinkage(composite, sParams.shrinkage);
    const topPicks = ALL_LOS
      .map((lo) => ({ lo, s: smoothedComp[lo] }))
      .sort((a, b) => b.s - a.s)
      .slice(0, topN)
      .map((p) => p.lo);

    // Get actual occurrences for this day
    const actualRows = await query<{ lo_number: string; count: number }>(
      "SELECT lo_number, count FROM lo_daily WHERE region = ? AND date = ?",
      [region, date]
    );
    const actualMap = new Map(actualRows.map((r) => [r.lo_number, r.count]));

    let hits = 0;
    let occ = 0;
    for (const pick of topPicks) {
      const c = actualMap.get(pick) ?? 0;
      if (c > 0) {
        hits++;
        occ += c;
      }
    }

    // Player view: bet 1 điểm on each top-N pick.
    //   cost  = topN × POINT_VALUE (23,000đ/điểm)
    //   win   = appearances × WIN_MULTIPLIER × 1000  (80,000đ per appearance)
    const cost = topN * POINT_VALUE;
    const win = occ * WIN_MULTIPLIER * 1000;
    const profit = win - cost;

    dayResults.push({
      date,
      predicted_top: topPicks,
      hits,
      total_occurrences: occ,
      actual_lo_count: actualRows.length,
      cost_vnd: cost,
      win_vnd: win,
      profit_vnd: profit,
      using_default: usingDefault,
    });
  }

  // Aggregates
  const totalCost = dayResults.reduce((s, d) => s + d.cost_vnd, 0);
  const totalWin = dayResults.reduce((s, d) => s + d.win_vnd, 0);
  const totalProfit = totalWin - totalCost;
  const roi = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const avgHits = dayResults.length > 0
    ? dayResults.reduce((s, d) => s + d.hits, 0) / dayResults.length
    : 0;
  const breakEvenHits = (POINT_VALUE * topN) / (WIN_MULTIPLIER * 1000);

  // Baseline: random top N expected hits = topN × (avg_lo_per_day / 100)
  const avgLoCount = dayResults.length > 0
    ? dayResults.reduce((s, d) => s + d.actual_lo_count, 0) / dayResults.length
    : 18;
  const baselineHits = topN * (avgLoCount / 100);

  // Per-model leaderboard from model_performance
  const cutoffDate = new Date(todayMs - days * 86_400_000).toISOString().slice(0, 10);
  const recentCutoff = new Date(todayMs - 3 * 86_400_000).toISOString().slice(0, 10);
  const prevCutoffStart = new Date(todayMs - 6 * 86_400_000).toISOString().slice(0, 10);
  const prevCutoffEnd = new Date(todayMs - 3 * 86_400_000).toISOString().slice(0, 10);

  const perfRows = await query<{ model_name: string; avg_hr: number; n: number }>(
    `SELECT model_name, AVG(hit_rate) as avg_hr, COUNT(*) as n
     FROM model_performance
     WHERE region = ? AND top_n = ? AND date >= ?
     GROUP BY model_name`,
    [region, topN, cutoffDate]
  );
  const recent3Rows = await query<{ model_name: string; avg_hr: number }>(
    `SELECT model_name, AVG(hit_rate) as avg_hr
     FROM model_performance
     WHERE region = ? AND top_n = ? AND date >= ?
     GROUP BY model_name`,
    [region, topN, recentCutoff]
  );
  const prev3Rows = await query<{ model_name: string; avg_hr: number }>(
    `SELECT model_name, AVG(hit_rate) as avg_hr
     FROM model_performance
     WHERE region = ? AND top_n = ? AND date >= ? AND date < ?
     GROUP BY model_name`,
    [region, topN, prevCutoffStart, prevCutoffEnd]
  );

  const recent3Map = new Map(recent3Rows.map((r) => [r.model_name, r.avg_hr ?? 0]));
  const prev3Map = new Map(prev3Rows.map((r) => [r.model_name, r.avg_hr ?? 0]));

  // Current adaptive weights (offset 0)
  const currentCfg = await getAdaptiveWeights(region, perfWindow, topN, 0);

  const breakEvenHitRate = breakEvenHits / topN; // hit rate needed
  const goodThreshold = Math.max(0.30, breakEvenHitRate + 0.05);
  const okThreshold = breakEvenHitRate;

  const modelRows: ModelScorecardRow[] = MODEL_KEYS.map((key) => {
    const row = perfRows.find((r) => r.model_name === key);
    const hr = row?.avg_hr ?? 0;
    const n = row?.n ?? 0;
    const r3 = recent3Map.get(key) ?? 0;
    const p3 = prev3Map.get(key) ?? 0;
    const trend: "up" | "down" | "flat" =
      r3 - p3 > 0.05 ? "up" : r3 - p3 < -0.05 ? "down" : "flat";
    let status: "good" | "ok" | "bad" | "no_data";
    if (n === 0) status = "no_data";
    else if (hr >= goodThreshold) status = "good";
    else if (hr >= okThreshold) status = "ok";
    else status = "bad";

    let rec: string;
    let suggestMute = false;
    if (status === "no_data") rec = "Chưa có data — bấm Backfill";
    else if (status === "good") rec = trend === "down" ? "Đang tốt nhưng đi xuống → theo dõi" : "Giữ nguyên";
    else if (status === "ok") rec = trend === "up" ? "Đang lên → giữ" : "Trung bình → có thể giảm weight";
    else {
      rec = trend === "up" ? "Kém nhưng đang lên → chờ thêm" : "Kém liên tục → ĐỀ XUẤT TẮT";
      suggestMute = trend !== "up" && n >= 5;
    }

    return {
      key,
      label: MODEL_LABELS[key],
      hit_rate_avg: hr,
      hit_rate_recent3: r3,
      hit_rate_prev3: p3,
      current_weight: currentCfg.weights[key] ?? 0,
      rank: 0,
      status,
      trend,
      recommendation: rec,
      suggest_mute: suggestMute,
    };
  });
  modelRows.sort((a, b) => b.hit_rate_avg - a.hit_rate_avg);
  modelRows.forEach((r, i) => { r.rank = i + 1; });

  // Strategy recommendation
  let strategyLabel: AdaptiveScorecard["strategy_label"];
  let strategyMsg: string;
  let strategyAction: string;

  if (dayResults.length < 3) {
    strategyLabel = "insufficient";
    strategyMsg = `Cần ít nhất 3 ngày data (đang có ${dayResults.length})`;
    strategyAction = "Bấm 🧠 Backfill 14d ở trên để bootstrap accuracy.";
  } else if (roi >= 5) {
    strategyLabel = "good";
    strategyMsg = `✅ ĐÁNG ĐÁNH — ROI ${roi.toFixed(1)}% (lãi ${formatVnd(totalProfit)})`;
    strategyAction = `Chơi Top ${topN} bình thường. Tỉ lệ hit TB ${avgHits.toFixed(2)}/${topN} (cần ≥ ${breakEvenHits.toFixed(2)} để hoà).`;
  } else if (roi >= 0) {
    strategyLabel = "neutral";
    strategyMsg = `⚠️ HOÀ VỐN — ROI ${roi.toFixed(1)}%`;
    strategyAction = `Giảm xuống Top 5 cho an toàn, hoặc chỉ chơi consensus (≥ 5/9 model agree).`;
  } else {
    strategyLabel = "bad";
    strategyMsg = `❌ ĐANG LỖ — ROI ${roi.toFixed(1)}% (lỗ ${formatVnd(-totalProfit)})`;
    const muteCount = modelRows.filter((r) => r.suggest_mute).length;
    strategyAction = muteCount > 0
      ? `NGHỈ ĐÁNH 1-2 ngày. ${muteCount} model bị flagged tệ → nên tắt để ensemble học lại.`
      : `NGHỈ ĐÁNH 1-2 ngày. Chờ adaptive học thêm rồi quay lại.`;
  }

  return {
    region,
    days_window: days,
    top_n: topN,
    point_value_vnd: POINT_VALUE,
    win_multiplier: WIN_MULTIPLIER,
    break_even_hits_per_day: Math.round(breakEvenHits * 100) / 100,
    baseline_hits_per_day: Math.round(baselineHits * 100) / 100,
    days: dayResults,
    total_cost_vnd: totalCost,
    total_win_vnd: totalWin,
    total_profit_vnd: totalProfit,
    roi_pct: Math.round(roi * 100) / 100,
    avg_hits_per_day: Math.round(avgHits * 100) / 100,
    days_with_data: dayResults.length,
    models: modelRows,
    strategy_label: strategyLabel,
    strategy_message: strategyMsg,
    strategy_action: strategyAction,
  };
}

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
}

/**
 * For a HISTORICAL date, run each of the 9-10 models on data BEFORE that date
 * and return each model's top-N picks. Used by criteria-based simulation to
 * compute consensus buckets per day.
 *
 * Skips provinceOfDay for non-MT regions (where it returns all zeros).
 */
export async function getModelTop10PerDay(
  region: Region,
  date: string,
  topN: number = 10
): Promise<Record<string, string[]>> {
  const history = await loadHistory(region, 60, date);
  if (Object.keys(history).length < 3) return {};
  const params = regionParams(region);
  const provinceHistory = region === "xsmt"
    ? await loadProvinceHistory(region, 60, date)
    : {};
  const raw = runAllModels(history, provinceHistory, region, params.recencyHalfLife);
  const out: Record<string, string[]> = {};
  for (const [key, scores] of Object.entries(raw)) {
    if (key === "provinceOfDay" && region !== "xsmt") continue;
    const norm = normalize(scores);
    out[key] = ALL_LOS
      .map((lo) => ({ lo, s: norm[lo] }))
      .sort((a, b) => b.s - a.s)
      .slice(0, topN)
      .map((p) => p.lo);
  }
  return out;
}

/**
 * Predict top-N picks for a HISTORICAL date using the adaptive ensemble
 * with weights derived from data strictly BEFORE that date.
 *
 * Used by simulation.ts to replay history without leaking the target day.
 */
export async function predictTopNHistorical(
  region: Region,
  date: string,
  topN: number = 10,
  perfWindowDays: number = 14
): Promise<{ picks: string[]; using_default: boolean }> {
  const history = await loadHistory(region, 60, date);
  if (Object.keys(history).length < 3) {
    return { picks: ALL_LOS.slice(0, topN), using_default: true };
  }

  const today = new Date();
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m, d] = date.split("-").map(Number);
  const offsetDays = Math.max(0, Math.floor((todayMs - Date.UTC(y, m - 1, d)) / 86_400_000));

  const cfg = await getAdaptiveWeights(region, perfWindowDays, topN, offsetDays);
  const usingDefault = cfg.days_with_data === 0;
  const params = regionParams(region);
  const provinceHistory = region === "xsmt" ? await loadProvinceHistory(region, 60, date) : {};

  const raw = runAllModels(history, provinceHistory, region, params.recencyHalfLife);
  const composite = emptyScores();
  for (const k of MODEL_KEYS) {
    const norm = normalize(raw[k]);
    const w = cfg.weights[k];
    for (const lo of ALL_LOS) composite[lo] += w * norm[lo];
  }
  const smoothed = applyShrinkage(composite, params.shrinkage);

  const picks = ALL_LOS
    .map((lo) => ({ lo, s: smoothed[lo] }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topN)
    .map((p) => p.lo);

  return { picks, using_default: usingDefault };
}
