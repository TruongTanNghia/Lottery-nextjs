/**
 * Bảng Tiền Đá phía máy chủ: đọc/lưu cấu hình và dựng bảng ĐANG HIỆU LỰC.
 *
 * Web và bot cùng đi qua đây. Bảng hiệu lực = bảng đã cài, rồi (nếu công tắc
 * luật bật) ép về 0 những ô đã bị luật đóng đinh. Luật hai bước của khách:
 *
 *   1. tổng thể mọi kỳ: ô nào tỷ lệ cả hai cùng về CAO hơn mức chung → chặn;
 *   2. tháng đang chạy: ô nào phần ăn tháng này ≤ phần ăn theo giá → chặn;
 *   "khi chặn rồi lưu giữ nguyên tới khi thay đổi lại".
 *
 * Cái vế cuối là điểm khác: luật không tính lại rồi tự mở ô ra; ô nào đã bị
 * chặn thì nằm trong `chanLuat` cho tới khi khách tự mở tay (`moTay`, luật
 * không đụng lại ô đó nữa). Nên mỗi lần đọc, máy chủ chạy luật trên số liệu
 * mới nhất, ô nào mới bị chặn thì ghi thêm vào danh sách và lưu luôn — đó là
 * cách "giữ nguyên" thành sự thật chứ không phải lời hứa.
 *
 * Chỉ tab Số Đá và lệnh /chanda của bot đọc thứ này. Bộ máy hạn mức lô không
 * biết tới nó.
 */
import { getConfigValue, query, setConfigValue } from "@/lib/db";
import { dungKy } from "@/lib/slot-stats";
import type { DrawHits } from "@/lib/backtest";
import {
  NGUONG_RUT_GON, apChanLuat, apLuatDinh, bangMacDinh, capBiChan, chuanHoaBang, chuanHoaBuoc, chuanHoaDanhSachO, chuanHoaNguongGon, khoKyToi, luatHaiBuoc,
  thongKeCapTheoThang, thongKeDa,
  type BangDa, type LuatHaiBuoc, type LyDoChan,
} from "@/lib/da";
import type { Region } from "@/lib/types";

const khoa = (region: Region) => `da_bang:${region}`;

export interface BangDaLuu {
  bang: BangDa;
  /** null = chưa ai lưu lần nào, đang là bảng mặc định 1 điểm mỗi ô. */
  luuLuc: string | null;
  /** Luật đang bật (= ít nhất một trong hai bước bật). Giữ tên cũ để bản lưu cũ đọc được. */
  tuDong: boolean;
  /** Hai công tắc riêng: bước 1 (quá mức chung) và bước 2 (lỗ 2 tháng gần). */
  buoc1: boolean;
  buoc2: boolean;
  /** Ô luật đã chặn — giữ nguyên tới khi khách mở tay. */
  chanLuat: string[];
  /** Ô khách đã mở tay — luật không đụng lại. */
  moTay: string[];
  /** Lần gần nhất luật đóng đinh thêm ô. */
  luatLuc: string | null;
  /** Rút gọn chuỗi: con bị chặn ≥ 90/99 thì chặn tròn cả con (chặn thêm vài cặp). */
  rutGon: boolean;
  /** Mức rút gọn: con bị chặn từ ngần này trên 99 con thì chặn tròn. */
  nguongGon: number;
}

const macDinh = (): BangDaLuu => ({ bang: bangMacDinh(), luuLuc: null, tuDong: true, chanLuat: [], moTay: [], luatLuc: null, rutGon: false, nguongGon: NGUONG_RUT_GON, buoc1: true, buoc2: true });

export async function docBangDa(region: Region): Promise<BangDaLuu> {
  const raw = await getConfigValue(khoa(region));
  if (!raw) return macDinh();
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof BangDaLuu, unknown>>;
    return {
      bang: chuanHoaBang(o.bang),
      luuLuc: typeof o.luuLuc === "string" ? o.luuLuc : null,
      // Bản lưu từ trước khi có công tắc thì coi như bật — đó là ý khách.
      tuDong: o.tuDong !== false && (o.buoc1 !== false || o.buoc2 !== false),
      buoc1: o.buoc1 !== false,
      buoc2: o.buoc2 !== false,
      chanLuat: chuanHoaDanhSachO(o.chanLuat),
      moTay: chuanHoaDanhSachO(o.moTay),
      luatLuc: typeof o.luatLuc === "string" ? o.luatLuc : null,
      rutGon: o.rutGon === true,
      nguongGon: chuanHoaNguongGon(o.nguongGon),
    };
  } catch {
    return macDinh();
  }
}

async function ghi(region: Region, data: BangDaLuu): Promise<void> {
  await setConfigValue(khoa(region), JSON.stringify(data));
}

export async function luuBangDa(
  region: Region,
  bang: unknown,
  tuDong: boolean,
  chanLuat: unknown,
  moTay: unknown,
  rutGon: boolean,
  nguongGon: unknown,
  buoc: unknown
): Promise<BangDaLuu> {
  const b = chuanHoaBuoc(buoc);
  const cu = await docBangDa(region);
  const mo = new Set(chuanHoaDanhSachO(moTay));
  const data: BangDaLuu = {
    bang: chuanHoaBang(bang),
    luuLuc: new Date().toISOString(),
    tuDong: tuDong && (b.buoc1 || b.buoc2),
    buoc1: b.buoc1,
    buoc2: b.buoc2,
    // Ô đã mở tay thì không thể đồng thời nằm trong danh sách luật chặn.
    chanLuat: chuanHoaDanhSachO(chanLuat).filter((k) => !mo.has(k)),
    moTay: [...mo].sort(),
    luatLuc: cu.luatLuc,
    rutGon,
    nguongGon: chuanHoaNguongGon(nguongGon),
  };
  await ghi(region, data);
  return data;
}

/** Mọi kỳ đã đếm của miền, đúng nguồn mà /api/history/hits trả cho trình duyệt. */
export async function taiKyDaXo(region: Region): Promise<DrawHits[]> {
  const rows = await query<{ date: string; lo_number: string; count: number }>(
    "SELECT date, lo_number, count FROM lo_daily WHERE region = ? ORDER BY date",
    [region]
  );
  const byDate = new Map<string, Record<string, number>>();
  for (const r of rows) {
    let d = byDate.get(r.date);
    if (!d) byDate.set(r.date, (d = {}));
    d[r.lo_number] = Number(r.count);
  }
  return [...byDate.entries()].map(([date, hits]) => ({ date, hits }));
}

export interface BangHieuLuc {
  /** Bản lưu SAU khi luật đã đóng đinh thêm (nếu có). */
  luu: BangDaLuu;
  /** Bảng sau khi áp luật (hoặc chính bảng đã cài nếu công tắc tắt). */
  bang: BangDa;
  luat: LuatHaiBuoc | null;
  /** Lý do của từng ô luật ĐANG muốn chặn ở số liệu mới nhất. */
  lyDo: Record<string, LyDoChan>;
  /** Ô vừa bị đóng đinh thêm ở lần đọc này. */
  moi: string[];
  ngayCuoi: string | null;
  /** Kỳ tới, từng cặp con số cụ thể rơi vào ô đang chặn. */
  capChan: [string, string][];
  soKy: number;
}

/**
 * Đọc bảng, chạy luật trên số liệu mới nhất, đóng đinh ô mới (và lưu), rồi
 * trả bảng hiệu lực. Ghi trong lúc đọc là cố ý: "chặn rồi giữ nguyên" chỉ
 * đúng nếu cái đã chặn được ghi lại ngay lúc nó xảy ra.
 */
export async function bangHieuLuc(region: Region): Promise<BangHieuLuc> {
  const [luu0, draws] = await Promise.all([docBangDa(region), taiKyDaXo(region)]);
  const ky = dungKy(draws);
  const tk = thongKeDa(ky, region);
  const tkt = thongKeCapTheoThang(ky, region);
  const luat = luu0.tuDong ? luatHaiBuoc(tk, tkt, { buoc1: luu0.buoc1, buoc2: luu0.buoc2 }) : null;
  const ap = apLuatDinh(luu0.bang, luat, luu0);

  let luu = luu0;
  if (luu0.tuDong && ap.moi.length > 0) {
    // Đọc LẠI ngay trước khi ghi và chỉ trộn thêm danh sách ô chặn. Tính luật
    // mất vài trăm ms (tải cả lịch sử); nếu trong lúc đó khách bấm Lưu thì
    // ghi nguyên `luu0` sẽ đè bản vừa lưu bằng bảng cũ — mất đúng cái khách
    // vừa cài. Chỉ thêm ô, không bao giờ chở theo bảng tiền cũ.
    const moiNhat = await docBangDa(region);
    const mo = new Set(moiNhat.moTay);
    const gop = [...new Set([...moiNhat.chanLuat, ...ap.moi])].filter((k) => !mo.has(k)).sort();
    luu = { ...moiNhat, chanLuat: gop, luatLuc: new Date().toISOString() };
    await ghi(region, luu);
  }

  // Bảng hiệu lực dựng từ bản lưu mới nhất (có thể vừa đọc lại ở trên).
  const bang = luu.tuDong ? apChanLuat(luu.bang, luu.chanLuat) : luu.bang;
  const tt = khoKyToi(draws);
  return {
    luu,
    bang,
    luat,
    lyDo: ap.lyDo,
    moi: ap.moi,
    ngayCuoi: tt?.ngayCuoi ?? null,
    capChan: tt ? capBiChan(tt.kho, bang) : [],
    soKy: ky.length,
  };
}
