import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { APPEARANCE_WINDOW_DAYS, getLimitSummary } from "@/lib/limit-engine";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ lo: string }> }
) {
  try {
    await ensureDb();
    const { lo } = await ctx.params;
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));

    if (!/^\d{2}$/.test(lo)) {
      throw new ApiError(400, "Lô number must be 2 digits (00-99)");
    }

    // Cùng một nguồn với bảng 100 lô. Bản trước tự tính lại ở đây theo NGÀY
    // HÔM NAY của máy chủ (bảng thì theo kỳ mới nhất) và bỏ qua phần chia đôi,
    // nên bấm vào một ô trên bảng lại thấy một hạn mức khác với chính ô đó.
    const item = (await getLimitSummary(region)).find((l) => l.lo_number === lo);
    if (!item) throw new ApiError(404, `Lô ${lo} not found for region ${region}`);

    const history = await query<{ date: string; count: number }>(
      `SELECT date, count FROM lo_daily WHERE lo_number = ? AND region = ?
       ORDER BY date DESC LIMIT 30`,
      [lo, region]
    );

    return NextResponse.json({
      status: "success",
      region,
      data: {
        ...item,
        appearance_window_days: APPEARANCE_WINDOW_DAYS,
        history,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
