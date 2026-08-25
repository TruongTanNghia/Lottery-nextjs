/**
 * Which đài (province draws) actually count.
 *
 * The bookie only takes bets on two đài per region per day, but the source
 * pages publish three (four on Saturday in Miền Nam). A lô that landed only in
 * an uncounted đài must not read as "về" — otherwise its limit drops on a
 * result nobody could bet on.
 *
 * The raw draw stays in lottery_results either way; this rule decides what
 * gets written into lo_daily, which is what every limit is computed from. That
 * split is deliberate: the results page can still show the whole draw, and the
 * rule can be changed and replayed over history without re-scraping.
 */
import { getConfigValue, setConfigValue } from "@/lib/db";
import type { Region } from "@/lib/types";

/** Index matches Date.getUTCDay(): 0 = Chủ Nhật. */
export const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Weekday → province names to drop, exactly as stored in lottery_results. */
export type ExcludeMap = Partial<Record<Weekday, string[]>>;

export interface StationConfig {
  enabled: boolean;
  exclude: ExcludeMap;
  /**
   * Prize tiers that do not count as a hit, e.g. ["G.8"].
   *
   * This is the same lever as dropping a đài, one notch finer, and it is the
   * only one that moves the margin without touching the price. Each region
   * pays 75.000đ per hit against a fixed stake, so the margin is decided
   * purely by how many prize positions count: 36 positions is break-even at
   * 27.000đ, and 34 leaves 5,56%. Verified across 181 real draws — a flat
   * book returns exactly 5,56% on every single one of them.
   *
   * It is a change to what the customer is buying, not a hidden fee: whoever
   * bets has to be told the tier does not count.
   */
  excludePrizes: string[];
}

/**
 * The bookie's list, verified against 181 draws: after these come out, every
 * single day leaves exactly two đài standing in both regions.
 */
const DEFAULT_EXCLUDE: Record<Region, ExcludeMap> = {
  xsmn: {
    T2: ["Cà Mau"],
    T3: ["Bạc Liêu"],
    T4: ["Sóc Trăng"],
    T5: ["Bình Thuận"],
    T6: ["Trà Vinh"],
    T7: ["Bình Phước", "Hậu Giang"],
    CN: ["Đà Lạt"],
  },
  xsmt: {
    T5: ["Quảng Bình"],
    T7: ["Đắc Nông"],
    CN: ["Thừa Thiên Huế"],
  },
  // One draw a day, nothing to drop.
  xsmb: {},
};

const key = (region: Region) => `stations:${region}`;

export function weekdayOf(dateStr: string): Weekday {
  const [y, m, d] = dateStr.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export async function loadStationConfig(region: Region): Promise<StationConfig> {
  const raw = await getConfigValue(key(region));
  if (!raw) {
    // On by default. It started off so that nobody's limits moved without a
    // decision — but the decision has since been made, and leaving it off is
    // not neutral: counting every đài means 56,6 hits a draw in Miền Nam
    // against a price built for 36, which is a −57% margin on every single
    // draw. A default that quietly loses money is not a safe default.
    return { enabled: true, exclude: DEFAULT_EXCLUDE[region], excludePrizes: [] };
  }
  try {
    const p = JSON.parse(raw);
    return {
      enabled: p.enabled === true,
      exclude: p.exclude && typeof p.exclude === "object" ? p.exclude : DEFAULT_EXCLUDE[region],
      excludePrizes: Array.isArray(p.excludePrizes) ? p.excludePrizes.map(String) : [],
    };
  } catch {
    return { enabled: true, exclude: DEFAULT_EXCLUDE[region], excludePrizes: [] };
  }
}

export async function saveStationConfig(region: Region, cfg: StationConfig): Promise<void> {
  await setConfigValue(
    key(region),
    JSON.stringify({
      enabled: cfg.enabled === true,
      exclude: cfg.exclude ?? {},
      excludePrizes: cfg.excludePrizes ?? [],
    })
  );
}

/** Does this province's draw on this date count toward the lô board? */
export function countsToward(cfg: StationConfig, dateStr: string, province: string): boolean {
  if (!cfg.enabled) return true;
  return !(cfg.exclude[weekdayOf(dateStr)] ?? []).includes(province);
}

/**
 * Does this prize tier count as a hit?
 *
 * Independent of the đài switch: a house can drop a tier while still counting
 * every đài, and the margin follows the position count either way.
 */
export function prizeCounts(cfg: StationConfig, prizeType: string): boolean {
  return !(cfg.excludePrizes ?? []).includes(prizeType);
}

export { DEFAULT_EXCLUDE };
