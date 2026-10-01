/**
 * Limit Engine — port of backend/limit_engine.py
 *
 * Bảng hạn mức mỗi miền có 24 ô, mỗi ô đứng riêng và ô nào cũng có số của nó
 * (xem lich-han-muc.ts): 20 ô "n ngày chưa về", ô "20+", ba ô "về liên tiếp
 * 2/3/4 kỳ". 0 là chặn. Sửa trên web, lưu trong lottery_config.
 */
import {
  getAppearanceCounts,
  getConfigValue,
  query,
  setConfigValue,
  type LoStatus,
  type Region,
  VALID_REGIONS,
} from "./db";
import {
  chuanHoaLich,
  docO,
  dungTrangThai,
  khoaO,
  mucTheoLich,
  oCua,
  tenO,
  type OLich,
  type Schedule,
} from "./lich-han-muc";

export { SCHEDULE_SLOTS, type Schedule } from "./lich-han-muc";

export const APPEARANCE_WINDOW_DAYS = 30;

export const POINT_VALUE = 23000;
export const WIN_MULTIPLIER = 80;
export const PRICE_PER_POINT = 75;
export const COST_MULTIPLIER: Record<Region, number> = {
  xsmn: 18,
  xsmt: 18,
  xsmb: 27,
};

// Per-region config keys. The original single "schedule" key meant editing one
// region silently rewrote all three — the regions have different draw counts
// (27 vs 18 numbers a day) so they need different limits.
const scheduleKey = (region: Region) => `schedule:${region}`;
const LEGACY_KEY = "schedule";

/**
 * Lịch của một miền, ĐÃ chuẩn hoá: đủ 24 ô. Ô nào bản lưu không có thì là 0
 * (chặn) và được kể trong `thieu`, để màn hình nói ra.
 *
 * Không nhớ tạm trong bộ nhớ. Bản cũ giữ lịch 30 giây, mà trên Vercel mỗi
 * đường API có thể là một tiến trình riêng: bấm Lưu ở tiến trình này thì tiến
 * trình trả bảng 100 lô vẫn tính bằng lịch cũ tới nửa phút — "lưu rồi mà máy
 * chưa chặn". Một lần đọc cấu hình rẻ hơn nhiều so với một con số sai.
 */
export async function docLich(region: Region): Promise<{ lich: Schedule; thieu: OLich[] }> {
  // Fall back to the shared key so a region never loses its settings before
  // it has been saved individually.
  const raw = (await getConfigValue(scheduleKey(region))) ?? (await getConfigValue(LEGACY_KEY));
  if (!raw) return chuanHoaLich(null);
  try {
    return chuanHoaLich(JSON.parse(raw));
  } catch {
    // Bản lưu hỏng không đọc được: không đoán, không lùi về bảng mặc định (bảng
    // đó NHẬN mọi lô tới 200n). Coi như chưa ô nào có số — chặn hết và báo ra.
    return chuanHoaLich({});
  }
}

export async function loadSchedule(region: Region): Promise<Schedule> {
  return (await docLich(region)).lich;
}

/** Ghi đủ 24 ô, kể cả ô 0 — bản lưu không bao giờ còn "ô thiếu" để ai phải đoán. */
export async function saveSchedule(region: Region, cfg: Schedule): Promise<void> {
  await setConfigValue(scheduleKey(region), JSON.stringify(chuanHoaLich(cfg).lich));
}

// ─────────────────────────────────────────────
// Limit calculation
// ─────────────────────────────────────────────

/** Số ở ô ngày ứng với độ khô này (không xét chuỗi). */
export function calculateBaseLimit(daysSinceLast: number, schedule: Schedule): number {
  return docO(schedule, oCua(daysSinceLast, 0));
}

/**
 * A lô on a streak gets its own level, not a ceiling on the base one.
 *
 * The operator asked to tell three things apart that were being priced as one:
 * a lô that just landed for the first time, and a lô that has landed two, three
 * or four kỳ running. Their words: "linh hoạt có thể ko ăn lô vừa về, nhưng có
 * thể ăn con lô về liên tiếp 2 ngày."
 *
 * Mỗi trạng thái rơi vào đúng một ô và lấy đúng số của ô đó — `mucTheoLich`
 * là chỗ duy nhất làm việc này. Bản trước cho ô liên tiếp "lùi" về ô ngày 0
 * khi nó không có trong bản lưu, và đó là cách một ô hiện 0 trên màn hình lại
 * được nhận 100n.
 */
export function calculateEffectiveLimit(
  daysSinceLast: number,
  consecutiveDays: number,
  schedule: Schedule
): number {
  return mucTheoLich(schedule, daysSinceLast, consecutiveDays);
}

// ─────────────────────────────────────────────
// Pricing helpers (Thu / Bù)
// ─────────────────────────────────────────────

export function getBetCost(points: number, region: Region): number {
  return points * COST_MULTIPLIER[region] * PRICE_PER_POINT;
}

export function getWinAmount(points: number, occurrences: number = 1): number {
  return points * PRICE_PER_POINT * occurrences;
}

// ─────────────────────────────────────────────
// lo_status — bản chép của trạng thái, cho các trang phụ
// ─────────────────────────────────────────────

/**
 * Chạy lại toàn bộ lịch sử rồi ghi lo_status. Mỗi miền đúng hai lượt tới DB
 * (một đọc, một ghi gộp).
 *
 * Đây là đường GHI duy nhất. Trước còn một đường "cập nhật từng ngày"
 * (updateAllLoStatus) cho cron và trang Hôm nay; nó sai theo hai kiểu, cả hai
 * đều không báo lỗi: xử lý một ngày khi đài chưa xổ xong thì lô về sau trong
 * cùng kỳ bị cắt chuỗi về 1, và kho hổng quá ba ngày thì những ngày ở giữa
 * không bao giờ được tính. Chạy lại từ đầu thì kết quả chỉ phụ thuộc lo_daily.
 *
 * Bảng 100 lô và bot KHÔNG đọc lo_status nữa (xem getLimitSummary) — bảng này
 * chỉ còn phục vụ các trang phụ đọc thẳng nó.
 */
export async function recalculateAllFromHistory(region?: Region): Promise<void> {
  const regions: Region[] = region ? [region] : [...VALID_REGIONS];
  const { getDb } = await import("./db");

  for (const rgn of regions) {
    // Each region carries its own schedule now — must be read inside the loop.
    const schedule = await loadSchedule(rgn);

    const rows = await query<{ date: string; lo_number: string }>(
      "SELECT date, lo_number FROM lo_daily WHERE region = ? ORDER BY date ASC",
      [rgn]
    );
    if (rows.length === 0) continue;

    const { lo } = dungTrangThai(rows);
    await getDb().batch(
      [...lo].map(([so, st]) => ({
        sql: `UPDATE lo_status SET last_appeared_date = ?, days_since_last = ?,
              consecutive_days = ?, current_limit = ?, updated_at = CURRENT_TIMESTAMP
              WHERE lo_number = ? AND region = ?`,
        args: [st.last, st.days, st.consec, mucTheoLich(schedule, st.days, st.consec), so, rgn],
      })),
      "write"
    );
  }
}

// ─────────────────────────────────────────────
// Live summary (compute days_since_last on the fly so it's always current)
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Rhythm ("nhịp") — which lô are worth watching
// ─────────────────────────────────────────────
//
// The operator only wants to watch numbers that come back on a steady beat,
// and only once that beat is due. A lô that drops in at random gaps carries no
// signal for them, so it stays off the watchlist.
//
// Steady = the gaps between appearances cluster tightly, measured by the
// coefficient of variation (sd / mean). Tuned on 180 days of real data: ≥3 gaps
// with CV ≤ 0.5 leaves ~5-13 lô per region, which is a watchlist a person can
// actually act on. Looser settings return half the board.
/**
 * Must match the strip drawn on the board. It used to be 30 while only 7
 * squares were shown, so a lô labelled "~8.7 kỳ" appeared as a single mark in
 * seven — the figure was right but unverifiable, and read as broken. A shorter
 * window also drops lô whose "rhythm" only exists because the window was long
 * enough to average two distant hits.
 */
export const RHYTHM_WINDOW_DRAWS = 15;
export const RHYTHM_MIN_GAPS = 3;
// Tightened from 0.5 when the window shrank to 15. Fewer gaps means a lower
// spread by chance, so the old threshold let 47 lô through in one region —
// back to a list too long to act on. 0.35 leaves 18/6/6.
export const RHYTHM_MAX_CV = 0.35;
/**
 * A watched lô must still be RUNNING on its beat — quiet at most this many
 * draws. Watching for "overdue" instead (quiet ≥ its own average gap) put lô
 * that had been gone 7-8 draws on the list: those have broken the rhythm, not
 * come due. It also contradicted a cap on quiet draws, since average gaps run
 * 2-5 — the two conditions together left the board empty.
 */
export const RHYTHM_MAX_QUIET = 2;
/** A watched lô takes half the money a normal one would. */
export const TRACKED_LIMIT_FACTOR = 0.5;

export interface Rhythm {
  appearances: number;
  mean_gap: number;
  cv: number;
  draws_since_last: number;
  regular: boolean;
  due: boolean;
}

// ── Top-N watchlist ──────────────────────────────────────────
// The operator also wants the hottest (or coldest) lô of the last few draws
// on half money. That selection drives real limits, so it lives on the server
// — keeping it in the browser would make the board, the 100-lô grid and the
// copied bet string disagree with each other.
export const TOP_WINDOW_DRAWS = 7;

export interface TopConfig {
  size: number;
  dir: "cold" | "hot";
  /** List is active — lô get flagged. */
  enabled: boolean;
  /** Being on the list cuts the limit in half. Separate, like the rhythm list. */
  halve: boolean;
}

const DEFAULT_TOP: TopConfig = { size: 10, dir: "hot", enabled: true, halve: true };
const topKey = (region: Region) => `top:${region}`;

export async function loadTopConfig(region: Region): Promise<TopConfig> {
  const raw = await getConfigValue(topKey(region));
  if (!raw) return DEFAULT_TOP;
  try {
    const p = JSON.parse(raw);
    return {
      size: Math.min(Math.max(Number(p.size) || DEFAULT_TOP.size, 0), 100),
      dir: p.dir === "cold" ? "cold" : "hot",
      enabled: p.enabled !== false,
      // Saved before this switch existed: "enabled" then meant "halve", so
      // inherit it rather than silently turning the discount back on.
      halve: p.halve === undefined ? p.enabled !== false : p.halve !== false,
    };
  } catch {
    return DEFAULT_TOP;
  }
}

// ── Rhythm watchlist switches ────────────────────────────────
// Two independent toggles, per region: whether the beat watchlist runs at all,
// and whether being on it halves the limit. Kept apart so the board can be
// used purely to look at without touching money.
export interface WatchConfig {
  enabled: boolean;
  halve: boolean;
  /** Keep only lô whose average gap falls inside [min_gap, max_gap] draws. */
  min_gap: number;
  max_gap: number;
}

const DEFAULT_WATCH: WatchConfig = { enabled: true, halve: true, min_gap: 1, max_gap: 3 };
const watchKey = (region: Region) => `watch:${region}`;

/** Clamp to a sane draw range and keep min ≤ max. */
function normaliseGaps(min: unknown, max: unknown): { min_gap: number; max_gap: number } {
  const lo = Math.min(Math.max(Number(min) || DEFAULT_WATCH.min_gap, 1), 15);
  const hi = Math.min(Math.max(Number(max) || DEFAULT_WATCH.max_gap, 1), 15);
  return { min_gap: Math.min(lo, hi), max_gap: Math.max(lo, hi) };
}

export async function loadWatchConfig(region: Region): Promise<WatchConfig> {
  const raw = await getConfigValue(watchKey(region));
  if (!raw) return DEFAULT_WATCH;
  try {
    const p = JSON.parse(raw);
    return {
      enabled: p.enabled !== false,
      halve: p.halve !== false,
      ...normaliseGaps(p.min_gap, p.max_gap),
    };
  } catch {
    return DEFAULT_WATCH;
  }
}

export async function saveWatchConfig(region: Region, cfg: WatchConfig): Promise<void> {
  await setConfigValue(
    watchKey(region),
    JSON.stringify({
      enabled: cfg.enabled !== false,
      halve: cfg.halve !== false,
      ...normaliseGaps(cfg.min_gap, cfg.max_gap),
    })
  );
}

// ── Manual watchlist ─────────────────────────────────────────
// Numbers the operator types in by hand. Same halving as the automatic lists,
// but chosen by eye rather than by rhythm — there is no rule that catches
// everything they notice.
export interface ManualConfig {
  los: string[];
  halve: boolean;
}

const DEFAULT_MANUAL: ManualConfig = { los: [], halve: true };
const manualKey = (region: Region) => `manual:${region}`;

/** Accepts "12 34", "12,34", "1 2" — anything digit-separated. */
export function parseLoList(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[^0-9]+/)) {
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 99) continue;
    seen.add(String(n).padStart(2, "0"));
  }
  return [...seen].sort();
}

export async function loadManualConfig(region: Region): Promise<ManualConfig> {
  const raw = await getConfigValue(manualKey(region));
  if (!raw) return DEFAULT_MANUAL;
  try {
    const p = JSON.parse(raw);
    return {
      los: Array.isArray(p.los) ? parseLoList(p.los.join(" ")) : [],
      halve: p.halve !== false,
    };
  } catch {
    return DEFAULT_MANUAL;
  }
}

export async function saveManualConfig(region: Region, cfg: ManualConfig): Promise<void> {
  await setConfigValue(
    manualKey(region),
    JSON.stringify({ los: parseLoList(cfg.los.join(" ")), halve: cfg.halve !== false })
  );
}

// ── Mirror pairs ─────────────────────────────────────────────
// 15↔51, 07↔70. Punters routinely back both halves of a pair in one go, so
// when the two carry the same price the exposure taken on that single decision
// is doubled — halving each brings it back to one number's worth.
//
// Doubles (00, 11, …) mirror to themselves and are not a pair, so they are
// skipped. Comparison uses the SCHEDULED limit (schedule + consecutive cap,
// before any watchlist discount) so the pairing does not depend on which
// discount happened to run first.
export interface PairConfig {
  enabled: boolean;
}

const DEFAULT_PAIR: PairConfig = { enabled: true };
const pairKey = (region: Region) => `pair:${region}`;

export const mirrorOf = (lo: string) => lo[1] + lo[0];

export async function loadPairConfig(region: Region): Promise<PairConfig> {
  const raw = await getConfigValue(pairKey(region));
  if (!raw) return DEFAULT_PAIR;
  try {
    return { enabled: JSON.parse(raw).enabled !== false };
  } catch {
    return DEFAULT_PAIR;
  }
}

export async function savePairConfig(region: Region, cfg: PairConfig): Promise<void> {
  await setConfigValue(pairKey(region), JSON.stringify({ enabled: cfg.enabled !== false }));
}

export async function saveTopConfig(region: Region, cfg: TopConfig): Promise<void> {
  await setConfigValue(
    topKey(region),
    JSON.stringify({
      size: Math.min(Math.max(Number(cfg.size) || 0, 0), 100),
      dir: cfg.dir === "cold" ? "cold" : "hot",
      enabled: cfg.enabled !== false,
      halve: cfg.halve !== false,
    })
  );
}

const EMPTY_RHYTHM: Rhythm = {
  appearances: 0,
  mean_gap: 0,
  cv: 0,
  draws_since_last: RHYTHM_WINDOW_DRAWS,
  regular: false,
  due: false,
};

/**
 * Gaps are counted in DRAWS, not calendar days — a skipped draw would otherwise
 * inflate every gap and make a steady lô look erratic.
 */
async function computeRhythms(
  region: Region,
  gapRange: { min_gap: number; max_gap: number }
): Promise<{ rhythms: Map<string, Rhythm>; recentHits: Map<string, number> }> {
  const rows = await query<{ date: string; lo_number: string }>(
    `SELECT date, lo_number FROM lo_daily
     WHERE region = ? AND date > date((SELECT MAX(date) FROM lo_daily WHERE region = ?), ?)
     ORDER BY date ASC`,
    [region, region, `-${RHYTHM_WINDOW_DRAWS + 5} day`]
  );

  const byDate = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, new Set());
    byDate.get(r.date)!.add(r.lo_number);
  }
  const all = [...byDate.keys()].sort();
  const draws = all.slice(-RHYTHM_WINDOW_DRAWS);

  // Same pass gives the short-window hit counts the Top-N board ranks on.
  const recentHits = new Map<string, number>();
  for (let i = 0; i < 100; i++) recentHits.set(String(i).padStart(2, "0"), 0);
  for (const d of all.slice(-TOP_WINDOW_DRAWS)) {
    for (const lo of byDate.get(d)!) recentHits.set(lo, (recentHits.get(lo) ?? 0) + 1);
  }

  const out = new Map<string, Rhythm>();
  for (let i = 0; i < 100; i++) {
    const lo = String(i).padStart(2, "0");
    const at: number[] = [];
    draws.forEach((d, k) => {
      if (byDate.get(d)!.has(lo)) at.push(k);
    });

    if (at.length === 0) {
      out.set(lo, { ...EMPTY_RHYTHM, draws_since_last: draws.length });
      continue;
    }

    const sinceLast = draws.length - 1 - at[at.length - 1];
    const gaps: number[] = [];
    for (let k = 1; k < at.length; k++) gaps.push(at[k] - at[k - 1]);

    if (gaps.length < RHYTHM_MIN_GAPS) {
      out.set(lo, { ...EMPTY_RHYTHM, appearances: at.length, draws_since_last: sinceLast });
      continue;
    }

    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
    const cv = mean > 0 ? sd / mean : Infinity;
    // Steady, and beating at the tempo the operator picked. Without the range
    // a "steady" 8-draw lô sat next to a 2-draw one on the same list.
    const inRange = mean >= gapRange.min_gap && mean <= gapRange.max_gap;
    const regular = cv <= RHYTHM_MAX_CV && inRange;

    out.set(lo, {
      appearances: at.length,
      mean_gap: Math.round(mean * 10) / 10,
      cv: Math.round(cv * 100) / 100,
      draws_since_last: sinceLast,
      regular,
      // On the watchlist while the beat is steady AND still running.
      due: regular && sinceLast <= RHYTHM_MAX_QUIET,
    });
  }
  return { rhythms: out, recentHits };
}

export interface LimitSummaryItem extends LoStatus {
  appearance_count: number;
  category: "hot_streak" | "consecutive" | "just_hit" | "recent" | "cooling" | "cold";
  base_limit: number;
  consecutive_penalty: number | null;
  bet_cost_vnd: number;
  win_per_hit_vnd: number;
  rhythm: Rhythm;
  /** On either watchlist. Halving is a separate switch. */
  tracked: boolean;
  in_watch: boolean;
  in_top: boolean;
  in_manual: boolean;
  /** Mirror carries the same scheduled limit → both halved. */
  in_pair: boolean;
  /** The mirror number, when in_pair. */
  pair_with: string | null;
  /** Hits over the short Top-N window. */
  recent_hits: number;
  /** What the limit would be without the watchlist discount. */
  limit_before_tracking: number;
  /** Ô của bảng hạn mức quyết định số trên: "ngay:3", "chuoi:2", "tren". */
  o_lich: string;
  /** Tên ô đó theo cách đọc trên màn hình: "ngày 3", "liên tiếp 2 kỳ", "20+ ngày". */
  o_ten: string;
}

function categorize(consec: number, days: number): LimitSummaryItem["category"] {
  if (consec >= 4) return "hot_streak";
  if (consec >= 2) return "consecutive";
  if (days === 0) return "just_hit";
  if (days <= 3) return "recent";
  if (days <= 7) return "cooling";
  return "cold";
}

export async function getLimitSummary(region: Region): Promise<LimitSummaryItem[]> {
  // Trạng thái từng lô (về lần cuối khi nào, đang liên tiếp mấy kỳ) dựng THẲNG
  // từ lo_daily ở mỗi lần đọc, không qua lo_status. lo_status là bản chép, và
  // bản chép thì có lúc cũ: kết quả mới đã vào kho mà bước tính lại chưa chạy
  // hoặc chạy lỗi. Lúc đó "số ngày" tính theo kỳ mới còn "liên tiếp" là của kỳ
  // cũ — hai nửa của cùng một lô nói hai chuyện khác nhau. Đọc từ gốc thì
  // không có trạng thái nào để mà cũ.
  const rows = await query<{ date: string; lo_number: string }>(
    "SELECT date, lo_number FROM lo_daily WHERE region = ? ORDER BY date ASC",
    [region]
  );
  const { ngayCuoi, lo: trangThai } = dungTrangThai(rows);

  // Anchor on the latest draw we have, NOT the server clock. A bet is placed
  // for the next draw, so "0 ngày" must mean "came out in the most recent
  // draw".
  //
  // Anchoring on today() silently shifted every lô by one tier once the day
  // rolled over before results were published: the "0 ngày (mới về)" bucket
  // was always empty, schedule.base[0] never applied, and 21-26 lô per region
  // got the wrong limit.
  const anchor = ngayCuoi ?? new Date().toISOString().slice(0, 10);
  const allStatus: LoStatus[] = [...trangThai].map(([lo_number, st]) => ({
    lo_number,
    region,
    last_appeared_date: st.last,
    // Chưa từng về trong kho: khô hơn cả bảng, rơi vào ô "20+".
    days_since_last: st.last ? st.days : APPEARANCE_WINDOW_DAYS,
    consecutive_days: st.consec,
    current_limit: 0,
  }));
  const counts = await getAppearanceCounts(region, anchor, APPEARANCE_WINDOW_DAYS);
  const schedule = await loadSchedule(region);
  const topCfg = await loadTopConfig(region);
  const watchCfg = await loadWatchConfig(region);
  const { rhythms, recentHits } = await computeRhythms(region, watchCfg);
  const manualCfg = await loadManualConfig(region);
  const manualSet = new Set(manualCfg.los);
  const pairCfg = await loadPairConfig(region);

  // Scheduled price of every lô, needed up front so mirrors can be compared
  // before any discount is applied.
  const scheduledOf = new Map<string, number>();
  const daysOf = new Map<string, number>();
  for (const s of allStatus) {
    daysOf.set(s.lo_number, s.days_since_last);
    scheduledOf.set(s.lo_number, mucTheoLich(schedule, s.days_since_last, s.consecutive_days));
  }

  const pairSet = new Set<string>();
  if (pairCfg.enabled) {
    for (const [lo, price] of scheduledOf) {
      const mi = mirrorOf(lo);
      if (mi === lo) continue;                       // 00, 11, … are not pairs
      if (scheduledOf.get(mi) === price) pairSet.add(lo);
    }
  }

  // Rank exactly like the Top board does, so the two never disagree. Ties are
  // broken by how long the lô has been quiet, then by number.
  const topSet = new Set<string>();
  if (topCfg.enabled && topCfg.size > 0) {
    const ranked = allStatus
      .map((s) => ({
        lo: s.lo_number,
        hits: recentHits.get(s.lo_number) ?? 0,
        quiet: rhythms.get(s.lo_number)?.draws_since_last ?? 0,
      }))
      .sort((a, b) => {
        const primary = topCfg.dir === "cold" ? a.hits - b.hits : b.hits - a.hits;
        if (primary !== 0) return primary;
        const secondary = topCfg.dir === "cold" ? b.quiet - a.quiet : a.quiet - b.quiet;
        return secondary || a.lo.localeCompare(b.lo);
      })
      .slice(0, topCfg.size);
    for (const r of ranked) topSet.add(r.lo);
  }

  return allStatus.map((status) => {
    const days = daysOf.get(status.lo_number)!;
    const consec = status.consecutive_days;
    const scheduled = scheduledOf.get(status.lo_number)!;

    // Discount is applied last, on top of the schedule and the consecutive cap,
    // so it always reads as exactly half of the cell above it. A lô caught by
    // SEVERAL rules is still halved once — never quartered.
    const rhythm = rhythms.get(status.lo_number) ?? EMPTY_RHYTHM;
    const inWatch = watchCfg.enabled && rhythm.due;
    const inTop = topSet.has(status.lo_number);   // already gated by topCfg.enabled
    const inManual = manualSet.has(status.lo_number);
    const inPair = pairSet.has(status.lo_number);
    const tracked = inWatch || inTop || inManual || inPair;
    const halve =
      (inWatch && watchCfg.halve) ||
      (inTop && topCfg.halve) ||
      (inManual && manualCfg.halve) ||
      inPair;
    // No floor clamp: the operator's own example takes 10n down to 5n, and 10n
    // is that region's minimum.
    const liveLimit = halve ? Math.round(scheduled * TRACKED_LIMIT_FACTOR) : scheduled;
    const o = oCua(days, consec);

    return {
      ...status,
      days_since_last: days,
      current_limit: liveLimit,
      appearance_count: counts[status.lo_number] ?? 0,
      category: categorize(consec, days),
      base_limit: calculateBaseLimit(days, schedule),
      consecutive_penalty: o.loai === "chuoi" ? docO(schedule, o) : null,
      bet_cost_vnd: getBetCost(liveLimit, region),
      win_per_hit_vnd: getWinAmount(liveLimit, 1),
      rhythm,
      tracked,
      in_watch: inWatch,
      in_top: inTop,
      in_manual: inManual,
      in_pair: inPair,
      pair_with: inPair ? mirrorOf(status.lo_number) : null,
      recent_hits: recentHits.get(status.lo_number) ?? 0,
      limit_before_tracking: scheduled,
      o_lich: khoaO(o),
      o_ten: tenO(o),
    };
  });
}

/**
 * Lô đang về liên tiếp từ 2 kỳ. Cùng nguồn với bảng 100 lô: trước đây khối này
 * đọc current_limit chép sẵn trong lo_status — con số chưa chia đôi và có thể
 * tính từ lịch cũ — nên cùng một lô mà hai khối trên Dashboard ghi hai mức.
 */
export async function getConsecutiveLos(region: Region) {
  const all = await getLimitSummary(region);
  return all
    .filter((s) => s.consecutive_days >= 2)
    .map((s) => ({
      lo_number: s.lo_number,
      consecutive_days: s.consecutive_days,
      current_limit: s.current_limit,
      last_appeared_date: s.last_appeared_date,
    }))
    .sort((a, b) => b.consecutive_days - a.consecutive_days);
}
