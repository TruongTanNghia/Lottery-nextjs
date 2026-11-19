/**
 * GET/PUT /api/config/dubao?region=xsmn
 *
 * Cài đặt tab Dự Báo của một miền: ô đã chọn (mô hình × thứ), số con, điểm,
 * tiền tố chuỗi copy, lọc "lấy con được từ k mô hình". Lưu trên máy chủ để vào
 * lại không mất (khách 20/11), và để bot gửi nhóm 2 gửi đúng ô khách chọn.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { docCaiDatDuBao, luuCaiDatDuBao } from "@/lib/du-bao-luu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    return NextResponse.json({ status: "success", region, data: await docCaiDatDuBao(region) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new ApiError(400, "Body must be a JSON object");
    return NextResponse.json({ status: "success", region, data: await luuCaiDatDuBao(region, body) });
  } catch (err) {
    return jsonError(err);
  }
}
