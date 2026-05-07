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
import { predictTopNHistorical } from "./prediction";

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
  bet_per_pick?: number;
  total_cost: number;
  total_payout: number;
  profit: number;
  balance_after: number;
  hits?: number;
  occurrences?: number;
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
        total_cost: 0, total_payout: 0, profit: 0,
        balance_after: balance, note,
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
          total_cost: 0, total_payout: 0, profit: 0,
          balance_after: balance,
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
    for (const pick of picks) {
      const c = actualMap.get(pick) ?? 0;
      if (c > 0) {
        hits++;
        occ += c;
      }
    }

    const payout = occ * betPerPick * WIN_PER_HIT;
    const profit = payout - cost;
    balance += profit;

    if (profit > 0) winDays++;
    else if (profit < 0) loseDays++;

    if (balance > maxBalance) maxBalance = balance;
    if (balance < minBalance) minBalance = balance;

    recentProfits.push(profit);
    if (recentProfits.length > 3) recentProfits.shift();

    timeline.push({
      date, action: "bet", picks,
      bet_per_pick: betPerPick,
      total_cost: cost,
      total_payout: payout,
      profit,
      balance_after: balance,
      hits, occurrences: occ, note,
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

    const hitsInPicks = picks.filter((p) => (actualMap.get(p) ?? 0) > 0).length;

    timeline.push({
      date, action: "play", picks,
      total_cost: thu,
      total_payout: bu,
      profit,
      balance_after: balance,
      hits: hitsInPicks,
      occurrences: actualLo.size,
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
