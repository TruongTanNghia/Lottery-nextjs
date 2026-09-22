/**
 * GET/PUT /api/config/da?region=xsmn
 *
 * Bảng tiền đá: mỗi ô (cặp ngày, "i-j" với i ≤ j) một số điểm, 0 là chặn, kèm
 * công tắc `tuDong` (luật "ô dưới phần ăn theo giá thì chặn"). Riêng từng
 * miền, như mọi công tắc hạn mức khác. Chỉ tab Số Đá và bot đọc bảng này —
 * bộ máy hạn mức lô không biết tới nó.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { docBangDa, luuBangDa } from "@/lib/da-bang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    return NextResponse.json({ status: "success", region, data: await docBangDa(region) });
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
    const data = await luuBangDa(region, body.bang, body.tuDong !== false);
    return NextResponse.json({ status: "success", region, data });
  } catch (err) {
    return jsonError(err);
  }
}
