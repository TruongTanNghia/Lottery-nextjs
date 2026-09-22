/**
 * Số đá (đá xiên) — giá, cách tính vòng, và thống kê theo cặp ngày.
 *
 * Khách đặt hàng đúng thứ tự: "làm khung sườn trước, chiến lược sau", và
 * "trước mắt xử lý chính xác làm giá và tính vòng chuẩn". Nên file này lo đúng
 * hai việc đó — số học của đá — chứ chưa bàn nên ôm nhóm nào.
 *
 * Khác lô ở một chỗ quyết định. Lô ăn theo TỪNG NHÁY: con về hai nháy thì trả
 * hai lần, nên ở giá 27.000đ biên đúng bằng 0. Đá ăn theo CẶP: hai con cùng có
 * mặt trong kỳ thì trúng, đếm một lần. Chính vì đếm một lần mà đá mới có biên
 * dương — xem `bienDa`.
 *
 * File này không import gì ngoài kiểu, để chạy thử độc lập được.
 */
import type { Region } from "./db";

/** Một điểm đá tốn bao nhiêu của khách. Đúng gấp đôi giá lô — đá ôm hai con. */
export const GIA_DA: Record<Region, number> = {
  xsmn: 54_000,
  xsmt: 54_000,
  xsmb: 40_500,
};

/** Trúng một vòng thì trả bao nhiêu cho một điểm. */
export const TRUNG_DA: Record<Region, number> = {
  xsmn: 580_000,
  xsmt: 580_000,
  xsmb: 700_000,
};

/** Số giải mỗi kỳ, giống hệt bên lô. */
export const GIAI: Record<Region, number> = { xsmn: 36, xsmt: 36, xsmb: 27 };

/**
 * Số vòng khi đá một bộ `a` con: mỗi hai con ghép thành một vòng.
 *
 * Đúng công thức khách đưa: V = a × (a − 1) / 2. Đá 5 con ra 10 vòng.
 */
export function soVong(a: number): number {
  if (!Number.isFinite(a) || a < 2) return 0;
  const n = Math.floor(a);
  return (n * (n - 1)) / 2;
}

/**
 * Xác suất HAI con cho trước cùng có mặt trong một kỳ `n` giải.
 *
 * Mỗi giải là một số hai chữ số, con nào cũng rơi vào với xác suất 1/100 và
 * các giải độc lập nhau — đúng giả định mà cả app đang dùng cho lô. Từ đó:
 *
 *   P(cả hai) = 1 − P(thiếu A) − P(thiếu B) + P(thiếu cả hai)
 *             = 1 − 2·(99/100)^n + (98/100)^n
 *
 * Trừ đi phần đếm trùng, chứ không phải P(A)·P(B): hai biến này không độc lập
 * vì cùng tranh nhau ngần ấy giải.
 */
export function xacSuatCaHai(n: number): number {
  return 1 - 2 * Math.pow(0.99, n) + Math.pow(0.98, n);
}

export interface BienDa {
  region: Region;
  gia: number;
  trung: number;
  giai: number;
  /** Xác suất một cặp bất kỳ cùng về trong một kỳ. */
  p: number;
  /** Tiền phải trả trung bình cho một điểm một vòng. */
  traTB: number;
  /** Phần nhà cái giữ lại, theo % tiền nhận. */
  bien: number;
  /** Giá hoà vốn: dưới mức này là bán lỗ. */
  giaHoaVon: number;
}

/**
 * Phần ăn của nhà cái trên một vòng đá, ở giá đang chạy.
 *
 * Đây là con số đáng giá nhất của cả file. Bên lô nó đúng bằng 0,00% nên
 * không cách chặn nào đẻ ra lời được; bên đá nó dương thật.
 */
export function bienDa(region: Region): BienDa {
  const giai = GIAI[region];
  const gia = GIA_DA[region];
  const trung = TRUNG_DA[region];
  const p = xacSuatCaHai(giai);
  const traTB = p * trung;
  return {
    region,
    gia,
    trung,
    giai,
    p,
    traTB,
    bien: gia > 0 ? ((gia - traTB) / gia) * 100 : 0,
    giaHoaVon: traTB,
  };
}

/**
 * Một vé đá: ôm `a` con, mỗi vòng `diem` điểm, rồi `k` con trong đó về.
 *
 * Số vòng trúng tính y như số vòng cược — cũng là "hai con bất kỳ trong số
 * con đã về ghép lại", tức C(k,2). Đúng câu khách nói: "số trúng trong vòng đó
 * cũng tính nhân lên như vậy, rồi nhân với 580".
 */
export interface VeDa {
  soCon: number;
  diem: number;
  vong: number;
  thu: number;
  conVe: number;
  vongTrung: number;
  tra: number;
  lai: number;
}

export function tinhVe(soCon: number, diem: number, conVe: number, region: Region): VeDa {
  const vong = soVong(soCon);
  const vongTrung = soVong(Math.min(conVe, Math.floor(soCon)));
  const thu = vong * diem * GIA_DA[region];
  const tra = vongTrung * diem * TRUNG_DA[region];
  return {
    soCon: Math.floor(soCon),
    diem,
    vong,
    thu,
    conVe: Math.min(conVe, Math.floor(soCon)),
    vongTrung,
    tra,
    lai: thu - tra,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Thống kê theo cặp ngày
// ─────────────────────────────────────────────────────────────────────────────

/** Một kỳ, đã biết mỗi lô khô mấy kỳ và về mấy nháy. */
export interface KyDa {
  date: string;
  /** Số kỳ chưa về tính tới sáng hôm đó. 0 = vừa ra. */
  kho: Record<string, number>;
  /** Số nháy về trong kỳ đó. */
  ve: Record<string, number>;
}

export interface OCapNgay {
  /** Hai bậc ngày, luôn i ≤ j. */
  i: number;
  j: number;
  /** Số cặp (kỳ × cặp lô) rơi vào ô này. */
  dip: number;
  /** Trong đó bao nhiêu cặp có CẢ HAI con cùng về. */
  caHai: number;
  /** caHai / dip. */
  tyLe: number;
  thu: number;
  tra: number;
  lai: number;
  bien: number;
}

/**
 * Đếm từng ô (ngày A, ngày B) trên cả quãng.
 *
 * Không duyệt 4.950 cặp lô mỗi kỳ. Chỉ cần, trong mỗi bậc ngày, đếm có bao
 * nhiêu con và bao nhiêu con trong đó về; số cặp và số cặp trúng suy ra ngay:
 *
 *   hai bậc khác nhau  →  dịp = a_i · a_j ,  trúng = h_i · h_j
 *   cùng một bậc       →  dịp = C(a_i, 2) , trúng = C(h_i, 2)
 *
 * Chính xác tuyệt đối chứ không phải xấp xỉ, và nhanh hơn hẳn.
 *
 * `tran` gộp mọi bậc từ đó trở lên vào một rọ — khách xin "từ vừa ra tới 10".
 */
export function demCapTheoNgay(
  ky: KyDa[],
  tran = 10
): Map<string, { dip: number; caHai: number }> {
  const out = new Map<string, { dip: number; caHai: number }>();
  const cong = (i: number, j: number, dip: number, caHai: number) => {
    if (dip <= 0) return;
    const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
    const o = out.get(key);
    if (o) {
      o.dip += dip;
      o.caHai += caHai;
    } else {
      out.set(key, { dip, caHai });
    }
  };

  for (const k of ky) {
    // a[b] = bao nhiêu con ở bậc b, h[b] = bao nhiêu con trong đó về.
    const a = new Array<number>(tran + 1).fill(0);
    const h = new Array<number>(tran + 1).fill(0);
    for (const lo of Object.keys(k.kho)) {
      const b = Math.min(tran, Math.max(0, k.kho[lo]));
      a[b]++;
      if ((k.ve[lo] ?? 0) > 0) h[b]++;
    }
    for (let i = 0; i <= tran; i++) {
      if (a[i] === 0) continue;
      cong(i, i, (a[i] * (a[i] - 1)) / 2, (h[i] * (h[i] - 1)) / 2);
      for (let j = i + 1; j <= tran; j++) {
        if (a[j] === 0) continue;
        cong(i, j, a[i] * a[j], h[i] * h[j]);
      }
    }
  }
  return out;
}

export interface ThongKeDa {
  region: Region;
  soKy: number;
  tran: number;
  chuan: BienDa;
  bang: OCapNgay[];
  /** Gộp mọi ô lại — để đối chiếu với mức chuẩn tính bằng toán. */
  tong: { dip: number; caHai: number; tyLe: number; thu: number; tra: number; lai: number; bien: number };
}

export function thongKeDa(ky: KyDa[], region: Region, tran = 10): ThongKeDa | null {
  if (ky.length === 0) return null;
  const gia = GIA_DA[region];
  const trung = TRUNG_DA[region];
  const dem = demCapTheoNgay(ky, tran);

  const bang: OCapNgay[] = [];
  let dDip = 0, dCaHai = 0;
  for (const [key, v] of dem) {
    const [i, j] = key.split("-").map(Number);
    const thu = v.dip * gia;
    const tra = v.caHai * trung;
    bang.push({
      i,
      j,
      dip: v.dip,
      caHai: v.caHai,
      tyLe: v.dip ? v.caHai / v.dip : 0,
      thu,
      tra,
      lai: thu - tra,
      bien: thu > 0 ? ((thu - tra) / thu) * 100 : 0,
    });
    dDip += v.dip;
    dCaHai += v.caHai;
  }
  bang.sort((x, y) => x.i - y.i || x.j - y.j);

  const thu = dDip * gia;
  const tra = dCaHai * trung;
  return {
    region,
    soKy: ky.length,
    tran,
    chuan: bienDa(region),
    bang,
    tong: {
      dip: dDip,
      caHai: dCaHai,
      tyLe: dDip ? dCaHai / dDip : 0,
      thu,
      tra,
      lai: thu - tra,
      bien: thu > 0 ? ((thu - tra) / thu) * 100 : 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sổ đá ôm đều — từng kỳ, từng tháng, từng cặp ngày theo tháng
// ─────────────────────────────────────────────────────────────────────────────
//
// Người vận hành xem bản đầu của tab rồi nói thẳng: "chưa có thống kê rõ ràng,
// bắt chước cái dash mà làm". Dashboard trả lời ba câu bằng tiền — tháng này
// lời hay lỗ, từng kỳ ra sao, nhóm nào đẹp — nên bên đá cũng phải trả lời đúng
// ba câu đó. Cuốn sổ đem ra đo là cuốn đơn giản nhất: ôm đều mỗi cặp ngần ấy
// điểm, đủ mọi cặp ghép được từ 100 con.

export interface KyDaRow {
  date: string;
  /** Bao nhiêu con (khác nhau) về trong kỳ. */
  soLoVe: number;
  /** Tổng số cặp đem ra ôm — 100 con thì 4.950 cặp. */
  soCap: number;
  /** Số cặp trúng: hai con bất kỳ trong số con đã về, tức C(soLoVe, 2). */
  capTrung: number;
  thu: number;
  tra: number;
  lai: number;
  /** Cộng dồn từ kỳ đầu của danh sách. */
  don: number;
}

/** Chốt sổ từng kỳ cho cuốn sổ ôm đều `diem` điểm mỗi cặp. */
export function soTungKy(ky: KyDa[], region: Region, diem = 1): KyDaRow[] {
  const gia = GIA_DA[region];
  const trung = TRUNG_DA[region];
  let don = 0;
  return ky.map((k) => {
    const los = Object.keys(k.kho);
    let h = 0;
    for (const lo of los) if ((k.ve[lo] ?? 0) > 0) h++;
    const soCap = soVong(los.length);
    const capTrung = soVong(h);
    const thu = soCap * diem * gia;
    const tra = capTrung * diem * trung;
    don += thu - tra;
    return { date: k.date, soLoVe: h, soCap, capTrung, thu, tra, lai: thu - tra, don };
  });
}

export interface ThangDa {
  /** "2026-07" */
  thang: string;
  soKy: number;
  thu: number;
  tra: number;
  lai: number;
  pct: number;
  dangChay: boolean;
}

/** Gom các kỳ theo tháng dương lịch, mỗi tháng đứng riêng. */
export function gomThang(rows: KyDaRow[]): ThangDa[] {
  const m = new Map<string, ThangDa>();
  for (const r of rows) {
    const t = r.date.slice(0, 7);
    let a = m.get(t);
    if (!a) m.set(t, (a = { thang: t, soKy: 0, thu: 0, tra: 0, lai: 0, pct: 0, dangChay: false }));
    a.soKy++;
    a.thu += r.thu;
    a.tra += r.tra;
    a.lai += r.lai;
  }
  const ds = [...m.values()].sort((a, b) => a.thang.localeCompare(b.thang));
  for (const t of ds) t.pct = t.thu > 0 ? (t.lai / t.thu) * 100 : 0;
  if (ds.length) ds[ds.length - 1].dangChay = true;
  return ds;
}

/**
 * Độ lệch chuẩn của lời/lỗ MỘT kỳ.
 *
 * Dùng để biết một tháng lệch bao nhiêu thì vẫn là bình thường: các kỳ xổ độc
 * lập nhau nên dao động của một tháng n kỳ là con số này nhân căn n. Tính từ
 * mọi kỳ chứ không từ dăm ba con số tháng, nên đứng vững hơn nhiều.
 */
export function doLechKy(rows: KyDaRow[]): number {
  if (rows.length < 2) return 0;
  const tb = rows.reduce((s, r) => s + r.lai, 0) / rows.length;
  return Math.sqrt(rows.reduce((s, r) => s + (r.lai - tb) ** 2, 0) / (rows.length - 1));
}

/** Một ô phải gom đủ ngần này cặp trong tháng thì con số của tháng đó mới được tính. */
export const DIP_TOI_THIEU = 500;
/** Tháng ít kỳ hơn ngần này thì không dùng để gắn nhãn. */
const KY_TOI_THIEU_THANG = 15;

export type NhanO = "om" | "ne" | "chua";

export interface OCapThang {
  thang: string;
  dip: number;
  caHai: number;
  /** null khi tháng đó ô này quá ít cặp. */
  bien: number | null;
}

export interface OCapDayDu extends OCapNgay {
  theoThang: OCapThang[];
  /**
   * NÊN ÔM chỉ khi lời ở MỌI tháng đủ (ít nhất ba tháng) lẫn cả quãng; NÉ RA
   * khi lỗ ở mọi tháng đủ. Tháng đang chạy dở không được tham gia gắn nhãn.
   */
  nhan: NhanO;
}

export interface ThongKeCapThang {
  cacThang: string[];
  thangDangChay: string;
  bang: OCapDayDu[];
  soOm: number;
  soNe: number;
}

export function thongKeCapTheoThang(ky: KyDa[], region: Region, tran = 10): ThongKeCapThang | null {
  const tong = thongKeDa(ky, region, tran);
  if (!tong) return null;
  const gia = GIA_DA[region];
  const trung = TRUNG_DA[region];

  const theoThang = new Map<string, KyDa[]>();
  for (const k of ky) {
    const t = k.date.slice(0, 7);
    const a = theoThang.get(t);
    if (a) a.push(k);
    else theoThang.set(t, [k]);
  }
  const cacThang = [...theoThang.keys()].sort();
  const thangDangChay = cacThang[cacThang.length - 1] ?? "";
  const demThang = new Map(cacThang.map((t) => [t, demCapTheoNgay(theoThang.get(t)!, tran)]));
  const thangDu = new Set(
    cacThang.filter((t) => t !== thangDangChay && theoThang.get(t)!.length >= KY_TOI_THIEU_THANG)
  );

  let soOm = 0, soNe = 0;
  const bang: OCapDayDu[] = tong.bang.map((o) => {
    const key = `${o.i}-${o.j}`;
    const ds: OCapThang[] = cacThang.map((t) => {
      const v = demThang.get(t)!.get(key) ?? { dip: 0, caHai: 0 };
      const thu = v.dip * gia;
      return {
        thang: t,
        dip: v.dip,
        caHai: v.caHai,
        bien: v.dip >= DIP_TOI_THIEU ? ((thu - v.caHai * trung) / thu) * 100 : null,
      };
    });
    const xet = ds.filter((x) => thangDu.has(x.thang) && x.bien != null).map((x) => x.bien as number);
    let nhan: NhanO = "chua";
    if (xet.length >= 3 && o.bien > 0 && xet.every((v) => v > 0)) nhan = "om";
    else if (xet.length >= 3 && o.bien < 0 && xet.every((v) => v < 0)) nhan = "ne";
    if (nhan === "om") soOm++;
    if (nhan === "ne") soNe++;
    return { ...o, theoThang: ds, nhan };
  });

  return { cacThang, thangDangChay, bang, soOm, soNe };
}

export interface KiemThuDa {
  kyHoc: number;
  kyThi: number;
  soO: number;
  soOChon: number;
  bienChon: number;
  bienTatCa: number;
  laiChon: number;
  laiTatCa: number;
}

/**
 * Phần giữ cho bảng cặp ngày thật thà: chọn ô có lời trên NỬA ĐẦU, rồi chỉ ôm
 * những ô đó ở NỬA SAU, so với cứ ôm đều mọi ô. Nếu biết chọn ô mà có giá trị
 * thì nửa sau phải hơn hẳn; nếu ngang nhau thì bảng xếp hạng ô là may rủi.
 */
export function kiemThuDa(ky: KyDa[], region: Region, tran = 10): KiemThuDa | null {
  const giua = Math.floor(ky.length / 2);
  if (giua < 20) return null;
  const gia = GIA_DA[region];
  const trung = TRUNG_DA[region];
  const hoc = demCapTheoNgay(ky.slice(0, giua), tran);
  const thi = demCapTheoNgay(ky.slice(giua), tran);

  const chon = new Set<string>();
  for (const [key, v] of hoc) {
    if (v.dip >= DIP_TOI_THIEU && v.dip * gia - v.caHai * trung > 0) chon.add(key);
  }
  let thuC = 0, traC = 0, thuA = 0, traA = 0;
  for (const [key, v] of thi) {
    thuA += v.dip * gia;
    traA += v.caHai * trung;
    if (chon.has(key)) {
      thuC += v.dip * gia;
      traC += v.caHai * trung;
    }
  }
  return {
    kyHoc: giua,
    kyThi: ky.length - giua,
    soO: hoc.size,
    soOChon: chon.size,
    bienChon: thuC > 0 ? ((thuC - traC) / thuC) * 100 : 0,
    bienTatCa: thuA > 0 ? ((thuA - traA) / thuA) * 100 : 0,
    laiChon: thuC - traC,
    laiTatCa: thuA - traA,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Kỳ tới: con nào đang ở ngày nào
// ─────────────────────────────────────────────────────────────────────────────

export interface KetQuaKy {
  date: string;
  hits: Record<string, number>;
}

const cachNgay = (sau: string, truoc: string) => {
  const [y1, m1, d1] = sau.split("-").map(Number);
  const [y2, m2, d2] = truoc.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000));
};

/**
 * Sáng kỳ tới, mỗi con đang khô mấy kỳ.
 *
 * Mọi thống kê của tab đều nhìn về phía sau; người vận hành thì hỏi câu ngược
 * lại — "nhìn không biết ôm con nào". Muốn trả lời bằng con số cụ thể thì phải
 * biết ngay lúc này từng con đang đứng ở ngày nào. Tính đúng theo luật của
 * `dungKy` (đếm theo ngày lịch kể từ lần về cuối), để "ngày" ở đây và "ngày"
 * trong bảng thống kê là cùng một thứ.
 */
export function khoKyToi(draws: KetQuaKy[]): { ngayCuoi: string; kho: Record<string, number> } | null {
  if (draws.length === 0) return null;
  const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));
  const ngayCuoi = sap[sap.length - 1].date;
  const veCuoi = new Map<string, string>();
  for (const d of sap) {
    for (const [lo, c] of Object.entries(d.hits)) if ((Number(c) || 0) > 0) veCuoi.set(lo, d.date);
  }
  const kho: Record<string, number> = {};
  for (let i = 0; i < 100; i++) {
    const lo = String(i).padStart(2, "0");
    const last = veCuoi.get(lo);
    // Chưa từng về trong kho thì coi như khô suốt từ kỳ đầu.
    kho[lo] = last ? cachNgay(ngayCuoi, last) : cachNgay(ngayCuoi, sap[0].date) + 1;
  }
  return { ngayCuoi, kho };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bảng tiền đá — mỗi ô một mức riêng
// ─────────────────────────────────────────────────────────────────────────────
//
// Khách duyệt khung rồi xin đúng một thứ: "tách riêng từng ô để em cài tiền vào
// được — ngày 1 đá với nhau, ngày 2 đá với nhau… ngày này đá chéo ngày kia, cho
// tất cả 10 ngày". Tức là bản đá của "Bảng Hạn Mức 100 Lô": mỗi ô (cặp ngày)
// một số điểm, 0 là chặn. Mọi thống kê của tab sau đó tính theo đúng bảng này,
// chứ không theo cuốn sổ ôm đều 1 điểm nữa.

/** "i-j" với i ≤ j  →  số điểm nhận cho MỖI cặp rơi vào ô đó. 0 = chặn. */
export type BangDa = Record<string, number>;

export const DIEM_DA_MAC_DINH = 1;
export const DIEM_DA_TOI_DA = 100_000;

export const khoaCap = (i: number, j: number) => `${Math.min(i, j)}-${Math.max(i, j)}`;

/** Mọi ô, cùng-ngày đứng trước rồi tới đá chéo — đúng thứ tự khách liệt kê. */
export function moiOCap(tran = 10): { i: number; j: number; cungNgay: boolean }[] {
  const out: { i: number; j: number; cungNgay: boolean }[] = [];
  for (let i = 0; i <= tran; i++) out.push({ i, j: i, cungNgay: true });
  for (let i = 0; i <= tran; i++) for (let j = i + 1; j <= tran; j++) out.push({ i, j, cungNgay: false });
  return out;
}

export function bangMacDinh(tran = 10): BangDa {
  const b: BangDa = {};
  for (const o of moiOCap(tran)) b[khoaCap(o.i, o.j)] = DIEM_DA_MAC_DINH;
  return b;
}

/**
 * Dọn một bảng đọc từ ngoài vào: đủ mọi ô, số nguyên, không âm, có trần.
 *
 * Thứ gì lạ thì bỏ chứ không đoán — đây là bảng tiền. Ô thiếu thì về mức mặc
 * định, để một bảng lưu từ bản cũ ít ô hơn vẫn mở ra dùng được.
 */
export function chuanHoaBang(raw: unknown, tran = 10): BangDa {
  const b = bangMacDinh(tran);
  if (!raw || typeof raw !== "object") return b;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in b)) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    b[k] = Math.max(0, Math.min(DIEM_DA_TOI_DA, Math.round(n)));
  }
  return b;
}

/**
 * Chốt sổ từng kỳ theo bảng tiền: mỗi cặp ôm đúng số điểm của ô nó rơi vào.
 *
 * Bảng toàn 1 điểm thì ra y hệt `soTungKy` — bài kiểm giữ chặt điều đó, để hai
 * đường tính không bao giờ lệch nhau.
 */
export function soTungKyTheoBang(ky: KyDa[], region: Region, bang: BangDa, tran = 10): KyDaRow[] {
  const gia = GIA_DA[region];
  const trung = TRUNG_DA[region];
  let don = 0;
  return ky.map((k) => {
    let h = 0;
    for (const lo of Object.keys(k.kho)) if ((k.ve[lo] ?? 0) > 0) h++;
    let soCap = 0, capTrung = 0, thu = 0, tra = 0;
    for (const [key, v] of demCapTheoNgay([k], tran)) {
      const diem = bang[key] ?? 0;
      if (diem <= 0) continue;
      soCap += v.dip;
      capTrung += v.caHai;
      thu += v.dip * diem * gia;
      tra += v.caHai * diem * trung;
    }
    don += thu - tra;
    return { date: k.date, soLoVe: h, soCap, capTrung, thu, tra, lai: thu - tra, don };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Luật tự chặn và lệnh chặn đá cho bot
// ─────────────────────────────────────────────────────────────────────────────
//
// Khách chốt luật: "MN, MT dưới +2,92% là chặn; MB dưới +5,14% là chặn — chừng
// nào em thay đổi thì bấm thay đổi hoặc vào cài thủ công". Hai con số đó chính
// là phần ăn theo giá của từng miền (`bienDa(region).bien`), nên luật đọc là:
// ô nào phần ăn đo được thấp hơn phần ăn theo giá thì không nhận.

/** Ô có ít hơn ngần này cặp thì luật chưa động tới — con số còn là may rủi. */
export const CAP_TOI_THIEU_LUAT = DIP_TOI_THIEU;

export interface KetQuaLuat {
  /** Bảng sau khi áp luật: ô dưới mức bị đưa về 0, ô khác giữ điểm đã cài. */
  bang: BangDa;
  /** Những ô luật vừa chặn (không tính ô đã tự cài 0). */
  chan: string[];
  /** Mức so sánh — phần ăn theo giá của miền. */
  nguong: number;
}

/**
 * Áp luật tự chặn lên bảng đã cài. Hàm thuần, nên web và bot cùng gọi một chỗ
 * và không bao giờ cho hai kết quả khác nhau.
 */
export function apLuatTuDong(bang: BangDa, tk: ThongKeDa | null, tran = 10): KetQuaLuat {
  const out: BangDa = { ...bangMacDinh(tran), ...bang };
  const chan: string[] = [];
  const nguong = tk ? tk.chuan.bien : 0;
  if (tk) {
    for (const o of tk.bang) {
      if (o.dip < CAP_TOI_THIEU_LUAT || o.bien >= nguong) continue;
      const k = khoaCap(o.i, o.j);
      if ((out[k] ?? 0) > 0) chan.push(k);
      out[k] = 0;
    }
  }
  return { bang: out, chan, nguong };
}

/**
 * Mọi cặp con số cụ thể rơi vào ô đang chặn, tính theo bậc ngày của 100 con
 * sau kỳ mới nhất. Đây là thứ đem đi dán cho người ghi cược.
 *
 * Trong cặp con lớn đứng trước, cả danh sách xếp tăng dần — theo đúng ví dụ
 * khách gõ ("01 00; 10 01").
 */
export function capBiChan(kho: Record<string, number>, bang: BangDa, tran = 10): [string, string][] {
  const los = Object.keys(kho).sort();
  const bac = (lo: string) => Math.min(tran, Math.max(0, kho[lo]));
  const out: [string, string][] = [];
  for (let x = 0; x < los.length; x++) {
    for (let y = x + 1; y < los.length; y++) {
      if ((bang[khoaCap(bac(los[x]), bac(los[y]))] ?? 0) > 0) continue;
      out.push([los[y], los[x]]);
    }
  }
  return out;
}

/** "st tv ag …: 01 00; 10 01; … dx0n" — hậu tố là chữ của khách: đá xiên, 0 nhận. */
export const HAU_TO_CHAN_DA = "dx0n";

/**
 * Chia danh sách cặp thành các khối, mỗi khối là MỘT chuỗi dán được trọn vẹn
 * (đủ đầu đài lẫn đuôi dx0n) và không dài quá `toiDa` ký tự. Khách sợ đúng
 * chỗ này: "e sợ Tele hạn chế ký tự".
 */
export function chiaKhoiChanDa(dau: string, cap: [string, string][], toiDa: number): string[] {
  if (cap.length === 0) return [];
  const mo = `${dau}: `, dong = ` ${HAU_TO_CHAN_DA}`;
  const khoi: string[] = [];
  let hien: string[] = [];
  let dai = mo.length + dong.length;
  for (const [a, b] of cap) {
    const c = `${a} ${b}`;
    const them = c.length + (hien.length ? 2 : 0);
    if (hien.length && dai + them > toiDa) {
      khoi.push(mo + hien.join("; ") + dong);
      hien = [];
      dai = mo.length + dong.length;
    }
    hien.push(c);
    dai += c.length + (hien.length > 1 ? 2 : 0);
  }
  if (hien.length) khoi.push(mo + hien.join("; ") + dong);
  return khoi;
}
