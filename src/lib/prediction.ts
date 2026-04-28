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
import { query, type Region } from "./db";

type DateMap = Record<string, Record<string, number>>; // date → {lo: count}

const ALL_LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

const WEIGHTS: Record<string, number> = {
  frequency: 0.2,
  recency: 0.25,
  poisson: 0.15,
  markov: 0.1,
  temperature: 0.1,
  pair: 0.1,
  streak: 0.1,
};

// ─────────────────────────────────────────────
// Data loader
// ─────────────────────────────────────────────

async function loadHistory(region: Region, days: number = 60): Promise<DateMap> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = await query<{ date: string; lo_number: string; count: number }>(
    `SELECT date, lo_number, count FROM lo_daily
     WHERE region = ? AND date >= ?
     ORDER BY date ASC`,
    [region, cutoffStr]
  );

  const out: DateMap = {};
  for (const r of rows) {
    if (!out[r.date]) out[r.date] = {};
    out[r.date][r.lo_number] = r.count;
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

export async function predict(region: Region, windowDays: number = 60): Promise<PredictionResult> {
  const history = await loadHistory(region, windowDays);
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

  const models = {
    frequency: modelFrequency(history),
    recency: modelRecency(history),
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

  // Weighted ensemble
  const composite: Record<string, number> = emptyScores();
  for (const [name, m] of Object.entries(normModels)) {
    const w = WEIGHTS[name] ?? 0;
    for (const lo of ALL_LOS) composite[lo] += w * m[lo];
  }

  const probs = softmax(composite, 0.15);

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
    model_weights: WEIGHTS,
    top_lift: Math.round(topLift * 100) / 100,
    predictions: items,
  };
}
