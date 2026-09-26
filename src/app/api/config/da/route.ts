/**
 * GET/PUT /api/config/da?region=xsmn
 *
 * Bảng tiền đá: mỗi ô (cặp ngày, "i-j" với i ≤ j) một số điểm, 0 là chặn; kèm
 * công tắc `tuDong` (luật hai bước), danh sách ô luật đã đóng đinh `chanLuat`
 * và ô khách đã mở tay `moTay`. Riêng từng miền, như mọi công tắc hạn mức.
 *
 * GET chạy luật trên số liệu mới nhất trước khi trả — ô nào mới bị chặn thì
 * được lưu luôn (xem da-bang.ts). PUT lưu rồi cũng chạy luật ngay, để trình
 * duyệt nhận đúng trạng thái sau lưu chứ không phải trạng thái trước luật.
 *
 * Chỉ tab Số Đá và bot đọc bảng này — bộ máy hạn mức lô không biết tới nó.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { bangHieuLuc, luuBangDa } from "@/lib/da-bang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function traLoi(region: ReturnType<typeof validateRegion>) {
  const h = await bangHieuLuc(region);
  return NextResponse.json({
    status: "success",
    region,
    data: {
      ...h.luu,
      lyDo: h.lyDo,
      moi: h.moi,
      nguong: h.luat?.nguong ?? null,
      thangLuat: h.luat?.thang ?? null,
    },
  });
}

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    return await traLoi(region);
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    const body = await req.json();
    if (!body || typeof body !== "object" || !body.bang || typeof body.bang !== "object") {
      throw new ApiError(400, "Body must be JSON with a 'bang' object");
    }
    await luuBangDa(region, body.bang, body.tuDong !== false, body.chanLuat, body.moTay);
    return await traLoi(region);
  } catch (err) {
    return jsonError(err);
  }
}
