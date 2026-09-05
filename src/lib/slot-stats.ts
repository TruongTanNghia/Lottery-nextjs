/**
 * "Nhóm nào đẹp nhất?" — đo theo THÁNG, mỗi tháng đứng riêng.
 *
 * Hai chuyện người vận hành tự chỉ ra, và cả hai đều đúng.
 *
 * Một: "vừa về" không phải một nhóm. Lô mới về lần đầu khác hẳn lô đã về hai,
 * ba, bốn kỳ liền, và họ muốn từ chối cái trước mà vẫn ăn cái sau. Nên gap 0
 * tách theo độ dài chuỗi, từ 1 kỳ khô trở lên mới đếm theo độ khô.
 *
 * Hai: bốn cửa sổ 30/60/90/120 kỳ lồng vào nhau nên không phải bốn phép kiểm.
 * Đo trên sổ thật, 30 kỳ gần nhất của Miền Trung đóng góp +504,9tr vào cả bốn
 * con số — một quãng tốt kéo xanh hết phần còn lại. Tháng thì không lồng nhau:
 * tháng 3 và tháng 7 là hai mẫu hoàn toàn riêng, nên "lời ở mọi tháng" mới là
 * một câu có sức nặng.
 *
 * `kiemThu` vẫn là phần giữ cho bảng thật thà: chọn nhóm trên nửa đầu, chơi
 * nửa sau, rồi so với việc cứ nhận đều tất cả.
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
/** Dưới mức này thì con số của tháng đó là may rủi, không phải kết quả. */
const MAU_TOI_THIEU = 30;
/** Tháng nào ít kỳ quá thì không phải một tháng — bỏ khỏi mọi phán xét. */
const KY_TOI_THIEU_THANG = 15;

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

export interface ThangRow {
  /** "2026-07" */
  thang: string;
  /** null khi tháng đó nhóm này không đủ mẫu để nói gì. */
  bien: number | null;
  mau: number;
}

/** Một lô cụ thể, trong một nhóm cụ thể, trên cả quãng đo. */
export interface LoTrongNhom {
  lo: string;
  /** Số lần lô này rơi vào nhóm. */
  dip: number;
  nhay: number;
  lai: number;
}

export interface BacRow {
  key: BacKey;
  ten: string;
  laChuoi: boolean;
  mau: number;
  tyLeVe: number;
  bien: number;
  kyLo: number;
  kyCo: number;
  thu100: number;
  tra100: number;
  /**
   * Con số của THÁNG ĐANG CHẠY — cái người vận hành muốn nhìn.
   *
   * Họ nói thẳng: "thay đổi 151 kỳ thành tháng 9". Cả quãng đo là chuyện của
   * nửa năm trước, còn tiền thì tiêu theo tháng. null khi tháng này nhóm đó
   * chưa đủ mẫu — tháng mới chạy vài kỳ thì nhóm nhỏ chưa nói được gì.
   */
  bienThangNay: number | null;
  tra100ThangNay: number | null;
  theoThang: ThangRow[];
  /** Từng lô trong nhóm, lỗ nặng nhất đứng trước. */
  cacLo: LoTrongNhom[];
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
  /** Các tháng có đủ kỳ, cũ → mới. */
  cacThang: string[];
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
      bac[l] =
        s.chuoi > 0
          ? keyChuoi(Math.min(TRAN_CHUOI, s.chuoi))
          : keyKho(Math.min(TRAN_BAC, Math.max(1, s.kho)));
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

/** Từng lô một, trong từng nhóm — để thấy cái +8% của nhóm đến từ đâu. */
function tachLo(ky: Ky[], gia: number): Record<BacKey, LoTrongNhom[]> {
  const acc: Record<BacKey, Record<string, { dip: number; nhay: number }>> = {};
  for (const k of ky) {
    for (const l of LOS) {
      const b = k.bac[l];
      const m = (acc[b] ??= {});
      const x = (m[l] ??= { dip: 0, nhay: 0 });
      x.dip++;
      x.nhay += k.ve[l];
    }
  }
  const out: Record<BacKey, LoTrongNhom[]> = {};
  for (const [b, m] of Object.entries(acc)) {
    out[b] = Object.entries(m)
      .map(([lo, x]) => ({
        lo,
        dip: x.dip,
        nhay: x.nhay,
        lai: x.dip * 100 * gia - x.nhay * 100 * WIN_PER_POINT,
      }))
      .sort((a, b2) => a.lai - b2.lai);
  }
  return out;
}

export function thongKeBac(draws: DrawHits[], region: Region): SlotStats | null {
  if (draws.length < WARMUP + 20) return null;
  const gia = STAKE_PRICE[region];
  const ky = dungKy(draws);
  const tong = gop(ky, gia);
  const cacLo = tachLo(ky, gia);

  // Tháng nào đủ kỳ mới được coi là một tháng.
  const theoThangKy = new Map<string, Ky[]>();
  for (const k of ky) {
    const t = k.date.slice(0, 7);
    let ds = theoThangKy.get(t);
    if (!ds) theoThangKy.set(t, (ds = []));
    ds.push(k);
  }
  // Tháng ĐANG CHẠY luôn được tính dù mới vài kỳ — đó là tháng người ta đang
  // sống trong nó và là thứ họ hỏi mỗi ngày. Chỉ tháng CŨ mới bị loại khi quá
  // ngắn, vì một tháng cũ 4 kỳ là mẩu dữ liệu vụn chứ không phải một tháng.
  const tatCaThang = [...theoThangKy.keys()].sort();
  const thangDangChay = tatCaThang.at(-1) ?? "";
  const cacThang = tatCaThang.filter(
    (t) => t === thangDangChay || (theoThangKy.get(t)?.length ?? 0) >= KY_TOI_THIEU_THANG
  );

  const gopThang: Record<string, Gop> = {};
  for (const t of cacThang) gopThang[t] = gop(theoThangKy.get(t)!, gia);
  const thangCuoi = thangDangChay;

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
      thu100: 100 * gia,
      tra100: 100 * WIN_PER_POINT * r.tyLeVe,
      bienThangNay: (() => {
        const g = thangCuoi ? gopThang[thangCuoi]?.[key] : undefined;
        return g && g.mau >= MAU_TOI_THIEU ? g.bien : null;
      })(),
      tra100ThangNay: (() => {
        const g = thangCuoi ? gopThang[thangCuoi]?.[key] : undefined;
        return g && g.mau >= MAU_TOI_THIEU ? 100 * WIN_PER_POINT * g.tyLeVe : null;
      })(),
      theoThang: cacThang.map((t) => {
        const g = gopThang[t][key];
        const mau = g?.mau ?? 0;
        return { thang: t, mau, bien: mau >= MAU_TOI_THIEU ? g.bien : null };
      }),
      cacLo: cacLo[key] ?? [],
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

  return {
    soKy: ky.length,
    chuan: region === "xsmb" ? 27 : 36,
    cacThang,
    bang,
    kiemThu,
  };
}
