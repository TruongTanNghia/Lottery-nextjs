/**
 * GOLDEN SEGMENT meta-prediction ("Quãng vàng" — VIP Tổng Hợp).
 *
 * Instead of always betting the top of each model's ranking, this layer
 * backtests the last N days and finds WHICH SEGMENT of each model's ranking
 * (e.g. rank 1-5, 6-10, 11-15…) most frequently produces actual hits.
 *
 * The 2 best-performing segments per model are aggregated into a unified
 * VIP board across 4 prediction types: lô 2 chân, lô 3 chân, đá nóng, đá lạnh.
 *
 * Compute budget: this is heavy (~30 days × 4 models replay). Endpoint must
 * be on-demand only (no auto-refresh) and is cached for 60 min per region+days.
 */
import { query, type Region } from "./db";
import { predict } from "./prediction";
import { predictThreeDigit, backtestThreeDigit } from "./prediction-three";
import { predictPair, predictPairCold, backtestPair } from "./prediction-pair";

export type GoldenModel = "lo2" | "lo3" | "pair_hot" | "pair_cold";

const MODEL_LABELS: Record<GoldenModel, string> = {
  lo2: "Lô 2 chân",
  lo3: "Lô 3 chân",
  pair_hot: "Đá nóng",
  pair_cold: "Đá lạnh",
};

const SEGMENT_SIZE = 5;
const MAX_RANK = 50;             // analyze top 50 → 10 segments
const TOP_SEGMENTS_TO_PICK = 2;  // pick 2 best segments → 10 picks per model

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SegmentStat {
  range_start: number;
  range_end: number;
  label: string;             // "Quãng 1-5"
  total_hits: number;        // # of picks in segment that hit (distinct, across days)
  total_occurrences: number; // sum of occurrence counts (3-chân may hit multi-times/day)
  days_with_hit: number;     // # days at least 1 segment pick hit
  hit_rate_pct: number;      // total_hits / (segment_size × days) × 100
}

export interface GoldenPick {
  rank: number;       // 1-based rank in the original prediction list
  value: string;      // "23" for lô, "234" for 3-chân, "12-34" for pair
  segment_start: number;
}

export interface GoldenModelResult {
  model: GoldenModel;
  label: string;
  days_used: number;
  segments: SegmentStat[];     // all segments sorted by total_hits desc
  top_segments: SegmentStat[]; // 2 best
  picks: GoldenPick[];          // 10 picks pulled from current prediction at the top-2 segments
  warning?: string;
}

export interface VipBoardResult {
  region: Region;
  window_days: number;
  segment_size: number;
  max_rank: number;
  computed_at: string;
  cached_until: string;
  lo2: GoldenModelResult;
  lo3: GoldenModelResult;
  pair_hot: GoldenModelResult;
  pair_cold: GoldenModelResult;
}

// ─────────────────────────────────────────────
// Core: bin per-day ranked picks vs actuals into size-5 segments
// ─────────────────────────────────────────────

interface DayRun {
  date: string;
  ranked: string[];                    // top maxRank picks for that date (rank 1 → maxRank)
  actual: Set<string> | Map<string, number>;  // Set for hit-once models (lô2, pair), Map for multi-occ (lô3)
}

function binSegments(days: DayRun[], segSize: number, maxRank: number): SegmentStat[] {
  const segStarts: number[] = [];
  for (let s = 1; s <= maxRank; s += segSize) segStarts.push(s);

  const acc = new Map<number, { hits: number; occ: number; dayHits: number }>();
  for (const s of segStarts) acc.set(s, { hits: 0, occ: 0, dayHits: 0 });

  let daysUsed = 0;
  for (const day of days) {
    if (day.ranked.length === 0) continue;
    daysUsed++;
    for (const s of segStarts) {
      const seg = day.ranked.slice(s - 1, s - 1 + segSize);
      let segHits = 0;
      let segOcc = 0;
      for (const v of seg) {
        if (day.actual instanceof Map) {
          const c = day.actual.get(v) ?? 0;
          if (c > 0) { segHits++; segOcc += c; }
        } else {
          if (day.actual.has(v)) { segHits++; segOcc++; }
        }
      }
      const a = acc.get(s)!;
      a.hits += segHits;
      a.occ += segOcc;
      if (segHits > 0) a.dayHits++;
    }
  }

  return segStarts.map((s) => {
    const end = Math.min(s + segSize - 1, maxRank);
    const size = end - s + 1;
    const a = acc.get(s)!;
    const totalPossible = size * daysUsed;
    return {
      range_start: s,
      range_end: end,
      label: `Quãng ${s}-${end}`,
      total_hits: a.hits,
      total_occurrences: a.occ,
      days_with_hit: a.dayHits,
      hit_rate_pct: totalPossible > 0 ? Math.round((a.hits / totalPossible) * 10000) / 100 : 0,
    };
  });
}

function pickTopSegments(segments: SegmentStat[]): SegmentStat[] {
  // Sort by total_hits desc, tiebreak by hit_rate desc, then by lower range_start (favor higher ranks).
  return [...segments]
    .sort((a, b) =>
      b.total_hits - a.total_hits ||
      b.hit_rate_pct - a.hit_rate_pct ||
      a.range_start - b.range_start
    )
    .slice(0, TOP_SEGMENTS_TO_PICK);
}

// ─────────────────────────────────────────────
// Helpers: get actuals per date (one query each)
// ─────────────────────────────────────────────

async function getLoSetForDate(region: Region, date: string): Promise<Set<string>> {
  const rows = await query<{ lo_number: string }>(
    `SELECT DISTINCT lo_number FROM lo_daily WHERE region = ? AND date = ?`,
    [region, date]
  );
  return new Set(rows.map((r) => r.lo_number));
}

async function get3DigitMapForDate(region: Region, date: string): Promise<Map<string, number>> {
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

async function getRecentDates(region: Region, windowDays: number): Promise<string[]> {
  const rows = await query<{ date: string }>(
    `SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT ?`,
    [region, windowDays]
  );
  return rows.map((r) => r.date).reverse();
}

// ─────────────────────────────────────────────
// Per-model golden-segment finders
// ─────────────────────────────────────────────

async function findGoldenLo2(region: Region, dates: string[]): Promise<GoldenModelResult> {
  // Replay: for each date, get the full ranked lô prediction made with data BEFORE date,
  // then compare against actual lô that came that date.
  //
  // Note: We use predict() (not predictTopNHistorical) because the latter signals
  // `using_default=true` whenever adaptive weights lack performance history — but the
  // picks are still valid ensemble output. predict() always returns the full ranked
  // 100-lô list as long as ≥5 days of history exist.
  const dayRuns: DayRun[] = [];
  for (const date of dates) {
    const [pred, actual] = await Promise.all([
      predict(region, 60, date),
      getLoSetForDate(region, date),
    ]);
    if (pred.predictions.length === 0) continue;  // <5 days history → skip
    const ranked = pred.predictions.slice(0, MAX_RANK).map((p) => p.lo_number);
    dayRuns.push({ date, ranked, actual });
  }

  const segments = binSegments(dayRuns, SEGMENT_SIZE, MAX_RANK);
  const top = pickTopSegments(segments);

  // Current prediction (no endDate = today's data)
  const current = await predict(region, 60);
  const picks: GoldenPick[] = [];
  if (current.predictions.length > 0 && top.length > 0) {
    for (const seg of top) {
      const slice = current.predictions
        .slice(seg.range_start - 1, seg.range_end)
        .map((p) => ({
          rank: p.rank,
          value: p.lo_number,
          segment_start: seg.range_start,
        }));
      picks.push(...slice);
    }
  }

  return {
    model: "lo2",
    label: MODEL_LABELS.lo2,
    days_used: dayRuns.length,
    segments,
    top_segments: top,
    picks,
    warning: dayRuns.length < 5 ? "Quá ít ngày data — kết quả ko đáng tin" : undefined,
  };
}

async function findGoldenLo3(region: Region, days: number): Promise<GoldenModelResult> {
  // Re-use backtestThreeDigit with topK=MAX_RANK; re-bin its days[].predicted_top into size-5 segments.
  const bt = await backtestThreeDigit(region, days, MAX_RANK, 120, 600_000);

  const dayRuns: DayRun[] = await Promise.all(
    bt.days.map(async (d) => ({
      date: d.date,
      ranked: d.predicted_top,
      actual: await get3DigitMapForDate(region, d.date),
    }))
  );

  const segments = binSegments(dayRuns, SEGMENT_SIZE, MAX_RANK);
  const top = pickTopSegments(segments);

  const current = await predictThreeDigit(region, 120);
  const picks: GoldenPick[] = [];
  if (current.predictions.length > 0 && top.length > 0) {
    for (const seg of top) {
      const slice = current.predictions
        .slice(seg.range_start - 1, seg.range_end)
        .map((p) => ({
          rank: p.rank,
          value: p.number,
          segment_start: seg.range_start,
        }));
      picks.push(...slice);
    }
  }

  return {
    model: "lo3",
    label: MODEL_LABELS.lo3,
    days_used: dayRuns.length,
    segments,
    top_segments: top,
    picks,
    warning: dayRuns.length < 5 ? "Quá ít ngày data — kết quả ko đáng tin" : undefined,
  };
}

async function findGoldenPair(
  region: Region,
  days: number,
  mode: "hot" | "cold"
): Promise<GoldenModelResult> {
  // Re-use backtestPair with topK=MAX_RANK; re-bin days[].predicted_pairs into segments.
  // For cold mode, narrower window (30d) matches predictPairCold's natural design.
  const windowDays = mode === "cold" ? 30 : 120;
  const topNSource = mode === "cold" ? 30 : 35;
  const bt = await backtestPair(region, days, MAX_RANK, windowDays, topNSource, 17, mode);

  const dayRuns: DayRun[] = await Promise.all(
    bt.days.map(async (d) => ({
      date: d.date,
      ranked: d.predicted_pairs.map((p) => `${p.lo_a}-${p.lo_b}`),
      actual: await getLoSetForDate(region, d.date),
    }))
  );

  // Re-derive "hit" for a pair string: split, check both lô in actual set.
  // The default binSegments treats actual as a string-Set test, but pair format is "AA-BB"
  // where we need to check BOTH lô. Override by pre-converting ranked → hit/not hit.
  // Simplest: rebuild segments with custom hit check inline.
  const segments = binPairSegments(dayRuns, SEGMENT_SIZE, MAX_RANK);
  const top = pickTopSegments(segments);

  // Current pair prediction → pull picks from top segments
  const current = mode === "cold"
    ? await predictPairCold(region, 30, 30, MAX_RANK)
    : await predictPair(region, 120, 35, MAX_RANK);
  const picks: GoldenPick[] = [];
  if (current.pairs.length > 0 && top.length > 0) {
    for (const seg of top) {
      const slice = current.pairs
        .slice(seg.range_start - 1, seg.range_end)
        .map((p) => ({
          rank: p.rank,
          value: `${p.lo_a}-${p.lo_b}`,
          segment_start: seg.range_start,
        }));
      picks.push(...slice);
    }
  }

  return {
    model: mode === "hot" ? "pair_hot" : "pair_cold",
    label: mode === "hot" ? MODEL_LABELS.pair_hot : MODEL_LABELS.pair_cold,
    days_used: dayRuns.length,
    segments,
    top_segments: top,
    picks,
    warning: dayRuns.length < 5 ? "Quá ít ngày data — kết quả ko đáng tin" : undefined,
  };
}

// Pair-specific segment binning: pair = "AA-BB" hits if BOTH AA and BB in actual Lo set.
function binPairSegments(days: DayRun[], segSize: number, maxRank: number): SegmentStat[] {
  const segStarts: number[] = [];
  for (let s = 1; s <= maxRank; s += segSize) segStarts.push(s);

  const acc = new Map<number, { hits: number; dayHits: number }>();
  for (const s of segStarts) acc.set(s, { hits: 0, dayHits: 0 });

  let daysUsed = 0;
  for (const day of days) {
    if (day.ranked.length === 0) continue;
    daysUsed++;
    const actualSet = day.actual instanceof Set ? day.actual : new Set<string>();
    for (const s of segStarts) {
      const seg = day.ranked.slice(s - 1, s - 1 + segSize);
      let segHits = 0;
      for (const pairStr of seg) {
        const [a, b] = pairStr.split("-");
        if (actualSet.has(a) && actualSet.has(b)) segHits++;
      }
      const a = acc.get(s)!;
      a.hits += segHits;
      if (segHits > 0) a.dayHits++;
    }
  }

  return segStarts.map((s) => {
    const end = Math.min(s + segSize - 1, maxRank);
    const size = end - s + 1;
    const a = acc.get(s)!;
    const totalPossible = size * daysUsed;
    return {
      range_start: s,
      range_end: end,
      label: `Quãng ${s}-${end}`,
      total_hits: a.hits,
      total_occurrences: a.hits, // for pair, occurrence == hit (binary per-day per-pair)
      days_with_hit: a.dayHits,
      hit_rate_pct: totalPossible > 0 ? Math.round((a.hits / totalPossible) * 10000) / 100 : 0,
    };
  });
}

// ─────────────────────────────────────────────
// In-memory cache (60-min TTL, keyed by region+days)
// Survives within a warm serverless instance only — that's enough to protect quota.
// ─────────────────────────────────────────────

interface CacheEntry {
  expiresAt: number;
  result: VipBoardResult;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function cacheKey(region: Region, days: number): string {
  return `${region}:${days}`;
}

// ─────────────────────────────────────────────
// Aggregator
// ─────────────────────────────────────────────

export async function buildVipBoard(
  region: Region,
  windowDays: number = 30,
  bypassCache: boolean = false
): Promise<VipBoardResult> {
  const key = cacheKey(region, windowDays);
  if (!bypassCache) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.result;
  }

  const dates = await getRecentDates(region, windowDays);

  // Run all 4 model analyses in parallel. They share Turso connection pool but each
  // runs its own per-date replay; total wall time ≈ slowest single model.
  const [lo2, lo3, pairHot, pairCold] = await Promise.all([
    findGoldenLo2(region, dates),
    findGoldenLo3(region, windowDays),
    findGoldenPair(region, windowDays, "hot"),
    findGoldenPair(region, windowDays, "cold"),
  ]);

  const now = Date.now();
  const result: VipBoardResult = {
    region,
    window_days: windowDays,
    segment_size: SEGMENT_SIZE,
    max_rank: MAX_RANK,
    computed_at: new Date(now).toISOString(),
    cached_until: new Date(now + CACHE_TTL_MS).toISOString(),
    lo2,
    lo3,
    pair_hot: pairHot,
    pair_cold: pairCold,
  };

  cache.set(key, { expiresAt: now + CACHE_TTL_MS, result });
  return result;
}
