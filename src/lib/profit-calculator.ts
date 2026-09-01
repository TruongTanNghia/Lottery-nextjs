/**
 * Profit Calculator (operator view).
 *
 * Thu = Σ điểm × giá bán   (27.000đ mỗi điểm ở MN/MT, 20.250đ ở MB)
 * Bù  = Σ điểm × 75.000đ × số nháy
 * Lãi = Thu − Bù
 *
 * Which điểm, though, is the whole question. This used to read lo_status —
 * today's limits — and settle every past draw against them. Today's limits
 * already say which lô are dry now, and a lô dry now mostly did not land in the
 * recent past, so that pairing quietly prices quiet days at high limits and
 * flatters the book with information it could not have had. On the real book it
 * moved Miền Nam's 30-draw result from +212,4M to −156,3M — the sign flipped.
 *
 * So every draw is now settled against the limit the schedule would have set on
 * that morning, replayed by chayLai(). Same function the dashboard panel calls,
 * so the API and the screen cannot drift apart.
 */
import { query, type Region } from "./db";
import { chayLai, type DrawHits } from "./backtest";
import { POSITIONS } from "./exposure";
import { loadSchedule } from "./limit-engine";

/** Every counted draw for a region, oldest first. */
async function layDraws(region: Region): Promise<DrawHits[]> {
  const rows = await query<{ date: string; lo_number: string; count: number }>(
    "SELECT date, lo_number, count FROM lo_daily WHERE region = ? ORDER BY date",
    [region]
  );
  const theoNgay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    let d = theoNgay.get(r.date);
    if (!d) theoNgay.set(r.date, (d = {}));
    d[r.lo_number] = Number(r.count);
  }
  return [...theoNgay.entries()].map(([date, hits]) => ({ date, hits }));
}

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
  const draws = await layDraws(region);
  if (draws.length === 0) return emptyDaily(dateStr);

  const kq = chayLai(draws, await loadSchedule(region), region);
  const row = kq?.days.find((d) => d.date === dateStr);
  if (!row) return emptyDaily(dateStr);

  const winCount = row.soLoVe;
  return {
    date: dateStr,
    region,
    total_thu_vnd: row.thu,
    total_bu_vnd: row.bu,
    net_profit_vnd: row.lai,
    total_bet_vnd: row.thu,
    total_win_vnd: row.bu,
    total_loss_vnd: Math.max(0, row.lai),
    win_count: winCount,
    lose_count: 100 - winCount,
    total_bets: 100,
    win_rate: winCount,
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
  /**
   * How many draws the figures actually cover, and how many lô-hits each one
   * counted.
   *
   * Both travel with the money because both can silently make it wrong. The
   * window is calendar-based, so stale results quietly shrink "30 ngày" to
   * whatever is left. And every đồng of Bù is hits × 75.000đ, so if the đài
   * rule lapses and a draw counts 56 hits instead of 36, the payout inflates by
   * half and the only visible symptom is a losing month. Reporting the number
   * next to the money is what turns that from a mystery into a reading.
   */
  so_ky: number;
  luot_ve_tb: number;
  luot_chuan: number;
  /** Draws that closed down — how many of the window went red. */
  ky_lo: number;
  /** Deepest fall from a running-total peak inside the window. */
  sut_sau_nhat: number;
}

/**
 * `days` counts draws, not calendar days.
 *
 * The operator asks for "30 kỳ" and means thirty draws. A calendar window
 * silently shrinks whenever results are stale — it was reporting sixteen draws
 * under a "30 ngày" heading — and a run of missing days would quietly change
 * what the number covers between one look and the next.
 */
export async function calculatePeriodProfit(
  days: number = 30,
  region: Region
): Promise<PeriodProfit> {
  const draws = await layDraws(region);
  const kq = chayLai(draws, await loadSchedule(region), region, days);

  if (!kq) {
    return {
      period_days: days, region,
      total_thu_vnd: 0, total_bu_vnd: 0, net_profit_vnd: 0,
      total_bet_vnd: 0, total_win_vnd: 0, total_loss_vnd: 0,
      win_count: 0, lose_count: 0, total_bets: 0,
      total_wins: 0, total_losses: 0, win_rate: 0, roi: 0,
      daily_breakdown: [], so_ky: 0, luot_ve_tb: 0, luot_chuan: POSITIONS[region],
      ky_lo: 0, sut_sau_nhat: 0,
    };
  }

  const daily: DailyProfit[] = kq.days.map((r) => ({
    date: r.date,
    region,
    total_thu_vnd: r.thu,
    total_bu_vnd: r.bu,
    net_profit_vnd: r.lai,
    total_bet_vnd: r.thu,
    total_win_vnd: r.bu,
    total_loss_vnd: Math.max(0, r.lai),
    win_count: r.soLoVe,
    lose_count: 100 - r.soLoVe,
    total_bets: 100,
    win_rate: r.soLoVe,
  }));

  const veTB = kq.days.length
    ? kq.days.reduce((s, r) => s + r.soLoVe, 0) / kq.days.length
    : 0;

  return {
    period_days: days,
    region,
    total_thu_vnd: kq.thu,
    total_bu_vnd: kq.bu,
    net_profit_vnd: kq.lai,
    total_bet_vnd: kq.thu,
    total_win_vnd: kq.bu,
    total_loss_vnd: Math.max(0, kq.lai),
    win_count: 0,
    lose_count: 0,
    total_bets: kq.days.length * 100,
    total_wins: kq.days.reduce((s, r) => s + r.soLoVe, 0),
    total_losses: kq.days.reduce((s, r) => s + (100 - r.soLoVe), 0),
    win_rate: veTB,
    roi: kq.phanTram,
    daily_breakdown: daily,
    so_ky: kq.soKy,
    luot_ve_tb: kq.luotTB,
    luot_chuan: kq.luotChuan,
    ky_lo: kq.kyLo,
    sut_sau_nhat: kq.sut?.sau ?? 0,
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
  // One replay, then read it off. Calling calculateDailyProfit in a loop would
  // re-walk the whole history once per point.
  const draws = await layDraws(region);
  const kq = chayLai(draws, await loadSchedule(region), region, days);
  const rows = kq?.days ?? [];

  return {
    labels: rows.map((r) => `${r.date.slice(8, 10)}/${r.date.slice(5, 7)}`),
    datasets: {
      wins: rows.map((r) => r.thu),
      losses: rows.map((r) => -r.bu),
      thu: rows.map((r) => r.thu),
      bu: rows.map((r) => -r.bu),
      net: rows.map((r) => r.lai),
      cumulative: rows.map((r) => r.don),
    },
  };
}

export interface ThangProfit {
  thang: string;
  soKy: number;
  thu: number;
  bu: number;
  lai: number;
  phanTram: number;
}

export interface BaoCaoThang {
  region: Region;
  cacThang: ThangProfit[];
  /** Độ dao động tự nhiên của một tháng, tính từ chính các tháng đã qua. */
  bienDo: number;
  trungBinh: number;
}

/** Tháng nào ít kỳ quá thì không phải một tháng. */
const KY_TOI_THIEU = 15;

/**
 * Lãi lỗ theo tháng dương lịch, mỗi tháng đứng riêng — và độ dao động của nó.
 *
 * Người vận hành tự chỉ ra chỗ sai của cửa sổ cuốn chiếu: 30/60/90/120 kỳ lồng
 * vào nhau nên một quãng tốt kéo xanh cả bốn. Tháng thì không lồng nhau.
 *
 * Nhưng tháng có cái bẫy riêng, nên `bienDo` đi kèm chứ không phải phụ lục:
 * đo trên sổ thật, một tháng Miền Nam dao động ±4,03% (±299tr) mà trung bình
 * chỉ +0,80%. Một tháng xanh nằm gọn trong khoảng đó không nói lên điều gì cả.
 * Báo cáo mà chỉ đưa con số rồi phán "tốt" là dạy người đọc tin vào nhiễu.
 */
export async function baoCaoTheoThang(region: Region): Promise<BaoCaoThang> {
  const draws = await layDraws(region);
  const kq = chayLai(draws, await loadSchedule(region), region);

  const gom = new Map<string, { thu: number; bu: number; lai: number; soKy: number }>();
  for (const d of kq?.days ?? []) {
    const t = d.date.slice(0, 7);
    let a = gom.get(t);
    if (!a) gom.set(t, (a = { thu: 0, bu: 0, lai: 0, soKy: 0 }));
    a.thu += d.thu;
    a.bu += d.bu;
    a.lai += d.lai;
    a.soKy++;
  }

  const cacThang: ThangProfit[] = [...gom.entries()]
    .filter(([, a]) => a.soKy >= KY_TOI_THIEU)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([thang, a]) => ({
      thang,
      soKy: a.soKy,
      thu: a.thu,
      bu: a.bu,
      lai: a.lai,
      phanTram: a.thu > 0 ? (a.lai / a.thu) * 100 : 0,
    }));

  const pcts = cacThang.map((t) => t.phanTram);
  const tb = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
  const bienDo = pcts.length
    ? Math.sqrt(pcts.reduce((a, b) => a + (b - tb) ** 2, 0) / pcts.length)
    : 0;

  return { region, cacThang, bienDo, trungBinh: tb };
}
