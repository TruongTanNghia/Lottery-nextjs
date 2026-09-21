/**
 * GET/PUT /api/config/da?region=xsmn
 *
 * Bảng tiền đá: mỗi ô (cặp ngày, "i-j" với i ≤ j) một số điểm, 0 là chặn.
 * Riêng từng miền, như mọi công tắc hạn mức khác. Chỉ tab Số Đá đọc bảng này —
 * bộ máy hạn mức lô không biết tới nó.
 */
import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { getConfigValue, setConfigValue } from "@/lib/db";
import { bangMacDinh, chuanHoaBang, type BangDa } from "@/lib/da";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const khoa = (region: string) => `da_bang:${region}`;

interface BangDaLuu {
  bang: BangDa;
  /** null = chưa ai lưu lần nào, đang là bảng mặc định 1 điểm mỗi ô. */
  luuLuc: string | null;
}

async function doc(region: string): Promise<BangDaLuu> {
  const raw = await getConfigValue(khoa(region));
  if (!raw) return { bang: bangMacDinh(), luuLuc: null };
  try {
    const o = JSON.parse(raw) as { bang?: unknown; luuLuc?: unknown };
    return { bang: chuanHoaBang(o.bang), luuLuc: typeof o.luuLuc === "string" ? o.luuLuc : null };
  } catch {
    return { bang: bangMacDinh(), luuLuc: null };
  }
}

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    return NextResponse.json({ status: "success", region, data: await doc(region) });
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
    const data: BangDaLuu = { bang: chuanHoaBang(body.bang), luuLuc: new Date().toISOString() };
    await setConfigValue(khoa(region), JSON.stringify(data));
    return NextResponse.json({ status: "success", region, data });
  } catch (err) {
    return jsonError(err);
  }
}
