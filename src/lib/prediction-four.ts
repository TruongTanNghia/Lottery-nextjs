/**
 * 4-DIGIT prediction ("4 càng" / "bốn càng").
 *
 * Data source: last 4 digits of Đặc Biệt (G.DB) ONLY.
 * Search space: 0000-9999 (10,000 candidates — 10× sparser than 3 chân).
 *
 * Why 4-càng is HARD:
 *   - XSMB: 1 ĐB / day → 180 days = 180 observations for 10,000 candidates.
 *   - XSMN: 3-4 ĐB / day → ~540-720 obs in 180 days.
 *   - Even with 720 obs, ≥86% of 10K candidates never appear in window.
 *   - Raw frequency is noise. Borrow models (from denser 3-chân + 2-chân lô
 *     spaces) carry most of the signal.
 *
 * 8-Model ensemble:
 *   1. frequency      — Laplace-smoothed (alpha bumped to 4 for 10K space)
 *   2. recency        — EWMA, half-life 14d
 *   3. dayOfWeek      — same weekday history
 *   4. temperature    — 14d recent vs 60d baseline (longer windows than 3-chân)
 *   5. digitFreq      — per-position digit independence (4 positions × 10 digits)
 *   6. loBorrow       — last 2 digits "CD" → leverage 100-space lô data (DENSEST)
 *   7. threeBorrow    — last 3 digits "BCD" → leverage 1000-space 3-chân data
 *   8. pairFreq       — first-2 "AB" + middle "BC" + last-2 "CD" pair distributions
 *
 * Per-region tuning weights borrow models heavily for 4-càng.
 */
import { query, type Region } from "./db";

type DateMap = Record<string, Record<string, number>>;

const SPACE_SIZE = 10000;
const ALL_FOUR = Array.from({ length: SPACE_SIZE }, (_, i) => String(i).padStart(4, "0"));

// ─────────────────────────────────────────────
// History loaders
// ─────────────────────────────────────────────

/** Load 4-digit history — last 4 chars of ĐẶC BIỆT (G.DB) only. */
async function loadFourHistory(
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
       WHERE region = ? AND date >= ? AND date < ?
       AND prize_type = 'G.DB' AND LENGTH(number) >= 4`,
      [region, startStr, endDate]
    );
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    rows = await query<{ date: string; number: string }>(
      `SELECT date, number FROM lottery_results
       WHERE region = ? AND date >= ?
       AND prize_type = 'G.DB' AND LENGTH(number) >= 4`,
      [region, cutoffStr]
    );
  }
  const out: DateMap = {};
  for (const r of rows) {
    const four = r.number.slice(-4).padStart(4, "0");
    if (!out[r.date]) out[r.date] = {};
    out[r.date][four] = (out[r.date][four] ?? 0) + 1;
  }
  return out;
}

/** Load 3-digit history (all prizes ≥3 digits) for "threeBorrow" model. */
async function loadThreeHistory(
  region: Region,
  days: number,
  endDate?: string
): Promise<Record<string, Record<string, number>>> {
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
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const three = r.number.slice(-3).padStart(3, "0");
    if (!out[r.date]) out[r.date] = {};
    out[r.date][three] = (out[r.date][three] ?? 0) + 1;
  }
  return out;
}

/** Load 2-digit lô history (denser — for loBorrow). */
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

/** Per-4-digit occurrence map on a specific date (for backtest hit-checking). */
async function getFourDigitOccurrencesOnDate(region: Region, date: string): Promise<Map<string, number>> {
  const rows = await query<{ number: string }>(
    `SELECT number FROM lottery_results
     WHERE region = ? AND date = ?
     AND prize_type = 'G.DB' AND LENGTH(number) >= 4`,
    [region, date]
  );
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r.number.slice(-4).padStart(4, "0");
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// ─────────────────────────────────────────────
// COMBINED-mode loaders (aggregate across all 3 regions)
//
// Rationale: 4-càng single-region is too sparse — 1-4 ĐB/day means model
// has no real training signal in 10K-space. Aggregating 3 miền gives
// ~6-8 ĐB/day (~1260 obs/180d) which is enough for digit-position + pair
// frequency models to actually learn patterns.
// ─────────────────────────────────────────────

async function loadFourHistoryCombined(days: number, endDate?: string): Promise<DateMap> {
  // ALL prizes ≥4 digits across all 3 regions (per user request — much denser
  // training data, ~80-120 events/day instead of just ~7 G.DB/day).
  let rows: { date: string; number: string }[];
  if (endDate) {
    const [ey, em, ed] = endDate.split("-").map(Number);
    const endMs = Date.UTC(ey, em - 1, ed);
    const startStr = new Date(endMs - days * 86_400_000).toISOString().slice(0, 10);
    rows = await query<{ date: string; number: string }>(
      `SELECT date, number FROM lottery_results
       WHERE date >= ? AND date < ? AND LENGTH(number) >= 4`,
      [startStr, endDate]
    );
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    rows = await query<{ date: string; number: string }>(
      `SELECT date, number FROM lottery_results
       WHERE date >= ? AND LENGTH(number) >= 4`,
      [cutoffStr]
    );
  }
  const out: DateMap = {};
  for (const r of rows) {
    const four = r.number.slice(-4).padStart(4, "0");
    if (!out[r.date]) out[r.date] = {};
    out[r.date][four] = (out[r.date][four] ?? 0) + 1;
  }
  return out;
}

async function loadThreeHistoryCombined(days: number, endDate?: string): Promise<Record<string, Record<string, number>>> {
  let rows: { date: string; number: string }[];
  if (endDate) {
    const [ey, em, ed] = endDate.split("-").map(Number);
    const endMs = Date.UTC(ey, em - 1, ed);
    const startStr = new Date(endMs - days * 86_400_000).toISOString().slice(0, 10);
    rows = await query<{ date: string; number: string }>(
      `SELECT date, number FROM lottery_results
       WHERE date >= ? AND date < ? AND LENGTH(number) >= 3`,
      [startStr, endDate]
    );
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    rows = await query<{ date: string; number: string }>(
      `SELECT date, number FROM lottery_results
       WHERE date >= ? AND LENGTH(number) >= 3`,
      [cutoffStr]
    );
  }
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const three = r.number.slice(-3).padStart(3, "0");
    if (!out[r.date]) out[r.date] = {};
    out[r.date][three] = (out[r.date][three] ?? 0) + 1;
  }
  return out;
}

async function loadLoHistoryCombined(days: number, endDate?: string): Promise<Record<string, Record<string, number>>> {
  let rows: { date: string; lo_number: string; count: number }[];
  if (endDate) {
    const [ey, em, ed] = endDate.split("-").map(Number);
    const endMs = Date.UTC(ey, em - 1, ed);
    const startStr = new Date(endMs - days * 86_400_000).toISOString().slice(0, 10);
    rows = await query<{ date: string; lo_number: string; count: number }>(
      `SELECT date, lo_number, SUM(count) as count FROM lo_daily
       WHERE date >= ? AND date < ?
       GROUP BY date, lo_number`,
      [startStr, endDate]
    );
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    rows = await query<{ date: string; lo_number: string; count: number }>(
      `SELECT date, lo_number, SUM(count) as count FROM lo_daily
       WHERE date >= ?
       GROUP BY date, lo_number`,
      [cutoffStr]
    );
  }
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!out[r.date]) out[r.date] = {};
    out[r.date][r.lo_number] = r.count;
  }
  return out;
}

async function getFourDigitOccurrencesOnDateCombined(date: string): Promise<Map<string, number>> {
  // ALL prizes ≥4 digits across all regions on this date (per user request).
  const rows = await query<{ number: string }>(
    `SELECT number FROM lottery_results
     WHERE date = ? AND LENGTH(number) >= 4`,
    [date]
  );
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r.number.slice(-4).padStart(4, "0");
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// ─────────────────────────────────────────────
// Score utilities
// ─────────────────────────────────────────────

function emptyScores(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of ALL_FOUR) out[n] = 0;
  return out;
}

function normalize(scores: Record<string, number>): Record<string, number> {
  const vals = Object.values(scores);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min;
  const out: Record<string, number> = {};
  if (range < 1e-12) {
    for (const n of ALL_FOUR) out[n] = 0;
    return out;
  }
  for (const n of ALL_FOUR) out[n] = (scores[n] - min) / range;
  return out;
}

function softmax(scores: Record<string, number>, T: number): Record<string, number> {
  const expScores: Record<string, number> = {};
  let sum = 0;
  const maxS = Math.max(...Object.values(scores));
  for (const n of ALL_FOUR) {
    const e = Math.exp((scores[n] - maxS) / T);
    expScores[n] = e;
    sum += e;
  }
  const out: Record<string, number> = {};
  for (const n of ALL_FOUR) out[n] = expScores[n] / sum;
  return out;
}

// ─────────────────────────────────────────────
// 8 Models
// ─────────────────────────────────────────────

/** Raw count + Laplace smoothing (alpha bumped to 4 for 10K-space sparseness). */
function modelFrequency(history: DateMap, alpha: number = 4): Record<string, number> {
  const counts = emptyScores();
  const dates = Object.keys(history);
  if (dates.length === 0) return counts;
  for (const date of dates) {
    for (const [num, c] of Object.entries(history[date])) {
      counts[num] = (counts[num] ?? 0) + c;
    }
  }
  const denom = dates.length + alpha;
  for (const n of ALL_FOUR) counts[n] = (counts[n] + alpha / SPACE_SIZE) / denom;
  return counts;
}

function modelRecency(history: DateMap, halfLife: number = 14): Record<string, number> {
  const counts = emptyScores();
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return counts;
  const decay = Math.log(2) / halfLife;
  const todayIdx = dates.length - 1;
  for (let i = 0; i < dates.length; i++) {
    const age = todayIdx - i;
    const w = Math.exp(-decay * age);
    for (const [num, c] of Object.entries(history[dates[i]])) {
      counts[num] = (counts[num] ?? 0) + w * c;
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
  let matching = 0;
  for (const date of dates) {
    const d = new Date(date + "T00:00:00");
    if (d.getDay() !== targetDow) continue;
    matching++;
    for (const [num, c] of Object.entries(history[date])) {
      counts[num] = (counts[num] ?? 0) + c;
    }
  }
  if (matching === 0) return emptyScores();
  for (const n of ALL_FOUR) counts[n] /= matching;
  return counts;
}

function modelTemperature(history: DateMap): Record<string, number> {
  // 14d recent vs full-window baseline (longer windows than 3-chân — more reliable on sparse data)
  const dates = Object.keys(history).sort();
  if (dates.length < 15) return emptyScores();
  const recent = dates.slice(-14);

  const recentCount = emptyScores();
  for (const d of recent) for (const [num, c] of Object.entries(history[d])) {
    recentCount[num] = (recentCount[num] ?? 0) + c;
  }
  const recentRate: Record<string, number> = {};
  for (const n of ALL_FOUR) recentRate[n] = recentCount[n] / recent.length;

  const totalCount = emptyScores();
  for (const d of dates) for (const [num, c] of Object.entries(history[d])) {
    totalCount[num] = (totalCount[num] ?? 0) + c;
  }
  const baseRate: Record<string, number> = {};
  for (const n of ALL_FOUR) baseRate[n] = totalCount[n] / dates.length;

  const out: Record<string, number> = {};
  for (const n of ALL_FOUR) out[n] = recentRate[n] - baseRate[n];
  return out;
}

/**
 * Per-position digit frequency — 4 positions × 10 digits = 40 cells.
 * Each digit-at-position has 100-720× more observations than each 4-digit number
 * → MUCH denser, smoother signal.
 * Score("ABCD") = rate_pos0(A) × rate_pos1(B) × rate_pos2(C) × rate_pos3(D)
 */
function modelDigitFrequency(history: DateMap): Record<string, number> {
  const posCount: number[][] = [
    Array(10).fill(0), Array(10).fill(0), Array(10).fill(0), Array(10).fill(0),
  ];
  let totalObs = 0;
  for (const date of Object.keys(history)) {
    for (const [num, c] of Object.entries(history[date])) {
      posCount[0][Number(num[0])] += c;
      posCount[1][Number(num[1])] += c;
      posCount[2][Number(num[2])] += c;
      posCount[3][Number(num[3])] += c;
      totalObs += c;
    }
  }
  if (totalObs === 0) return emptyScores();
  // Laplace smoothing per position (alpha=2 per digit, 20 total per position)
  const rates: number[][] = posCount.map((row) => {
    const sum = row.reduce((s, v) => s + v, 0);
    return row.map((v) => (v + 2) / (sum + 20));
  });
  const out = emptyScores();
  for (const n of ALL_FOUR) {
    out[n] = rates[0][Number(n[0])] *
             rates[1][Number(n[1])] *
             rates[2][Number(n[2])] *
             rates[3][Number(n[3])];
  }
  return out;
}

/**
 * BORROW from 2-digit lô (100-space, DENSEST data we have).
 * For 4-digit "ABCD", the lô tail = "CD".
 * If "CD" is hot recently as lô → boost all "**CD" candidates.
 */
function modelLoBorrow(
  loHistory: Record<string, Record<string, number>>,
  halfLife: number = 10
): Record<string, number> {
  const loDates = Object.keys(loHistory).sort();
  if (loDates.length === 0) return emptyScores();
  const loScore: Record<string, number> = {};
  for (let i = 0; i < 100; i++) loScore[String(i).padStart(2, "0")] = 0;
  const decay = Math.log(2) / halfLife;
  const todayIdx = loDates.length - 1;
  for (let i = 0; i < loDates.length; i++) {
    const age = todayIdx - i;
    const w = Math.exp(-decay * age);
    for (const [lo, c] of Object.entries(loHistory[loDates[i]])) {
      loScore[lo] = (loScore[lo] ?? 0) + w * c;
    }
  }
  const out = emptyScores();
  for (const n of ALL_FOUR) {
    const lo = n.slice(2); // last 2 digits "CD"
    out[n] = loScore[lo] ?? 0;
  }
  return out;
}

/**
 * BORROW from 3-digit (1000-space).
 * For "ABCD", the 3-chân tail = "BCD".
 * If "BCD" is hot recently as 3-chân → boost all "*BCD" candidates.
 */
function modelThreeBorrow(
  threeHistory: Record<string, Record<string, number>>,
  halfLife: number = 12
): Record<string, number> {
  const dates = Object.keys(threeHistory).sort();
  if (dates.length === 0) return emptyScores();
  const threeScore: Record<string, number> = {};
  for (let i = 0; i < 1000; i++) threeScore[String(i).padStart(3, "0")] = 0;
  const decay = Math.log(2) / halfLife;
  const todayIdx = dates.length - 1;
  for (let i = 0; i < dates.length; i++) {
    const age = todayIdx - i;
    const w = Math.exp(-decay * age);
    for (const [three, c] of Object.entries(threeHistory[dates[i]])) {
      threeScore[three] = (threeScore[three] ?? 0) + w * c;
    }
  }
  const out = emptyScores();
  for (const n of ALL_FOUR) {
    const three = n.slice(1); // last 3 digits "BCD"
    out[n] = threeScore[three] ?? 0;
  }
  return out;
}

/**
 * Pair-Decomposition: score "ABCD" by 3 overlapping pair frequencies.
 *   AB (first-2) × BC (middle-2) × CD (last-2)
 * Captures local correlations the position-independent digitFreq misses.
 */
function modelPairFreq(history: DateMap): Record<string, number> {
  const firstTwo: Record<string, number> = {};
  const middle: Record<string, number> = {};
  const lastTwo: Record<string, number> = {};

  for (const date of Object.keys(history)) {
    for (const [num, c] of Object.entries(history[date])) {
      const ab = num.slice(0, 2);
      const bc = num.slice(1, 3);
      const cd = num.slice(2, 4);
      firstTwo[ab] = (firstTwo[ab] ?? 0) + c;
      middle[bc] = (middle[bc] ?? 0) + c;
      lastTwo[cd] = (lastTwo[cd] ?? 0) + c;
    }
  }
  // Laplace smoothing per pair-position (100 cells each, alpha=1)
  const sumF = Object.values(firstTwo).reduce((s, v) => s + v, 0) + 100;
  const sumM = Object.values(middle).reduce((s, v) => s + v, 0) + 100;
  const sumL = Object.values(lastTwo).reduce((s, v) => s + v, 0) + 100;
  const out = emptyScores();
  for (const n of ALL_FOUR) {
    const ab = n.slice(0, 2);
    const bc = n.slice(1, 3);
    const cd = n.slice(2, 4);
    const f = ((firstTwo[ab] ?? 0) + 1) / sumF;
    const m = ((middle[bc] ?? 0) + 1) / sumM;
    const l = ((lastTwo[cd] ?? 0) + 1) / sumL;
    out[n] = f * m * l;
  }
  return out;
}

/** Bayesian shrinkage toward uniform — heavier for 10K-space than 1K-space. */
function applyShrinkage(scores: Record<string, number>, shrink: number): Record<string, number> {
  if (shrink <= 0) return scores;
  const vals = Object.values(scores);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const out: Record<string, number> = {};
  for (const n of ALL_FOUR) out[n] = (1 - shrink) * scores[n] + shrink * avg;
  return out;
}

// ─────────────────────────────────────────────
// Per-region tuning
// ─────────────────────────────────────────────

interface FourRegionParams {
  weights: Record<string, number>;
  softmaxT: number;
  recencyHalfLife: number;
  shrinkage: number;
}

// Weights heavily skewed toward BORROW models since they leverage
// 10× / 100× denser data spaces (3-chân: 1K; lô: 100).
const REGION_PARAMS: Record<Region, FourRegionParams> = {
  xsmn: {
    weights: {
      frequency: 0.05,    // raw is mostly noise in 10K
      recency: 0.08,
      dayOfWeek: 0.06,
      temperature: 0.05,
      digitFreq: 0.18,    // independent per-position
      loBorrow: 0.22,     // strongest borrow (lô densest)
      threeBorrow: 0.20,
      pairFreq: 0.16,
    },
    softmaxT: 0.20, recencyHalfLife: 14, shrinkage: 0.15,
  },
  xsmb: {
    // Single province → DoW doesn't matter; only 1 ĐB/day → leaner data
    weights: {
      frequency: 0.04,
      recency: 0.08,
      dayOfWeek: 0.02,
      temperature: 0.04,
      digitFreq: 0.20,
      loBorrow: 0.24,     // MB has 27 lô/day → loBorrow strongest here
      threeBorrow: 0.20,
      pairFreq: 0.18,
    },
    softmaxT: 0.22, recencyHalfLife: 14, shrinkage: 0.20,
  },
  xsmt: {
    // Province rotation by weekday → DoW matters most
    weights: {
      frequency: 0.04,
      recency: 0.06,
      dayOfWeek: 0.16,
      temperature: 0.04,
      digitFreq: 0.16,
      loBorrow: 0.22,
      threeBorrow: 0.18,
      pairFreq: 0.14,
    },
    softmaxT: 0.24, recencyHalfLife: 10, shrinkage: 0.22,
  },
};

const MODEL_META: Record<string, { label: string; question: string }> = {
  frequency: { label: "Tần suất", question: "4 càng nào về NHIỀU NHẤT?" },
  recency: { label: "Gần đây (EWMA)", question: "4 càng nào về gần đây?" },
  dayOfWeek: { label: "Cùng thứ", question: "Hay về vào thứ này?" },
  temperature: { label: "Hot vs base", question: "ĐANG HOT hơn baseline?" },
  digitFreq: { label: "Vị trí chữ số", question: "Từng vị trí 1/2/3/4 hay là số nào?" },
  loBorrow: { label: "Mượn lô (2 chữ đuôi)", question: "Đuôi 2 chữ CD đang hot?" },
  threeBorrow: { label: "Mượn 3 chân", question: "3 chữ đuôi BCD đang hot?" },
  pairFreq: { label: "Cặp chữ số", question: "Cặp AB/BC/CD có tần suất cao?" },
};

const CONSENSUS_THRESHOLD: Record<Region, number> = {
  xsmn: 5, xsmb: 4, xsmt: 3,
};

// ─────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────

export interface FourDigitItem {
  rank: number;
  number: string;
  probability: number;
  composite_score: number;
  breakdown: Record<string, number>;
}

export interface FourModelTopPick {
  rank: number;
  number: string;
  norm_score: number;
}

export interface FourModelBreakdown {
  key: string;
  label: string;
  question: string;
  weight: number;
  top_picks: FourModelTopPick[];
}

export interface FourConsensusItem {
  number: string;
  appearances_in_top: number;
  models: string[];
}

export interface FourDigitResult {
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  weights: Record<string, number>;
  predictions: FourDigitItem[];
  total_models: number;
  consensus_threshold: number;
  models: FourModelBreakdown[];
  consensus: FourConsensusItem[];
  controversial: FourConsensusItem[];
}

// ─────────────────────────────────────────────
// Main predictor
// ─────────────────────────────────────────────

export async function predictFourDigit(
  region: Region,
  windowDays: number = 180,   // 4 càng needs DENSE history (10K-space)
  endDate?: string
): Promise<FourDigitResult> {
  const history = await loadFourHistory(region, windowDays, endDate);
  const daysAvailable = Object.keys(history).length;
  const params = REGION_PARAMS[region] ?? REGION_PARAMS.xsmn;

  if (daysAvailable < 14) {
    return {
      region,
      window_days: windowDays,
      days_available: daysAvailable,
      warning: `Cần ít nhất 14 ngày data G.DB, hiện có ${daysAvailable}. Scrape thêm rồi quay lại.`,
      weights: params.weights,
      predictions: [],
      total_models: 8,
      consensus_threshold: CONSENSUS_THRESHOLD[region],
      models: [],
      consensus: [],
      controversial: [],
    };
  }

  // Load supplementary denser histories for borrow models (parallel)
  const [loHistory, threeHistory] = await Promise.all([
    loadLoHistory(region, windowDays, endDate),
    loadThreeHistory(region, windowDays, endDate),
  ]);

  const raw: Record<string, Record<string, number>> = {
    frequency: modelFrequency(history),
    recency: modelRecency(history, params.recencyHalfLife),
    dayOfWeek: modelDayOfWeek(history),
    temperature: modelTemperature(history),
    digitFreq: modelDigitFrequency(history),
    loBorrow: modelLoBorrow(loHistory, params.recencyHalfLife - 2),
    threeBorrow: modelThreeBorrow(threeHistory, params.recencyHalfLife),
    pairFreq: modelPairFreq(history),
  };
  const norm: Record<string, Record<string, number>> = {};
  for (const [k, m] of Object.entries(raw)) norm[k] = normalize(m);

  const composite = emptyScores();
  for (const [k, m] of Object.entries(norm)) {
    const w = params.weights[k] ?? 0;
    for (const n of ALL_FOUR) composite[n] += w * m[n];
  }
  const smoothed = applyShrinkage(composite, params.shrinkage);
  const probs = softmax(smoothed, params.softmaxT);

  const items: FourDigitItem[] = ALL_FOUR.map((num) => ({
    rank: 0,
    number: num,
    probability: Math.round(probs[num] * 100 * 1_000_000) / 1_000_000, // 6 decimals (very small probs)
    composite_score: Math.round(composite[num] * 10000) / 10000,
    breakdown: Object.fromEntries(
      Object.entries(norm).map(([k, m]) => [k, Math.round(m[num] * 10000) / 10000])
    ),
  }));
  items.sort((a, b) => b.probability - a.probability);
  items.forEach((p, i) => { p.rank = i + 1; });

  const TOP_PER_MODEL = 10;
  const models: FourModelBreakdown[] = Object.entries(norm).map(([key, scores]) => {
    const ranked = ALL_FOUR
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

  // Consensus across model top-10 lists
  const topSets: Record<string, Set<string>> = {};
  for (const m of models) topSets[m.key] = new Set(m.top_picks.map((p) => p.number));
  const appearancesPerNum: Record<string, string[]> = {};
  for (const ms of Object.entries(topSets)) {
    const [k, set] = ms;
    for (const n of set) {
      if (!appearancesPerNum[n]) appearancesPerNum[n] = [];
      appearancesPerNum[n].push(k);
    }
  }
  const allRanked = Object.entries(appearancesPerNum)
    .map(([n, ms]) => ({ number: n, appearances_in_top: ms.length, models: ms }))
    .sort((a, b) => b.appearances_in_top - a.appearances_in_top);

  const threshold = CONSENSUS_THRESHOLD[region];
  const consensus = allRanked.filter((x) => x.appearances_in_top >= threshold);
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
// COMBINED-mode predictor (3 miền aggregated)
//
// Critical changes vs per-region predictFourDigit:
//   1. Weights REBALANCED: less borrow (signals from non-ĐB prizes don't
//      necessarily correlate with ĐB-only 4-càng); more digitFreq + pairFreq
//      (signals derived from the same ĐB data we're predicting).
//   2. CANDIDATE POOL FILTERED to numbers that ACTUALLY appeared as 4-càng
//      in the window (drops 8800+ never-seen candidates that would otherwise
//      get scored from speculative borrow signals). This is the biggest
//      hit-rate uplift.
//   3. dayOfWeek disabled (3 regions have different rotation patterns —
//      combined DoW is noisy).
// ─────────────────────────────────────────────

const COMBINED_WEIGHTS: Record<string, number> = {
  frequency: 0.12,     // direct count over 1260 obs — still noisy but workable
  recency: 0.15,       // recent EWMA on combined data
  dayOfWeek: 0.0,      // disabled (3-region mix muddies the signal)
  temperature: 0.08,
  digitFreq: 0.28,     // STRONGEST signal — 5040 digit-pos obs / 40 cells
  loBorrow: 0.07,      // de-emphasized (different prize → different patterns)
  threeBorrow: 0.10,   // de-emphasized
  pairFreq: 0.20,      // strong: 1260 obs across 3 pair positions × 100 cells
};

const COMBINED_SOFTMAX_T = 0.22;
const COMBINED_RECENCY_HL = 12;
const COMBINED_SHRINKAGE = 0.18;

export interface FourCombinedResult {
  combined: true;
  window_days: number;
  days_available: number;
  warning?: string;
  weights: Record<string, number>;
  predictions: FourDigitItem[];
  candidate_pool_size: number;     // # of distinct 4-càng that ever appeared in window
  total_observations: number;      // total ĐB count across 3 miền
  total_models: number;
  consensus_threshold: number;
  models: FourModelBreakdown[];
  consensus: FourConsensusItem[];
}

export async function predictFourDigitCombined(
  windowDays: number = 180,
  endDate?: string
): Promise<FourCombinedResult> {
  const history = await loadFourHistoryCombined(windowDays, endDate);
  const daysAvailable = Object.keys(history).length;

  if (daysAvailable < 14) {
    return {
      combined: true,
      window_days: windowDays,
      days_available: daysAvailable,
      warning: `Cần ít nhất 14 ngày data, hiện có ${daysAvailable}. Scrape thêm rồi quay lại.`,
      weights: COMBINED_WEIGHTS,
      predictions: [],
      candidate_pool_size: 0,
      total_observations: 0,
      total_models: 8,
      consensus_threshold: 4,
      models: [],
      consensus: [],
    };
  }

  // Compute candidate pool = numbers that ACTUALLY appeared in window.
  // This is the key filter: dropping 8000+ never-seen candidates that
  // pure model speculation would over-rank from borrow signals.
  const appeared = new Set<string>();
  let totalObs = 0;
  for (const date of Object.keys(history)) {
    for (const [num, c] of Object.entries(history[date])) {
      appeared.add(num);
      totalObs += c;
    }
  }
  const poolSize = appeared.size;

  // Load supplementary denser histories for borrow models (parallel)
  const [loHistory, threeHistory] = await Promise.all([
    loadLoHistoryCombined(windowDays, endDate),
    loadThreeHistoryCombined(windowDays, endDate),
  ]);

  const raw: Record<string, Record<string, number>> = {
    frequency: modelFrequency(history, 2),  // alpha=2 (less smoothing — pool is filtered)
    recency: modelRecency(history, COMBINED_RECENCY_HL),
    dayOfWeek: modelDayOfWeek(history),
    temperature: modelTemperature(history),
    digitFreq: modelDigitFrequency(history),
    loBorrow: modelLoBorrow(loHistory, COMBINED_RECENCY_HL - 2),
    threeBorrow: modelThreeBorrow(threeHistory, COMBINED_RECENCY_HL),
    pairFreq: modelPairFreq(history),
  };
  const norm: Record<string, Record<string, number>> = {};
  for (const [k, m] of Object.entries(raw)) norm[k] = normalize(m);

  // Composite — ONLY for candidates that appeared in window
  const composite: Record<string, number> = {};
  for (const n of appeared) {
    composite[n] = 0;
    for (const [k, m] of Object.entries(norm)) {
      composite[n] += (COMBINED_WEIGHTS[k] ?? 0) * (m[n] ?? 0);
    }
  }
  // Apply shrinkage within the filtered pool
  const vals = Object.values(composite);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  for (const n of appeared) composite[n] = (1 - COMBINED_SHRINKAGE) * composite[n] + COMBINED_SHRINKAGE * avg;

  // Softmax over filtered pool
  const expScores: Record<string, number> = {};
  let sum = 0;
  const maxS = Math.max(...Object.values(composite));
  for (const n of appeared) {
    const e = Math.exp((composite[n] - maxS) / COMBINED_SOFTMAX_T);
    expScores[n] = e;
    sum += e;
  }
  const probs: Record<string, number> = {};
  for (const n of appeared) probs[n] = expScores[n] / sum;

  const items: FourDigitItem[] = Array.from(appeared).map((num) => ({
    rank: 0,
    number: num,
    probability: Math.round(probs[num] * 100 * 1_000_000) / 1_000_000,
    composite_score: Math.round(composite[num] * 10000) / 10000,
    breakdown: Object.fromEntries(
      Object.entries(norm).map(([k, m]) => [k, Math.round((m[num] ?? 0) * 10000) / 10000])
    ),
  }));
  items.sort((a, b) => b.probability - a.probability);
  items.forEach((p, i) => { p.rank = i + 1; });

  const TOP_PER_MODEL = 10;
  const models: FourModelBreakdown[] = Object.entries(norm).map(([key, scores]) => {
    const ranked = Array.from(appeared)
      .map((n) => ({ number: n, norm_score: scores[n] ?? 0 }))
      .sort((a, b) => b.norm_score - a.norm_score)
      .slice(0, TOP_PER_MODEL)
      .map((p, idx) => ({ rank: idx + 1, ...p, norm_score: Math.round(p.norm_score * 10000) / 10000 }));
    return {
      key,
      label: MODEL_META[key]?.label ?? key,
      question: MODEL_META[key]?.question ?? "",
      weight: COMBINED_WEIGHTS[key] ?? 0,
      top_picks: ranked,
    };
  });

  // Consensus
  const topSets: Record<string, Set<string>> = {};
  for (const m of models) topSets[m.key] = new Set(m.top_picks.map((p) => p.number));
  const appearancesPerNum: Record<string, string[]> = {};
  for (const [k, set] of Object.entries(topSets)) {
    for (const n of set) {
      if (!appearancesPerNum[n]) appearancesPerNum[n] = [];
      appearancesPerNum[n].push(k);
    }
  }
  const allRanked = Object.entries(appearancesPerNum)
    .map(([n, ms]) => ({ number: n, appearances_in_top: ms.length, models: ms }))
    .sort((a, b) => b.appearances_in_top - a.appearances_in_top);
  const consensus = allRanked.filter((x) => x.appearances_in_top >= 4);

  return {
    combined: true,
    window_days: windowDays,
    days_available: daysAvailable,
    weights: COMBINED_WEIGHTS,
    predictions: items,
    candidate_pool_size: poolSize,
    total_observations: totalObs,
    total_models: 8,
    consensus_threshold: 4,
    models,
    consensus,
  };
}

// ─────────────────────────────────────────────
// BACKTEST
// ─────────────────────────────────────────────

export interface FourBacktestDay {
  date: string;
  predicted_top: string[];
  actual_count: number;       // # of distinct 4-digit ĐB that came that day
  hits: number;               // # of top_k picks that appeared
  hit_picks: string[];
  total_occurrences: number;  // sum of appearance counts on hit picks
  hit_rate_pct: number;
  coverage_pct: number;
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
}

export interface FourTierStat {
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
  hit_numbers: Array<{ number: string; days_hit: number; total_occ: number }>;
}

export interface FourBacktestResult {
  region: Region;
  days_window: number;
  top_k: number;
  total_models: number;
  baseline_pct: number;
  payout_per_hit_vnd: number;
  cost_per_pick_vnd: number;
  total_predicted: number;
  total_hits: number;
  total_occurrences: number;
  total_actual: number;
  hit_rate_pct: number;
  coverage_pct: number;
  lift_vs_baseline: number;
  total_cost_vnd: number;
  total_win_vnd: number;
  total_profit_vnd: number;
  roi_pct: number;
  break_even_occurrences_per_day: number;
  tiers: FourTierStat[];
  days: FourBacktestDay[];
}

function buildTiers(topK: number): Array<{ start: number; end: number; label: string }> {
  const out: Array<{ start: number; end: number; label: string }> = [];
  // 4-càng uses chunks of 20 (instead of 10 for 3-chân) since top K is much higher (100+)
  for (let start = 1; start <= topK; start += 20) {
    const end = Math.min(start + 19, topK);
    out.push({ start, end, label: `Top ${start}-${end}` });
  }
  return out;
}

const POINT_COST_VND_FOUR = 23_000;

export async function backtestFourDigit(
  region: Region,
  days: number = 14,
  topK: number = 100,
  windowDays: number = 180,
  payoutVnd: number = 6_500_000  // 4-càng pays ~280-330× cost per single appearance
): Promise<FourBacktestResult> {
  const dateRows = await query<{ date: string }>(
    `SELECT DISTINCT date FROM lottery_results
     WHERE region = ? AND prize_type = 'G.DB' AND LENGTH(number) >= 4
     ORDER BY date DESC LIMIT ?`,
    [region, days]
  );
  const dates = dateRows.map((r) => r.date).reverse();

  const dayResults: FourBacktestDay[] = [];
  const tierDefs = buildTiers(topK);
  const tierAcc: Map<number, {
    hits: number;
    occ: number;
    daysCounted: number;
    hitMap: Map<string, { days: number; occ: number }>;
  }> = new Map();
  for (const t of tierDefs) tierAcc.set(t.start, { hits: 0, occ: 0, daysCounted: 0, hitMap: new Map() });

  for (const date of dates) {
    const r = await predictFourDigit(region, windowDays, date);
    if (r.warning || r.predictions.length === 0) continue;

    const topPicks = r.predictions.slice(0, topK).map((p) => p.number);
    const occMap = await getFourDigitOccurrencesOnDate(region, date);
    const hitPicks = topPicks.filter((n) => (occMap.get(n) ?? 0) > 0);
    const totalOcc = hitPicks.reduce((s, n) => s + (occMap.get(n) ?? 0), 0);

    const hit = hitPicks.length;
    const actualCount = occMap.size;
    const cost = topK * POINT_COST_VND_FOUR;
    const win = totalOcc * payoutVnd;
    const profit = win - cost;

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
          if (prev) { prev.days++; prev.occ += c; }
          else acc.hitMap.set(n, { days: 1, occ: c });
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

  const tiers: FourTierStat[] = tierDefs.map((t) => {
    const acc = tierAcc.get(t.start)!;
    const picksPerDay = t.end - t.start + 1;
    const totalPred = picksPerDay * acc.daysCounted;
    const tCost = totalPred * POINT_COST_VND_FOUR;
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
  const baseline = (topK / SPACE_SIZE) * 100;
  const hitRate = totalPredicted > 0 ? (totalHits / totalPredicted) * 100 : 0;
  const coverage = totalActual > 0 ? (totalHits / totalActual) * 100 : 0;

  const totalCost = dayResults.reduce((s, d) => s + d.cost_vnd, 0);
  const totalWin = dayResults.reduce((s, d) => s + d.win_vnd, 0);
  const totalProfit = totalWin - totalCost;
  const roi = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const breakEvenOcc = payoutVnd > 0 ? (topK * POINT_COST_VND_FOUR) / payoutVnd : 0;

  return {
    region,
    days_window: days,
    top_k: topK,
    total_models: 8,
    baseline_pct: Math.round(baseline * 1000) / 1000,
    payout_per_hit_vnd: payoutVnd,
    cost_per_pick_vnd: POINT_COST_VND_FOUR,
    total_predicted: totalPredicted,
    total_hits: totalHits,
    total_occurrences: totalOcc,
    total_actual: totalActual,
    hit_rate_pct: Math.round(hitRate * 1000) / 1000,
    coverage_pct: Math.round(coverage * 100) / 100,
    lift_vs_baseline: baseline > 0 ? Math.round((hitRate / baseline) * 100) / 100 : 0,
    total_cost_vnd: totalCost,
    total_win_vnd: totalWin,
    total_profit_vnd: totalProfit,
    roi_pct: Math.round(roi * 100) / 100,
    break_even_occurrences_per_day: Math.round(breakEvenOcc * 1000) / 1000,
    tiers,
    days: dayResults,
  };
}

// ─────────────────────────────────────────────
// COMBINED-mode backtest (3 miền aggregated)
// ─────────────────────────────────────────────

export interface FourCombinedBacktestResult extends Omit<FourBacktestResult, "region"> {
  combined: true;
  candidate_pool_size_avg: number;  // avg pool size across backtest days
  total_observations: number;       // total ĐB events in window across miền
}

export async function backtestFourDigitCombined(
  days: number = 14,
  topK: number = 100,
  windowDays: number = 180,
  payoutVnd: number = 6_500_000
): Promise<FourCombinedBacktestResult> {
  // Distinct dates with at least 1 prize ≥4 digits across any region.
  const dateRows = await query<{ date: string }>(
    `SELECT DISTINCT date FROM lottery_results
     WHERE LENGTH(number) >= 4
     ORDER BY date DESC LIMIT ?`,
    [days]
  );
  const dates = dateRows.map((r) => r.date).reverse();

  const dayResults: FourBacktestDay[] = [];
  const tierDefs = buildTiers(topK);
  const tierAcc: Map<number, {
    hits: number;
    occ: number;
    daysCounted: number;
    hitMap: Map<string, { days: number; occ: number }>;
  }> = new Map();
  for (const t of tierDefs) tierAcc.set(t.start, { hits: 0, occ: 0, daysCounted: 0, hitMap: new Map() });

  let poolSizeSum = 0;
  let totalObsAggregated = 0;

  for (const date of dates) {
    const r = await predictFourDigitCombined(windowDays, date);
    if (r.warning || r.predictions.length === 0) continue;
    poolSizeSum += r.candidate_pool_size;
    totalObsAggregated = Math.max(totalObsAggregated, r.total_observations);

    const topPicks = r.predictions.slice(0, topK).map((p) => p.number);
    const occMap = await getFourDigitOccurrencesOnDateCombined(date);
    const hitPicks = topPicks.filter((n) => (occMap.get(n) ?? 0) > 0);
    const totalOcc = hitPicks.reduce((s, n) => s + (occMap.get(n) ?? 0), 0);

    const hit = hitPicks.length;
    const actualCount = occMap.size;
    const cost = topK * POINT_COST_VND_FOUR;
    const win = totalOcc * payoutVnd;
    const profit = win - cost;

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
          if (prev) { prev.days++; prev.occ += c; }
          else acc.hitMap.set(n, { days: 1, occ: c });
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

  const tiers: FourTierStat[] = tierDefs.map((t) => {
    const acc = tierAcc.get(t.start)!;
    const picksPerDay = t.end - t.start + 1;
    const totalPred = picksPerDay * acc.daysCounted;
    const tCost = totalPred * POINT_COST_VND_FOUR;
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
  // Baseline: with filtered pool, baseline = topK / pool_size (instead of /10000)
  const avgPool = dayResults.length > 0 ? poolSizeSum / dayResults.length : SPACE_SIZE;
  const baseline = (topK / Math.max(avgPool, topK)) * 100;
  const hitRate = totalPredicted > 0 ? (totalHits / totalPredicted) * 100 : 0;
  const coverage = totalActual > 0 ? (totalHits / totalActual) * 100 : 0;

  const totalCost = dayResults.reduce((s, d) => s + d.cost_vnd, 0);
  const totalWin = dayResults.reduce((s, d) => s + d.win_vnd, 0);
  const totalProfit = totalWin - totalCost;
  const roi = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const breakEvenOcc = payoutVnd > 0 ? (topK * POINT_COST_VND_FOUR) / payoutVnd : 0;

  return {
    combined: true,
    days_window: days,
    top_k: topK,
    total_models: 8,
    baseline_pct: Math.round(baseline * 1000) / 1000,
    payout_per_hit_vnd: payoutVnd,
    cost_per_pick_vnd: POINT_COST_VND_FOUR,
    total_predicted: totalPredicted,
    total_hits: totalHits,
    total_occurrences: totalOcc,
    total_actual: totalActual,
    hit_rate_pct: Math.round(hitRate * 1000) / 1000,
    coverage_pct: Math.round(coverage * 100) / 100,
    lift_vs_baseline: baseline > 0 ? Math.round((hitRate / baseline) * 100) / 100 : 0,
    total_cost_vnd: totalCost,
    total_win_vnd: totalWin,
    total_profit_vnd: totalProfit,
    roi_pct: Math.round(roi * 100) / 100,
    break_even_occurrences_per_day: Math.round(breakEvenOcc * 1000) / 1000,
    tiers,
    days: dayResults,
    candidate_pool_size_avg: Math.round(avgPool),
    total_observations: totalObsAggregated,
  };
}
