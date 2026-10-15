/**
 * Phần ăn (% lời/lỗ) của từng ô trong bảng "Hạn Mức Theo Số Ngày Chưa Về",
 * tính trên N kỳ gần nhất.
 *
 * Khách: "thêm cái % thắng thua của ô đó hiện trên được hem — vd 30 kì gần của
 * ô đó +- bao nhiêu %, để kiểm soát ô kĩ hơn". Mỗi kỳ, lô nào đang ở ô nào
 * (đúng luật `oCua` của bộ máy hạn mức: ngày chưa về 0…19, 20+, hoặc về liên
 * tiếp 2/3/4 kỳ) thì tính cho ô đó: nhận 1 điểm mỗi lô → thu giá lô, lô về
 * bao nhiêu nháy thì trả bấy nhiêu lần tiền trúng. Phần ăn = (thu − trả) / thu.
 *
 * Đo với 1 điểm mỗi lô nên con số là của CHÍNH Ô, không phụ thuộc số đang cài
 * (cài 100 hay 8 thì % vẫn vậy, chỉ tiền to nhỏ). Ô đang chặn vẫn có % — để
 * biết nếu mở ra thì ăn hay thua. Chỉ đọc, không đổi hạn mức.
 */
import type { DrawHits } from "./backtest";
import { STAKE_PRICE, WIN_PER_POINT } from "./exposure";
import { khoaO, moiO, oCua } from "./lich-han-muc";
import { dungKy } from "./slot-stats";
import type { Region } from "./types";

export interface PhanAnO {
  /** Số lượt lô rơi vào ô (kỳ × lô). */
  soLo: number;
  /** Tổng số nháy các lô đó về. */
  nhay: number;
  thu: number;
  tra: number;
  lai: number;
  /** % — dương là lời. null khi ô không có lô nào trong quãng. */
  bien: number | null;
}

/** Một kỳ của một ô — một "vạch". */
export interface VachKy {
  date: string;
  /** Số lô nằm ở ô đó sáng hôm ấy (0 = ô trống, không thu không trả). */
  soLo: number;
  nhay: number;
  lai: number;
}

/** Khách: "bên cạnh ô 7 vạch nhỏ, báo hiệu ngày hôm đó — xanh là lời, đỏ là lỗ, xám là hoà". */
export const SO_VACH = 7;

export interface KetQuaPhanAnO {
  /** Khoá ô (khoaO) → số liệu. */
  o: Record<string, PhanAnO>;
  /** Khoá ô → SO_VACH kỳ gần nhất, cũ trước mới sau. Ô nào cũng đủ vạch (kỳ ô trống thì soLo 0). */
  vach: Record<string, VachKy[]>;
  /** Số kỳ thật sự đem ra tính (có thể ít hơn N nếu kho ngắn). */
  soKy: number;
  tuNgay: string | null;
  denNgay: string | null;
}

export function phanAnTheoO(draws: DrawHits[], region: Region, soKy = 30): KetQuaPhanAnO {
  const ky = dungKy(draws).slice(-Math.max(1, soKy));
  const gia = STAKE_PRICE[region];
  const o: Record<string, PhanAnO> = {};
  for (const k of ky) {
    for (const lo of Object.keys(k.kho)) {
      const key = khoaO(oCua(k.kho[lo], k.chuoi[lo]));
      let x = o[key];
      if (!x) o[key] = x = { soLo: 0, nhay: 0, thu: 0, tra: 0, lai: 0, bien: null };
      const n = Number(k.ve[lo]) || 0;
      x.soLo++;
      x.nhay += n;
      x.thu += gia;
      x.tra += n * WIN_PER_POINT;
    }
  }
  for (const x of Object.values(o)) {
    x.lai = x.thu - x.tra;
    x.bien = x.thu > 0 ? (x.lai / x.thu) * 100 : null;
  }
  // Vạch từng kỳ: luôn là SO_VACH kỳ cuối, không phụ thuộc quãng % đang chọn.
  const vach: Record<string, VachKy[]> = {};
  const kyVach = dungKy(draws).slice(-SO_VACH);
  for (const oo of moiO()) vach[khoaO(oo)] = kyVach.map((k) => ({ date: k.date, soLo: 0, nhay: 0, lai: 0 }));
  kyVach.forEach((k, i) => {
    for (const lo of Object.keys(k.kho)) {
      const v = vach[khoaO(oCua(k.kho[lo], k.chuoi[lo]))][i];
      const n = Number(k.ve[lo]) || 0;
      v.soLo++;
      v.nhay += n;
      v.lai += gia - n * WIN_PER_POINT;
    }
  });
  return { o, vach, soKy: ky.length, tuNgay: ky[0]?.date ?? null, denNgay: ky[ky.length - 1]?.date ?? null };
}
