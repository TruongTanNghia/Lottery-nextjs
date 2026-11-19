/**
 * Lưu cài đặt tab Dự Báo trên máy chủ, mỗi miền một bộ (khách 20/11: "vào lại
 * máy lại reset như cũ", "ô tiền em cài máy lưu giùm"). Tab đọc/ghi qua
 * /api/config/dubao; bot gửi nhóm 2 đọc đúng bộ này (cách "chon").
 */
import { getConfigValue, setConfigValue } from "./db";
import { chuanHoaCaiDatDuBao, type CaiDatDuBaoTab } from "./du-bao";
import type { Region } from "./types";

const khoa = (region: Region) => `dubao_cai_dat:${region}`;

export async function docCaiDatDuBao(region: Region): Promise<CaiDatDuBaoTab & { luuLuc: string | null }> {
  const raw = await getConfigValue(khoa(region));
  if (!raw) return { ...chuanHoaCaiDatDuBao(null), luuLuc: null };
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    return { ...chuanHoaCaiDatDuBao(j), luuLuc: typeof j.luuLuc === "string" ? j.luuLuc : null };
  } catch {
    return { ...chuanHoaCaiDatDuBao(null), luuLuc: null };
  }
}

export async function luuCaiDatDuBao(region: Region, raw: unknown, now = new Date()): Promise<CaiDatDuBaoTab & { luuLuc: string }> {
  const cd = { ...chuanHoaCaiDatDuBao(raw), luuLuc: now.toISOString() };
  await setConfigValue(khoa(region), JSON.stringify(cd));
  return cd;
}
