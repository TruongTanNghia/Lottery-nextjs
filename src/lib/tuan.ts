/**
 * Tab "📅 Tuần" — khách 09/11/2026: "lấy dữ liệu tầm 3 năm, phân tích theo
 * từng tuần; anh cảm giác có tuần đánh thì ăn, có tuần đánh thì thua; tìm ra
 * cái dấu hiệu đó".
 *
 * Việc của file này: gom kết quả đã xổ (3 năm cào sẵn + kho đang chạy) theo
 * TUẦN (thứ 2 → chủ nhật), chấm từng tuần theo cách khách đang đánh, rồi đem
 * các "luật tuần" ra thử: tuần trước ăn thì đánh, tuần trước thua thì đánh,
 * tuần lẻ, tuần chẵn, tuần đầu tháng, tuần cuối tháng… Mỗi luật được so với
 * may rủi bằng phép hoán vị: chọn ngẫu nhiên cùng số tuần ấy 2.000 lần, xem
 * bao nhiêu lần ngẫu nhiên cũng ăn bằng hoặc hơn. Luật nào ngẫu nhiên hiếm khi
 * đuổi kịp (dưới 5%) mới đáng gọi là dấu hiệu — và vẫn phải nói rõ số phép
 * thử, vì thử 8 luật thì xác suất ít nhất một luật lọt ngưỡng do may rủi đã
 * là 34%.
 *
 * Thuần, chỉ đọc; không chạm bảng đá, bot hay tab nào khác.
 */
import type { DrawHits } from "./backtest";
import { GIA_DA, TRUNG_DA } from "./da";
import { dungKy } from "./slot-stats";
import { trackTheoThang } from "./track-thang";
import type { Region } from "./types";

/** Cách khách đánh: nhận đều 4.950 cặp 1n, hay luật khách (ô −% → 1n, tab Track). */
export type CachDanh = "deu" | "khach";
/** Nhìn từ phía anh đánh lên cửa trên (gửi) hay phía nhận. */
export type PhiaNhin = "gui" | "nhan";

export interface NgayLai {
  date: string;
  /** Tiền xác bỏ ra (phía gửi) = tiền thu (phía nhận). */
  xac: number;
  /** Tiền trúng được trả. */
  trung: number;
  /** Có đánh ngày đó không (luật khách có ngày "chờ dữ liệu"). */
  danh: boolean;
}

export const soLan = (n: number, k = 2): number => (n < k ? 0 : (n * (n - 1)) / 2);

/** Nhận đều 1n mọi cặp: thu 4.950 × giá, trả C(số con về, 2) × trúng. */
export function laiNgayDeu(d: DrawHits, region: Region): NgayLai {
  const h = Object.values(d.hits).filter((x) => Number(x) > 0).length;
  return { date: d.date, xac: 4950 * GIA_DA[region], trung: soLan(h) * TRUNG_DA[region], danh: true };
}

/** Luật khách (tab Track, chiều "am"): ngày chờ dữ liệu = không đánh. */
export function laiNgayKhach(draws: DrawHits[], region: Region): NgayLai[] {
  const kq = trackTheoThang(dungKy(draws), region, "am");
  return kq.cacThang.flatMap((t) => t.ngay.map((n) => ({ date: n.date, xac: n.cho ? 0 : n.thu, trung: n.cho ? 0 : n.tra, danh: !n.cho })));
}

export interface ThongTinTuan {
  /** "2026-W45" */
  khoa: string;
  nam: number;
  so: number;
  /** Thứ 2 và chủ nhật của tuần, YYYY-MM-DD. */
  thu2: string;
  cn: string;
  /** Tuần thứ mấy trong tháng theo ngày thứ 2 (1–5). */
  thuTrongThang: number;
  /** Thứ 2 rơi vào 7 ngày cuối tháng. */
  cuoiThang: boolean;
}

const utc = (s: string) => new Date(s + "T00:00:00Z");
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Tuần ISO: thứ 2 → chủ nhật; số tuần theo ngày thứ 5 của tuần. */
export function thuTuan(date: string): ThongTinTuan {
  const d = utc(date);
  const lui = (d.getUTCDay() + 6) % 7;
  const thu2 = new Date(d); thu2.setUTCDate(d.getUTCDate() - lui);
  const cn = new Date(thu2); cn.setUTCDate(thu2.getUTCDate() + 6);
  const thu5 = new Date(thu2); thu5.setUTCDate(thu2.getUTCDate() + 3);
  const nam = thu5.getUTCFullYear();
  const dauNam = new Date(Date.UTC(nam, 0, 1));
  const so = Math.floor((thu5.getTime() - dauNam.getTime()) / 86_400_000 / 7) + 1;
  const ngayCuoiThang = new Date(Date.UTC(thu2.getUTCFullYear(), thu2.getUTCMonth() + 1, 0)).getUTCDate();
  return {
    khoa: `${nam}-W${String(so).padStart(2, "0")}`, nam, so, thu2: ymd(thu2), cn: ymd(cn),
    thuTrongThang: Math.floor((thu2.getUTCDate() - 1) / 7) + 1,
    cuoiThang: thu2.getUTCDate() + 7 > ngayCuoiThang,
  };
}

export interface Tuan extends ThongTinTuan {
  soKy: number;
  /** Số ngày có đánh. */
  soNgayDanh: number;
  xac: number;
  trung: number;
  /** Lãi theo phía đang nhìn. */
  lai: number;
}

/** Gom ngày thành tuần (chỉ tuần có kỳ), cũ → mới. `phia` quyết định dấu của lãi. */
export function gomTuan(ngay: NgayLai[], phia: PhiaNhin): Tuan[] {
  const m = new Map<string, Tuan>();
  for (const n of ngay) {
    const tt = thuTuan(n.date);
    let t = m.get(tt.khoa);
    if (!t) m.set(tt.khoa, (t = { ...tt, soKy: 0, soNgayDanh: 0, xac: 0, trung: 0, lai: 0 }));
    t.soKy++;
    if (n.danh) t.soNgayDanh++;
    t.xac += n.xac;
    t.trung += n.trung;
  }
  const out = [...m.values()].sort((a, b) => a.thu2.localeCompare(b.thu2));
  for (const t of out) t.lai = phia === "nhan" ? t.xac - t.trung : t.trung - t.xac;
  return out;
}

export type Luat = "luon" | "sauAn" | "sauThua" | "sau2An" | "sau2Thua" | "tuanLe" | "tuanChan" | "tuanDauThang" | "tuanCuoiThang";
export const CAC_LUAT: { khoa: Luat; ten: string; moTa: string }[] = [
  { khoa: "luon", ten: "Đánh mọi tuần", moTa: "mốc so sánh" },
  { khoa: "sauAn", ten: "Tuần trước ăn thì đánh", moTa: "theo đà" },
  { khoa: "sauThua", ten: "Tuần trước thua thì đánh", moTa: "chờ gỡ" },
  { khoa: "sau2An", ten: "Hai tuần ăn liền thì đánh", moTa: "đà mạnh" },
  { khoa: "sau2Thua", ten: "Hai tuần thua liền thì đánh", moTa: "gỡ sâu" },
  { khoa: "tuanLe", ten: "Chỉ đánh tuần lẻ", moTa: "tuần đánh tuần nghỉ" },
  { khoa: "tuanChan", ten: "Chỉ đánh tuần chẵn", moTa: "tuần nghỉ tuần đánh" },
  { khoa: "tuanDauThang", ten: "Chỉ tuần đầu tháng", moTa: "thứ 2 rơi vào 1–7" },
  { khoa: "tuanCuoiThang", ten: "Chỉ tuần cuối tháng", moTa: "thứ 2 rơi vào 7 ngày cuối" },
];

/** Tuần nào đánh theo luật. Luật "tuần trước" nhìn tuần liền trước trong danh sách. */
export function chonTuan(tuan: Tuan[], luat: Luat): boolean[] {
  return tuan.map((t, i) => {
    const t1 = tuan[i - 1], t2 = tuan[i - 2];
    switch (luat) {
      case "luon": return true;
      case "sauAn": return !!t1 && t1.lai > 0;
      case "sauThua": return !!t1 && t1.lai < 0;
      case "sau2An": return !!t1 && !!t2 && t1.lai > 0 && t2.lai > 0;
      case "sau2Thua": return !!t1 && !!t2 && t1.lai < 0 && t2.lai < 0;
      case "tuanLe": return t.so % 2 === 1;
      case "tuanChan": return t.so % 2 === 0;
      case "tuanDauThang": return t.thuTrongThang === 1;
      case "tuanCuoiThang": return t.cuoiThang;
    }
  });
}

export interface DanhGiaLuat {
  luat: Luat;
  ten: string;
  moTa: string;
  tuanDanh: number;
  tuanAn: number;
  tuanThua: number;
  tuanHoa: number;
  lai: number;
  /** Lãi trung bình mỗi tuần có đánh. */
  laiTB: number;
  /** Lãi trung bình mỗi tuần nếu đánh mọi tuần — để so. */
  laiTBLuon: number;
  /** Xác suất chọn ngẫu nhiên cùng số tuần mà ăn bằng hoặc hơn. 1 = luật "luôn". */
  mayRui: number;
  /** Vượt may rủi: mayRui < 0,05 và hơn mốc "đánh mọi tuần". */
  vuot: boolean;
}

export const SO_HOAN_VI = 2000;
export const NGUONG_MAY_RUI = 0.05;

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Chọn ngẫu nhiên `k` trong `n` tuần, `soLan` lần, xem bao nhiêu lần tổng lãi
 * ≥ `thucTe`. Có cộng 1 ở tử và mẫu để không bao giờ ra đúng 0.
 */
export function xacSuatMayRui(lai: number[], k: number, thucTe: number, soLan = SO_HOAN_VI, seed = 20261109): number {
  const n = lai.length;
  if (k <= 0 || k >= n) return 1;
  const rnd = mulberry32(seed);
  const idx = lai.map((_, i) => i);
  let dem = 0;
  for (let l = 0; l < soLan; l++) {
    // Fisher–Yates một phần: k phần tử đầu là tập chọn.
    let s = 0;
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rnd() * (n - i));
      [idx[i], idx[j]] = [idx[j], idx[i]];
      s += lai[idx[i]];
    }
    if (s >= thucTe - 1e-6) dem++;
  }
  return (dem + 1) / (soLan + 1);
}

export function danhGiaLuat(tuan: Tuan[], luat: Luat, seed = 20261109): DanhGiaLuat {
  const chon = chonTuan(tuan, luat);
  const lai = tuan.map((t) => t.lai);
  const { ten, moTa } = CAC_LUAT.find((l) => l.khoa === luat)!;
  let tuanDanh = 0, tuanAn = 0, tuanThua = 0, tuanHoa = 0, tong = 0;
  chon.forEach((c, i) => {
    if (!c) return;
    tuanDanh++;
    tong += lai[i];
    if (lai[i] > 0) tuanAn++; else if (lai[i] < 0) tuanThua++; else tuanHoa++;
  });
  const tongLuon = lai.reduce((s, x) => s + x, 0);
  const laiTBLuon = tuan.length ? tongLuon / tuan.length : 0;
  const laiTB = tuanDanh ? tong / tuanDanh : 0;
  const mayRui = luat === "luon" ? 1 : xacSuatMayRui(lai, tuanDanh, tong, SO_HOAN_VI, seed);
  return { luat, ten, moTa, tuanDanh, tuanAn, tuanThua, tuanHoa, lai: tong, laiTB, laiTBLuon, mayRui, vuot: luat !== "luon" && tuanDanh > 0 && mayRui < NGUONG_MAY_RUI && laiTB > laiTBLuon };
}

/** Tương quan tuần này với tuần liền sau (Pearson, trễ 1). Gần 0 = tuần này không nói gì về tuần sau. */
export function tuongQuanTre1(lai: number[]): number {
  const n = lai.length - 1;
  if (n < 3) return 0;
  const a = lai.slice(0, -1), b = lai.slice(1);
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

export interface ChuoiTuan { soTuan: number; tu: string | null; den: string | null; lai: number }

/** Chuỗi tuần ăn liền dài nhất và thua liền dài nhất. */
export function chuoiDaiNhat(tuan: Tuan[]): { an: ChuoiTuan; thua: ChuoiTuan } {
  const tim = (dau: 1 | -1): ChuoiTuan => {
    let best: ChuoiTuan = { soTuan: 0, tu: null, den: null, lai: 0 }, dem = 0, tu: string | null = null, lai = 0;
    for (const t of tuan) {
      if (Math.sign(t.lai) === dau) {
        if (dem === 0) { tu = t.thu2; lai = 0; }
        dem++; lai += t.lai;
        if (dem > best.soTuan) best = { soTuan: dem, tu, den: t.cn, lai };
      } else dem = 0;
    }
    return best;
  };
  return { an: tim(1), thua: tim(-1) };
}

export interface NamTuan { nam: number; soTuan: number; tuanAn: number; tuanThua: number; lai: number; xac: number }

export interface PhanTichTuan {
  region: Region;
  cach: CachDanh;
  phia: PhiaNhin;
  soKy: number;
  tuNgay: string | null;
  denNgay: string | null;
  tuan: Tuan[];
  luat: DanhGiaLuat[];
  tuongQuan: number;
  chuoi: { an: ChuoiTuan; thua: ChuoiTuan };
  theoNam: NamTuan[];
  /** Số luật đem thử (không kể mốc). */
  soPhepThu: number;
  /** Xác suất ít nhất một luật lọt ngưỡng chỉ do may rủi, với chừng ấy phép thử. */
  xacSuatLotNgau: number;
  ketLuan: string;
}

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};

export function phanTichTuan(draws: DrawHits[], region: Region, cach: CachDanh, phia: PhiaNhin, seed = 20261109): PhanTichTuan {
  const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));
  const ngay = cach === "deu" ? sap.map((d) => laiNgayDeu(d, region)) : laiNgayKhach(sap, region);
  const tuan = gomTuan(ngay, phia);
  const luat = CAC_LUAT.map((l) => danhGiaLuat(tuan, l.khoa, seed));
  const lai = tuan.map((t) => t.lai);
  const theoNamM = new Map<number, NamTuan>();
  for (const t of tuan) {
    let x = theoNamM.get(t.nam);
    if (!x) theoNamM.set(t.nam, (x = { nam: t.nam, soTuan: 0, tuanAn: 0, tuanThua: 0, lai: 0, xac: 0 }));
    x.soTuan++; x.lai += t.lai; x.xac += t.xac;
    if (t.lai > 0) x.tuanAn++; else if (t.lai < 0) x.tuanThua++;
  }
  const soPhepThu = CAC_LUAT.length - 1;
  const xacSuatLotNgau = 1 - Math.pow(1 - NGUONG_MAY_RUI, soPhepThu);
  const vuot = luat.filter((l) => l.vuot);
  const moc = luat.find((l) => l.luat === "luon")!;
  const an = tuan.filter((t) => t.lai > 0).length, thua = tuan.filter((t) => t.lai < 0).length;
  const tq = tuongQuanTre1(lai);
  const tqChu = Math.abs(tq) < 0.1 ? "tuần này không nói gì về tuần sau" : tq > 0 ? "tuần ăn hơi dễ kéo theo tuần ăn, nhưng yếu" : "tuần ăn hơi dễ kéo theo tuần thua, nhưng yếu";
  let ketLuan: string;
  if (tuan.length < 20) ketLuan = `Mới có ${tuan.length} tuần, chưa đủ để nói gì về dấu hiệu.`;
  else if (vuot.length === 0) {
    ketLuan = `${tuan.length} tuần: ${an} tuần ăn, ${thua} tuần thua, đánh mọi tuần được ${tien(moc.lai)}. Không luật tuần nào trong ${soPhepThu} luật đem thử vượt được may rủi: chọn tuần ngẫu nhiên cũng ăn ngang vậy. Tương quan tuần này với tuần sau ${tq.toFixed(2)}, ${tqChu}. Tuần ăn tuần thua là dao động bình thường của kết quả xổ, không phải chu kỳ.`;
  } else {
    const ds = vuot.map((l) => `"${l.ten}" (${l.tuanDanh} tuần, ${tien(l.lai)}, may rủi đuổi kịp ${(l.mayRui * 100).toFixed(1)}%)`).join("; ");
    ketLuan = `${tuan.length} tuần: ${an} tuần ăn, ${thua} tuần thua, đánh mọi tuần được ${tien(moc.lai)}. Luật nổi lên: ${ds}. Nhưng đem thử ${soPhepThu} luật thì xác suất có ít nhất một luật lọt ngưỡng chỉ do may rủi đã là ${Math.round(xacSuatLotNgau * 100)}%, nên chưa được tin. Cách kiểm thật: giữ nguyên luật đó, theo dõi 20 tuần tới trên tab này, không đổi luật giữa chừng.`;
  }
  return {
    region, cach, phia, soKy: sap.length, tuNgay: sap[0]?.date ?? null, denNgay: sap[sap.length - 1]?.date ?? null,
    tuan, luat, tuongQuan: tq, chuoi: chuoiDaiNhat(tuan), theoNam: [...theoNamM.values()].sort((a, b) => a.nam - b.nam), soPhepThu, xacSuatLotNgau, ketLuan,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Kho dài: file cào sẵn 3 năm (public/kho-dai/<miền>.json) + kho đang chạy
// ─────────────────────────────────────────────────────────────────────────────

export interface KhoDai {
  nguon: string;
  capNhat: string;
  tu: string;
  den: string;
  /** [ngày, "lo:count lo:count …"] */
  ky: [string, string][];
}

export function docKhoDai(kho: KhoDai): DrawHits[] {
  return kho.ky.map(([date, s]) => {
    const hits: Record<string, number> = {};
    for (const p of s.split(" ")) {
      if (!p) continue;
      const [lo, c] = p.split(":");
      hits[lo] = Number(c) || 0;
    }
    return { date, hits };
  });
}

/** Gộp kho dài với kho đang chạy: trùng ngày thì lấy kho đang chạy. */
export function gopKho(dai: DrawHits[], moi: DrawHits[]): DrawHits[] {
  const m = new Map<string, DrawHits>();
  for (const d of dai) m.set(d.date, d);
  for (const d of moi) m.set(d.date, d);
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}
