/**
 * Chặn theo NGÀY (bậc) hai bước — cùng luật với chan-lo.ts nhưng áp lên từng
 * bậc của bảng "Hạn Mức Theo Số Ngày Chưa Về", đúng ý khách: "mình áp dụng
 * theo ngày á — áp dụng nó theo từng kỳ".
 *
 *   1. tổng thể mọi kỳ: bậc nào tỷ lệ về CAO hơn mức chung → chặn;
 *   2. hai tháng gần nhất: bậc nào phần ăn DƯỚI 0% → chặn.
 *
 * Bậc = đúng các nhóm của khối "Ngày Nào Đẹp Nhất" (slot-stats): vừa về, về
 * liên tiếp 2/3/4 kỳ, 1…19+ kỳ chưa về. Mỗi bậc ứng với một ô trong lịch hạn
 * mức: "vừa về" là ngày 0, "về liên tiếp n" là mức riêng n, "n kỳ chưa về" là
 * ngày n. Bậc bị chặn thì ô đó về 0; bậc không bị chặn thì GIỮ NGUYÊN số
 * khách đang cài — luật chỉ thêm số 0, không tự đặt lại tiền.
 *
 * Module thuần: web, bot và cron cùng gọi.
 */
import type { DrawHits } from "./backtest";
import { STAKE_PRICE, WIN_PER_POINT, hitsPerDraw } from "./exposure";
import type { Schedule } from "./limit-engine";
import { dungKy, moiBac, tenBac, type BacKey } from "./slot-stats";
import type { Region } from "./types";

const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

/** Bậc ít hơn ngần này lô-kỳ trong quãng xét thì bước đó không chấm (cùng mức với Ngày Nào Đẹp Nhất). */
export const MAU_TOI_THIEU_NGAY = 30;

export type LyDoChanNgay = "tong" | "thang" | "cahai";

export interface ViTriLich {
  loai: "base" | "consecutive";
  so: number;
}

export interface BacChan {
  key: BacKey;
  ten: string;
  viTri: ViTriLich;
  /** Cả quãng: lô-kỳ, nháy, tỷ lệ, phần ăn. */
  mau: number;
  nhay: number;
  tyLe: number;
  bien: number;
  /** Hai tháng gần nhất. */
  mau2: number;
  nhay2: number;
  tyLe2: number;
  bien2: number;
  b1: boolean;
  b2: boolean;
  lyDo: LyDoChanNgay | null;
}

export interface KetQuaChanNgay {
  region: Region;
  soKy: number;
  mucChung: number;
  thang2: string[];
  soKy2: number;
  bang: BacChan[];
  chan: BacKey[];
  dem: { tong: number; thang: number; cahai: number };
  tuNgay: string | null;
  denNgay: string | null;
}

/** Bậc nào ứng với ô nào trong lịch hạn mức. */
export function viTriCua(key: BacKey): ViTriLich {
  const [loai, n] = key.split(":");
  const so = Number(n);
  if (loai === "chuoi") return so <= 1 ? { loai: "base", so: 0 } : { loai: "consecutive", so };
  return { loai: "base", so };
}

const bienBac = (nhay: number, mau: number, region: Region): number => {
  const gia = STAKE_PRICE[region];
  return mau > 0 ? ((gia - (nhay / mau) * WIN_PER_POINT) / gia) * 100 : 0;
};

export function luatChanNgay(draws: DrawHits[], region: Region): KetQuaChanNgay {
  const ky = dungKy(draws);
  const cacThang = [...new Set(ky.map((k) => k.date.slice(0, 7)))].sort();
  const thang2 = cacThang.slice(-2);
  const trong2 = new Set(thang2);
  const mucChung = hitsPerDraw(region);

  const acc: Record<string, { mau: number; nhay: number; mau2: number; nhay2: number }> = {};
  for (const b of moiBac()) acc[b] = { mau: 0, nhay: 0, mau2: 0, nhay2: 0 };
  let soKy2 = 0;
  for (const k of ky) {
    const gan = trong2.has(k.date.slice(0, 7));
    if (gan) soKy2++;
    for (const l of LOS) {
      const a = acc[k.bac[l]] ?? (acc[k.bac[l]] = { mau: 0, nhay: 0, mau2: 0, nhay2: 0 });
      a.mau++;
      a.nhay += k.ve[l];
      if (gan) {
        a.mau2++;
        a.nhay2 += k.ve[l];
      }
    }
  }

  const dem = { tong: 0, thang: 0, cahai: 0 };
  const bang: BacChan[] = moiBac().map((key) => {
    const a = acc[key];
    const tyLe = a.mau ? a.nhay / a.mau : 0;
    const tyLe2 = a.mau2 ? a.nhay2 / a.mau2 : 0;
    const bien = bienBac(a.nhay, a.mau, region);
    const bien2 = bienBac(a.nhay2, a.mau2, region);
    const b1 = a.mau >= MAU_TOI_THIEU_NGAY && tyLe > mucChung;
    const b2 = a.mau2 >= MAU_TOI_THIEU_NGAY && bien2 < 0;
    const lyDo: LyDoChanNgay | null = b1 && b2 ? "cahai" : b1 ? "tong" : b2 ? "thang" : null;
    if (lyDo) dem[lyDo]++;
    return { key, ten: tenBac(key), viTri: viTriCua(key), mau: a.mau, nhay: a.nhay, tyLe, bien, mau2: a.mau2, nhay2: a.nhay2, tyLe2, bien2, b1, b2, lyDo };
  });

  return {
    region,
    soKy: ky.length,
    mucChung,
    thang2,
    soKy2,
    bang,
    chan: bang.filter((x) => x.lyDo).map((x) => x.key),
    dem,
    tuNgay: ky[0]?.date ?? null,
    denNgay: ky[ky.length - 1]?.date ?? null,
  };
}

export interface DoiLich {
  /** "ngày 3" / "liên tiếp 2". */
  o: string;
  viTri: ViTriLich;
  tu: number;
  den: number;
}

/**
 * Áp danh sách bậc chặn vào một lịch: ô của bậc chặn về 0, mọi ô khác giữ
 * nguyên. Chỉ đụng ô CÓ trong lịch — ô không có thì lịch đang dùng min_limit,
 * bịa thêm ô là đổi nghĩa của lịch. Trả kèm danh sách ô thật sự đổi.
 */
export function apVaoLich(lich: Schedule, chan: BacKey[]): { lich: Schedule; doi: DoiLich[] } {
  const moi: Schedule = {
    base: { ...lich.base },
    min_limit: lich.min_limit,
    consecutive: { ...lich.consecutive },
    consecutive_reset_after: lich.consecutive_reset_after,
  };
  const doi: DoiLich[] = [];
  for (const key of chan) {
    const vt = viTriCua(key);
    const bang = vt.loai === "base" ? moi.base : moi.consecutive;
    if (!(vt.so in bang)) continue;
    const tu = bang[vt.so];
    if (tu === 0) continue;
    bang[vt.so] = 0;
    doi.push({ o: vt.loai === "base" ? `ngày ${vt.so}` : `liên tiếp ${vt.so}`, viTri: vt, tu, den: 0 });
  }
  return { lich: moi, doi };
}
