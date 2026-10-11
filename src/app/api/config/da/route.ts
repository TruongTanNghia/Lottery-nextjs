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
 *
 * `&pa=2` là bảng riêng của tab Số Đá 2 (phương án 2). Không có `pa` = phương
 * án 1, đúng như trước.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { bangHieuLuc, chuanHoaPa, luuBangDa, type PhuongAn } from "@/lib/da-bang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function traLoi(region: ReturnType<typeof validateRegion>, pa: PhuongAn) {
  const h = await bangHieuLuc(region, pa);
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
    const u = new URL(req.url);
    const region = validateRegion(u.searchParams.get("region"));
    return await traLoi(region, chuanHoaPa(u.searchParams.get("pa")));
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await ensureDb();
    const u = new URL(req.url);
    const region = validateRegion(u.searchParams.get("region"));
    const pa = chuanHoaPa(u.searchParams.get("pa"));
    const body = await req.json();
    if (!body || typeof body !== "object" || !body.bang || typeof body.bang !== "object") {
      throw new ApiError(400, "Body must be JSON with a 'bang' object");
    }
    await luuBangDa(region, body.bang, body.tuDong !== false, body.chanLuat, body.moTay, body.rutGon === true, body.nguongGon, { buoc1: body.buoc1, buoc2: body.buoc2 }, pa);
    return await traLoi(region, pa);
  } catch (err) {
    return jsonError(err);
  }
}
