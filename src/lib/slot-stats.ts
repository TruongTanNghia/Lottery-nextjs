/**
 * "Bậc ngày-chưa-về nào có lời?"
 *
 * The operator's own lever, measured directly: group every (lô, kỳ) pair by how
 * many kỳ that lô had been dry that morning, then ask what a flat 100 điểm on
 * that group would have returned.
 *
 * The table is the easy half. The hard half — and the reason `kiemThu` exists —
 * is that picking the winning bậc out of such a table is choosing after seeing
 * the answers. So the same routine also does it properly: choose on the first
 * half of the record, play the second half blind, and report what that made
 * against simply accepting every bậc.
 */
import { LOS, type DrawHits } from "./backtest";
import { STAKE_PRICE, WIN_PER_POINT } from "./exposure";
import type { Region } from "./db";

/** Bậc 19 gathers everything from 19 kỳ dry upward — past that the samples vanish. */
export const TRAN_BAC = 19;
/** Early kỳ have no dry history yet, so every lô would sit in bậc 0 and skew it. */
const WARMUP = 30;

export interface BacRow {
  bac: number;
  /** (lô, kỳ) pairs that sat in this bậc — the sample size behind the number. */
  mau: number;
  tyLeVe: number;
  bien: number;
  kyLo: number;
  kyCo: number;
  /** Margin in each of the 30/60/90/120 windows, for "lời cả 4 chu kỳ". */
  theoCuaSo: Record<number, number | null>;
}

export interface KiemThu {
  kyHoc: number;
  kyThi: number;
  bacChon: number[];
  bienChon: number;
  bienTatCa: number;
  bacConLoi: number;
}

export interface SlotStats {
  soKy: number;
  chuan: number;
  bang: BacRow[];
  kiemThu: KiemThu | null;
}

interface Ky {
  date: string;
  bac: Record<string, number>;
  ve: Record<string, number>;
}

/** Every kỳ tagged with each lô's bậc that morning. */
function dungKy(draws: DrawHits[]): Ky[] {
  const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));
  const truoc = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, dd));
    t.setUTCDate(t.getUTCDate() - 1);
    return t.toISOString().slice(0, 10);
  };
  const cach = (a: string, b: string) => {
    const [y1, m1, d1] = a.split("-").map(Number);
    const [y2, m2, d2] = b.split("-").map(Number);
    return Math.max(0, Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000));
  };

  const st = new Map(LOS.map((l) => [l, { last: null as string | null, kho: 0 }]));
  const out: Ky[] = [];
  for (const d of sap) {
    const bac: Record<string, number> = {};
    const ve: Record<string, number> = {};
    for (const l of LOS) {
      bac[l] = Math.min(TRAN_BAC, st.get(l)!.kho);
      ve[l] = d.hits[l] ?? 0;
    }
    out.push({ date: d.date, bac, ve });
    for (const [l, s] of st) {
      if ((d.hits[l] ?? 0) > 0) { s.kho = 0; s.last = d.date; }
      else { s.kho = s.last ? cach(d.date, s.last) : s.kho + 1; }
    }
    void truoc;
  }
  return out.slice(WARMUP);
}

function gop(ky: Ky[], gia: number) {
  const B = Array.from({ length: TRAN_BAC + 1 }, () => ({ lo: 0, nhay: 0, kyLo: 0, kyCo: 0 }));
  for (const k of ky) {
    const hom = Array.from({ length: TRAN_BAC + 1 }, () => ({ lo: 0, nhay: 0 }));
    for (const l of LOS) {
      const b = k.bac[l];
      hom[b].lo++;
      hom[b].nhay += k.ve[l];
    }
    for (let b = 0; b <= TRAN_BAC; b++) {
      if (!hom[b].lo) continue;
      B[b].lo += hom[b].lo;
      B[b].nhay += hom[b].nhay;
      B[b].kyCo++;
      if (hom[b].lo * gia - hom[b].nhay * WIN_PER_POINT < 0) B[b].kyLo++;
    }
  }
  return B.map((x) => ({
    mau: x.lo,
    tyLeVe: x.lo ? x.nhay / x.lo : 0,
    bien: x.lo ? ((gia - (x.nhay / x.lo) * WIN_PER_POINT) / gia) * 100 : 0,
    kyLo: x.kyLo,
    kyCo: x.kyCo,
  }));
}

/** Margin of a flat 100 on the given bậc, over the given kỳ. */
function bienCua(ky: Ky[], gia: number, bacNhan: (b: number) => boolean): number {
  let thu = 0, bu = 0;
  for (const k of ky) {
    for (const l of LOS) {
      if (!bacNhan(k.bac[l])) continue;
      thu += 100 * gia;
      bu += 100 * WIN_PER_POINT * k.ve[l];
    }
  }
  return thu > 0 ? ((thu - bu) / thu) * 100 : 0;
}

export function thongKeBac(draws: DrawHits[], region: Region): SlotStats | null {
  if (draws.length < WARMUP + 20) return null;
  const gia = STAKE_PRICE[region];
  const ky = dungKy(draws);
  const tong = gop(ky, gia);

  const cuaSo = [30, 60, 90, 120];
  const theo: Record<number, ReturnType<typeof gop>> = {};
  for (const n of cuaSo) theo[n] = gop(ky.slice(-n), gia);

  const bang: BacRow[] = tong.map((r, b) => ({
    bac: b,
    mau: r.mau,
    tyLeVe: r.tyLeVe,
    bien: r.bien,
    kyLo: r.kyLo,
    kyCo: r.kyCo,
    theoCuaSo: Object.fromEntries(
      cuaSo.map((n) => [n, theo[n][b].mau >= 30 ? theo[n][b].bien : null])
    ),
  }));

  // Chọn bằng nửa đầu, chấm bằng nửa sau. Không có bước này thì bảng trên chỉ
  // là danh sách những gì đã xảy ra, không phải thứ đem ra dùng được.
  const nua = Math.floor(ky.length / 2);
  let kiemThu: KiemThu | null = null;
  if (nua >= 30) {
    const hoc = gop(ky.slice(0, nua), gia);
    const thi = ky.slice(nua);
    const chon = hoc.map((r, b) => ({ b, ...r })).filter((r) => r.mau >= 60 && r.bien > 0).map((r) => r.b);
    const sauNay = gop(thi, gia);
    kiemThu = {
      kyHoc: nua,
      kyThi: thi.length,
      bacChon: chon,
      bienChon: chon.length ? bienCua(thi, gia, (b) => chon.includes(b)) : 0,
      bienTatCa: bienCua(thi, gia, () => true),
      bacConLoi: chon.filter((b) => sauNay[b] && sauNay[b].bien > 0).length,
    };
  }

  return {
    soKy: ky.length,
    chuan: region === "xsmb" ? 27 : 36,
    bang,
    kiemThu,
  };
}
