import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { docLich, recalculateAllFromHistory, saveSchedule } from "@/lib/limit-engine";
import { chuanHoaLich, khoaO, tenO, type OLich, type Schedule } from "@/lib/lich-han-muc";

/** Lịch đủ 24 ô, khoá dạng chuỗi như JSON vẫn gửi. */
function goi(lich: Schedule, thieu: OLich[]) {
  return {
    data: {
      base: Object.fromEntries(Object.entries(lich.base).map(([k, v]) => [String(k), v])),
      min_limit: lich.min_limit,
      consecutive: Object.fromEntries(Object.entries(lich.consecutive).map(([k, v]) => [String(k), v])),
      consecutive_reset_after: lich.consecutive_reset_after,
    },
    // Ô mà BẢN LƯU không có số: màn hình cũ vẫn vẽ 0 nhưng máy lại tính theo ô
    // khác. Giờ máy tính đúng 0; danh sách này để màn hình nói rõ chuyện đó.
    thieu: thieu.map((o) => ({ khoa: khoaO(o), ten: tenO(o) })),
  };
}

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    const { lich, thieu } = await docLich(region);
    return NextResponse.json({ status: "success", region, ...goi(lich, thieu) });
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

    if (!body.base || typeof body.base !== "object" || Object.keys(body.base).length === 0) {
      throw new ApiError(400, "base schedule is required");
    }

    // Cùng một bộ dọn với lúc đọc: đủ 24 ô, ô nào trình duyệt không gửi số thì
    // là 0. Một trang mở từ trước bản này chỉ gửi những ô nó có — và những ô nó
    // không có thì chính nó đang vẽ là 0, nên 0 là đúng thứ người bấm Lưu thấy.
    const { lich } = chuanHoaLich(body);

    // Only this region — editing one region must not touch the other two.
    await saveSchedule(region, lich);
    await recalculateAllFromHistory(region);

    return NextResponse.json({
      status: "success",
      region,
      message: `Đã lưu schedule ${region} và tính lại hạn mức.`,
      // Trả luôn bản vừa ghi, để màn hình hiện đúng thứ máy đang giữ chứ không
      // phải thứ nó tưởng là đã gửi.
      ...goi(lich, []),
    });
  } catch (err) {
    return jsonError(err);
  }
}
