/**
 * Track dữ liệu — tab riêng, bám THÁNG HIỆN TẠI (khách chốt 29/10/2026).
 *
 * Khách đang cài tay bảng đá PA2 theo luật: nhìn con số "THÁNG N" của từng ô
 * trên tab Số Đá (phần ăn của ô trong tháng), ô **+%** cài 0n, ô **−%** cài
 * 1n, ô "ít cặp" cài 0n; "mỗi tháng nó mỗi khác, cố định theo tháng cũ dễ
 * oẳng". Tab này làm y vậy một cách tự động, ngày qua ngày ("cuốn chiếu"), để
 * trả lời: theo cách đó thì tháng ăn hay thua, thua dài nhất mấy ngày, thua
 * sâu nhất bao nhiêu. Tháng nào riêng tháng đó.
 *
 * Cách chấm mỗi ngày d của tháng M: lấy các kỳ của M TRƯỚC d, đếm cho 190 ô
 * số cặp đã rơi vào ô (dịp) và số cặp cả hai cùng về; ô dưới DIP_TOI_THIEU
 * cặp = "ít cặp" → 0n; còn lại phần ăn < 0 → 1n, ≥ 0 → 0n. Nhận mọi cặp rơi
 * vào ô 1n với 1 điểm, chốt bằng kết quả ngày d. Ngày chưa có ô nào đủ cặp là
 * ngày "chờ dữ liệu", không nhận gì.
 *
 * Để khách so, tính luôn chiều ngược (ô +% → 1n, ô −% → 0n) cùng dữ liệu.
 * Hoàn toàn thuần, không chạm bảng đá đang chạy hay bot gửi.
 */
import { DIP_TOI_THIEU, GIA_DA, TRUNG_DA, demCapTheoNgay, type KyDa } from "./da";
import type { Region } from "./db";

export type ChieuTrack = "am" | "duong";

export interface NgayTrack {
  date: string;
  /** Số ô cài 1n sáng hôm đó. 0 = chờ dữ liệu. */
  soO: number;
  /** Các ô 1n ("i-j"). */
  o: string[];
  soCap: number;
  capTrung: number;
  thu: number;
  tra: number;
  lai: number;
  /** Lũy kế trong tháng. */
  don: number;
  cho: boolean;
}

export interface TomTatThang {
  soNgay: number;
  ngayCho: number;
  ngayAn: number;
  ngayThua: number;
  ngayHoa: number;
  thu: number;
  tra: number;
  lai: number;
  pct: number;
  /** Chuỗi thua dài nhất: số ngày và ngày đầu–cuối. */
  thuaDai: { soNgay: number; tu: string | null; den: string | null };
  /** Sụt sâu nhất từ đỉnh lũy kế xuống đáy. */
  sutSau: { tien: number; tu: string | null; den: string | null };
}

export interface ThangTrack {
  thang: string;
  ngay: NgayTrack[];
  tomTat: TomTatThang;
}

export interface KetQuaTrack {
  region: Region;
  chieu: ChieuTrack;
  cacThang: ThangTrack[];
}

/** Ô nào cài 1n sáng hôm đó, theo số liệu tháng tới hôm trước. */
export function oCai1n(tong: Map<string, { dip: number; caHai: number }>, region: Region, chieu: ChieuTrack): string[] {
  const gia = GIA_DA[region], trung = TRUNG_DA[region];
  const out: string[] = [];
  for (const [k, v] of tong) {
    if (v.dip < DIP_TOI_THIEU) continue; // "ít cặp"
    const bien = v.dip * gia - v.caHai * trung;
    if (chieu === "am" ? bien < 0 : bien > 0) out.push(k);
  }
  return out.sort();
}

export function tomTat(ngay: NgayTrack[]): TomTatThang {
  const co = ngay.filter((n) => !n.cho);
  let thu = 0, tra = 0, ngayAn = 0, ngayThua = 0, ngayHoa = 0;
  // Chuỗi thua dài nhất
  let chuoi = 0, chuoiTu: string | null = null, thuaDai = { soNgay: 0, tu: null as string | null, den: null as string | null };
  // Sụt sâu nhất từ đỉnh
  let dinh = 0, dinhNgay: string | null = null, sutSau = { tien: 0, tu: null as string | null, den: null as string | null };
  for (const n of co) {
    thu += n.thu; tra += n.tra;
    if (n.lai > 0) ngayAn++; else if (n.lai < 0) ngayThua++; else ngayHoa++;
    if (n.lai < 0) {
      if (chuoi === 0) chuoiTu = n.date;
      chuoi++;
      if (chuoi > thuaDai.soNgay) thuaDai = { soNgay: chuoi, tu: chuoiTu, den: n.date };
    } else chuoi = 0;
    if (n.don > dinh) { dinh = n.don; dinhNgay = n.date; }
    const sut = dinh - n.don;
    if (sut > sutSau.tien) sutSau = { tien: sut, tu: dinhNgay, den: n.date };
  }
  const lai = thu - tra;
  return { soNgay: ngay.length, ngayCho: ngay.length - co.length, ngayAn, ngayThua, ngayHoa, thu, tra, lai, pct: thu > 0 ? (lai / thu) * 100 : 0, thuaDai, sutSau };
}

/**
 * Chạy cuốn chiếu cho mọi tháng có trong `ky` (đã qua dungKy). Mỗi tháng
 * bắt đầu từ sổ trắng.
 */
export function trackTheoThang(ky: KyDa[], region: Region, chieu: ChieuTrack): KetQuaTrack {
  const gia = GIA_DA[region], trung = TRUNG_DA[region];
  const theoThang = new Map<string, KyDa[]>();
  for (const k of ky) {
    const t = k.date.slice(0, 7);
    const a = theoThang.get(t);
    if (a) a.push(k); else theoThang.set(t, [k]);
  }
  const cacThang: ThangTrack[] = [];
  for (const thang of [...theoThang.keys()].sort()) {
    const tong = new Map<string, { dip: number; caHai: number }>();
    const ngay: NgayTrack[] = [];
    let don = 0;
    for (const k of theoThang.get(thang)!) {
      const o = oCai1n(tong, region, chieu);
      const oSet = new Set(o);
      let soCap = 0, capTrung = 0;
      const homNay = demCapTheoNgay([k]);
      for (const [key, v] of homNay) {
        if (oSet.has(key)) { soCap += v.dip; capTrung += v.caHai; }
        // Cộng dồn cho ngày mai — SAU khi đã chấm hôm nay bằng số liệu tới hôm trước.
        const a = tong.get(key);
        if (a) { a.dip += v.dip; a.caHai += v.caHai; } else tong.set(key, { dip: v.dip, caHai: v.caHai });
      }
      const thu = soCap * gia, tra = capTrung * trung, lai = thu - tra;
      const cho = o.length === 0;
      if (!cho) don += lai;
      ngay.push({ date: k.date, soO: o.length, o, soCap, capTrung, thu, tra, lai, don, cho });
    }
    cacThang.push({ thang, ngay, tomTat: tomTat(ngay) });
  }
  return { region, chieu, cacThang };
}
