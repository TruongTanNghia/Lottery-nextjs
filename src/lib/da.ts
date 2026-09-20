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
