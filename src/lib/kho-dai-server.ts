/**
 * Kho dài 3 năm (public/kho-dai/<miền>.json) cho phía MÁY CHỦ — bot gửi số dự
 * báo theo thứ phải tính y như tab Dự Báo, mà tab dùng kho dài gộp kho đang
 * chạy. Trình duyệt tải file qua /kho-dai/…; máy chủ không đọc được thư mục
 * public một cách chắc chắn trên Vercel, nên nhúng thẳng vào mã (≈ 520 KB cả ba).
 */
import xsmn from "../../public/kho-dai/xsmn.json";
import xsmt from "../../public/kho-dai/xsmt.json";
import xsmb from "../../public/kho-dai/xsmb.json";
import type { DrawHits } from "./backtest";
import { docKhoDai, gopKho, type KhoDai } from "./tuan";
import type { Region } from "./types";

const KHO: Record<Region, KhoDai> = { xsmn: xsmn as unknown as KhoDai, xsmt: xsmt as unknown as KhoDai, xsmb: xsmb as unknown as KhoDai };
const daDoc = new Map<Region, DrawHits[]>();

/** Kho dài của miền, đọc một lần mỗi tiến trình. */
export function khoDai(region: Region): DrawHits[] {
  let d = daDoc.get(region);
  if (!d) daDoc.set(region, (d = docKhoDai(KHO[region])));
  return d;
}

/** Kho dài gộp kho đang chạy (trùng ngày lấy kho đang chạy) — đúng như tab Dự Báo. */
export function gopVoiKhoDai(region: Region, moi: DrawHits[]): DrawHits[] {
  return gopKho(khoDai(region), moi);
}
