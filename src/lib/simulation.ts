/**
 * Virtual money simulation — replays history with a strategy and tracks balance.
 *
 * Two modes:
 *  - PLAYER: AI bets on adaptive top-N picks each day. Goal: don't go bankrupt.
 *  - HOUSE:  AI adjusts limits based on VIP predictions to minimize liability.
 *
 * Stateless — every run replays from scratch (no DB writes). Determinism comes
 * from historical lô outcomes which are immutable.
 */
import { query, type Region, getLoAppearedOnDate } from "./db";
import { POINT_VALUE, WIN_MULTIPLIER, COST_MULTIPLIER } from "./limit-engine";
import { predictTopNHistorical, getModelTop10PerDay } from "./prediction";

const ALL_LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
const POINT_COST = POINT_VALUE;            // 23,000đ per điểm
const WIN_PER_HIT = WIN_MULTIPLIER * 1000; // 80,000đ per appearance
const DEFAULT_LIMIT = 200;
const SHRINK_FLOOR = 10;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PlayerStrategy = "aggressive" | "conservative" | "smart" | "skip_bad";
export type HouseStrategy = "none" | "mild" | "aggressive" | "smart";
export type SimMode = "player" | "house";

export interface SimDay {
  date: string;
  action: string;
  picks: string[];
  hit_picks: string[];      // picks that actually appeared
  miss_picks: string[];     // picks that didn't appear
  pick_occurrences: Record<string, number>;  // per-pick appearance count
  pick_limit?: Record<string, number>;       // per-pick limit (house mode only)
  pick_bet_vnd?: number;    // VND bet on each pick (player mode)
  pick_win_vnd?: Record<string, number>;     // VND won on each pick if hit (player)
  bet_per_pick?: number;
  total_cost: number;
  total_payout: number;
  profit: number;
  balance_after: number;
  hits?: number;
  occurrences?: number;
  break_even_hits: number;  // hits needed this day to break even
  lesson: string;           // human-readable takeaway
  note?: string;
}

export interface SimResult {
  mode: SimMode;
  region: Region;
  strategy: string;
  initial_capital: number;
  days_simulated: number;
  final_balance: number;
  total_profit: number;
  roi_pct: number;
  max_balance: number;
  min_balance: number;
  max_drawdown_pct: number;
  win_days: number;
  lose_days: number;
  skip_days: number;
  bankrupt: boolean;
  bankrupt_date?: string;
  timeline: SimDay[];
}

// ─────────────────────────────────────────────
// Lesson generators — convert numbers into human takeaways
// ─────────────────────────────────────────────

function playerLesson(args: {
  hits: number;
  topN: number;
  breakEven: number;
  occ: number;
  profit: number;
  hitPicks: string[];
  recentProfits: number[];
  betPerPick: number;
}): string {
  const { hits, topN, breakEven, occ, profit, hitPicks, recentProfits, betPerPick } = args;
  const parts: string[] = [];

  // Hit assessment
  if (hits >= breakEven + 1) {
    parts.push(`✅ Hit ${hits}/${topN} (vượt break-even ${breakEven.toFixed(1)}) → chiến thuật ổn`);
  } else if (hits >= Math.ceil(breakEven)) {
    parts.push(`⚖️ Hit ${hits}/${topN} (đúng break-even ${breakEven.toFixed(1)}) → hoà vốn`);
  } else if (hits === 0) {
    parts.push(`💀 0/${topN} hit — toàn bộ pick lệch khỏi kết quả thực`);
  } else {
    parts.push(`❌ Hit ${hits}/${topN} (cần ≥ ${Math.ceil(breakEven)}) → dưới break-even`);
  }

  // Specific hit numbers
  if (hitPicks.length > 0) {
    parts.push(`Trúng: ${hitPicks.join(" ")} (${occ} lần xuất hiện)`);
  }

  // Streak detection from recent profits
  const last3 = recentProfits.slice(-3);
  if (last3.length === 3) {
    const allUp = last3.every((p) => p > 0);
    const allDown = last3.every((p) => p < 0);
    if (allUp && profit > 0) {
      parts.push(`🔥 4 ngày liên tiếp lãi → tự tin, có thể tăng cược`);
    } else if (allDown && profit < 0) {
      parts.push(`⚠️ 4 ngày liên tiếp lỗ → cân nhắc đổi chiến thuật hoặc nghỉ`);
    } else if (allDown && profit > 0) {
      parts.push(`🔄 Phá streak lỗ — bắt đầu hồi vốn`);
    }
  }

  // Bet size signal
  if (betPerPick >= 3 && profit < 0) {
    parts.push(`Cược lớn (${betPerPick}đ/pick) gặp ngày tệ → mất nhiều hơn`);
  } else if (betPerPick >= 3 && profit > 0) {
    parts.push(`Cược lớn (${betPerPick}đ/pick) gặp ngày tốt → ăn đậm`);
  }

  return parts.join(" • ");
}

function houseLesson(args: {
  picks: string[];
  hitInPicks: number;
  topN: number;
  profit: number;
  thuShort: string;
  buShort: string;
  hitPicks: string[];
}): string {
  const { hitInPicks, topN, profit, hitPicks } = args;
  const parts: string[] = [];

  if (profit > 0) {
    parts.push(`✅ Nhà cái lãi: thu nhiều hơn bù`);
  } else {
    parts.push(`❌ Nhà cái lỗ: bù vượt thu`);
  }

  if (hitInPicks <= topN * 0.2) {
    parts.push(`Top ${topN} dự đoán chỉ ${hitInPicks} lô về → AI dự đoán SAI nhiều, các lô ngoài top mới về`);
  } else if (hitInPicks >= topN * 0.4) {
    parts.push(`Top ${topN} có ${hitInPicks} lô về → AI dự đoán ĐÚNG nhiều → lý do nhà cái phải giảm limit`);
  }

  if (hitPicks.length > 0) {
    parts.push(`Lô top trúng (limit đã giảm): ${hitPicks.slice(0, 5).join(" ")}${hitPicks.length > 5 ? "…" : ""}`);
  }

  return parts.join(" • ");
}

// ─────────────────────────────────────────────
// PLAYER MODE
// ─────────────────────────────────────────────

export async function simulatePlayer(
  region: Region,
  initialCapital: number,
  days: number,
  topN: number,
  strategy: PlayerStrategy,
  perfWindow: number = 14
): Promise<SimResult> {
  const dateRows = await query<{ date: string }>(
    "SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT ?",
    [region, days]
  );
  const dates = dateRows.map((r) => r.date).reverse();

  let balance = initialCapital;
  let maxBalance = initialCapital;
  let minBalance = initialCapital;
  let winDays = 0;
  let loseDays = 0;
  let skipDays = 0;
  let bankrupt = false;
  let bankruptDate: string | undefined;
  const timeline: SimDay[] = [];
  const recentProfits: number[] = [];

  for (const date of dates) {
    if (bankrupt) break;

    let betPerPick = 1;
    let action = "bet";
    let note: string | undefined;

    const recentAvg =
      recentProfits.length > 0
        ? recentProfits.reduce((s, v) => s + v, 0) / recentProfits.length
        : 0;

    if (strategy === "smart") {
      if (recentAvg > 50_000) betPerPick = 3;
      else if (recentAvg > 0) betPerPick = 2;
      else betPerPick = 1;
    } else if (strategy === "skip_bad") {
      if (recentProfits.length >= 3 && recentAvg < 0) {
        action = "skip";
        note = `Bỏ qua: 3 ngày gần lỗ TB ${Math.round(recentAvg).toLocaleString("vi-VN")}đ`;
      }
    } else if (strategy === "aggressive") {
      betPerPick = 3;
    }
    // conservative: betPerPick stays at 1

    if (action === "skip") {
      timeline.push({
        date, action: "skip", picks: [],
        hit_picks: [], miss_picks: [], pick_occurrences: {},
        total_cost: 0, total_payout: 0, profit: 0,
        balance_after: balance,
        break_even_hits: 0,
        lesson: `⏸️ Bỏ qua hôm nay để bảo toàn vốn — chiến lược "Né ngày tệ" thấy 3 ngày gần TB lỗ ${Math.round(recentAvg).toLocaleString("vi-VN")}đ`,
        note,
      });
      skipDays++;
      recentProfits.push(0);
      if (recentProfits.length > 3) recentProfits.shift();
      continue;
    }

    const requiredCost = topN * betPerPick * POINT_COST;
    if (requiredCost > balance) {
      const affordablePoints = Math.floor(balance / (topN * POINT_COST));
      if (affordablePoints < 1) {
        bankrupt = true;
        bankruptDate = date;
        timeline.push({
          date, action: "skip", picks: [],
          hit_picks: [], miss_picks: [], pick_occurrences: {},
          total_cost: 0, total_payout: 0, profit: 0,
          balance_after: balance,
          break_even_hits: 0,
          lesson: `💀 Phá sản — vốn còn ${balance.toLocaleString("vi-VN")}đ không đủ chơi 1 ván nữa. Chiến thuật này KHÔNG hợp với data hiện tại.`,
          note: `💀 Hết vốn — không đủ ${(POINT_COST * topN).toLocaleString("vi-VN")}đ để chơi 1 vòng`,
        });
        break;
      }
      betPerPick = affordablePoints;
      note = `⚠️ Vốn thấp → giảm xuống ${betPerPick} điểm/pick`;
    }

    const { picks } = await predictTopNHistorical(region, date, topN, perfWindow);
    const cost = topN * betPerPick * POINT_COST;

    const actualRows = await query<{ lo_number: string; count: number }>(
      "SELECT lo_number, count FROM lo_daily WHERE region = ? AND date = ?",
      [region, date]
    );
    const actualMap = new Map(actualRows.map((r) => [r.lo_number, r.count]));

    let hits = 0;
    let occ = 0;
    const hitPicks: string[] = [];
    const missPicks: string[] = [];
    const pickOcc: Record<string, number> = {};
    for (const pick of picks) {
      const c = actualMap.get(pick) ?? 0;
      pickOcc[pick] = c;
      if (c > 0) {
        hits++;
        occ += c;
        hitPicks.push(pick);
      } else {
        missPicks.push(pick);
      }
    }

    const payout = occ * betPerPick * WIN_PER_HIT;
    const profit = payout - cost;
    balance += profit;

    if (profit > 0) winDays++;
    else if (profit < 0) loseDays++;

    if (balance > maxBalance) maxBalance = balance;
    if (balance < minBalance) minBalance = balance;

    const breakEven = (POINT_COST * topN) / WIN_PER_HIT;  // hits/day to break even

    const lesson = playerLesson({
      hits, topN, breakEven, occ, profit,
      hitPicks, recentProfits: [...recentProfits], betPerPick,
    });

    // Per-pick win amounts (player mode):
    //   bet per pick = betPerPick × POINT_COST
    //   win per pick (if hit) = betPerPick × occurrences × WIN_PER_HIT
    const pickBetVnd = betPerPick * POINT_COST;
    const pickWinVnd: Record<string, number> = {};
    for (const p of picks) {
      const c = pickOcc[p] ?? 0;
      pickWinVnd[p] = c > 0 ? betPerPick * c * WIN_PER_HIT : 0;
    }

    recentProfits.push(profit);
    if (recentProfits.length > 3) recentProfits.shift();

    timeline.push({
      date, action: "bet", picks,
      hit_picks: hitPicks, miss_picks: missPicks, pick_occurrences: pickOcc,
      pick_bet_vnd: pickBetVnd,
      pick_win_vnd: pickWinVnd,
      bet_per_pick: betPerPick,
      total_cost: cost,
      total_payout: payout,
      profit,
      balance_after: balance,
      hits, occurrences: occ,
      break_even_hits: breakEven,
      lesson,
      note,
    });
  }

  const drawdown = maxBalance > 0 ? ((maxBalance - minBalance) / maxBalance) * 100 : 0;

  return {
    mode: "player",
    region,
    strategy,
    initial_capital: initialCapital,
    days_simulated: timeline.length,
    final_balance: balance,
    total_profit: balance - initialCapital,
    roi_pct: initialCapital > 0
      ? Math.round(((balance - initialCapital) / initialCapital) * 10000) / 100
      : 0,
    max_balance: maxBalance,
    min_balance: minBalance,
    max_drawdown_pct: Math.round(drawdown * 100) / 100,
    win_days: winDays,
    lose_days: loseDays,
    skip_days: skipDays,
    bankrupt,
    bankrupt_date: bankruptDate,
    timeline,
  };
}

// ─────────────────────────────────────────────
// HOUSE MODE
// ─────────────────────────────────────────────

function adjustedLimits(picks: string[], strategy: HouseStrategy): Map<string, number> {
  const out = new Map<string, number>();
  for (const lo of ALL_LOS) out.set(lo, DEFAULT_LIMIT);
  if (strategy === "none") return out;

  const pickSet = new Set(picks);
  if (strategy === "mild") {
    for (const p of pickSet) out.set(p, Math.max(SHRINK_FLOOR, Math.round(DEFAULT_LIMIT * 0.8)));
  } else if (strategy === "aggressive") {
    for (const p of pickSet) out.set(p, Math.max(SHRINK_FLOOR, Math.round(DEFAULT_LIMIT * 0.5)));
    for (const lo of ALL_LOS) {
      if (!pickSet.has(lo)) out.set(lo, Math.round(DEFAULT_LIMIT * 1.2));
    }
  } else if (strategy === "smart") {
    picks.forEach((p, i) => {
      const factor = 0.3 + (i / picks.length) * 0.5;
      out.set(p, Math.max(SHRINK_FLOOR, Math.round(DEFAULT_LIMIT * factor)));
    });
  }
  return out;
}

export async function simulateHouse(
  region: Region,
  initialCapital: number,
  days: number,
  topN: number,
  strategy: HouseStrategy,
  perfWindow: number = 14
): Promise<SimResult> {
  const dateRows = await query<{ date: string }>(
    "SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT ?",
    [region, days]
  );
  const dates = dateRows.map((r) => r.date).reverse();
  const costMult = COST_MULTIPLIER[region];

  let balance = initialCapital;
  let maxBalance = initialCapital;
  let minBalance = initialCapital;
  let winDays = 0;
  let loseDays = 0;
  let bankrupt = false;
  let bankruptDate: string | undefined;
  const timeline: SimDay[] = [];

  for (const date of dates) {
    if (bankrupt) break;

    const { picks } = await predictTopNHistorical(region, date, topN, perfWindow);
    const limits = adjustedLimits(picks, strategy);

    const actualLo = await getLoAppearedOnDate(date, region);
    const actualRows = await query<{ lo_number: string; count: number }>(
      "SELECT lo_number, count FROM lo_daily WHERE region = ? AND date = ?",
      [region, date]
    );
    const actualMap = new Map(actualRows.map((r) => [r.lo_number, r.count]));

    // Operator math (assumes every number is fully booked at its limit):
    //   Thu = sum_lo limit[lo] × cost_mult × 1000  (collected from gamblers)
    //   Bù  = sum_lo limit[lo] × win_per_hit × occurrences  (paid to winners)
    let thu = 0;
    let bu = 0;
    for (const lo of ALL_LOS) {
      const lim = limits.get(lo) ?? DEFAULT_LIMIT;
      thu += lim * costMult * 1000;
      const occ = actualMap.get(lo) ?? 0;
      if (occ > 0) bu += lim * WIN_PER_HIT * occ;
    }

    const profit = thu - bu;
    balance += profit;

    if (profit > 0) winDays++;
    else loseDays++;

    if (balance > maxBalance) maxBalance = balance;
    if (balance < minBalance) minBalance = balance;

    if (balance <= 0) {
      bankrupt = true;
      bankruptDate = date;
    }

    const hitPicks: string[] = [];
    const missPicks: string[] = [];
    const pickOcc: Record<string, number> = {};
    for (const p of picks) {
      const c = actualMap.get(p) ?? 0;
      pickOcc[p] = c;
      if (c > 0) hitPicks.push(p);
      else missPicks.push(p);
    }
    const hitsInPicks = hitPicks.length;

    const lesson = houseLesson({
      picks, hitInPicks: hitsInPicks, topN, profit,
      thuShort: thu.toString(), buShort: bu.toString(), hitPicks,
    });

    timeline.push({
      date, action: "play", picks,
      hit_picks: hitPicks, miss_picks: missPicks, pick_occurrences: pickOcc,
      total_cost: thu,
      total_payout: bu,
      profit,
      balance_after: balance,
      hits: hitsInPicks,
      occurrences: actualLo.size,
      break_even_hits: 0, // house mode break-even depends on volume, not relevant per-day
      lesson,
      note: strategy === "none" ? "Baseline: limit 200 đều" : `Strategy: ${strategy}`,
    });
  }

  const drawdown = maxBalance > 0 ? ((maxBalance - minBalance) / maxBalance) * 100 : 0;

  return {
    mode: "house",
    region,
    strategy,
    initial_capital: initialCapital,
    days_simulated: timeline.length,
    final_balance: balance,
    total_profit: balance - initialCapital,
    roi_pct: initialCapital > 0
      ? Math.round(((balance - initialCapital) / initialCapital) * 10000) / 100
      : 0,
    max_balance: maxBalance,
    min_balance: minBalance,
    max_drawdown_pct: Math.round(drawdown * 100) / 100,
    win_days: winDays,
    lose_days: loseDays,
    skip_days: 0,
    bankrupt,
    bankrupt_date: bankruptDate,
    timeline,
  };
}

// ─────────────────────────────────────────────
// CRITERIA-BASED PLAYER SIM — bets by consensus bucket
//
// Each historical day:
//   1. Run all 9 (or 10 for MT) models, get each model's top 10
//   2. Compute how many models agreed on each lô (appearance count in top-10s)
//   3. Group lô into buckets by agreement count:
//        5+/N  → very strong (consensus)
//        4/N   → strong
//        3/N   → medium
//        2/N   → weak
//   4. Bet 1 điểm per lô in EACH bucket separately
//   5. Track per-bucket hits, profit, ROI → tells user which criterion pays
// ─────────────────────────────────────────────

export interface CriteriaBucketDay {
  date: string;
  picks: string[];
  hits: number;                 // distinct lô that hit (≤ picks.length)
  total_occurrences: number;    // sum of occurrence counts across hit picks
  hit_picks: string[];
  hit_picks_with_occ: Array<{ lo: string; occ: number }>;
  cost_vnd: number;
  win_vnd: number;
  profit_vnd: number;
}

export interface CriteriaBucketStats {
  bucket_key: string;        // "5plus" | "4" | "3" | "2"
  label: string;             // e.g. "5+/9", "4/10"
  min_models: number;
  max_models: number;
  total_picks: number;       // sum of #picks across all days
  total_hits: number;        // sum of distinct lô hits
  total_occurrences: number; // sum of all hit occurrences (counts multi-hits)
  hit_rate: number;          // hits / picks (0-100)
  occ_per_pick: number;      // average occurrences per pick (0-100)
  total_cost_vnd: number;
  total_win_vnd: number;
  total_profit_vnd: number;
  roi_pct: number;
  win_days: number;
  lose_days: number;
  skip_days: number;
  days: CriteriaBucketDay[];
}

export interface CriteriaSimResult {
  mode: "player_criteria";
  region: Region;
  initial_capital: number;
  days_simulated: number;
  total_models: number;
  buckets: CriteriaBucketStats[];
  total_cost_vnd: number;
  total_win_vnd: number;
  total_profit_vnd: number;
  roi_pct: number;
  final_balance: number;
}

export async function simulatePlayerByCriteria(
  region: Region,
  initialCapital: number,
  days: number,
  topN: number = 10
): Promise<CriteriaSimResult> {
  const dateRows = await query<{ date: string }>(
    "SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT ?",
    [region, days]
  );
  const dates = dateRows.map((r) => r.date).reverse();

  const totalModels = region === "xsmt" ? 10 : 9;
  const buckets: Array<{ key: string; label: string; min: number; max: number }> = [
    { key: "5plus", label: `5+/${totalModels}`, min: 5, max: totalModels },
    { key: "4", label: `4/${totalModels}`, min: 4, max: 4 },
    { key: "3", label: `3/${totalModels}`, min: 3, max: 3 },
    { key: "2", label: `2/${totalModels}`, min: 2, max: 2 },
  ];

  const stats: Record<string, CriteriaBucketStats> = {};
  for (const b of buckets) {
    stats[b.key] = {
      bucket_key: b.key, label: b.label,
      min_models: b.min, max_models: b.max,
      total_picks: 0, total_hits: 0, total_occurrences: 0,
      hit_rate: 0, occ_per_pick: 0,
      total_cost_vnd: 0, total_win_vnd: 0, total_profit_vnd: 0,
      roi_pct: 0,
      win_days: 0, lose_days: 0, skip_days: 0,
      days: [],
    };
  }

  for (const date of dates) {
    const top10ByModel = await getModelTop10PerDay(region, date, topN);
    if (Object.keys(top10ByModel).length === 0) continue;

    // Count model appearances per lô
    const appearances: Record<string, number> = {};
    for (const picks of Object.values(top10ByModel)) {
      for (const lo of picks) appearances[lo] = (appearances[lo] ?? 0) + 1;
    }

    // Actual results that day
    const actualRows = await query<{ lo_number: string; count: number }>(
      "SELECT lo_number, count FROM lo_daily WHERE region = ? AND date = ?",
      [region, date]
    );
    const actualMap = new Map(actualRows.map((r) => [r.lo_number, r.count]));

    // Per-bucket bets
    for (const b of buckets) {
      const bucketPicks: string[] = [];
      const bucketHits: string[] = [];
      const bucketHitsWithOcc: Array<{ lo: string; occ: number }> = [];
      let occ = 0;
      for (const [lo, n] of Object.entries(appearances)) {
        if (n >= b.min && n <= b.max) {
          bucketPicks.push(lo);
          const c = actualMap.get(lo) ?? 0;
          if (c > 0) {
            bucketHits.push(lo);
            bucketHitsWithOcc.push({ lo, occ: c });
            occ += c;
          }
        }
      }
      bucketHitsWithOcc.sort((a, b2) => b2.occ - a.occ);
      const cost = bucketPicks.length * POINT_VALUE;
      const win = occ * WIN_MULTIPLIER * 1000;
      const profit = win - cost;

      const s = stats[b.key];
      s.total_picks += bucketPicks.length;
      s.total_hits += bucketHits.length;
      s.total_occurrences += occ;
      s.total_cost_vnd += cost;
      s.total_win_vnd += win;
      s.total_profit_vnd += profit;
      if (bucketPicks.length === 0) s.skip_days++;
      else if (profit > 0) s.win_days++;
      else s.lose_days++;
      s.days.push({
        date,
        picks: bucketPicks,
        hits: bucketHits.length,
        total_occurrences: occ,
        hit_picks: bucketHits,
        hit_picks_with_occ: bucketHitsWithOcc,
        cost_vnd: cost,
        win_vnd: win,
        profit_vnd: profit,
      });
    }
  }

  // Finalize per-bucket stats
  for (const b of buckets) {
    const s = stats[b.key];
    s.hit_rate = s.total_picks > 0 ? Math.round((s.total_hits / s.total_picks) * 10000) / 100 : 0;
    s.occ_per_pick = s.total_picks > 0
      ? Math.round((s.total_occurrences / s.total_picks) * 10000) / 10000
      : 0;
    s.roi_pct = s.total_cost_vnd > 0
      ? Math.round((s.total_profit_vnd / s.total_cost_vnd) * 10000) / 100
      : 0;
  }

  const totalCost = Object.values(stats).reduce((s, b) => s + b.total_cost_vnd, 0);
  const totalWin = Object.values(stats).reduce((s, b) => s + b.total_win_vnd, 0);
  const totalProfit = totalWin - totalCost;

  return {
    mode: "player_criteria",
    region,
    initial_capital: initialCapital,
    days_simulated: dates.length,
    total_models: totalModels,
    buckets: buckets.map((b) => stats[b.key]),
    total_cost_vnd: totalCost,
    total_win_vnd: totalWin,
    total_profit_vnd: totalProfit,
    roi_pct: totalCost > 0 ? Math.round((totalProfit / totalCost) * 10000) / 100 : 0,
    final_balance: initialCapital + totalProfit,
  };
}
