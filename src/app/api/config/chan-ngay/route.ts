/**
 * /api/config/chan-ngay?region=xsmn — chặn theo ngày hai bước.
 *
 *   GET  → trạng thái: công tắc tự áp, kết quả luật, lịch hiện tại, lịch sau
 *          khi áp và những ô sẽ đổi (xem trước, không ghi gì).
 *   PUT  {auto} → bật/tắt tự áp dụng mỗi kỳ (cron gọi sau khi cào kết quả).
 *   POST → áp ngay vào lịch hạn mức của miền (ghi lịch + tính lại).
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { apDungChanNgay, docBuoc, luuAuto, luuBuoc, trangThaiChanNgay } from "@/lib/chan-ngay-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    return NextResponse.json({ status: "success", region, data: await trangThaiChanNgay(region) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    const body = await req.json();
    if (!body || typeof body !== "object") throw new ApiError(400, "Body must be JSON");
    if (typeof body.auto === "boolean") await luuAuto(region, body.auto);
    if (typeof body.buoc1 === "boolean" || typeof body.buoc2 === "boolean") {
      const cu = await docBuoc(region);
      await luuBuoc(region, { buoc1: typeof body.buoc1 === "boolean" ? body.buoc1 : cu.buoc1, buoc2: typeof body.buoc2 === "boolean" ? body.buoc2 : cu.buoc2 });
    }
    return NextResponse.json({ status: "success", region, data: await trangThaiChanNgay(region) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    return NextResponse.json({ status: "success", region, data: await apDungChanNgay(region) });
  } catch (err) {
    return jsonError(err);
  }
}
