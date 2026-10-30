/**
 * Cân sổ — tab thử nghiệm riêng (khách 30/10/2026): "những con số trên đó nếu
 * nhận được thì không nói, nếu không nhận được thì con số còn thiếu sẽ đánh
 * vào bao nhiêu để kiểu gì mình cũng có lời".
 *
 * Mỗi dòng là một số (lô) hay một cặp (đá): hạn mức máy đang đưa ra, tiền đã
 * nhận của khách lẻ, phần còn thiếu. Ba cách xử lý, chấm cùng một kết quả xổ:
 *
 *   1. Không bù        — ôm nguyên sổ đã nhận.
 *   2. Đánh lên đúng   — đánh lên cửa trên đúng con đã nhận, đúng tiền, ở giá
 *      số đã nhận        "đánh". Khách về thì cửa trên trả đúng số mình phải
 *                        trả; kết quả nào cũng còn (giá thu − giá đánh) × tiền
 *                        nhận. Đây là dạng "luôn lời" DUY NHẤT tồn tại.
 *   3. Bù số thiếu     — đánh thêm vào phần thiếu. Phần bù thắng/thua cùng
 *                        chiều với sổ (khách về thì sổ thua, con bù không
 *                        trúng), nên không có mức bù nào chắc lời.
 *
 * File này chỉ tính; không đọc, không ghi gì. Giá nhập tay (mặc định là giá
 * máy đang dùng), vì giá thu của khách lẻ và giá đánh lên có thể khác nhau.
 */
import { GIA_DA, TRUNG_DA, nhomVong } from "./da";
import { STAKE_PRICE, WIN_PER_POINT } from "./exposure";
import { hauToNhan } from "./da-nhan";
import type { Region } from "./types";

export type LoaiSo = "lo" | "da";

export interface DongSo {
  /** Lô "27"; cặp đá "24-95" (nhỏ trước). */
  khoa: string;
  /** Hạn mức máy đang đưa ra (điểm). 0 = chặn. */
  hanMuc: number;
  /** Tiền khách lẻ đã đánh vào (điểm). */
  daNhan: number;
}

/** Giá một điểm, bằng đồng: thu của khách lẻ, đánh lên cửa trên, trả mỗi lần trúng. */
export interface GiaBen {
  thu: number;
  danh: number;
  tra: number;
}

export type KieuBu = { kieu: "thieu" } | { kieu: "codinh"; n: number };

export const giaMacDinh = (loai: LoaiSo, region: Region): GiaBen =>
  loai === "lo"
    ? { thu: STAKE_PRICE[region], danh: STAKE_PRICE[region], tra: WIN_PER_POINT }
    : { thu: GIA_DA[region], danh: GIA_DA[region], tra: TRUNG_DA[region] };

export const thieuCua = (d: DongSo): number => Math.max(0, d.hanMuc - d.daNhan);

/** Điểm bù vào một dòng theo kiểu bù. "Cố định" chỉ áp cho dòng còn thiếu. */
export function diemBu(d: DongSo, bu: KieuBu): number {
  const thieu = thieuCua(d);
  if (thieu <= 0) return 0;
  return bu.kieu === "thieu" ? thieu : Math.max(0, bu.n);
}

/**
 * Số lần trúng của một dòng trong một kỳ. Lô: số nháy. Đá: cả hai con cùng
 * về thì 1, đếm một lần (đúng cách bộ máy đá đang tính), không thì 0.
 */
export function lanTrung(loai: LoaiSo, khoa: string, hits: Record<string, number>): number {
  if (loai === "lo") return Number(hits[khoa]) || 0;
  const [a, b] = khoa.split("-");
  return (Number(hits[a]) || 0) > 0 && (Number(hits[b]) || 0) > 0 ? 1 : 0;
}

export interface KetQuaKyCanSo {
  date: string;
  /** Tổng lần trúng rơi vào các dòng đã nhận (lô: nháy; đá: cặp về). */
  trungNhan: number;
  /** Tổng lần trúng rơi vào các dòng có bù. */
  trungBu: number;
  khongBu: number;
  danhLen: number;
  buThieu: number;
}

/** Chấm một kỳ cho cả ba cách. */
export function chamKy(ds: DongSo[], gia: GiaBen, bu: KieuBu, loai: LoaiSo, ky: { date: string; hits: Record<string, number> }): KetQuaKyCanSo {
  let thu = 0, danhLenChi = 0, traNhan = 0, buChi = 0, buVe = 0, trungNhan = 0, trungBu = 0;
  for (const d of ds) {
    const r = Math.max(0, d.daNhan), x = diemBu(d, bu);
    if (r <= 0 && x <= 0) continue;
    const t = lanTrung(loai, d.khoa, ky.hits);
    thu += r * gia.thu;
    danhLenChi += r * gia.danh;
    traNhan += r * gia.tra * t;
    buChi += x * gia.danh;
    buVe += x * gia.tra * t;
    if (r > 0) trungNhan += t;
    if (x > 0) trungBu += t;
  }
  return {
    date: ky.date,
    trungNhan,
    trungBu,
    khongBu: thu - traNhan,
    // Đánh lên đúng con đã nhận: cửa trên trả về đúng traNhan → triệt tiêu.
    danhLen: thu - danhLenChi,
    buThieu: thu - traNhan - buChi + buVe,
  };
}

export interface TomTatCach {
  soKy: number;
  kyLoi: number;
  kyLo: number;
  kyHoa: number;
  teNhat: number;
  ngayTeNhat: string | null;
  totNhat: number;
  ngayTotNhat: string | null;
  tong: number;
  trungBinh: number;
  /** Mọi kỳ đều > 0. */
  luonLoi: boolean;
  /** Mọi kỳ đều cùng một số — không phụ thuộc kết quả. */
  coDinh: boolean;
}

export type Cach = "khongBu" | "danhLen" | "buThieu";
export const CAC_CACH: Cach[] = ["khongBu", "danhLen", "buThieu"];
export const TEN_CACH: Record<Cach, string> = { khongBu: "Không bù", danhLen: "Đánh lên đúng số nhận", buThieu: "Bù số thiếu" };

export function tomTatCach(ky: KetQuaKyCanSo[], cach: Cach): TomTatCach {
  let kyLoi = 0, kyLo = 0, kyHoa = 0, tong = 0;
  let teNhat = Infinity, totNhat = -Infinity, ngayTeNhat: string | null = null, ngayTotNhat: string | null = null;
  for (const k of ky) {
    const v = k[cach];
    tong += v;
    if (v > 0) kyLoi++; else if (v < 0) kyLo++; else kyHoa++;
    if (v < teNhat) { teNhat = v; ngayTeNhat = k.date; }
    if (v > totNhat) { totNhat = v; ngayTotNhat = k.date; }
  }
  const soKy = ky.length;
  if (soKy === 0) return { soKy, kyLoi, kyLo, kyHoa, teNhat: 0, ngayTeNhat, totNhat: 0, ngayTotNhat, tong, trungBinh: 0, luonLoi: false, coDinh: true };
  return { soKy, kyLoi, kyLo, kyHoa, teNhat, ngayTeNhat, totNhat, ngayTotNhat, tong, trungBinh: tong / soKy, luonLoi: teNhat > 0, coDinh: Math.abs(totNhat - teNhat) < 1e-6 };
}

export interface KetQuaCanSo {
  /** Tổng điểm đã nhận / thiếu / bù, và tiền chắc khi đánh lên. */
  tongNhan: number;
  tongThieu: number;
  tongBu: number;
  /** (giá thu − giá đánh) × tổng nhận — số tiền còn lại mọi kỳ khi đánh lên đúng số nhận. */
  chenhChac: number;
  /** Số dòng có nhận; số dòng còn thiếu; số dòng nhận ngoài hạn mức (chặn mà vẫn nhận). */
  dongNhan: number;
  dongThieu: number;
  dongNgoai: number;
  ky: KetQuaKyCanSo[];
  tomTat: Record<Cach, TomTatCach>;
}

/** Chạy cả ba cách trên các kỳ đã xổ (cũ → mới), cùng một sổ. */
export function chayCanSo(ds: DongSo[], gia: GiaBen, bu: KieuBu, loai: LoaiSo, draws: { date: string; hits: Record<string, number> }[]): KetQuaCanSo {
  let tongNhan = 0, tongThieu = 0, tongBu = 0, dongNhan = 0, dongThieu = 0, dongNgoai = 0;
  for (const d of ds) {
    const r = Math.max(0, d.daNhan), t = thieuCua(d), x = diemBu(d, bu);
    tongNhan += r; tongThieu += t; tongBu += x;
    if (r > 0) dongNhan++;
    if (t > 0) dongThieu++;
    if (r > 0 && d.hanMuc <= 0) dongNgoai++;
  }
  const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));
  const ky = sap.map((k) => chamKy(ds, gia, bu, loai, k));
  return {
    tongNhan, tongThieu, tongBu, chenhChac: tongNhan * (gia.thu - gia.danh), dongNhan, dongThieu, dongNgoai, ky,
    tomTat: { khongBu: tomTatCach(ky, "khongBu"), danhLen: tomTatCach(ky, "danhLen"), buThieu: tomTatCach(ky, "buThieu") },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Đọc số đã nhận
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lô: "23b1, 24b1, 25b10dd5" (đúng khuôn tab Rủi Ro Tiền và chuỗi copy),
 * có hay không có tiền tố "st tv ag …:" / "2d". Phần "dd" (đề) không tính.
 * Lặp thì cộng dồn — hai khách cùng một con.
 */
export function docLoNhan(text: string): { diem: Record<string, number>; soMuc: number; la: string[] } {
  const body = text.includes(":") ? text.slice(text.indexOf(":") + 1) : text;
  const diem: Record<string, number> = {};
  const la: string[] = [];
  let soMuc = 0;
  for (const raw of body.split(/[\s,;]+/)) {
    const tok = raw.trim();
    if (!tok) continue;
    const m = /^(?:2d|mb|mn|mt)?(\d{1,2})b(\d+)n?(?:dd\d+n?)?$/i.exec(tok);
    if (!m) { la.push(tok); continue; }
    const lo = m[1].padStart(2, "0");
    diem[lo] = (diem[lo] ?? 0) + Number(m[2]);
    soMuc++;
  }
  return { diem, soMuc, la };
}

/**
 * Đá: "24 95dx10n 37 82dx6n", "Mb 24 95da10n", vòng "01 10 11dx5n" (mọi cặp
 * trong vòng, mỗi cặp một lần). Tiền tố "Mn 2d" / "mb " bỏ qua. Lặp cộng dồn.
 */
export function docDaNhan(text: string): { diem: Record<string, number>; soCap: number; la: string[] } {
  const diem: Record<string, number> = {};
  const la: string[] = [];
  let soCap = 0;
  // Tiền tố đài: "Mn", "mb " đứng riêng; "2d" thường dính liền con đầu ("2d24 95dx10n").
  const sach = text.replace(/\b(mn|mt|mb)\b/gi, " ").replace(/\b2d(?=\s|\d|$)/gi, " ");
  const re = /(\d{2}(?:[\s,]+\d{2})+)\s*(?:dx|da)\s*(\d+)\s*n?/gi;
  let cuoi = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sach))) {
    const giua = sach.slice(cuoi, m.index).trim();
    if (giua) la.push(giua);
    cuoi = m.index + m[0].length;
    const con = [...new Set(m[1].split(/[\s,]+/).filter(Boolean))].sort();
    const n = Number(m[2]);
    for (let x = 0; x < con.length; x++) for (let y = x + 1; y < con.length; y++) {
      const k = `${con[x]}-${con[y]}`;
      diem[k] = (diem[k] ?? 0) + n;
      soCap++;
    }
  }
  const duoi = sach.slice(cuoi).trim();
  if (duoi) la.push(duoi);
  return { diem, soCap, la };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chuỗi đánh lên đúng số nhận
// ─────────────────────────────────────────────────────────────────────────────

/** Lô: "2d23b1, 24b1, 25b10" — đúng khuôn bot gửi lô (chuoiLoGui). Không nhận gì thì rỗng. */
export function chuoiDanhLenLo(ds: DongSo[], tienTo: string): string {
  const co = ds.filter((d) => d.daNhan > 0).sort((a, b) => a.khoa.localeCompare(b.khoa)).map((d) => `${d.khoa}b${d.daNhan}`);
  return co.length ? `${tienTo}${co.join(", ")}` : "";
}

/**
 * Đá: "2d01 10 11dx5n 24 95dx10n" — cặp cùng điểm gom vòng không lặp (mỗi cặp
 * đúng một lần, như chuỗi số nhận), theo từng mức điểm. Không nhận gì thì rỗng.
 */
export function chuoiDanhLenDa(ds: DongSo[], region: Region, tienTo: string): string {
  const theoMuc = new Map<number, [string, string][]>();
  for (const d of ds) {
    if (d.daNhan <= 0) continue;
    const [a, b] = d.khoa.split("-");
    let arr = theoMuc.get(d.daNhan);
    if (!arr) theoMuc.set(d.daNhan, (arr = []));
    arr.push([a, b]);
  }
  const mau: string[] = [];
  for (const diem of [...theoMuc.keys()].sort((x, y) => x - y)) {
    for (const vong of nhomVong(theoMuc.get(diem)!, true)) mau.push(`${vong.join(" ")}${hauToNhan(region, diem)}`);
  }
  return mau.length ? `${tienTo}${mau.join(" ")}` : "";
}
