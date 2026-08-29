/**
 * "Ngày nào đẹp nhất?" — nhưng "vừa về" không phải một nhóm.
 *
 * The operator drew the line themself: a lô that just landed once is not the
 * same animal as a lô that has landed two, three or four kỳ running, and they
 * want to be able to refuse the first while still taking the second. All four
 * used to sit in one bucket called "vừa về", so the table could never show that
 * they behave differently — or that they don't.
 *
 * So gap 0 is split by streak length, and everything from 1 kỳ dry upward keeps
 * counting by dryness. Each group is then priced the only way that means
 * anything: what a flat 100 điểm on it would have returned.
 *
 * `kiemThu` is the half that keeps the table honest. Picking the winning groups
 * out of it is choosing after seeing the answers, so the same routine also
 * chooses on the first half of the record, plays the second half blind, and
 * reports that against simply accepting every group.
 */
import { LOS, type DrawHits } from "./backtest";
import { STAKE_PRICE, WIN_PER_POINT } from "./exposure";
import type { Region } from "./db";

/** Bậc 19 gathers everything from 19 kỳ dry upward — past that the samples vanish. */
export const TRAN_BAC = 19;
/** Streaks reset after this many, matching the limit engine. */
export const TRAN_CHUOI = 4;
/** Early kỳ have no dry history yet, so every lô would sit in bậc 0 and skew it. */
const WARMUP = 30;

/** `chuoi:2` = về liên tiếp 2 kỳ · `kho:5` = 5 kỳ chưa về. */
export type BacKey = string;

export const keyChuoi = (n: number): BacKey => `chuoi:${n}`;
export const keyKho = (n: number): BacKey => `kho:${n}`;

export function tenBac(key: BacKey): string {
  const [loai, n] = key.split(":");
  const so = Number(n);
  if (loai === "chuoi") {
    if (so === 1) return "vừa về";
    return so >= TRAN_CHUOI ? `về liên tiếp ${TRAN_CHUOI} kỳ` : `về liên tiếp ${so} kỳ`;
  }
  return so >= TRAN_BAC ? `${TRAN_BAC}+ kỳ chưa về` : `${so} kỳ chưa về`;
}

/** Mọi nhóm, theo đúng thứ tự người ta đọc: vừa về → chuỗi → khô dần. */
export function moiBac(): BacKey[] {
  const out: BacKey[] = [];
  for (let c = 1; c <= TRAN_CHUOI; c++) out.push(keyChuoi(c));
  for (let k = 1; k <= TRAN_BAC; k++) out.push(keyKho(k));
  return out;
}

export interface BacRow {
  key: BacKey;
  ten: string;
  /** True cho nhóm chuỗi — để màn hình gom chúng lại một chỗ. */
  laChuoi: boolean;
  /** (lô, kỳ) pairs that sat in this group — the sample size behind the number. */
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
  bacChon: BacKey[];
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
  bac: Record<string, BacKey>;
  ve: Record<string, number>;
}

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

/** Every kỳ tagged with each lô's group that morning. */
function dungKy(draws: DrawHits[]): Ky[] {
  const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));
  const st = new Map(LOS.map((l) => [l, { last: null as string | null, kho: 0, chuoi: 0 }]));
  const out: Ky[] = [];

  for (const d of sap) {
    const bac: Record<string, BacKey> = {};
    const ve: Record<string, number> = {};
    for (const l of LOS) {
      const s = st.get(l)!;
      bac[l] = s.chuoi > 0 ? keyChuoi(Math.min(TRAN_CHUOI, s.chuoi)) : keyKho(Math.min(TRAN_BAC, Math.max(1, s.kho)));
      ve[l] = d.hits[l] ?? 0;
    }
    out.push({ date: d.date, bac, ve });

    for (const [l, s] of st) {
      if ((d.hits[l] ?? 0) > 0) {
        s.chuoi = s.last === truoc(d.date) ? s.chuoi + 1 : 1;
        if (s.chuoi > TRAN_CHUOI) s.chuoi = 1;
        s.kho = 0;
        s.last = d.date;
      } else {
        s.kho = s.last ? cach(d.date, s.last) : s.kho + 1;
        s.chuoi = 0;
      }
    }
  }
  return out.slice(WARMUP);
}

type Gop = Record<BacKey, { mau: number; tyLeVe: number; bien: number; kyLo: number; kyCo: number }>;

function gop(ky: Ky[], gia: number): Gop {
  const acc: Record<BacKey, { lo: number; nhay: number; kyLo: number; kyCo: number }> = {};
  for (const k of moiBac()) acc[k] = { lo: 0, nhay: 0, kyLo: 0, kyCo: 0 };

  for (const k of ky) {
    const hom: Record<BacKey, { lo: number; nhay: number }> = {};
    for (const l of LOS) {
      const b = k.bac[l];
      (hom[b] ??= { lo: 0, nhay: 0 }).lo++;
      hom[b].nhay += k.ve[l];
    }
    for (const [b, h] of Object.entries(hom)) {
      const a = (acc[b] ??= { lo: 0, nhay: 0, kyLo: 0, kyCo: 0 });
      a.lo += h.lo;
      a.nhay += h.nhay;
      a.kyCo++;
      if (h.lo * gia - h.nhay * WIN_PER_POINT < 0) a.kyLo++;
    }
  }

  const out: Gop = {};
  for (const [b, a] of Object.entries(acc)) {
    out[b] = {
      mau: a.lo,
      tyLeVe: a.lo ? a.nhay / a.lo : 0,
      bien: a.lo ? ((gia - (a.nhay / a.lo) * WIN_PER_POINT) / gia) * 100 : 0,
      kyLo: a.kyLo,
      kyCo: a.kyCo,
    };
  }
  return out;
}

/** Margin of a flat 100 on the given groups, over the given kỳ. */
function bienCua(ky: Ky[], gia: number, nhan: (b: BacKey) => boolean): number {
  let thu = 0, bu = 0;
  for (const k of ky) {
    for (const l of LOS) {
      if (!nhan(k.bac[l])) continue;
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
  const theo: Record<number, Gop> = {};
  for (const n of cuaSo) theo[n] = gop(ky.slice(-n), gia);

  const bang: BacRow[] = moiBac().map((key) => {
    const r = tong[key];
    return {
      key,
      ten: tenBac(key),
      laChuoi: key.startsWith("chuoi:"),
      mau: r.mau,
      tyLeVe: r.tyLeVe,
      bien: r.bien,
      kyLo: r.kyLo,
      kyCo: r.kyCo,
      theoCuaSo: Object.fromEntries(
        cuaSo.map((n) => [n, (theo[n][key]?.mau ?? 0) >= 30 ? theo[n][key].bien : null])
      ),
    };
  });

  const nua = Math.floor(ky.length / 2);
  let kiemThu: KiemThu | null = null;
  if (nua >= 30) {
    const hoc = gop(ky.slice(0, nua), gia);
    const thi = ky.slice(nua);
    const chon = moiBac().filter((b) => hoc[b].mau >= 60 && hoc[b].bien > 0);
    const sauNay = gop(thi, gia);
    kiemThu = {
      kyHoc: nua,
      kyThi: thi.length,
      bacChon: chon,
      bienChon: chon.length ? bienCua(thi, gia, (b) => chon.includes(b)) : 0,
      bienTatCa: bienCua(thi, gia, () => true),
      bacConLoi: chon.filter((b) => (sauNay[b]?.mau ?? 0) > 0 && sauNay[b].bien > 0).length,
    };
  }

  return { soKy: ky.length, chuan: region === "xsmb" ? 27 : 36, bang, kiemThu };
}
