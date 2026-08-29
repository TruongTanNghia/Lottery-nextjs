/**
 * Replays a limit schedule over the draws that actually happened.
 *
 * The question this answers is the operator's: "if I had been running this
 * table, would I be up or down, and when did it hurt?" That only means
 * anything if each draw is settled against the limit that table would have
 * produced *on that morning* — a lô three days dry is a different bet from the
 * same lô the day after it landed.
 *
 * The dashboard used to settle every past draw against today's stored limits.
 * That is not a small approximation: today's limits already encode which lô are
 * dry right now, and a lô that is dry now mostly did not land in the recent
 * past — so pairing a high limit with those quiet days flatters the book with
 * information from the future. Measured on the real book it moved Miền Nam's
 * 30-draw result from +212,4M to −156,3M. Sign included.
 */
import type { Region } from "./db";
import { STAKE_PRICE, WIN_PER_POINT } from "./exposure";
import type { Schedule } from "./limit-engine";

export const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

export interface DrawHits {
  date: string;
  hits: Record<string, number>;
}

export interface DayRow {
  date: string;
  /** Points the table would have accepted that morning, per lô. */
  limits: Record<string, number>;
  hits: Record<string, number>;
  /** Draws since the last hit, as of that morning — the number that set the limit. */
  gaps: Record<string, number>;
  points: number;
  thu: number;
  bu: number;
  lai: number;
  /** Running total of lai from the first draw in the window. */
  don: number;
  /** How many lô landed at all — the board's own hit count for the day. */
  soLoVe: number;
  luot: number;
}

export interface BacktestResult {
  region: Region;
  soKy: number;
  days: DayRow[];
  thu: number;
  bu: number;
  lai: number;
  phanTram: number;
  kyLo: number;
  ngayTeNhat: DayRow | null;
  ngayDamNhat: DayRow | null;
  /** Deepest run-up-to-trough on the running total, and where it happened. */
  sut: { tu: string; den: string; sau: number } | null;
  luotTB: number;
  luotChuan: number;
}

const truoc = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
};

const cachNgay = (sau: string, truocDo: string) => {
  const [y1, m1, d1] = sau.split("-").map(Number);
  const [y2, m2, d2] = truocDo.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000));
};

/**
 * The schedule's answer for one lô, given how it stands this morning.
 *
 * Mirrors calculateEffectiveLimit exactly: a streak level replaces the base
 * level rather than capping it, so "vừa về" and "về liên tiếp 2 kỳ" can carry
 * different money. Any drift between these two would put the replay and the
 * live board on different books.
 */
export function mucCho(schedule: Schedule, ngayKho: number, chuoi: number): number {
  if (chuoi > 0 && chuoi <= schedule.consecutive_reset_after) {
    const rieng = schedule.consecutive[chuoi];
    if (rieng != null) return rieng;
  }
  return schedule.base[ngayKho] ?? schedule.min_limit;
}

/**
 * Walks every draw in order, settling each one against its own limits.
 *
 * `soKy` trims the *reported* window, not the replay: the gap counters have to
 * run from the very first draw on record or the first days of any window would
 * start from a blank slate and price every lô as if it had never landed.
 */
export function chayLai(
  draws: DrawHits[],
  schedule: Schedule,
  region: Region,
  soKy?: number
): BacktestResult | null {
  if (draws.length === 0) return null;

  const gia = STAKE_PRICE[region];
  const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));

  const trangThai = new Map<string, { last: string | null; kho: number; chuoi: number }>(
    LOS.map((lo) => [lo, { last: null, kho: 0, chuoi: 0 }])
  );

  const tatCa: DayRow[] = [];
  for (const d of sap) {
    const limits: Record<string, number> = {};
    const gaps: Record<string, number> = {};
    let points = 0;
    for (const lo of LOS) {
      const st = trangThai.get(lo)!;
      const m = mucCho(schedule, st.kho, st.chuoi);
      limits[lo] = m;
      gaps[lo] = st.kho;
      points += m;
    }

    let bu = 0;
    let luot = 0;
    let soLoVe = 0;
    for (const [lo, c] of Object.entries(d.hits)) {
      const n = Number(c) || 0;
      if (n <= 0) continue;
      bu += (limits[lo] ?? 0) * WIN_PER_POINT * n;
      luot += n;
      soLoVe++;
    }
    const thu = points * gia;

    tatCa.push({
      date: d.date,
      limits,
      hits: { ...d.hits },
      gaps,
      points,
      thu,
      bu,
      lai: thu - bu,
      don: 0,
      soLoVe,
      luot,
    });

    // Only now does the draw become history the next day may look at.
    for (const [lo, st] of trangThai) {
      if ((d.hits[lo] ?? 0) > 0) {
        st.chuoi = st.last === truoc(d.date) ? st.chuoi + 1 : 1;
        if (st.chuoi > schedule.consecutive_reset_after) st.chuoi = 1;
        st.kho = 0;
        st.last = d.date;
      } else {
        st.kho = st.last ? cachNgay(d.date, st.last) : st.kho + 1;
        st.chuoi = 0;
      }
    }
  }

  const days = soKy && soKy < tatCa.length ? tatCa.slice(-soKy) : tatCa;

  let thu = 0;
  let bu = 0;
  let don = 0;
  let kyLo = 0;
  let luotTong = 0;
  let dinh = 0;
  let dinhNgay = days[0]?.date ?? "";
  let sut: BacktestResult["sut"] = null;
  let teNhat: DayRow | null = null;
  let damNhat: DayRow | null = null;

  for (const r of days) {
    thu += r.thu;
    bu += r.bu;
    don += r.lai;
    r.don = don;
    luotTong += r.luot;
    if (r.lai < 0) kyLo++;
    if (!teNhat || r.lai < teNhat.lai) teNhat = r;
    if (!damNhat || r.lai > damNhat.lai) damNhat = r;

    if (don > dinh) {
      dinh = don;
      dinhNgay = r.date;
    }
    const rot = dinh - don;
    if (rot > (sut?.sau ?? 0)) sut = { tu: dinhNgay, den: r.date, sau: rot };
  }

  return {
    region,
    soKy: days.length,
    days,
    thu,
    bu,
    lai: thu - bu,
    phanTram: thu > 0 ? ((thu - bu) / thu) * 100 : 0,
    kyLo,
    ngayTeNhat: teNhat,
    ngayDamNhat: damNhat,
    sut,
    luotTB: days.length ? luotTong / days.length : 0,
    luotChuan: region === "xsmb" ? 27 : 36,
  };
}
