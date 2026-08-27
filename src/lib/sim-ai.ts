/**
 * SIM-AI — an agent that is handed a bankroll and sets its own limits.
 *
 * Given a stake and a stretch of draws, it decides how many points to accept
 * on each lô each day, collects the take, pays the winners, and carries the
 * result into the next day. It learns by playing the training days over and
 * over and keeping whatever adjustment made it richer.
 *
 * Deliberately a small policy rather than 100 free numbers. A table of 100
 * limits can memorise which numbers happened to be quiet last month and look
 * brilliant doing it; six weights over features cannot. So if a real edge
 * exists, this finds it — and if it reports nothing, that is evidence rather
 * than a failure to search hard enough.
 */

export interface Draw {
  date: string;
  hits: Record<string, number>;
}

export const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

/** What the agent knows about one lô before the draw. Nothing from the future. */
export const FEATURES = [
  "luôn bật",
  "ngày chưa về",
  "về 7 kỳ gần",
  "về 30 kỳ gần",
  "là số kép",
  "đang có chuỗi",
] as const;

export type Weights = number[];

/** Features are centred and scaled so every weight moves the limit comparably. */
function featuresFor(history: Draw[], lo: string): number[] {
  let gap = history.length;
  for (let i = history.length - 1, back = 0; i >= 0; i--, back++) {
    if ((history[i].hits[lo] ?? 0) > 0) { gap = back; break; }
  }
  const hits = (n: number) =>
    history.slice(-n).reduce((s, d) => s + (d.hits[lo] ?? 0), 0);

  let streak = 0;
  for (let i = history.length - 1; i >= 0 && (history[i].hits[lo] ?? 0) > 0; i--) streak++;

  return [
    1,
    (Math.min(gap, 12) - 3) / 3,
    (hits(7) - 2.5) / 2.5,
    (hits(30) - 10.8) / 10.8,
    lo[0] === lo[1] ? 1 : 0,
    Math.min(streak, 3) / 2,
  ];
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

/**
 * Points to accept on each lô.
 *
 * Capped at twice the base so the agent can double down or refuse outright,
 * but cannot answer every question with "bet everything on one number" — the
 * degenerate solution a free search always drifts into.
 */
export function policyLimits(w: Weights, history: Draw[], base: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lo of LOS) {
    const f = featuresFor(history, lo);
    let z = 0;
    for (let i = 0; i < w.length; i++) z += w[i] * f[i];
    out[lo] = Math.round(base * 2 * sigmoid(z));
  }
  return out;
}

export interface DayResult {
  date: string;
  taken: number;
  payout: number;
  profit: number;
  bankroll: number;
  points: number;
  /** Points accepted on each lô that day — the decision, kept for inspection. */
  limits: Record<string, number>;
  /** How many times each lô landed. Empty entries did not land. */
  hits: Record<string, number>;
}

/**
 * Plays a run of draws with a fixed policy.
 *
 * The bankroll is real: a day that pays out more than the stake on hand ends
 * the run, because that is what happens to a book that cannot settle.
 */
export function play(
  w: Weights,
  draws: Draw[],
  price: number,
  winPerPoint: number,
  base: number,
  bankroll: number,
  warmup = 30,
  /** When given, money comes from the table and the policy only ranks. */
  tiers?: Tier[]
): { days: DayResult[]; broke: boolean } {
  const days: DayResult[] = [];
  let money = bankroll;

  for (let i = warmup; i < draws.length; i++) {
    const hist = draws.slice(0, i);
    const limits = tiers ? tierLimits(w, hist, tiers) : policyLimits(w, hist, base);
    const points = LOS.reduce((s, lo) => s + limits[lo], 0);
    const taken = points * price;

    let payout = 0;
    for (const [lo, count] of Object.entries(draws[i].hits)) {
      payout += (limits[lo] ?? 0) * winPerPoint * count;
    }

    const profit = taken - payout;
    money += profit;
    // Kept whole rather than summarised: the operator has to be able to open
    // any single day and see which number took which money.
    days.push({
      date: draws[i].date,
      taken, payout, profit, bankroll: money, points,
      limits,
      hits: { ...draws[i].hits },
    });
    if (money <= 0) return { days, broke: true };
  }
  return { days, broke: false };
}

export interface TrainOptions {
  /** 0 = chase profit only; higher = penalise losing days harder. */
  riskAversion: number;
  rounds: number;
  restarts: number;
}

/** Mean daily return, docked for the pain of losing days. */
function score(days: DayResult[], broke: boolean, riskAversion: number): number {
  if (days.length === 0) return -Infinity;
  if (broke) return -Infinity;

  const rets = days.map((d) => (d.taken > 0 ? d.profit / d.taken : 0));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  if (riskAversion <= 0) return mean;

  // Downside only: upside volatility is not a problem anyone needs solving.
  const down = rets.filter((r) => r < 0);
  const pain = down.length ? Math.sqrt(down.reduce((s, r) => s + r * r, 0) / rets.length) : 0;
  return mean - riskAversion * pain;
}

export interface TrainResult {
  weights: Weights;
  trainScore: number;
  history: number[];
}

/**
 * Learns by trial and error over the training draws.
 *
 * Hill climbing with restarts rather than backprop: the objective runs a whole
 * simulation per evaluation, is not differentiable through the payout, and has
 * only six parameters. Gradient descent would add machinery without adding
 * search quality.
 */
export function train(
  draws: Draw[],
  price: number,
  winPerPoint: number,
  base: number,
  bankroll: number,
  opts: TrainOptions,
  seed = 20260826,
  tiers?: Tier[]
): TrainResult {
  let s = seed;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const evaluate = (w: Weights) => {
    const r = play(w, draws, price, winPerPoint, base, bankroll, 30, tiers);
    return score(r.days, r.broke, opts.riskAversion);
  };

  let bestW: Weights = new Array(FEATURES.length).fill(0);
  let bestS = evaluate(bestW);
  const history: number[] = [bestS];

  for (let r = 0; r < opts.restarts; r++) {
    // Start flat on the first pass, then from random corners of the space.
    let w = r === 0 ? new Array(FEATURES.length).fill(0) : bestW.map((v) => v + (rnd() - 0.5) * 2);
    let sc = evaluate(w);
    let step = 0.8;

    for (let i = 0; i < opts.rounds; i++) {
      const j = Math.floor(rnd() * w.length);
      const old = w[j];
      w[j] = old + (rnd() - 0.5) * step * 2;
      const v = evaluate(w);
      if (v > sc) sc = v;
      else w[j] = old;

      // Cool down so the search settles instead of rattling around forever.
      if (i > 0 && i % Math.max(1, Math.floor(opts.rounds / 8)) === 0) step *= 0.7;
    }

    if (sc > bestS) { bestS = sc; bestW = [...w]; }
    history.push(bestS);
  }

  return { weights: bestW, trainScore: bestS, history };
}

/** Flat limits — the benchmark every strategy has to beat to matter. */
export const FLAT_WEIGHTS: Weights = new Array(FEATURES.length).fill(0);

export interface RunSummary {
  days: number;
  broke: boolean;
  start: number;
  end: number;
  profit: number;
  meanReturn: number;
  worstDay: number;
  lossDays: number;
  curve: number[];
}

export function summarise(
  days: DayResult[],
  broke: boolean,
  bankroll: number
): RunSummary {
  if (days.length === 0) {
    return {
      days: 0, broke, start: bankroll, end: bankroll, profit: 0,
      meanReturn: 0, worstDay: 0, lossDays: 0, curve: [bankroll],
    };
  }
  const rets = days.map((d) => (d.taken > 0 ? d.profit / d.taken : 0));
  return {
    days: days.length,
    broke,
    start: bankroll,
    end: days[days.length - 1].bankroll,
    profit: days[days.length - 1].bankroll - bankroll,
    meanReturn: rets.reduce((a, b) => a + b, 0) / rets.length,
    worstDay: Math.min(...rets),
    lossDays: rets.filter((r) => r < 0).length,
    curve: [bankroll, ...days.map((d) => d.bankroll)],
  };
}

// ─────────────────────────────────────────────
// Chế độ BẬC — khách định sẵn mỗi bậc bao nhiêu số, bao nhiêu tiền
// ─────────────────────────────────────────────

export interface Tier {
  /** How many lô sit in this tier. */
  soLo: number;
  /** Points accepted on each lô in it. */
  tien: number;
}

/**
 * The bookie's own tier table: twenty steps from 250 điểm down to 5.
 *
 * Splits the job in two. The table fixes how much money exists at each level —
 * a business decision about how much unevenness to carry. The agent only
 * decides the ORDER numbers are ranked in, which is the part they asked to
 * have researched.
 *
 * Worth keeping in view while reading any result from this mode: the total
 * accepted is fixed by the table, so no ordering can change the expected
 * profit. What the ordering changes is which days hurt.
 */
export const DEFAULT_TIERS: Tier[] = [
  { soLo: 1, tien: 250 }, { soLo: 1, tien: 225 }, { soLo: 2, tien: 200 },
  { soLo: 2, tien: 175 }, { soLo: 3, tien: 150 },
  { soLo: 3, tien: 140 }, { soLo: 4, tien: 130 }, { soLo: 4, tien: 120 },
  { soLo: 4, tien: 110 }, { soLo: 5, tien: 100 },
  { soLo: 5, tien: 90 }, { soLo: 6, tien: 80 }, { soLo: 6, tien: 70 },
  { soLo: 6, tien: 60 }, { soLo: 7, tien: 50 },
  { soLo: 7, tien: 41 }, { soLo: 8, tien: 32 }, { soLo: 8, tien: 23 },
  { soLo: 9, tien: 14 }, { soLo: 9, tien: 5 },
];

/** Score per lô from the same policy — used only to rank, never as money. */
function scoreOf(w: Weights, history: Draw[], lo: string): number {
  const f = featuresFor(history, lo);
  let z = 0;
  for (let i = 0; i < w.length; i++) z += w[i] * f[i];
  return z;
}

/** Draws since this lô last landed. */
function gapOf(history: Draw[], lo: string): number {
  for (let i = history.length - 1, back = 0; i >= 0; i--, back++) {
    if ((history[i].hits[lo] ?? 0) > 0) return back;
  }
  return history.length;
}

/**
 * Ranks every lô by the policy, then pours them into the tiers top-down.
 *
 * The agent very often settles on weights near zero — that is its honest
 * answer, since no ordering beats another on average. But zero weights tie all
 * hundred lô, and breaking that tie on the number alone would hand the top tier
 * to lô 00 for no reason other than being first, which reads as a broken table.
 * So ties fall back to the longest dry spell, then to the number. Deterministic
 * either way, and the fallback is the ordering the operator already thinks in.
 */
export function tierLimits(
  w: Weights,
  history: Draw[],
  tiers: Tier[]
): Record<string, number> {
  const ranked = [...LOS].sort((a, b) => {
    const d = scoreOf(w, history, b) - scoreOf(w, history, a);
    if (d !== 0) return d;
    const g = gapOf(history, b) - gapOf(history, a);
    return g !== 0 ? g : a.localeCompare(b);
  });

  const out: Record<string, number> = {};
  let k = 0;
  for (const t of tiers) {
    for (let i = 0; i < t.soLo && k < ranked.length; i++) out[ranked[k++]] = t.tien;
  }
  // Anything the table did not cover takes nothing.
  for (; k < ranked.length; k++) out[ranked[k]] = 0;
  return out;
}

/** Total points the table accepts, regardless of who lands where. */
export function tierTotal(tiers: Tier[]): number {
  return tiers.reduce((s, t) => s + t.soLo * t.tien, 0);
}

export interface SpreadTest {
  lan: number;
  trungBinh: number;
  bienDo: number;
  xauNhat: number;
  totNhat: number;
  tyLeLoi: number;
  ngayTeNhatTB: number;
}

/**
 * How much of a tier table's result is the ranking, and how much is luck.
 *
 * Keeps the real draws and the real tier table and shuffles only *which* lô
 * sits in which tier. Every shuffle accepts the same money on the same days,
 * so whatever spread comes out is pure variance — and the average across
 * shuffles is what the table is actually worth. Without this the operator sees
 * one 30-day number and reads it as a verdict on the table.
 */
export function tierSpread(
  draws: Draw[],
  tiers: Tier[],
  price: number,
  winPerPoint: number,
  lan = 400,
  seed = 20260827
): SpreadTest | null {
  if (draws.length === 0) return null;

  const thang: number[] = [];
  for (const t of tiers) for (let i = 0; i < t.soLo && thang.length < 100; i++) thang.push(t.tien);
  while (thang.length < 100) thang.push(0);

  let s = seed;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const tongs: number[] = [];
  let tongTeNhat = 0;
  let loi = 0;

  for (let k = 0; k < lan; k++) {
    const thuTu = [...LOS];
    for (let i = thuTu.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [thuTu[i], thuTu[j]] = [thuTu[j], thuTu[i]];
    }
    const lim: Record<string, number> = {};
    thuTu.forEach((lo, i) => (lim[lo] = thang[i]));

    // The take is the same every day, so it comes out of the loop.
    const thu = LOS.reduce((a, lo) => a + lim[lo], 0) * price;
    let tong = 0;
    let teNhat = Infinity;
    for (const d of draws) {
      let tra = 0;
      for (const [lo, c] of Object.entries(d.hits)) tra += (lim[lo] ?? 0) * winPerPoint * c;
      const p = thu - tra;
      tong += p;
      if (p < teNhat) teNhat = p;
    }
    tongs.push(tong);
    tongTeNhat += teNhat;
    if (tong > 0) loi++;
  }

  const tb = tongs.reduce((a, b) => a + b, 0) / lan;
  const bienDo = Math.sqrt(tongs.reduce((a, b) => a + (b - tb) ** 2, 0) / lan);
  return {
    lan,
    trungBinh: tb,
    bienDo,
    xauNhat: Math.min(...tongs),
    totNhat: Math.max(...tongs),
    tyLeLoi: loi / lan,
    ngayTeNhatTB: tongTeNhat / lan,
  };
}
