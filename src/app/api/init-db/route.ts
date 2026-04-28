/**
 * One-shot DB init — call once after deploy to ensure tables + seed data exist.
 * Idempotent: safe to call multiple times.
 *
 * Protected by CRON_SECRET to prevent random users from triggering it.
 */
import { NextResponse } from "next/server";
import { checkCronAuth, jsonError } from "@/lib/api-utils";
import { initDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!checkCronAuth(req)) {
      return NextResponse.json({ status: "unauthorized" }, { status: 401 });
    }
    await initDb();
    return NextResponse.json({ status: "success", message: "DB initialized + seeded" });
  } catch (err) {
    return jsonError(err);
  }
}
