/**
 * Tính tiền cho luật chặn lô 2 bước — NGÀY NÀO TÍNH THEO LUẬT CỦA NGÀY ĐÓ.
 *
 * Khách: "tính tiền giùm phần này (lô bị chặn / bước 1 / bước 2 / cả hai
 * bước) được không. Ngày nào tính ngày đó theo thời gian thực."
 *
 * "Thời gian thực" là chỗ quyết định: mỗi kỳ D, danh sách chặn được lập chỉ
 * từ các kỳ TRƯỚC D — đúng như hôm đó anh mở tab Chặn Lô và copy. Rồi lấy
 * kết quả kỳ D để chốt sổ. Lấy danh sách chặn của hôm nay đem chấm cho các
 * ngày cũ là nhìn trước tương lai: lô bị chặn hôm nay chính là lô đã về nhiều
 * trong quá khứ, nên "nếu chặn thì đỡ được bao nhiêu" sẽ đẹp giả.
 *
 * Mỗi kỳ, 100 lô chia làm bốn nhóm đúng như bốn ô trên tab:
 *   nhận        — không dính luật (khách nói mỗi miền ~30–35 số)
 *   tong        — chỉ dính bước 1 (về trên mức chung cả quãng)
 *   thang       — chỉ dính bước 2 (2 tháng gần lỗ)
 *   cahai       — dính cả hai
 * Mỗi lô tính như ôm `diem` điểm: thu = điểm × giá, trả = điểm × 75.000đ × số
 * nháy về. Lãi của nhóm chặn là tiền KHÔNG ăn được (dương) hoặc tiền ĐỠ được
 * (âm) nhờ chặn.
 *
 * Module thuần: dùng lại đúng hàm luatChanLo của tab, không có bản tính thứ hai.
 */
import type { DrawHits } from "./backtest";
import { KY_TOI_THIEU_LO, luatChanLo, type CongTacBuocLo } from "./chan-lo";
import { STAKE_PRICE, WIN_PER_POINT } from "./exposure";
import type { Region } from "./types";

const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

export type NhomTien = "nhan" | "tong" | "thang" | "cahai";
export const CAC_NHOM: NhomTien[] = ["nhan", "tong", "thang", "cahai"];

export interface Tien {
  /** Số lượt lô (lô × kỳ) trong nhóm. */
  luot: number;
  /** Số nháy về. */
  nhay: number;
  thu: number;
  tra: number;
  lai: number;
}

const tienRong = (): Tien => ({ luot: 0, nhay: 0, thu: 0, tra: 0, lai: 0 });
const cong = (a: Tien, b: Tien) => { a.luot += b.luot; a.nhay += b.nhay; a.thu += b.thu; a.tra += b.tra; a.lai += b.lai; };

export interface NgayTien {
  date: string;
  /** Số kỳ có trước ngày này — luật hôm đó lập từ ngần ấy kỳ. */
  kyTruoc: number;
  /** Lô từng nhóm hôm đó (luật lập TRƯỚC khi xổ). */
  lo: Record<NhomTien, string[]>;
  /** Lô về hôm đó, kèm số nháy. */
  ve: Record<string, number>;
  tien: Record<NhomTien, Tien>;
  /** Cả 100 lô (nếu nhận hết) = nhan + tong + thang + cahai. */
  tatCa: Tien;
}

export interface TienChanLo {
  region: Region;
  diem: number;
  ngay: NgayTien[];
  /** Cộng dồn từng nhóm trên các ngày đã tính. */
  tong: Record<NhomTien, Tien>;
  tatCa: Tien;
  /** Số kỳ đầu bỏ qua vì chưa đủ dữ liệu để luật chạy. */
  boQuaDau: number;
}

/**
 * Chạy lại từng kỳ. `tuNgay` (YYYY-MM-DD) để chỉ chấm từ một ngày trở đi —
 * luật vẫn lập từ TOÀN BỘ các kỳ trước đó, chỉ phần cộng tiền bắt đầu muộn hơn.
 */
export function tienChanLoTheoNgay(
  draws: DrawHits[],
  region: Region,
  buoc: CongTacBuocLo,
  diem = 1,
  tuNgay: string | null = null
): TienChanLo {
  const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));
  const gia = STAKE_PRICE[region];
  const ngay: NgayTien[] = [];
  const tong = { nhan: tienRong(), tong: tienRong(), thang: tienRong(), cahai: tienRong() } as Record<NhomTien, Tien>;
  const tatCa = tienRong();
  let boQuaDau = 0;

  for (let i = 0; i < sap.length; i++) {
    const d = sap[i];
    if (i < KY_TOI_THIEU_LO) { boQuaDau++; continue; }
    if (tuNgay && d.date < tuNgay) continue;
    const kq = luatChanLo(sap.slice(0, i), region, buoc);
    const lyDo = new Map(kq.bang.map((x) => [x.lo, x.lyDo]));
    const lo = { nhan: [], tong: [], thang: [], cahai: [] } as Record<NhomTien, string[]>;
    const tien = { nhan: tienRong(), tong: tienRong(), thang: tienRong(), cahai: tienRong() } as Record<NhomTien, Tien>;
    const ve: Record<string, number> = {};
    const tc = tienRong();
    for (const l of LOS) {
      const nhom: NhomTien = lyDo.get(l) ?? "nhan";
      const n = Number(d.hits[l]) || 0;
      if (n > 0) ve[l] = n;
      lo[nhom].push(l);
      const t = { luot: 1, nhay: n, thu: diem * gia, tra: diem * WIN_PER_POINT * n, lai: diem * gia - diem * WIN_PER_POINT * n };
      cong(tien[nhom], t);
      cong(tc, t);
    }
    for (const g of CAC_NHOM) cong(tong[g], tien[g]);
    cong(tatCa, tc);
    ngay.push({ date: d.date, kyTruoc: i, lo, ve, tien, tatCa: tc });
  }
  return { region, diem, ngay, tong, tatCa, boQuaDau };
}

/** Phần ăn (%) của một khoản: lãi / thu. */
export const phanAn = (t: Tien) => (t.thu > 0 ? (t.lai / t.thu) * 100 : 0);

/**
 * Để so sánh: lấy MỘT danh sách chặn (thường là danh sách hôm nay) đem chấm
 * cho mọi ngày cũ. Đây là cách nhìn dễ mắc nhất — nhìn bảng hôm nay rồi thấy
 * "các số còn lại toàn số lời" — và nó nhìn trước tương lai, vì lô bị chặn hôm
 * nay chính là lô đã về nhiều trong quá khứ. Chỉ để hiện cạnh số thật.
 */
export function tienNhinTruoc(draws: DrawHits[], region: Region, chan: string[], diem = 1, tuNgay: string | null = null): Tien {
  const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));
  const gia = STAKE_PRICE[region];
  const bo = new Set(chan);
  const t = tienRong();
  sap.forEach((d, i) => {
    if (i < KY_TOI_THIEU_LO || (tuNgay && d.date < tuNgay)) return;
    for (const l of LOS) {
      if (bo.has(l)) continue;
      const n = Number(d.hits[l]) || 0;
      cong(t, { luot: 1, nhay: n, thu: diem * gia, tra: diem * WIN_PER_POINT * n, lai: diem * gia - diem * WIN_PER_POINT * n });
    }
  });
  return t;
}
