/**
 * GET/PUT /api/bot-gui/nhom2 — bảng điều khiển bot gửi NHÓM 2 trên web (khách 21/11: "anh gõ chat mà chưa
 * được, em tự bật luôn đi"). Người đã đăng nhập web bấm chọn nhóm / bật / tắt, khỏi gõ lệnh Telegram.
 *
 *   GET            → tình trạng nhóm 2 (nhóm, từng miền bật/tắt + giờ, hôm nay đã gửi chưa).
 *   GET ?ds=1      → các nhóm mà tài khoản gửi (nick phụ) đang ở, để chọn.
 *   PUT { nhom: { id, ten } }   → chọn nhóm (phải là nhóm nick phụ đang ở).
 *   PUT { bat: true | false }   → bật / tắt cả 3 miền (bật thì phải chọn nhóm trước).
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError } from "@/lib/api-utils";
import { docBotGui, docGoCua, luuBotGui } from "@/lib/bot-gui";
import { daGuiHomNay, gioVN, tenNoiDungGui } from "@/lib/bot-gui-thuan";
import { coTaiKhoanGui, dsNhomCuaTaiKhoan } from "@/lib/tele-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MIEN = ["xsmn", "xsmt", "xsmb"] as const;

async function tinhTrang() {
  const [cfg, goCua] = await Promise.all([docBotGui(2), docGoCua()]);
  const now = new Date();
  return {
    nhom: cfg.nhom,
    tenNhom: cfg.tenNhom,
    noiDung: tenNoiDungGui(cfg),
    coTaiKhoan: coTaiKhoanGui(),
    goCua,
    mien: Object.fromEntries(
      MIEN.map((r) => [r, { bat: cfg.mien[r].bat, tu: cfg.mien[r].tu, den: cfg.mien[r].den, daGui: daGuiHomNay(now, cfg.daGui[r]) ? gioVN(new Date(cfg.daGui[r]!)).gio : null }])
    ),
  };
}

export async function GET(req: Request) {
  try {
    await ensureDb();
    if (new URL(req.url).searchParams.get("ds") === "1") {
      const ds = await dsNhomCuaTaiKhoan();
      return NextResponse.json({ status: ds.ok ? "success" : "error", ...ds });
    }
    return NextResponse.json({ status: "success", data: await tinhTrang() });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await ensureDb();
    const body = (await req.json().catch(() => null)) as { nhom?: { id?: unknown; ten?: unknown }; bat?: unknown } | null;
    if (!body || typeof body !== "object") throw new ApiError(400, "Body must be a JSON object");
    const cfg = await docBotGui(2);
    if (body.nhom) {
      const id = Number(body.nhom.id);
      if (!Number.isInteger(id) || id >= 0) throw new ApiError(400, "id nhóm không hợp lệ");
      let ten = typeof body.nhom.ten === "string" ? body.nhom.ten.slice(0, 120) : null;
      // Có tài khoản gửi thì chỉ cho chọn nhóm mà nick phụ ĐANG Ở — gửi vào nhóm khác cũng không được.
      if (coTaiKhoanGui()) {
        const ds = await dsNhomCuaTaiKhoan();
        if (!ds.ok) throw new ApiError(502, `Không đọc được danh sách nhóm của tài khoản gửi: ${ds.loi}`);
        const thay = ds.nhom.find((d) => d.id === id);
        if (!thay) throw new ApiError(400, "Tài khoản gửi không ở trong nhóm này");
        ten = thay.ten;
      }
      cfg.nhom = id;
      cfg.tenNhom = ten;
    }
    if (typeof body.bat === "boolean") {
      if (body.bat && cfg.nhom == null) throw new ApiError(400, "Chưa chọn nhóm — chọn nhóm trước rồi mới bật");
      for (const r of MIEN) cfg.mien[r].bat = body.bat;
    }
    await luuBotGui(cfg, 2);
    return NextResponse.json({ status: "success", data: await tinhTrang() });
  } catch (err) {
    return jsonError(err);
  }
}
