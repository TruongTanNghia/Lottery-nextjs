/**
 * Tab "🔮 Dự Báo" — khách 10/11/2026: "có quy luật của nó chưa, chơi như nào
 * là win, số dự báo và số ra, đánh như nào — cho hết trong tab đó".
 *
 * Việc của file này: lấy lại 9 mô hình của bộ dự đoán cũ (về nhiều, về gần,
 * gan, chuyển tiếp hôm qua → hôm nay, nóng lên, đi cặp, về liên tiếp, đảo,
 * theo thứ) + 1 tổng hợp, cho mỗi mô hình chọn N con cho TỪNG kỳ trong kho 3
 * năm chỉ bằng dữ liệu TRƯỚC kỳ đó (60 kỳ nhìn lại, như bộ cũ), rồi chấm tiền
 * thật: mỗi con 1 điểm giá miền (27.000 / 20.250), trúng 75.000 một nháy.
 * Mỗi mô hình đem so với may rủi: bốc ngẫu nhiên N con cho cùng các kỳ đó
 * 1.000 lần, xem bao nhiêu lần ngẫu nhiên cũng ăn bằng hoặc hơn.
 *
 * Bộ cũ tính tiền 23.000 / ×80 nên bảng điểm cũ sai; file này không sửa bộ cũ
 * (các tab ấy đang ẩn), chỉ chấm lại cho đúng ở tab mới. Thuần, chỉ đọc.
 */
import type { DrawHits } from "./backtest";
import { POSITIONS, STAKE_PRICE, WIN_PER_POINT } from "./exposure";
import type { Region } from "./types";

/** Số kỳ nhìn lại cho mỗi mô hình (bộ dự đoán cũ cũng 60). */
export const CUA_SO = 60;
/** Số con chọn mỗi kỳ cho anh chọn thử; giữ sẵn 20 hạng đầu nên đổi N không phải tính lại. */
export const CAC_SO_CON = [5, 10, 20] as const;
export const SO_CON_MAC_DINH = 10;
export const SO_MO_PHONG = 1000;
export const NGUONG_MAY_RUI = 0.05;

export type MoHinh = "tongHop" | "frequency" | "recency" | "poisson" | "markov" | "temperature" | "pair" | "streak" | "mirror" | "dayOfWeek";

export const CAC_MO_HINH: { khoa: MoHinh; ten: string; moTa: string }[] = [
  { khoa: "tongHop", ten: "Tổng hợp 9 mô hình", moTa: "cộng điểm 9 mô hình dưới theo trọng số của bộ dự đoán cũ" },
  { khoa: "frequency", ten: "Về nhiều", moTa: "con nào về nhiều nhất trong 60 kỳ qua thì đánh" },
  { khoa: "recency", ten: "Về gần đây", moTa: "như 'về nhiều' nhưng ngày gần nặng điểm hơn (nửa đời 7 ngày)" },
  { khoa: "poisson", ten: "Gan lâu chưa về", moTa: "con lâu chưa về 'đến lúc' phải về" },
  { khoa: "markov", ten: "Hôm qua về X, hôm nay về Y", moTa: "cầu chuyển tiếp 1 ngày học từ 60 kỳ" },
  { khoa: "temperature", ten: "Đang nóng lên", moTa: "7 kỳ gần về nhiều hơn mức thường của chính nó" },
  { khoa: "pair", ten: "Đi cặp", moTa: "con hay về cùng ngày với các con vừa về hôm qua" },
  { khoa: "streak", ten: "Về liên tiếp", moTa: "con về mấy ngày liền thì đánh tiếp" },
  { khoa: "mirror", ten: "Đảo (kép lộn)", moTa: "12 về nhiều thì đánh 21" },
  { khoa: "dayOfWeek", ten: "Theo thứ", moTa: "con hay về đúng thứ này trong tuần" },
];

/** Trọng số tổng hợp (bộ dự đoán cũ, bỏ 'đài theo thứ' vì kho dài không có tên đài). */
const TRONG_SO: Record<Region, Record<Exclude<MoHinh, "tongHop">, number>> = {
  xsmn: { frequency: 0.17, recency: 0.22, poisson: 0.13, markov: 0.10, temperature: 0.10, pair: 0.09, streak: 0.09, mirror: 0.05, dayOfWeek: 0.05 },
  xsmb: { frequency: 0.22, recency: 0.20, poisson: 0.13, markov: 0.14, temperature: 0.10, pair: 0.08, streak: 0.10, mirror: 0.03, dayOfWeek: 0.00 },
  xsmt: { frequency: 0.12, recency: 0.10, poisson: 0.08, markov: 0.05, temperature: 0.07, pair: 0.08, streak: 0.05, mirror: 0.05, dayOfWeek: 0.10 },
};
const NUA_DOI: Record<Region, number> = { xsmn: 7, xsmb: 10, xsmt: 5 };

export const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
type Diem = Record<string, number>;
const rong = (): Diem => { const o: Diem = {}; for (const lo of LOS) o[lo] = 0; return o; };
const utc = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const _chiSo = new WeakMap<DrawHits, number[]>();
/** Chỉ số (0..99) các con về trong kỳ, nhớ sẵn vì mỗi kỳ được 9 mô hình × 60 cửa sổ hỏi lại. */
const chiSoCon = (d: DrawHits): number[] => {
  let a = _chiSo.get(d);
  if (!a) { a = []; for (const lo in d.hits) if (Number(d.hits[lo]) > 0) a.push(Number(lo)); _chiSo.set(d, a); }
  return a;
};
const cacCon = (d: DrawHits) => chiSoCon(d).map((i) => LOS[i]);

// ─────────────────────────────────────────────────────────────────────────────
// 9 mô hình: nhận cửa sổ kỳ đã xổ (đã sắp theo ngày), trả điểm 0..1 cho 100 con
// ─────────────────────────────────────────────────────────────────────────────

export function mhVeNhieu(cs: DrawHits[]): Diem {
  const o = rong();
  for (const d of cs) for (const lo of cacCon(d)) o[lo] += 1;
  const n = Math.max(1, cs.length);
  for (const lo of LOS) o[lo] /= n;
  return o;
}

export function mhVeGan(cs: DrawHits[], nuaDoi = 7): Diem {
  const o = rong();
  if (!cs.length) return o;
  const cuoi = utc(cs[cs.length - 1].date), k = Math.log(2) / nuaDoi;
  let tongW = 0;
  for (const d of cs) {
    const w = Math.exp(-k * ((cuoi - utc(d.date)) / 86_400_000));
    tongW += w;
    for (const lo of cacCon(d)) o[lo] += w;
  }
  for (const lo of LOS) o[lo] /= tongW;
  return o;
}

export function mhGan(cs: DrawHits[]): Diem {
  const o = rong();
  if (!cs.length) return o;
  const tanSuat = mhVeNhieu(cs), cuoi = utc(cs[cs.length - 1].date);
  const lanCuoi = new Float64Array(100).fill(NaN);
  for (const d of cs) { const ms = utc(d.date); for (const i of chiSoCon(d)) lanCuoi[i] = ms; }
  for (let i = 0; i < 100; i++) {
    const r = tanSuat[LOS[i]];
    if (r <= 0) continue;
    const gap = Number.isNaN(lanCuoi[i]) ? cs.length : (cuoi - lanCuoi[i]) / 86_400_000 + 1;
    o[LOS[i]] = 1 - Math.exp(-r * gap);
  }
  return o;
}

export function mhChuyenTiep(cs: DrawHits[]): Diem {
  const o = rong();
  if (cs.length < 2) return o;
  const chuyen = new Float64Array(10_000), tuTong = new Float64Array(100);
  for (let i = 0; i < cs.length - 1; i++) {
    const mai = chiSoCon(cs[i + 1]);
    for (const f of chiSoCon(cs[i])) {
      tuTong[f] += 1;
      for (const t of mai) chuyen[f * 100 + t] += 1;
    }
  }
  const homQua = chiSoCon(cs[cs.length - 1]);
  if (!homQua.length) return o;
  const tong = new Float64Array(100);
  for (const f of homQua) {
    const m = tuTong[f];
    if (!m) continue;
    for (let t = 0; t < 100; t++) tong[t] += chuyen[f * 100 + t] / m;
  }
  for (let t = 0; t < 100; t++) o[LOS[t]] = tong[t] / homQua.length;
  return o;
}

export function mhNongLen(cs: DrawHits[], soKyGan = 7): Diem {
  const o: Diem = {};
  if (!cs.length) { for (const lo of LOS) o[lo] = 0.5; return o; }
  const gan = mhVeNhieu(cs.slice(-soKyGan)), goc = mhVeNhieu(cs);
  const v = Object.values(goc), tb = v.reduce((a, b) => a + b, 0) / v.length;
  const ps = v.reduce((s, x) => s + (x - tb) ** 2, 0) / Math.max(1, v.length - 1);
  const sd = ps > 0 ? Math.sqrt(ps) : 1e-9;
  for (const lo of LOS) o[lo] = 1 / (1 + Math.exp(-((gan[lo] - goc[lo]) / sd)));
  return o;
}

export function mhDiCap(cs: DrawHits[]): Diem {
  const o = rong();
  if (!cs.length) return o;
  const cung = new Float64Array(10_000), xuatHien = new Float64Array(100);
  for (const d of cs) {
    const con = chiSoCon(d);
    for (const a of con) {
      xuatHien[a] += 1;
      for (const b of con) if (a !== b) cung[a * 100 + b] += 1;
    }
  }
  const homQua = chiSoCon(cs[cs.length - 1]);
  if (!homQua.length) return o;
  const tong = new Float64Array(100);
  for (const a of homQua) {
    const m = xuatHien[a];
    if (!m) continue;
    for (let b = 0; b < 100; b++) tong[b] += cung[a * 100 + b] / m;
  }
  for (let b = 0; b < 100; b++) o[LOS[b]] = tong[b] / homQua.length;
  return o;
}

export function mhLienTiep(cs: DrawHits[]): Diem {
  const o = rong();
  for (const lo of LOS) {
    let s = 0;
    for (let i = cs.length - 1; i >= 0 && Number(cs[i].hits[lo]) > 0; i--) s++;
    o[lo] = s === 0 ? 0 : s === 1 ? 0.3 : s === 2 ? 0.55 : s === 3 ? 0.75 : 0.9;
  }
  return o;
}

export const dao = (lo: string) => lo[1] + lo[0];
export function mhDao(cs: DrawHits[]): Diem {
  const o = rong();
  if (!cs.length) return o;
  const goc = mhVeNhieu(cs);
  for (const lo of LOS) o[lo] = goc[dao(lo)];
  return o;
}

/** Theo thứ của NGÀY ĐANG DỰ BÁO (bộ cũ lấy ngày cuối + 1; ở đây truyền thẳng ngày mục tiêu). */
export function mhTheoThu(cs: DrawHits[], ngayMucTieu: string): Diem {
  const o = rong();
  const thu = new Date(utc(ngayMucTieu)).getUTCDay();
  let n = 0;
  for (const d of cs) {
    if (new Date(utc(d.date)).getUTCDay() !== thu) continue;
    n++;
    for (const lo of cacCon(d)) o[lo] += 1;
  }
  if (n) for (const lo of LOS) o[lo] /= n;
  return o;
}

function chuanHoa(diem: Diem): Diem {
  const v = Object.values(diem), lo = Math.min(...v), hi = Math.max(...v), o: Diem = {};
  for (const k of LOS) o[k] = hi - lo < 1e-12 ? 0.5 : (diem[k] - lo) / (hi - lo);
  return o;
}

/** Xếp 100 con theo điểm giảm dần, bằng điểm thì con nhỏ đứng trước (ổn định, kiểm được bằng tay). */
export function xepHang(diem: Diem): string[] {
  return [...LOS].sort((a, b) => diem[b] - diem[a] || a.localeCompare(b));
}

/** Điểm của cả 10 mô hình cho một kỳ, chỉ từ cửa sổ TRƯỚC kỳ đó. */
export function diemMoHinh(cuaSo: DrawHits[], ngayMucTieu: string, region: Region): Record<MoHinh, Diem> {
  const rieng: Record<Exclude<MoHinh, "tongHop">, Diem> = {
    frequency: mhVeNhieu(cuaSo), recency: mhVeGan(cuaSo, NUA_DOI[region]), poisson: mhGan(cuaSo), markov: mhChuyenTiep(cuaSo),
    temperature: mhNongLen(cuaSo), pair: mhDiCap(cuaSo), streak: mhLienTiep(cuaSo), mirror: mhDao(cuaSo), dayOfWeek: mhTheoThu(cuaSo, ngayMucTieu),
  };
  const tongHop = rong(), w = TRONG_SO[region];
  for (const k of Object.keys(rieng) as (keyof typeof rieng)[]) {
    if (!w[k]) continue;
    const c = chuanHoa(rieng[k]);
    for (const lo of LOS) tongHop[lo] += w[k] * c[lo];
  }
  return { tongHop, ...rieng };
}

export const SO_HANG_GIU = 20;
export type ChonKy = Record<MoHinh, string[]>;
/** Mỗi mô hình chọn 20 hạng đầu cho một kỳ. */
export function chonKy(cuaSo: DrawHits[], ngayMucTieu: string, region: Region): ChonKy {
  const diem = diemMoHinh(cuaSo, ngayMucTieu, region);
  const o = {} as ChonKy;
  for (const m of CAC_MO_HINH) o[m.khoa] = xepHang(diem[m.khoa]).slice(0, SO_HANG_GIU);
  return o;
}

export interface KyDuBao { date: string; chon: ChonKy }

/**
 * Chạy hết kho: kỳ thứ i (i ≥ CUA_SO) được dự báo bằng CUA_SO kỳ ngay trước nó.
 * `tuKy` để trang web chạy từng khúc (không treo màn hình).
 */
export function chayDuBao(draws: DrawHits[], region: Region, tuKy = CUA_SO, denKy = draws.length): KyDuBao[] {
  const sap = sapXep(draws), out: KyDuBao[] = [];
  for (let i = Math.max(CUA_SO, tuKy); i < Math.min(denKy, sap.length); i++) out.push({ date: sap[i].date, chon: chonKy(sap.slice(i - CUA_SO, i), sap[i].date, region) });
  return out;
}

export const sapXep = (draws: DrawHits[]) => [...draws].sort((a, b) => a.date.localeCompare(b.date));

/** Dự báo cho kỳ tới = ngày sau kỳ cuối trong kho. */
export function duBaoKyToi(draws: DrawHits[], region: Region): KyDuBao | null {
  const sap = sapXep(draws);
  if (sap.length < CUA_SO) return null;
  const ngay = ymd(utc(sap[sap.length - 1].date) + 86_400_000);
  return { date: ngay, chon: chonKy(sap.slice(-CUA_SO), ngay, region) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chấm tiền thật
// ─────────────────────────────────────────────────────────────────────────────

/** Mỗi con 1 điểm: xác = N × giá miền; trúng = tổng nháy × 75.000. Kỳ vọng lãi mỗi điểm = 36 × 75.000 / 100 − 27.000 = 0. */
export const laiKyVongMoiDiem = (region: Region) => (POSITIONS[region] / 100) * WIN_PER_POINT - STAKE_PRICE[region];
/** Đánh N con 1 điểm, cần ít nhất bao nhiêu nháy mới lời. */
export const nhayCanDeLoi = (n: number, region: Region) => Math.floor((n * STAKE_PRICE[region]) / WIN_PER_POINT) + 1;
/** Số nháy trung bình may rủi đem lại cho N con. */
export const nhayKyVong = (n: number, region: Region) => (n * POSITIONS[region]) / 100;

export interface KetQuaKy {
  date: string;
  chon: string[];
  /** Con trúng trong N con chọn, kèm số nháy. */
  trung: { lo: string; nhay: number }[];
  soNhay: number;
  xac: number;
  tra: number;
  lai: number;
}

export function chamKy(chon: string[], ky: DrawHits, region: Region): KetQuaKy {
  const trung = chon.filter((lo) => Number(ky.hits[lo]) > 0).map((lo) => ({ lo, nhay: Number(ky.hits[lo]) }));
  const soNhay = trung.reduce((s, t) => s + t.nhay, 0);
  const xac = chon.length * STAKE_PRICE[region], tra = soNhay * WIN_PER_POINT;
  return { date: ky.date, chon, trung, soNhay, xac, tra, lai: tra - xac };
}

export interface TongKetMoHinh {
  moHinh: MoHinh;
  ten: string;
  moTa: string;
  soKy: number;
  kyAn: number;
  kyThua: number;
  kyHoa: number;
  tongXac: number;
  tongTra: number;
  lai: number;
  /** Lãi chia tiền xác. */
  tiLe: number;
  laiTBKy: number;
  nhayTB: number;
  nhayKyVong: number;
  chuoiAn: number;
  chuoiThua: number;
  /** Sụt sâu nhất từ đỉnh (số âm hoặc 0). */
  thuaSauNhat: number;
  /** Trong SO_MO_PHONG lần bốc ngẫu nhiên N con, phần lãi ≥ mô hình. */
  mayRui: number;
  /** Lãi > 0 và may rủi hiếm khi đuổi kịp. */
  vuot: boolean;
  ky: KetQuaKy[];
}

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
 * Phân phối lãi khi bốc ngẫu nhiên N con cho đúng các kỳ này, `soLan` lần.
 * Trả mảng tổng lãi đã sắp tăng dần. Chỉ phụ thuộc N nên tính một lần dùng cho mọi mô hình.
 */
export function phanPhoiMayRui(cacKy: DrawHits[], n: number, region: Region, soLan = SO_MO_PHONG, seed = 20261110): number[] {
  const rnd = mulberry32(seed), out: number[] = [];
  const nhayTheoKy = cacKy.map((k) => Int32Array.from(LOS, (lo) => Number(k.hits[lo]) || 0));
  const xac = cacKy.length * n * STAKE_PRICE[region];
  // Một mảng chỉ số dùng lại: đảo một phần (Fisher–Yates) từ hoán vị bất kỳ vẫn cho n con đều ngẫu nhiên.
  const idx = Int32Array.from({ length: 100 }, (_, i) => i);
  for (let l = 0; l < soLan; l++) {
    let nhay = 0;
    for (const bang of nhayTheoKy) {
      for (let i = 0; i < n; i++) {
        const j = i + Math.floor(rnd() * (100 - i));
        [idx[i], idx[j]] = [idx[j], idx[i]];
        nhay += bang[idx[i]];
      }
    }
    out.push(nhay * WIN_PER_POINT - xac);
  }
  return out.sort((a, b) => a - b);
}

/** Phần lãi ngẫu nhiên ≥ lãi thật, cộng 1 tử và mẫu để không ra đúng 0. */
export function xacSuatMayRui(phanPhoi: number[], laiThat: number): number {
  let dem = 0;
  for (let i = phanPhoi.length - 1; i >= 0 && phanPhoi[i] >= laiThat - 1e-6; i--) dem++;
  return (dem + 1) / (phanPhoi.length + 1);
}

export function tongKetMoHinh(kyDuBao: KyDuBao[], theoNgay: Map<string, DrawHits>, moHinh: MoHinh, n: number, region: Region, phanPhoi: number[]): TongKetMoHinh {
  const ky: KetQuaKy[] = [];
  for (const k of kyDuBao) {
    const d = theoNgay.get(k.date);
    if (d) ky.push(chamKy(k.chon[moHinh].slice(0, n), d, region));
  }
  let tongXac = 0, tongTra = 0, kyAn = 0, kyThua = 0, kyHoa = 0, soNhay = 0;
  let chuoiAn = 0, chuoiThua = 0, dangAn = 0, dangThua = 0, dinh = 0, congDon = 0, thuaSauNhat = 0;
  for (const k of ky) {
    tongXac += k.xac; tongTra += k.tra; soNhay += k.soNhay;
    if (k.lai > 0) { kyAn++; dangAn++; dangThua = 0; } else if (k.lai < 0) { kyThua++; dangThua++; dangAn = 0; } else { kyHoa++; dangAn = 0; dangThua = 0; }
    chuoiAn = Math.max(chuoiAn, dangAn); chuoiThua = Math.max(chuoiThua, dangThua);
    congDon += k.lai; dinh = Math.max(dinh, congDon); thuaSauNhat = Math.min(thuaSauNhat, congDon - dinh);
  }
  const lai = tongTra - tongXac, meta = CAC_MO_HINH.find((m) => m.khoa === moHinh)!;
  const mayRui = ky.length ? xacSuatMayRui(phanPhoi, lai) : 1;
  return {
    moHinh, ten: meta.ten, moTa: meta.moTa, soKy: ky.length, kyAn, kyThua, kyHoa, tongXac, tongTra, lai,
    tiLe: tongXac ? lai / tongXac : 0, laiTBKy: ky.length ? lai / ky.length : 0, nhayTB: ky.length ? soNhay / ky.length : 0, nhayKyVong: nhayKyVong(n, region),
    chuoiAn, chuoiThua, thuaSauNhat, mayRui, vuot: lai > 0 && mayRui < NGUONG_MAY_RUI, ky,
  };
}

export interface PhanTichDuBao {
  region: Region;
  n: number;
  soKy: number;
  tuNgay: string | null;
  denNgay: string | null;
  moHinh: TongKetMoHinh[];
  /** Mô hình lãi cao nhất. */
  tot: TongKetMoHinh | null;
  /** Phân phối may rủi (đã sắp): trung bình, 5% thấp, 95% cao. */
  mayRui: { tb: number; thap: number; cao: number };
  soPhepThu: number;
  xacSuatLotNgau: number;
  ketLuan: string;
  /** Ăn thua theo thứ của từng mô hình + chiến lược "ngày nào chơi mô hình nào". */
  theoThu: PhanTichTheoThu;
}

const soVN = (x: number, lePhan = 0) => x.toLocaleString("vi-VN", { minimumFractionDigits: lePhan, maximumFractionDigits: lePhan });
const tien = (x: number) => {
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};

export function phanTichDuBao(kyDuBao: KyDuBao[], draws: DrawHits[], n: number, region: Region, seed = 20261110, ngayKyToi: string | null = null): PhanTichDuBao {
  const theoNgay = new Map(draws.map((d) => [d.date, d]));
  const cacKy = kyDuBao.map((k) => theoNgay.get(k.date)).filter((d): d is DrawHits => !!d);
  const phanPhoi = phanPhoiMayRui(cacKy, n, region, SO_MO_PHONG, seed);
  const moHinh = CAC_MO_HINH.map((m) => tongKetMoHinh(kyDuBao, theoNgay, m.khoa, n, region, phanPhoi));
  const tot = moHinh.length ? moHinh.reduce((a, b) => (b.lai > a.lai ? b : a)) : null;
  const tb = phanPhoi.length ? phanPhoi.reduce((a, b) => a + b, 0) / phanPhoi.length : 0;
  const mayRui = { tb, thap: phanPhoi[Math.floor(phanPhoi.length * 0.05)] ?? 0, cao: phanPhoi[Math.min(phanPhoi.length - 1, Math.floor(phanPhoi.length * 0.95))] ?? 0 };
  const soPhepThu = CAC_MO_HINH.length * CAC_SO_CON.length, xacSuatLotNgau = 1 - Math.pow(1 - NGUONG_MAY_RUI, soPhepThu);
  const vuot = moHinh.filter((m) => m.vuot);
  const gia = STAKE_PRICE[region].toLocaleString("vi-VN"), can = nhayCanDeLoi(n, region), kv = nhayKyVong(n, region);
  let ketLuan: string;
  if (cacKy.length < 30) ketLuan = `Mới chấm được ${cacKy.length} kỳ, chưa đủ để nói gì.`;
  else {
    const dau = `Đánh ${n} con, mỗi con 1 điểm giá ${gia}: cần từ ${can} nháy một kỳ mới lời, may rủi cho trung bình ${soVN(kv, 1)} nháy, tức kỳ vọng đúng 0 dù chọn con nào. Chấm ${soVN(cacKy.length)} kỳ: ` +
      `mô hình tốt nhất "${tot?.ten}" được ${tien(tot?.lai ?? 0)} (${soVN((tot?.tiLe ?? 0) * 100, 1)}% tiền xác), may rủi đuổi kịp ${soVN((tot?.mayRui ?? 1) * 100, 1)}%; bốc ngẫu nhiên ${n} con cho cùng các kỳ này ra từ ${tien(mayRui.thap)} đến ${tien(mayRui.cao)} (90% số lần).`;
    if (!vuot.length) ketLuan = dau + ` Không mô hình nào trong ${CAC_MO_HINH.length} mô hình vượt may rủi: không có quy luật để "đánh là win"; số dự báo bên dưới chỉ để tham khảo, không phải cửa ăn.`;
    else ketLuan = dau + ` Mô hình nổi lên: ${vuot.map((m) => `"${m.ten}" (${tien(m.lai)}, may rủi ${soVN(m.mayRui * 100, 1)}%)`).join("; ")}. Nhưng thử ${CAC_MO_HINH.length} mô hình × ${CAC_SO_CON.length} mức số con = ${soPhepThu} phép thử thì xác suất ít nhất một cái lọt ngưỡng chỉ do may rủi đã là ${Math.round(xacSuatLotNgau * 100)}%, nên chưa được tin; giữ nguyên mô hình đó, theo dõi thêm 60 kỳ ngay trên tab này rồi mới kết luận.`;
  }
  const theoThu = phanTichTheoThu(moHinh, region, phanPhoi, ngayKyToi);
  return { region, n, soKy: cacKy.length, tuNgay: cacKy[0]?.date ?? null, denNgay: cacKy[cacKy.length - 1]?.date ?? null, moHinh, tot, mayRui, soPhepThu, xacSuatLotNgau, ketLuan, theoThu };
}

/** Chuỗi gửi đi cho N con: "2d23b1, 24b1, …" theo kiểu các tab khác (tiền tố tuỳ chọn). */
export function chuoiDanh(chon: string[], tienTo = ""): string {
  return chon.map((lo, i) => `${i === 0 ? tienTo : ""}${lo}b1`).join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Theo thứ — khách 14/11/2026: "9 mô hình này phân tích kĩ từng mô hình nó thua
// nhiều vào thứ mấy, ăn nhiều vào thứ mấy; ngày nào chơi mô hình nào tối ưu lợi
// nhuận, không theo đuổi một mô hình cố định".
//
// Hai cách chấm, phải tách bạch:
//  - "Nhìn lại": biết hết 3 năm rồi mới chọn mô hình tốt nhất cho từng thứ → luôn
//    đẹp vì chọn sau khi biết kết quả; chỉ là mốc trên, không đánh được.
//  - "Đi tới" (thật): đến kỳ nào chỉ dùng các kỳ TRƯỚC đó, chọn mô hình đang ăn
//    nhất ở thứ đó rồi đánh kỳ ấy. Đây mới là cách khách sẽ chơi, đem so may rủi.
// ─────────────────────────────────────────────────────────────────────────────

export const TEN_THU = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const thuCuaNgay = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
/** Số kỳ tối thiểu ở một thứ trước khi "đi tới" dám chọn theo thứ; chưa đủ thì dùng tổng hợp. */
export const KY_TOI_THIEU_THU = 10;

export interface OThu { thu: number; soKy: number; kyAn: number; kyThua: number; lai: number }
export interface MoHinhTheoThu { moHinh: MoHinh; ten: string; thu: OThu[]; thuTot: number; thuXau: number }
export interface KyTheoThu extends KetQuaKy { moHinh: MoHinh; thu: number }

export interface ChienLuocTheoThu {
  ky: KyTheoThu[];
  soKy: number;
  kyAn: number;
  kyThua: number;
  tongXac: number;
  lai: number;
  tiLe: number;
  mayRui: number;
  vuot: boolean;
  /** Mô hình "đi tới" dùng bao nhiêu kỳ mỗi loại. */
  soLanDung: { moHinh: MoHinh; ten: string; soKy: number }[];
}

export interface PhanTichTheoThu {
  bang: MoHinhTheoThu[];
  /** Mốc trên: biết trước, chọn mô hình tốt nhất từng thứ. */
  nhinLai: { thu: number; moHinh: MoHinh; ten: string; lai: number }[];
  laiNhinLai: number;
  diToi: ChienLuocTheoThu;
  /** Kỳ tới rơi vào thứ nào, "đi tới" sẽ chọn mô hình nào. */
  kyToi: { date: string; thu: number; moHinh: MoHinh; ten: string } | null;
  ketLuan: string;
}

export function phanTichTheoThu(moHinh: TongKetMoHinh[], region: Region, phanPhoi: number[], ngayKyToi: string | null): PhanTichTheoThu {
  const ten = (k: MoHinh) => CAC_MO_HINH.find((m) => m.khoa === k)!.ten;
  const bang: MoHinhTheoThu[] = moHinh.map((m) => {
    const thu: OThu[] = Array.from({ length: 7 }, (_, t) => ({ thu: t, soKy: 0, kyAn: 0, kyThua: 0, lai: 0 }));
    for (const k of m.ky) { const o = thu[thuCuaNgay(k.date)]; o.soKy++; o.lai += k.lai; if (k.lai > 0) o.kyAn++; else if (k.lai < 0) o.kyThua++; }
    const co = thu.filter((o) => o.soKy > 0);
    const thuTot = co.length ? co.reduce((a, b) => (b.lai > a.lai ? b : a)).thu : -1, thuXau = co.length ? co.reduce((a, b) => (b.lai < a.lai ? b : a)).thu : -1;
    return { moHinh: m.moHinh, ten: m.ten, thu, thuTot, thuXau };
  });
  // Nhìn lại
  const nhinLai = Array.from({ length: 7 }, (_, t) => {
    const tot = bang.reduce((a, b) => (b.thu[t].lai > a.thu[t].lai ? b : a));
    return { thu: t, moHinh: tot.moHinh, ten: tot.ten, lai: tot.thu[t].lai };
  }).filter((x) => bang.some((b) => b.thu[x.thu].soKy > 0));
  const laiNhinLai = nhinLai.reduce((s, x) => s + x.lai, 0);
  // Đi tới: các mô hình có cùng danh sách kỳ (cùng kyDuBao), đi theo chỉ số
  const soKy = moHinh[0]?.ky.length ?? 0;
  const cong = moHinh.map(() => new Array<number>(7).fill(0)), dem = new Array<number>(7).fill(0);
  const iTongHop = Math.max(0, moHinh.findIndex((m) => m.moHinh === "tongHop"));
  const chonChoThu = (t: number): number => {
    if (dem[t] < KY_TOI_THIEU_THU) return iTongHop;
    let best = 0;
    for (let i = 1; i < moHinh.length; i++) if (cong[i][t] > cong[best][t]) best = i;
    return best;
  };
  const ky: KyTheoThu[] = [];
  const dung = moHinh.map(() => 0);
  for (let j = 0; j < soKy; j++) {
    const date = moHinh[0].ky[j].date, t = thuCuaNgay(date);
    const i = chonChoThu(t);
    ky.push({ ...moHinh[i].ky[j], moHinh: moHinh[i].moHinh, thu: t });
    dung[i]++;
    for (let m = 0; m < moHinh.length; m++) cong[m][t] += moHinh[m].ky[j].lai;
    dem[t]++;
  }
  const tongXac = ky.reduce((s, k) => s + k.xac, 0), lai = ky.reduce((s, k) => s + k.lai, 0);
  const mayRui = ky.length ? xacSuatMayRui(phanPhoi, lai) : 1;
  const diToi: ChienLuocTheoThu = {
    ky, soKy: ky.length, kyAn: ky.filter((k) => k.lai > 0).length, kyThua: ky.filter((k) => k.lai < 0).length, tongXac, lai, tiLe: tongXac ? lai / tongXac : 0, mayRui,
    vuot: lai > 0 && mayRui < NGUONG_MAY_RUI,
    soLanDung: moHinh.map((m, i) => ({ moHinh: m.moHinh, ten: m.ten, soKy: dung[i] })).filter((x) => x.soKy > 0).sort((a, b) => b.soKy - a.soKy),
  };
  let kyToi: PhanTichTheoThu["kyToi"] = null;
  if (ngayKyToi && moHinh.length) { const t = thuCuaNgay(ngayKyToi), i = chonChoThu(t); kyToi = { date: ngayKyToi, thu: t, moHinh: moHinh[i].moHinh, ten: moHinh[i].ten }; }
  let ketLuan: string;
  if (soKy < 70) ketLuan = `Mới ${soKy} kỳ, chưa đủ mỗi thứ 10 kỳ để nói gì.`;
  else {
    const dau = `Nhìn lại 3 năm rồi chọn mô hình tốt nhất cho từng thứ thì được ${tien(laiNhinLai)}, nhưng đó là chọn sau khi đã biết kết quả, không đánh được. ` +
      `Chơi thật kiểu "đến kỳ nào chọn mô hình đang ăn nhất ở thứ đó" trên ${soVN(soKy)} kỳ: ${tien(lai)} (${soVN(diToi.tiLe * 100, 1)}% tiền xác), ${diToi.kyAn} kỳ ăn / ${diToi.kyThua} kỳ thua, may rủi đuổi kịp ${soVN(mayRui * 100, 1)}%.`;
    ketLuan = diToi.vuot
      ? dau + ` Cách này đang nổi lên, nhưng nó là một phép thử nữa chồng lên ${CAC_MO_HINH.length} mô hình, nên cũng chỉ tin vừa phải; theo dõi thêm 60 kỳ.`
      : dau + ` Nghĩa là "ngày nào chơi mô hình nào" cũng không hơn bốc đại: mô hình ăn ở thứ này trong quá khứ không ăn tiếp ở thứ đó về sau. Ô xanh đỏ trong bảng là nhiễu của từng thứ, không phải quy luật.`;
  }
  return { bang, nhinLai, laiNhinLai, diToi, kyToi, ketLuan };
}
