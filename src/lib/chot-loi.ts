/**
 * "Chốt lời sớm" — lời tới đâu thì nghỉ, và ăn đậm có kéo theo thua đậm không.
 *
 * Người vận hành xin: "hiện giùm em mấy cái giống như T9 — để xem chốt lời
 * sớm được không — cứ một ngày ăn đậm là dễ bị thua đậm lại." Tức là ba thứ:
 *
 *   1. Mọi tháng đều có đường tiền dồn từng kỳ như tháng 9, không riêng tháng
 *      đang chạy — để nhìn ra tháng nào từng lên cao rồi rơi xuống.
 *   2. Một luật chốt lời làm được thật: tháng đã lời tới X thì nghỉ hết tháng.
 *   3. Kiểm chính cái cảm giác "ăn đậm xong là thua đậm".
 *
 * Chỗ dễ hỏng nhất là (1). Nhìn đường của một tháng đã xong, ai cũng thấy
 * ngay "giá mà dừng ở đỉnh" — nhưng đỉnh chỉ biết được khi tháng đã hết. Nên
 * con số "dừng đúng đỉnh" luôn phải đứng cạnh luật chốt lời thật và mang nhãn
 * nhìn lại mới biết, không thì bảng này đang bán một thứ không ai làm được.
 *
 * File này không import gì của app để chạy thử độc lập được.
 */

export interface KyLai {
  date: string;
  lai: number;
  thu: number;
}

export interface ThangChuoi {
  /** "2026-07" */
  thang: string;
  ngay: string[];
  /** Lời/lỗ gộp 3 miền của từng kỳ. */
  laiKy: number[];
  /** Cộng dồn từ mùng 1 tới kỳ đó. */
  don: number[];
  cuoi: number;
  /** Chỗ cao nhất đường dồn từng lên — chỉ biết khi nhìn lại. */
  dinh: number;
  dinhNgay: string;
  day: number;
  thu: number;
  dangChay: boolean;
  /**
   * Tháng đầu tiên của kho — vẽ ra nhưng không đem ra chấm.
   *
   * Máy dò lại bắt đầu đếm từ con số không: kỳ đầu kho nó chưa biết con nào
   * đã khô bao lâu, nên hạn mức mấy chục kỳ đầu đều lệch. Soi trên sổ thật thì
   * kỳ đầu kho (09/03) ra đúng 0đ, và tháng 3 chỉ có 23 kỳ vì kho bắt đầu giữa
   * tháng — cả tháng nằm gần trọn trong quãng khởi động. Đem nó ra chấm luật
   * chốt lời là để một tháng méo quyết định kết luận.
   */
  khoiDong: boolean;
}

export interface KetQuaNguong {
  /** Phần trăm của tiền nhận trung bình một tháng. */
  pct: number;
  /** Quy ra đồng: lời dồn chạm mức này là nghỉ hết tháng. */
  nguong: number;
  soThangCham: number;
  /** Tổng tiền giữ được qua các tháng đủ, nếu làm theo luật này. */
  tong: number;
  /** So với không dừng. */
  hon: number;
}

export interface SauAnDam {
  /** Số lần có một kỳ ăn đậm (top 10%) mà còn kỳ kế sau. */
  soLan: number;
  /** Mức "ăn đậm": lời từ ngần này trở lên. */
  mucAnDam: number;
  /** Mức "thua đậm": lỗ từ ngần này trở xuống (10% tệ nhất). */
  mucThuaDam: number;
  tbKyKe: number;
  tbChung: number;
  tyLeKyKeLo: number;
  tyLeLoChung: number;
  /** Sau kỳ ăn đậm, bao nhiêu phần kỳ kế rơi vào nhóm thua đậm. Chuẩn là 10%. */
  tyLeKyKeThuaDam: number;
}

export interface ChotLoi {
  /** Mọi tháng, cũ trước mới sau. */
  thang: ThangChuoi[];
  /** Những tháng dùng để chấm luật: đủ kỳ, đã xong, không phải tháng khởi động. */
  thangDu: string[];
  /** Tháng đầu kho, bị loại khỏi phần chấm. */
  thangKhoiDong: string | null;
  thuTBThang: number;
  khongDung: number;
  /** Dừng đúng đỉnh mọi tháng — nhìn lại mới biết, không làm được. */
  dungDungDinh: number;
  nguongs: KetQuaNguong[];
  /** Tương quan lời/lỗ kỳ này với kỳ ngay sau. */
  tuongQuan: number;
  /** Tương quan nằm trong ±ngần này thì chưa khác gì tung đồng xu (95%). */
  nguongNhieu: number;
  soCap: number;
  sauAnDam: SauAnDam;
}

/** Tháng ít kỳ hơn ngần này thì không chấm — trừ để vẽ. */
const KY_TOI_THIEU = 15;
/** Các mức chốt lời thử, tính theo % tiền nhận một tháng. */
const PCT_NGUONG = [0.5, 1, 1.5, 2, 3];

const tb = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function tinhTuongQuan(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = tb(a.slice(0, n));
  const mb = tb(b.slice(0, n));
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

/**
 * Luật chốt lời cho một tháng: lời dồn chạm `nguong` ở kỳ nào thì giữ đúng
 * số đó và nghỉ phần còn lại của tháng. Không chạm thì ăn trọn kết quả cuối.
 *
 * Chỉ dùng thông tin có được tại thời điểm đó — đây là luật làm được thật.
 */
export function apNguong(don: number[], nguong: number): { giu: number; cham: boolean } {
  for (const v of don) if (v >= nguong) return { giu: v, cham: true };
  return { giu: don.length ? don[don.length - 1] : 0, cham: false };
}

export function phanTichChotLoi(mien: KyLai[][]): ChotLoi | null {
  // Gộp ba miền theo ngày.
  const theoNgay = new Map<string, { lai: number; thu: number }>();
  for (const ds of mien) {
    for (const k of ds) {
      const a = theoNgay.get(k.date);
      if (a) {
        a.lai += k.lai;
        a.thu += k.thu;
      } else {
        theoNgay.set(k.date, { lai: k.lai, thu: k.thu });
      }
    }
  }
  const ngayAll = [...theoNgay.keys()].sort();
  if (ngayAll.length < 20) return null;

  const theoThang = new Map<string, string[]>();
  for (const n of ngayAll) {
    const t = n.slice(0, 7);
    const a = theoThang.get(t);
    if (a) a.push(n);
    else theoThang.set(t, [n]);
  }
  const cacThang = [...theoThang.keys()].sort();
  const thangDau = cacThang[0];
  const thangMoi = cacThang[cacThang.length - 1];

  const thang: ThangChuoi[] = cacThang.map((t) => {
    const ngay = theoThang.get(t)!;
    let d = 0, thu = 0;
    let dinh = -Infinity, dinhNgay = ngay[0], day = Infinity;
    const laiKy: number[] = [];
    const don: number[] = [];
    for (const n of ngay) {
      const v = theoNgay.get(n)!;
      d += v.lai;
      thu += v.thu;
      laiKy.push(v.lai);
      don.push(d);
      if (d > dinh) {
        dinh = d;
        dinhNgay = n;
      }
      if (d < day) day = d;
    }
    return {
      thang: t,
      ngay,
      laiKy,
      don,
      cuoi: d,
      dinh,
      dinhNgay,
      day,
      thu,
      dangChay: t === thangMoi,
      khoiDong: t === thangDau,
    };
  });

  // Ba loại tháng không được chấm. Tháng đang chạy dở: "cuối tháng" của nó chỉ
  // là hôm nay. Tháng quá ít kỳ: một hai đêm quyết định cả tháng. Và tháng
  // khởi động: hạn mức mấy chục kỳ đầu kho còn lệch vì máy chưa kịp đếm.
  const du = thang.filter((x) => !x.dangChay && !x.khoiDong && x.ngay.length >= KY_TOI_THIEU);
  const thuTBThang = tb(du.map((x) => x.thu));
  const khongDung = du.reduce((s, x) => s + x.cuoi, 0);
  const dungDungDinh = du.reduce((s, x) => s + x.dinh, 0);

  const nguongs: KetQuaNguong[] = PCT_NGUONG.map((pct) => {
    const nguong = (thuTBThang * pct) / 100;
    let tong = 0, soThangCham = 0;
    for (const x of du) {
      const r = apNguong(x.don, nguong);
      tong += r.giu;
      if (r.cham) soThangCham++;
    }
    return { pct, nguong, soThangCham, tong, hon: tong - khongDung };
  });

  // "Ăn đậm xong là thua đậm" — soi trên chuỗi kỳ liền nhau của cả quãng.
  const seq = ngayAll.map((n) => theoNgay.get(n)!.lai);
  const soCap = seq.length - 1;
  const tuongQuan = tinhTuongQuan(seq.slice(0, -1), seq.slice(1));
  const nguongNhieu = soCap > 0 ? 1.96 / Math.sqrt(soCap) : 0;

  const giam = [...seq].sort((a, b) => b - a);
  const tang = [...seq].sort((a, b) => a - b);
  const k10 = Math.max(1, Math.floor(seq.length * 0.1));
  const mucAnDam = giam[k10 - 1];
  const mucThuaDam = tang[k10 - 1];

  const keSau: number[] = [];
  for (let i = 0; i < seq.length - 1; i++) if (seq[i] >= mucAnDam) keSau.push(seq[i + 1]);

  const sauAnDam: SauAnDam = {
    soLan: keSau.length,
    mucAnDam,
    mucThuaDam,
    tbKyKe: tb(keSau),
    tbChung: tb(seq),
    tyLeKyKeLo: keSau.length ? keSau.filter((x) => x < 0).length / keSau.length : 0,
    tyLeLoChung: seq.filter((x) => x < 0).length / seq.length,
    tyLeKyKeThuaDam: keSau.length ? keSau.filter((x) => x <= mucThuaDam).length / keSau.length : 0,
  };

  return {
    thang,
    thangDu: du.map((x) => x.thang),
    thangKhoiDong: thangDau ?? null,
    thuTBThang,
    khongDung,
    dungDungDinh,
    nguongs,
    tuongQuan,
    nguongNhieu,
    soCap,
    sauAnDam,
  };
}
