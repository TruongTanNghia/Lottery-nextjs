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

// ─────────────────────────────────────────────
// VIP Prediction — 9 models, max parameters, per-model rankings
// ─────────────────────────────────────────────

const VIP_WEIGHTS: Record<string, number> = {
  frequency: 0.17,
  recency: 0.22,
  poisson: 0.13,
  markov: 0.10,
  temperature: 0.10,
  pair: 0.09,
  streak: 0.09,
  mirror: 0.05,
  dayOfWeek: 0.05,
};

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
  windowDays: number = 90   // VIP uses MAX window for max signal
): Promise<VipPredictionResult> {
  const history = await loadHistory(region, windowDays);
  const daysAvailable = Object.keys(history).length;

  if (daysAvailable < 5) {
    return {
      region,
      window_days: windowDays,
      days_available: daysAvailable,
      warning: "Cần ít nhất 5 ngày dữ liệu để dự đoán VIP",
      model_weights: VIP_WEIGHTS,
      final: [],
      models: [],
      consensus: [],
      controversial: [],
    };
  }

  const rawModels = {
    frequency: modelFrequency(history),
    recency: modelRecency(history),
    poisson: modelPoissonGap(history),
    markov: modelMarkov(history),
    temperature: modelTemperature(history),
    pair: modelPair(history),
    streak: modelStreak(history),
    mirror: modelMirror(history),
    dayOfWeek: modelDayOfWeek(history),
  };

  const normModels: Record<string, Record<string, number>> = {};
  for (const [name, m] of Object.entries(rawModels)) {
    normModels[name] = normalize(m);
  }

  // Per-model top 10 picks
  const models: ModelBreakdown[] = Object.entries(normModels).map(([key, scores]) => {
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
      weight: VIP_WEIGHTS[key] ?? 0,
      top_picks: ranked,
    };
  });

  // Final ensemble with VIP weights
  const composite: Record<string, number> = emptyScores();
  for (const [name, m] of Object.entries(normModels)) {
    const w = VIP_WEIGHTS[name] ?? 0;
    for (const lo of ALL_LOS) composite[lo] += w * m[lo];
  }
  const probs = softmax(composite, 0.15);

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

  const consensus = allRanked.filter((x) => x.appearances_in_top10 >= 5);
  const controversial = allRanked.filter((x) => x.appearances_in_top10 <= 2);

  const topLift = final[0].probability / 1.0;

  return {
    region,
    window_days: windowDays,
    days_available: daysAvailable,
    model_weights: VIP_WEIGHTS,
    top_lift: Math.round(topLift * 100) / 100,
    final,
    models,
    consensus,
    controversial,
  };
}
