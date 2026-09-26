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
  apLuatDinh, bangMacDinh, capBiChan, chuanHoaBang, chuanHoaDanhSachO, khoKyToi, luatHaiBuoc,
  thongKeCapTheoThang, thongKeDa,
  type BangDa, type LuatHaiBuoc, type LyDoChan,
} from "@/lib/da";
import type { Region } from "@/lib/types";

const khoa = (region: Region) => `da_bang:${region}`;

export interface BangDaLuu {
  bang: BangDa;
  /** null = chưa ai lưu lần nào, đang là bảng mặc định 1 điểm mỗi ô. */
  luuLuc: string | null;
  /** Công tắc luật hai bước. Khách xin bật sẵn, nên mặc định là bật. */
  tuDong: boolean;
  /** Ô luật đã chặn — giữ nguyên tới khi khách mở tay. */
  chanLuat: string[];
  /** Ô khách đã mở tay — luật không đụng lại. */
  moTay: string[];
  /** Lần gần nhất luật đóng đinh thêm ô. */
  luatLuc: string | null;
}

const macDinh = (): BangDaLuu => ({ bang: bangMacDinh(), luuLuc: null, tuDong: true, chanLuat: [], moTay: [], luatLuc: null });

export async function docBangDa(region: Region): Promise<BangDaLuu> {
  const raw = await getConfigValue(khoa(region));
  if (!raw) return macDinh();
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof BangDaLuu, unknown>>;
    return {
      bang: chuanHoaBang(o.bang),
      luuLuc: typeof o.luuLuc === "string" ? o.luuLuc : null,
      // Bản lưu từ trước khi có công tắc thì coi như bật — đó là ý khách.
      tuDong: o.tuDong !== false,
      chanLuat: chuanHoaDanhSachO(o.chanLuat),
      moTay: chuanHoaDanhSachO(o.moTay),
      luatLuc: typeof o.luatLuc === "string" ? o.luatLuc : null,
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
  moTay: unknown
): Promise<BangDaLuu> {
  const cu = await docBangDa(region);
  const mo = new Set(chuanHoaDanhSachO(moTay));
  const data: BangDaLuu = {
    bang: chuanHoaBang(bang),
    luuLuc: new Date().toISOString(),
    tuDong,
    // Ô đã mở tay thì không thể đồng thời nằm trong danh sách luật chặn.
    chanLuat: chuanHoaDanhSachO(chanLuat).filter((k) => !mo.has(k)),
    moTay: [...mo].sort(),
    luatLuc: cu.luatLuc,
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
  const luat = luu0.tuDong ? luatHaiBuoc(tk, tkt) : null;
  const ap = apLuatDinh(luu0.bang, luat, luu0);

  let luu = luu0;
  if (luu0.tuDong && ap.moi.length > 0) {
    luu = { ...luu0, chanLuat: ap.chanLuat, luatLuc: new Date().toISOString() };
    await ghi(region, luu);
  }

  const bang = luu.tuDong ? ap.bang : luu.bang;
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
