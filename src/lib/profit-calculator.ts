/**
 * Profit Calculator (operator view) — port of backend/profit_calculator.py
 *
 * Thu = Σ điểm × COST_MULTIPLIER × 75  (tiền cược thu vào, tất cả 100 lô)
 * Bù  = Σ điểm × 75 × occurrences      (chi trả cho lô về)
 * Lãi = Thu - Bù
 */
import { query, type Region } from "./db";
import { COST_MULTIPLIER, PRICE_PER_POINT } from "./limit-engine";

export interface DailyProfit {
  date: string;
  region?: Region;
  total_thu_vnd: number;
  total_bu_vnd: number;
  net_profit_vnd: number;
  // Legacy aliases for older clients
  total_bet_vnd: number;
  total_win_vnd: number;
  total_loss_vnd: number;
  win_count: number;
  lose_count: number;
  total_bets: number;
  win_rate: number;
}

export async function calculateDailyProfit(
  dateStr: string,
  region: Region
): Promise<DailyProfit> {
  const costMult = COST_MULTIPLIER[region];

  const limits = await query<{ lo_number: string; current_limit: number }>(
    "SELECT lo_number, current_limit FROM lo_status WHERE region = ?",
    [region]
  );

  const appearances = await query<{ lo_number: string; count: number }>(
    "SELECT lo_number, count FROM lo_daily WHERE date = ? AND region = ?",
    [dateStr, region]
  );

  if (limits.length === 0) return emptyDaily(dateStr);

  const appearMap = new Map<string, number>(
    appearances.map((a) => [a.lo_number, a.count])
  );

  let totalThu = 0;
  let totalBu = 0;
  let winCount = 0;
  let loseCount = 0;

  for (const { lo_number, current_limit } of limits) {
    totalThu += current_limit * costMult * PRICE_PER_POINT;
    const n = appearMap.get(lo_number) ?? 0;
    if (n > 0) {
      totalBu += current_limit * PRICE_PER_POINT * n;
      winCount++;
    } else {
      loseCount++;
    }
  }

  const lai = totalThu - totalBu;

  return {
    date: dateStr,
    region,
    total_thu_vnd: totalThu,
    total_bu_vnd: totalBu,
    net_profit_vnd: lai,
    total_bet_vnd: totalThu,
    total_win_vnd: totalBu,
    total_loss_vnd: Math.max(0, totalThu - totalBu),
    win_count: winCount,
    lose_count: loseCount,
    total_bets: winCount + loseCount,
    win_rate: winCount + loseCount > 0 ? (winCount / 100) * 100 : 0,
  };
}

function emptyDaily(dateStr: string): DailyProfit {
  return {
    date: dateStr,
    total_thu_vnd: 0,
    total_bu_vnd: 0,
    net_profit_vnd: 0,
    total_bet_vnd: 0,
    total_win_vnd: 0,
    total_loss_vnd: 0,
    win_count: 0,
    lose_count: 0,
    total_bets: 0,
    win_rate: 0,
  };
}

export interface PeriodProfit extends Omit<DailyProfit, "date"> {
  period_days: number;
  region: Region;
  total_wins: number;
  total_losses: number;
  roi: number;
  daily_breakdown: DailyProfit[];
}

export async function calculatePeriodProfit(
  days: number = 30,
  region: Region
): Promise<PeriodProfit> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const dates = await query<{ date: string }>(
    "SELECT DISTINCT date FROM lo_daily WHERE region = ? AND date >= ? ORDER BY date DESC",
    [region, cutoffStr]
  );

  let totalThu = 0;
  let totalBu = 0;
  let totalWins = 0;
  let totalLosses = 0;
  const daily: DailyProfit[] = [];

  for (const { date } of dates) {
    const d = await calculateDailyProfit(date, region);
    daily.push(d);
    totalThu += d.total_thu_vnd;
    totalBu += d.total_bu_vnd;
    totalWins += d.win_count;
    totalLosses += d.lose_count;
  }

  const lai = totalThu - totalBu;
  const totalBets = totalWins + totalLosses;

  return {
    period_days: days,
    region,
    total_thu_vnd: totalThu,
    total_bu_vnd: totalBu,
    net_profit_vnd: lai,
    total_bet_vnd: totalThu,
    total_win_vnd: totalBu,
    total_loss_vnd: Math.max(0, totalThu - totalBu),
    win_count: 0,
    lose_count: 0,
    total_bets: totalBets,
    total_wins: totalWins,
    total_losses: totalLosses,
    win_rate: totalBets > 0 ? (totalWins / totalBets) * 100 : 0,
    roi: totalThu > 0 ? (lai / totalThu) * 100 : 0,
    daily_breakdown: daily,
  };
}

export interface ChartData {
  labels: string[];
  datasets: {
    wins: number[]; // alias: thu
    losses: number[]; // alias: bu (negative)
    thu: number[];
    bu: number[];
    net: number[];
    cumulative: number[];
  };
}

export async function getProfitChartData(
  days: number = 30,
  region: Region
): Promise<ChartData> {
  const labels: string[] = [];
  const thuData: number[] = [];
  const buData: number[] = [];
  const netData: number[] = [];
  const cumData: number[] = [];
  let cumulative = 0;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const display = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

    const daily = await calculateDailyProfit(dateStr, region);
    labels.push(display);
    thuData.push(daily.total_thu_vnd);
    buData.push(-daily.total_bu_vnd);
    netData.push(daily.net_profit_vnd);
    cumulative += daily.net_profit_vnd;
    cumData.push(cumulative);
  }

  return {
    labels,
    datasets: {
      wins: thuData,
      losses: buData,
      thu: thuData,
      bu: buData,
      net: netData,
      cumulative: cumData,
    },
  };
}
