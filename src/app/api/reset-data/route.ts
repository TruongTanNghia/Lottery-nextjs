/**
 * POST /api/reset-data
 * Wipes lottery_results, lo_daily, scraped_dates, and resets lo_status to defaults.
 * Use this if data is corrupted (e.g., duplicate rows from old scrape bug).
 *
 * Auth: requires CRON_SECRET to prevent accidental wipe.
 *
 * After reset, run /api/scrape/all?days=N to re-populate.
 */
import { NextResponse } from "next/server";
import { checkCronAuth, ensureDb, jsonError } from "@/lib/api-utils";
import { exec } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!checkCronAuth(req)) {
      return NextResponse.json({ status: "unauthorized" }, { status: 401 });
    }
    await ensureDb();

    const r1 = await exec("DELETE FROM lottery_results");
    const r2 = await exec("DELETE FROM lo_daily");
    const r3 = await exec("DELETE FROM scraped_dates");
    await exec(
      "UPDATE lo_status SET last_appeared_date = NULL, days_since_last = 0, consecutive_days = 0, current_limit = 200"
    );

    return NextResponse.json({
      status: "success",
      message: "All scrape data wiped. Now POST /api/scrape/all?days=30 to repopulate.",
      deleted: {
        lottery_results: r1.rowsAffected,
        lo_daily: r2.rowsAffected,
        scraped_dates: r3.rowsAffected,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
