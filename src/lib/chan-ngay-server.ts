/**
 * Chặn theo ngày — phần máy chủ: công tắc "tự áp dụng mỗi kỳ", xem trước, và
 * áp thật vào lịch hạn mức (saveSchedule + tính lại như khi khách sửa tay).
 *
 * Web (nút Áp dụng), bot và cron cùng đi qua đây.
 */
import { getConfigValue, setConfigValue } from "@/lib/db";
import { loadSchedule, recalculateAllFromHistory, saveSchedule, type Schedule } from "@/lib/limit-engine";
import { taiKyDaXo } from "@/lib/da-bang";
import { apVaoLich, luatChanNgay, type DoiLich, type KetQuaChanNgay } from "@/lib/chan-ngay";
import type { Region } from "@/lib/types";

const khoaAuto = (region: Region) => `chan_ngay_auto:${region}`;

export async function docAuto(region: Region): Promise<boolean> {
  return (await getConfigValue(khoaAuto(region))) === "1";
}

export async function luuAuto(region: Region, auto: boolean): Promise<void> {
  await setConfigValue(khoaAuto(region), auto ? "1" : "0");
}

export interface TrangThaiChanNgay {
  auto: boolean;
  kq: KetQuaChanNgay;
  lichHienTai: Schedule;
  lichSau: Schedule;
  doi: DoiLich[];
  apLuc: string | null;
}

export async function trangThaiChanNgay(region: Region): Promise<TrangThaiChanNgay> {
  const [auto, draws, lichHienTai, apLuc] = await Promise.all([
    docAuto(region),
    taiKyDaXo(region),
    loadSchedule(region),
    getConfigValue(`chan_ngay_ap_luc:${region}`),
  ]);
  const kq = luatChanNgay(draws, region);
  const { lich: lichSau, doi } = apVaoLich(lichHienTai, kq.chan);
  return { auto, kq, lichHienTai, lichSau, doi, apLuc };
}

/**
 * Áp thật: ô của bậc chặn về 0 rồi tính lại hạn mức từ lịch sử — y hệt đường
 * đi khi khách bấm Lưu trên bảng lịch. Không có ô nào đổi thì không ghi gì.
 */
export async function apDungChanNgay(region: Region): Promise<TrangThaiChanNgay> {
  const tt = await trangThaiChanNgay(region);
  if (tt.doi.length === 0) return tt;
  await saveSchedule(region, tt.lichSau);
  await recalculateAllFromHistory(region);
  const luc = new Date().toISOString();
  await setConfigValue(`chan_ngay_ap_luc:${region}`, luc);
  return { ...tt, lichHienTai: tt.lichSau, doi: [], apLuc: luc };
}
