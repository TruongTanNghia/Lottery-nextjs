import { NextResponse } from "next/server";
import { ensureDb, jsonError } from "@/lib/api-utils";
import { cleanupOldData } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30"), 7), 365);
    const deleted = await cleanupOldData(days);
    return NextResponse.json({ status: "success", deleted_records: deleted });
  } catch (err) {
    return jsonError(err);
  }
}
