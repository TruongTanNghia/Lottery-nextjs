/**
 * Chặn lô hai bước — luật khách chốt cho cả ba miền:
 *
 *   1. tổng thể mọi kỳ: lô nào tỷ lệ về CAO hơn mức chung → chặn
 *      (mức chung = số giải đang tính / 100: Nam, Trung 36 nháy trên 100 kỳ,
 *      Bắc 27);
 *   2. hai tháng gần nhất: lô nào phần ăn DƯỚI 0% → chặn.
 *
 * Ở giá đang bán (27.000đ Nam/Trung, 20.250đ Bắc, thắng 75.000đ một nháy)
 * phần ăn của một lô bằng 0 đúng khi nó về đúng mức chung, nên hai bước là
 * cùng một thước đo trên hai quãng thời gian. Vẫn tính phần ăn bằng giá thật
 * chứ không suy từ tỷ lệ, để đổi giá thì bước 2 vẫn đúng.
 *
 * Danh sách này KHÔNG tự đổi hạn mức trên Dashboard — nó là thứ đem đi dán
 * ("05b0n" = lô 05, 0 nhận) cho người ghi cược, y như chặn đá. Tính lại mỗi
 * kỳ, không đóng đinh (khách chưa xin giữ nguyên cho lô).
 *
 * Module thuần: web và bot cùng gọi, không thể lệch nhau.
 */
import type { DrawHits } from "./backtest";
import { STAKE_PRICE, WIN_PER_POINT, hitsPerDraw } from "./exposure";
import type { Region } from "./types";

const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

/** Lô ít hơn ngần này kỳ trong quãng đang xét thì bước đó không chấm. */
export const KY_TOI_THIEU_LO = 20;

export type LyDoChanLo = "tong" | "thang" | "cahai";

export interface LoChan {
  lo: string;
  /** Cả quãng. */
  nhay: number;
  ky: number;
  tyLe: number;
  bien: number;
  /** Hai tháng gần nhất. */
  nhay2: number;
  ky2: number;
  tyLe2: number;
  bien2: number;
  b1: boolean;
  b2: boolean;
  lyDo: LyDoChanLo | null;
}

export interface KetQuaChanLo {
  region: Region;
  soKy: number;
  /** Tỷ lệ về mức chung, ví dụ 0,36. */
  mucChung: number;
  /** Hai tháng đang chấm ở bước 2, cũ → mới. */
  thang2: string[];
  soKy2: number;
  bang: LoChan[];
  /** Lô bị chặn, tăng dần. */
  chan: string[];
  dem: { tong: number; thang: number; cahai: number };
  tuNgay: string | null;
  denNgay: string | null;
}

const bienLo = (nhay: number, ky: number, region: Region): number => {
  const thu = ky * STAKE_PRICE[region];
  return thu > 0 ? ((thu - nhay * WIN_PER_POINT) / thu) * 100 : 0;
};

/** Hai công tắc riêng, cùng khách chốt cho cả lô lẫn đá. */
export interface CongTacBuocLo {
  buoc1: boolean;
  buoc2: boolean;
}
export const CA_HAI_BUOC_LO: CongTacBuocLo = { buoc1: true, buoc2: true };

export function luatChanLo(draws: DrawHits[], region: Region, buoc: CongTacBuocLo = CA_HAI_BUOC_LO): KetQuaChanLo {
  const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));
  const cacThang = [...new Set(sap.map((d) => d.date.slice(0, 7)))].sort();
  const thang2 = cacThang.slice(-2);
  const trong2 = new Set(thang2);
  // hitsPerDraw đã là nháy mỗi lô mỗi kỳ (0,36 / 0,27) — không chia thêm.
  const mucChung = hitsPerDraw(region);

  const nhay: Record<string, number> = {}, nhay2: Record<string, number> = {};
  for (const l of LOS) (nhay[l] = 0), (nhay2[l] = 0);
  let soKy2 = 0;
  for (const d of sap) {
    const gan = trong2.has(d.date.slice(0, 7));
    if (gan) soKy2++;
    for (const [l, c] of Object.entries(d.hits)) {
      const n = Number(c) || 0;
      if (!(l in nhay)) continue;
      nhay[l] += n;
      if (gan) nhay2[l] += n;
    }
  }
  const soKy = sap.length;

  const dem = { tong: 0, thang: 0, cahai: 0 };
  const bang: LoChan[] = LOS.map((lo) => {
    const tyLe = soKy > 0 ? nhay[lo] / soKy : 0;
    const tyLe2 = soKy2 > 0 ? nhay2[lo] / soKy2 : 0;
    const bien = bienLo(nhay[lo], soKy, region);
    const bien2 = bienLo(nhay2[lo], soKy2, region);
    const b1 = buoc.buoc1 && soKy >= KY_TOI_THIEU_LO && tyLe > mucChung;
    const b2 = buoc.buoc2 && soKy2 >= KY_TOI_THIEU_LO && bien2 < 0;
    const lyDo: LyDoChanLo | null = b1 && b2 ? "cahai" : b1 ? "tong" : b2 ? "thang" : null;
    if (lyDo) dem[lyDo]++;
    return { lo, nhay: nhay[lo], ky: soKy, tyLe, bien, nhay2: nhay2[lo], ky2: soKy2, tyLe2, bien2, b1, b2, lyDo };
  });

  return {
    region,
    soKy,
    mucChung,
    thang2,
    soKy2,
    bang,
    chan: bang.filter((x) => x.lyDo).map((x) => x.lo),
    dem,
    tuNgay: sap[0]?.date ?? null,
    denNgay: sap[sap.length - 1]?.date ?? null,
  };
}

/** "st tv ag …: 05b0n 17b0n …" — đúng cú pháp lô của phần mềm ghi cược (b = bao lô, 0n = 0 nhận). */
export function chuoiChanLo(dau: string, chan: string[]): string {
  return chan.length ? `${dau}: ${chan.map((l) => `${l}b0n`).join(" ")}` : "";
}
