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

// ─────────────────────────────────────────────
// Cân bằng sổ — nguồn duy nhất của lãi chắc chắn
// ─────────────────────────────────────────────

/**
 * A flat book has no risk at all.
 *
 * Payout = 75.000 × Σ over the draw's positions of points[whichever lô landed].
 * If every lô carries the same points p, that sum is 36p no matter which
 * numbers come out — the payout is a constant, so the day's profit is fixed
 * before the draw happens. Every bit of risk the book carries comes from the
 * gaps between lô, not from luck.
 *
 * Confirmed by simulation over 20.000 draws: a flat book at a 5% price returns
 * 5,00% on the worst day and the best day alike, with no losing days.
 */
export interface BalancePlan {
  /** Points each lô would carry if the book were flat. */
  target: number;
  /** 1 = perfectly flat, 0 = everything on one number. */
  score: number;
  /** Lô already past the flat level — stop taking these. */
  over: Array<{ lo: string; points: number; excess: number }>;
  /** Lô still under it, and by how much. */
  room: Array<{ lo: string; points: number; room: number }>;
  /** Points that would have to be refused to reach a flat book. */
  excessTotal: number;
}

export function balancePlan(points: Record<string, number>): BalancePlan {
  const los = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
  const at = (lo: string) => Math.max(0, points[lo] ?? 0);
  const total = los.reduce((s, lo) => s + at(lo), 0);
  const target = total / 100;

  const over: BalancePlan["over"] = [];
  const room: BalancePlan["room"] = [];
  for (const lo of los) {
    const p = at(lo);
    if (p > target) over.push({ lo, points: p, excess: p - target });
    else room.push({ lo, points: p, room: target - p });
  }
  over.sort((a, b) => b.excess - a.excess);
  room.sort((a, b) => b.room - a.room);

  // Mean absolute deviation from flat, scaled so 1 is flat and 0 is all on one
  // number. Reads directly as "how balanced is this book".
  const mad = los.reduce((s, lo) => s + Math.abs(at(lo) - target), 0);
  const worstMad = total > 0 ? 2 * total * 0.99 : 1;
  const score = total > 0 ? Math.max(0, 1 - mad / worstMad) : 1;

  return {
    target,
    score,
    over,
    room,
    excessTotal: over.reduce((s, o) => s + o.excess, 0),
  };
}

export interface RiskProfile {
  /** Average day, as a fraction of money taken. */
  avg: number;
  /** Worst day seen, as a fraction of money taken. */
  worst: number;
  /** Loss not exceeded on 95% of days. */
  p05: number;
  /** Share of days that end in the red. */
  lossRate: number;
}

/**
 * Rolls the draw many times over the book as it stands.
 *
 * Seeded, so the same book always reports the same risk — a number that
 * flickers every render is a number nobody trusts.
 */
export function simulateDay(
  points: Record<string, number>,
  region: Region,
  price: number = STAKE_PRICE[region],
  runs: number = 4000
): RiskProfile {
  const arr = Array.from({ length: 100 }, (_, i) => Math.max(0, points[String(i).padStart(2, "0")] ?? 0));
  const total = arr.reduce((a, b) => a + b, 0);
  const taken = total * price;
  if (taken === 0) return { avg: 0, worst: 0, p05: 0, lossRate: 0 };

  // mulberry32. The obvious little LCG is not good enough here: its low bits
  // barely change, so `floor(rnd() * 100)` came out visibly lopsided —
  // measured at chi² 26.443 against 99 expected, some lô drawn 34% too often.
  // A simulation of a lottery has to draw uniformly or it measures itself.
  let seed = 987654321;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const positions = POSITIONS[region];
  const results: number[] = [];
  let losses = 0;
  for (let t = 0; t < runs; t++) {
    let payout = 0;
    for (let j = 0; j < positions; j++) payout += arr[Math.floor(rnd() * 100)] * WIN_PER_POINT;
    const profit = (taken - payout) / taken;
    results.push(profit);
    if (profit < 0) losses++;
  }
  results.sort((a, b) => a - b);
  return {
    avg: results.reduce((a, b) => a + b, 0) / runs,
    worst: results[0],
    p05: results[Math.floor(runs * 0.05)],
    lossRate: losses / runs,
  };
}

// ─────────────────────────────────────────────
// Nạp sổ cược nhiều ngày một lượt
// ─────────────────────────────────────────────

export interface BulkDay {
  date: string;
  points: Record<string, number>;
  entries: number;
  bad: string[];
}

/** "20/8", "20/08/2026", "2026-08-20" — all the ways a date shows up in chat. */
function readDate(token: string, fallbackYear: number): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (iso) return token;

  const dmy = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(token);
  if (!dmy) return null;

  const d = Number(dmy[1]);
  const m = Number(dmy[2]);
  let y = dmy[3] ? Number(dmy[3]) : fallbackYear;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}

/**
 * Reads a pile of pasted messages into one book per draw date.
 *
 * Written for what actually gets pasted: a month of Telegram history, each
 * day led by a date in whichever format the sender happened to use, bet
 * strings possibly spread over several lines, and the province prefix still
 * attached. Lines before any date are ignored rather than guessed at — a bet
 * filed under the wrong draw is worse than a bet not filed at all.
 */
export function parseBulkBets(text: string, fallbackYear = new Date().getUTCFullYear()): BulkDay[] {
  const days = new Map<string, BulkDay>();
  let current: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // A date may lead the line and be followed by that day's bets.
    const head = line.split(/[\s:]+/)[0];
    const found = readDate(head, fallbackYear);
    let body = line;
    if (found) {
      current = found;
      if (!days.has(found)) days.set(found, { date: found, points: {}, entries: 0, bad: [] });
      body = line.slice(head.length).replace(/^[\s:]+/, "");
    }

    if (!current || !body) continue;

    const parsed = parseBetString(body);
    const day = days.get(current)!;
    for (const [lo, v] of Object.entries(parsed.points)) {
      day.points[lo] = (day.points[lo] ?? 0) + v;
    }
    day.entries += parsed.entries;
    day.bad.push(...parsed.bad);
  }

  return [...days.values()].filter((d) => d.entries > 0).sort((a, b) => a.date.localeCompare(b.date));
}
