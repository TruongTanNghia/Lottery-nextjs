/**
 * Bảng Tiền Đá phía máy chủ: đọc/lưu cấu hình và dựng bảng ĐANG HIỆU LỰC.
 *
 * Web và bot cùng đi qua đây. Bảng hiệu lực = bảng đã cài, rồi (nếu công tắc
 * tự động bật) áp luật "ô dưới phần ăn theo giá thì chặn" bằng đúng hàm thuần
 * `apLuatTuDong` mà trình duyệt cũng gọi — nên hai nơi không thể lệch nhau.
 *
 * Chỉ tab Số Đá và lệnh /chanlq của bot đọc thứ này. Bộ máy hạn mức lô không
 * biết tới nó.
 */
import { getConfigValue, query, setConfigValue } from "@/lib/db";
import { dungKy } from "@/lib/slot-stats";
import type { DrawHits } from "@/lib/backtest";
import {
  apLuatTuDong, bangMacDinh, capBiChan, chuanHoaBang, khoKyToi, thongKeDa,
  type BangDa, type KetQuaLuat,
} from "@/lib/da";
import type { Region } from "@/lib/types";

const khoa = (region: Region) => `da_bang:${region}`;

export interface BangDaLuu {
  bang: BangDa;
  /** null = chưa ai lưu lần nào, đang là bảng mặc định 1 điểm mỗi ô. */
  luuLuc: string | null;
  /** Công tắc luật tự chặn. Khách xin bật sẵn, nên mặc định là bật. */
  tuDong: boolean;
}

export async function docBangDa(region: Region): Promise<BangDaLuu> {
  const raw = await getConfigValue(khoa(region));
  if (!raw) return { bang: bangMacDinh(), luuLuc: null, tuDong: true };
  try {
    const o = JSON.parse(raw) as { bang?: unknown; luuLuc?: unknown; tuDong?: unknown };
    return {
      bang: chuanHoaBang(o.bang),
      luuLuc: typeof o.luuLuc === "string" ? o.luuLuc : null,
      // Bản lưu từ trước khi có công tắc thì coi như bật — đó là ý khách.
      tuDong: o.tuDong !== false,
    };
  } catch {
    return { bang: bangMacDinh(), luuLuc: null, tuDong: true };
  }
}

export async function luuBangDa(region: Region, bang: unknown, tuDong: boolean): Promise<BangDaLuu> {
  const data: BangDaLuu = { bang: chuanHoaBang(bang), luuLuc: new Date().toISOString(), tuDong };
  await setConfigValue(khoa(region), JSON.stringify(data));
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
  luu: BangDaLuu;
  /** Bảng sau khi áp luật (hoặc chính bảng đã cài nếu công tắc tắt). */
  bang: BangDa;
  luat: KetQuaLuat | null;
  ngayCuoi: string | null;
  /** Kỳ tới, từng cặp con số cụ thể rơi vào ô đang chặn. */
  capChan: [string, string][];
  soKy: number;
}

export async function bangHieuLuc(region: Region): Promise<BangHieuLuc> {
  const [luu, draws] = await Promise.all([docBangDa(region), taiKyDaXo(region)]);
  const ky = dungKy(draws);
  const tk = thongKeDa(ky, region);
  const luat = luu.tuDong ? apLuatTuDong(luu.bang, tk) : null;
  const bang = luat ? luat.bang : luu.bang;
  const tt = khoKyToi(draws);
  return {
    luu,
    bang,
    luat,
    ngayCuoi: tt?.ngayCuoi ?? null,
    capChan: tt ? capBiChan(tt.kho, bang) : [],
    soKy: ky.length,
  };
}
