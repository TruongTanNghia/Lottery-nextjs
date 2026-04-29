/**
 * Weekly cleanup — drops data older than 30 days.
 * Vercel Cron schedule: Sunday 20:00 UTC = Monday 03:00 VN.
 */
import { NextResponse } from "next/server";
import { checkCronAuth, ensureDb, jsonError } from "@/lib/api-utils";
import { cleanupOldData } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!checkCronAuth(req)) {
      return NextResponse.json({ status: "unauthorized" }, { status: 401 });
    }
    await ensureDb();

    // Rolling window: always keep exactly the most recent 45 days
    const deleted = await cleanupOldData(45);
    return NextResponse.json({
      status: "success",
      deleted_records: deleted,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(err);
  }
}
