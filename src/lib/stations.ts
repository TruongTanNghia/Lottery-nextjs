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
    // Off until switched on: turning it on rewrites every limit, and that has
    // to be a decision someone made, not a default that arrived with a deploy.
    return { enabled: false, exclude: DEFAULT_EXCLUDE[region] };
  }
  try {
    const p = JSON.parse(raw);
    return {
      enabled: p.enabled === true,
      exclude: p.exclude && typeof p.exclude === "object" ? p.exclude : DEFAULT_EXCLUDE[region],
    };
  } catch {
    return { enabled: false, exclude: DEFAULT_EXCLUDE[region] };
  }
}

export async function saveStationConfig(region: Region, cfg: StationConfig): Promise<void> {
  await setConfigValue(
    key(region),
    JSON.stringify({ enabled: cfg.enabled === true, exclude: cfg.exclude ?? {} })
  );
}

/** Does this province's draw on this date count toward the lô board? */
export function countsToward(cfg: StationConfig, dateStr: string, province: string): boolean {
  if (!cfg.enabled) return true;
  return !(cfg.exclude[weekdayOf(dateStr)] ?? []).includes(province);
}

export { DEFAULT_EXCLUDE };
