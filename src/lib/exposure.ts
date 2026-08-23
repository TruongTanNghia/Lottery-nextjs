/**
 * Liability / Exposure — what the book owes if a number lands.
 *
 * The limit board answers "how long since lô 27 came?". That is a proxy for
 * risk. This answers the question a book actually has to answer: "if lô 27
 * lands tomorrow, what do I pay, and where does the day end up?" — which
 * depends on the money taken, not on the calendar.
 *
 * Nothing here predicts anything. It prices the position that already exists.
 */
import type { Region } from "@/lib/types";

/**
 * Prize positions counted per draw, per region.
 *
 * Miền Nam / Trung count two đài × 18 giải; Miền Bắc is a single 27-giải
 * draw. Verified against every draw on record: 18/18/27, no exceptions.
 */
export const POSITIONS: Record<Region, number> = { xsmn: 36, xsmt: 36, xsmb: 27 };

/** What one point of lô costs the customer, in đồng. */
export const STAKE_PRICE: Record<Region, number> = { xsmn: 27_000, xsmt: 27_000, xsmb: 20_250 };

/** Paid out per point, per time the lô appears. */
export const WIN_PER_POINT = 75_000;

/**
 * How often one lô lands per draw, on average — positions ÷ 100.
 *
 * Arithmetic, not an estimate: every prize position is an independent draw of
 * a two-digit number, so a given lô occupies each one with probability 1/100.
 */
export function hitsPerDraw(region: Region): number {
  return POSITIONS[region] / 100;
}

/** Break-even stake price: below this the book loses money by design. */
export function fairPrice(region: Region): number {
  return hitsPerDraw(region) * WIN_PER_POINT;
}

/** House edge at the current price, as a fraction (0.03 = 3%). */
export function margin(region: Region): number {
  const price = STAKE_PRICE[region];
  return (price - fairPrice(region)) / price;
}

/** Stake price that would produce the requested margin. */
export function priceForMargin(region: Region, target: number): number {
  return fairPrice(region) / (1 - target);
}

/** Payout per hit that would produce the requested margin at today's price. */
export function payoutForMargin(region: Region, target: number): number {
  return (STAKE_PRICE[region] * (1 - target)) / hitsPerDraw(region);
}

export interface Book {
  /** lô → points taken. Missing lô count as zero. */
  points: Record<string, number>;
  region: Region;
}

export interface LoExposure {
  lo: string;
  points: number;
  /** Money taken on this lô. */
  taken: number;
  /** Paid out each time it lands. */
  perHit: number;
  /**
   * Where the day ends up if this lô lands exactly once and every other lô
   * behaves averagely — the number that says which lô can hurt.
   */
  netIfOnce: number;
  /** Same, landing twice ("hai nháy"). */
  netIfTwice: number;
  /** Share of the whole book riding on this one number. */
  share: number;
}

export interface BookSummary {
  region: Region;
  totalPoints: number;
  /** Money in. */
  taken: number;
  /** Money out, on an average draw. */
  expectedPayout: number;
  /** taken − expectedPayout. Zero at a zero-margin price, whatever the spread. */
  expectedProfit: number;
  /** Everything paid out if every lô landed once — the theoretical ceiling. */
  worstCaseAllOnce: number;
  perLo: LoExposure[];
  /** Sorted by damage, worst first. */
  riskiest: LoExposure[];
  /** How lopsided the book is: 1 = all on one number, 0 = perfectly spread. */
  concentration: number;
}

export function analyseBook({ points, region }: Book): BookSummary {
  const price = STAKE_PRICE[region];
  const rate = hitsPerDraw(region);

  const los = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
  const pointsOf = (lo: string) => Math.max(0, points[lo] ?? 0);

  const totalPoints = los.reduce((s, lo) => s + pointsOf(lo), 0);
  const taken = totalPoints * price;
  const expectedPayout = totalPoints * WIN_PER_POINT * rate;
  const expectedProfit = taken - expectedPayout;

  const perLo: LoExposure[] = los.map((lo) => {
    const p = pointsOf(lo);
    const perHit = p * WIN_PER_POINT;
    return {
      lo,
      points: p,
      taken: p * price,
      perHit,
      // Landing k times moves the day by (k − rate) × perHit against the book;
      // every other lô is left at its average, so this isolates one number.
      netIfOnce: expectedProfit - perHit * (1 - rate),
      netIfTwice: expectedProfit - perHit * (2 - rate),
      share: totalPoints > 0 ? p / totalPoints : 0,
    };
  });

  // Herfindahl index: the standard way to say "how much of this sits on one
  // number". A flat book scores 0.01; everything on a single lô scores 1.
  const concentration = perLo.reduce((s, l) => s + l.share * l.share, 0);

  return {
    region,
    totalPoints,
    taken,
    expectedPayout,
    expectedProfit,
    worstCaseAllOnce: totalPoints * WIN_PER_POINT,
    perLo,
    riskiest: [...perLo].sort((a, b) => a.netIfOnce - b.netIfOnce),
    concentration,
  };
}

/**
 * Reads a pasted bet string into points per lô.
 *
 * Accepts what the operator already sends out and gets back — "27b50n",
 * "27b50", "27b50dd50" — with any of space, comma or newline between entries,
 * and an optional province prefix before a colon. Repeats add up rather than
 * overwrite, because two customers can back the same number.
 */
export function parseBetString(input: string): {
  points: Record<string, number>;
  entries: number;
  hasDe: boolean;
  bad: string[];
} {
  // Drop a leading "st tv ag ...:" province list if one is present.
  const body = input.includes(":") ? input.slice(input.indexOf(":") + 1) : input;

  const points: Record<string, number> = {};
  const bad: string[] = [];
  let entries = 0;
  let hasDe = false;

  for (const rawToken of body.split(/[\s,;]+/)) {
    const token = rawToken.trim();
    if (!token) continue;

    const m = /^(\d{1,2})b(\d+)n?(?:dd(\d+)n?)?$/i.exec(token);
    if (!m) {
      bad.push(token);
      continue;
    }
    if (m[3] !== undefined) hasDe = true;

    const lo = m[1].padStart(2, "0");
    points[lo] = (points[lo] ?? 0) + Number(m[2]);
    entries++;
  }

  return { points, entries, hasDe, bad };
}
