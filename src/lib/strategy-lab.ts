/**
 * Strategy lab — test any limit-setting idea against the real draws.
 *
 * Every idea gets the same treatment: it only ever sees draws before the one
 * it is being scored on, and it is scored on a stretch of draws it never had
 * access to. That split is the whole point. Any rule tuned on history can be
 * made to look brilliant on that same history; the only question worth asking
 * is whether it still works on days it has not seen.
 */

export interface Draw {
  date: string;
  /** lô → how many times it landed that draw. */
  hits: Record<string, number>;
}

export const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

export interface Strategy {
  key: string;
  name: string;
  note: string;
  /**
   * Points to accept on each lô for the next draw, given only what has already
   * happened. `base` is the flat level every strategy is scaled around, so the
   * comparison is about shape, not size.
   */
  limits(history: Draw[], base: number): Record<string, number>;
}

/** Hits per lô over the last n draws. */
function recentHits(history: Draw[], n: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lo of LOS) out[lo] = 0;
  for (const d of history.slice(-n)) {
    for (const [lo, c] of Object.entries(d.hits)) out[lo] = (out[lo] ?? 0) + c;
  }
  return out;
}

/** Draws since each lô last landed; a lô never seen gets the full length. */
function gaps(history: Draw[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lo of LOS) out[lo] = history.length;
  for (let i = history.length - 1, back = 0; i >= 0; i--, back++) {
    for (const lo of Object.keys(history[i].hits)) {
      if (out[lo] === history.length) out[lo] = back;
    }
  }
  return out;
}

const flat = (base: number) => Object.fromEntries(LOS.map((lo) => [lo, base]));

/** Picks the n lô scoring highest (or lowest) on a per-lô measure. */
function pick(score: Record<string, number>, n: number, dir: "hi" | "lo"): Set<string> {
  const sorted = [...LOS].sort((a, b) => (dir === "hi" ? score[b] - score[a] : score[a] - score[b]));
  return new Set(sorted.slice(0, n));
}

function adjust(base: number, chosen: Set<string>, factor: number): Record<string, number> {
  return Object.fromEntries(
    LOS.map((lo) => [lo, chosen.has(lo) ? Math.round(base * factor) : base])
  );
}

export const STRATEGIES: Strategy[] = [
  {
    key: "flat",
    name: "Hạn mức phẳng",
    note: "Mọi lô cùng một mức, không nhìn lịch sử gì cả",
    limits: (_h, base) => flat(base),
  },
  {
    key: "step",
    name: "Bậc thang theo ngày chưa về",
    note: "Càng lâu chưa về càng giảm — cách app đang chạy",
    limits: (h, base) => {
      const g = gaps(h);
      // 200 xuống dần, chuẩn hoá quanh base để so công bằng về quy mô.
      const raw = LOS.map((lo) => Math.max(15, 200 - 20 * Math.min(g[lo], 9)));
      const mean = raw.reduce((a, b) => a + b, 0) / 100;
      return Object.fromEntries(LOS.map((lo, i) => [lo, Math.round((raw[i] / mean) * base)]));
    },
  },
  {
    key: "blockHot",
    name: "Chặn 10 lô hay về nhất",
    note: "Không nhận 10 lô ra nhiều nhất 7 kỳ gần đây",
    limits: (h, base) => adjust(base, pick(recentHits(h, 7), 10, "hi"), 0),
  },
  {
    key: "blockCold",
    name: "Chặn 10 lô lâu chưa về nhất",
    note: "Không nhận 10 lô đang khan nhất",
    limits: (h, base) => adjust(base, pick(gaps(h), 10, "hi"), 0),
  },
  {
    key: "halfHot",
    name: "Giảm nửa 20 lô hay về",
    note: "Chia đôi hạn mức 20 lô ra nhiều nhất 7 kỳ",
    limits: (h, base) => adjust(base, pick(recentHits(h, 7), 20, "hi"), 0.5),
  },
  {
    key: "halfCold",
    name: "Giảm nửa 20 lô khan nhất",
    note: "Chia đôi hạn mức 20 lô lâu chưa về nhất",
    limits: (h, base) => adjust(base, pick(gaps(h), 20, "hi"), 0.5),
  },
  {
    key: "boostCold",
    name: "Nhận GẤP ĐÔI 20 lô khan nhất",
    note: "Làm ngược lại — ăn nhiều hơn ở lô đang khan",
    limits: (h, base) => adjust(base, pick(gaps(h), 20, "hi"), 2),
  },
  {
    key: "streak",
    name: "Chặn lô vừa về 2 kỳ liên tiếp",
    note: "Lô đang có chuỗi thì ngừng nhận",
    limits: (h, base) => {
      const a = h[h.length - 1]?.hits ?? {};
      const b = h[h.length - 2]?.hits ?? {};
      const chosen = new Set(LOS.filter((lo) => a[lo] > 0 && b[lo] > 0));
      return adjust(base, chosen, 0);
    },
  },
];

export interface Result {
  /** Mean profit as a share of money taken. */
  avg: number;
  worst: number;
  best: number;
  lossRate: number;
  /** Mean money taken per draw, so a strategy cannot win by trading nothing. */
  turnover: number;
}

/**
 * Runs one strategy over a stretch of draws.
 *
 * `warmup` is history the strategy may read but is not scored on — a rule that
 * looks at the last 7 draws needs 7 draws to look at.
 */
export function backtest(
  strategy: Strategy,
  draws: Draw[],
  price: number,
  winPerPoint: number,
  base = 100,
  warmup = 10
): Result {
  const profits: number[] = [];
  let turnover = 0;

  for (let i = warmup; i < draws.length; i++) {
    const limits = strategy.limits(draws.slice(0, i), base);
    const taken = LOS.reduce((s, lo) => s + (limits[lo] ?? 0), 0) * price;
    if (taken <= 0) continue;

    let payout = 0;
    for (const [lo, count] of Object.entries(draws[i].hits)) {
      payout += (limits[lo] ?? 0) * winPerPoint * count;
    }
    profits.push((taken - payout) / taken);
    turnover += taken;
  }

  if (profits.length === 0) return { avg: 0, worst: 0, best: 0, lossRate: 0, turnover: 0 };
  return {
    avg: profits.reduce((a, b) => a + b, 0) / profits.length,
    worst: Math.min(...profits),
    best: Math.max(...profits),
    lossRate: profits.filter((p) => p < 0).length / profits.length,
    turnover: turnover / profits.length,
  };
}

// ─────────────────────────────────────────────
// Chạy trên sổ cược THẬT
// ─────────────────────────────────────────────

/** What customers actually put down on one draw. */
export interface Book {
  date: string;
  points: Record<string, number>;
}

export interface RealResult extends Result {
  /** Draws that had both a book and a result. */
  draws: number;
  /** Money the rule turned away, summed over the run. */
  refused: number;
  /** Total profit in đồng, not a percentage — what actually landed. */
  profitVnd: number;
}

/**
 * Replays a limit rule over the books that really came in.
 *
 * A limit is a ceiling, not an order: whatever a customer wanted is accepted
 * up to the cap and refused above it. So the question this answers is the only
 * one that matters — "had I been running this rule, what would have happened
 * to MY money?" — rather than what a hypothetical flat book would have done.
 */
export function backtestReal(
  strategy: Strategy,
  draws: Draw[],
  books: Book[],
  price: number,
  winPerPoint: number,
  base = 100,
  warmup = 10
): RealResult {
  const bookBy = new Map(books.map((b) => [b.date, b.points]));
  const profits: number[] = [];
  let turnover = 0;
  let refused = 0;
  let profitVnd = 0;

  for (let i = warmup; i < draws.length; i++) {
    const book = bookBy.get(draws[i].date);
    if (!book) continue;

    const limits = strategy.limits(draws.slice(0, i), base);

    let taken = 0;
    let payout = 0;
    const accepted: Record<string, number> = {};
    for (const lo of LOS) {
      const wanted = Math.max(0, book[lo] ?? 0);
      const cap = Math.max(0, limits[lo] ?? 0);
      const take = Math.min(wanted, cap);
      accepted[lo] = take;
      refused += wanted - take;
      taken += take * price;
    }
    if (taken <= 0) continue;

    for (const [lo, count] of Object.entries(draws[i].hits)) {
      payout += (accepted[lo] ?? 0) * winPerPoint * count;
    }

    profits.push((taken - payout) / taken);
    turnover += taken;
    profitVnd += taken - payout;
  }

  if (profits.length === 0) {
    return { avg: 0, worst: 0, best: 0, lossRate: 0, turnover: 0, draws: 0, refused, profitVnd: 0 };
  }
  return {
    avg: profits.reduce((a, b) => a + b, 0) / profits.length,
    worst: Math.min(...profits),
    best: Math.max(...profits),
    lossRate: profits.filter((p) => p < 0).length / profits.length,
    turnover: turnover / profits.length,
    draws: profits.length,
    refused,
    profitVnd,
  };
}

/** No rule at all — accept everything, which is what happened in real life. */
export const NO_LIMIT: Strategy = {
  key: "none",
  name: "Nhận hết, không chặn gì",
  note: "Đúng những gì đã xảy ra thật",
  limits: () => Object.fromEntries(LOS.map((lo) => [lo, Number.MAX_SAFE_INTEGER])),
};
