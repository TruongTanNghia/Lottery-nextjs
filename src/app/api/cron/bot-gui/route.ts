/**
 * GET /api/cron/bot-gui — một lượt của bot gửi tự động.
 *
 * Được gọi vài phút một lần trong các khung giờ (GitHub Actions, vì cron của
 * Vercel gói hiện tại chỉ chạy mỗi ngày một lần và lệch tới cả tiếng). Gọi
 * thừa không sao: ngoài khung, đang tắt hay hôm nay đã gửi thì không làm gì.
 *
 *   ?thu=1   chỉ trả lời "sẽ làm gì", không gửi, không ghi.
 *   ?luc=ISO giả lập thời điểm — để thử khung giờ; vẫn cần khoá cron.
 */
import { NextResponse } from "next/server";
import { checkCronAuth, ensureDb, jsonError } from "@/lib/api-utils";
import { chayBotGui, ghiGoCua } from "@/lib/bot-gui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    if (!checkCronAuth(req)) return NextResponse.json({ status: "error", detail: "unauthorized" }, { status: 401 });
    await ensureDb();
    const q = new URL(req.url).searchParams;
    const luc = q.get("luc");
    const now = luc && !Number.isNaN(new Date(luc).getTime()) ? new Date(luc) : new Date();
    // Ghi dấu "đã có người gõ cửa" bằng giờ THẬT (không phải giờ giả lập) — /lichgui đọc để biết bộ hẹn giờ còn chạy.
    if (q.get("thu") !== "1") await ghiGoCua();
    const kq = await chayBotGui(now, q.get("thu") === "1");
    console.log(`[bot-gui] ${kq.luc}: ${kq.ketQua.map((k) => `${k.region}=${k.viec}`).join(" ")}`);
    return NextResponse.json({ status: "success", thu: q.get("thu") === "1", ...kq });
  } catch (err) {
    return jsonError(err);
  }
}
