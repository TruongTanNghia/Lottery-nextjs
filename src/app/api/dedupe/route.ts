/**
 * POST /api/dedupe
 *
 * Detects (date, region) pairs in lottery_results where the SAME
 * (province, prize_type, number) tuple appears more than once (= scrape
 * was run multiple times for that date). For each such pair:
 *   1. Delete duplicate rows in lottery_results — keep only one row per
 *      unique tuple (the row with the smallest id).
 *   2. Rebuild lo_daily for that (date, region) from the deduplicated
 *      lottery_results: count = number of rows with that lo_number.
 *
 * Then runs incremental recalc on the cleaned regions so lo_status reflects
 * the corrected data.
 *
 * Auth: requires CRON_SECRET to prevent accidental destructive use.
 */
import { NextResponse } from "next/server";
import { checkCronAuth, ensureDb, jsonError } from "@/lib/api-utils";
import { exec, query, type Region, VALID_REGIONS } from "@/lib/db";
import { updateAllLoStatus } from "@/lib/limit-engine";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!checkCronAuth(req)) {
      return NextResponse.json({ status: "unauthorized" }, { status: 401 });
    }
    await ensureDb();

    // Find (date, region) pairs that have duplicate rows
    const dups = await query<{
      date: string;
      region: string;
      total_rows: number;
      unique_rows: number;
    }>(`
      SELECT date, region,
             COUNT(*) as total_rows,
             COUNT(DISTINCT province || '|' || prize_type || '|' || number) as unique_rows
      FROM lottery_results
      GROUP BY date, region
      HAVING total_rows > unique_rows
      ORDER BY date DESC
    `);

    const cleaned: Array<{
      date: string;
      region: Region;
      removed_rows: number;
      kept_rows: number;
      duplicate_factor: number;
    }> = [];

    for (const d of dups) {
      const region = d.region as Region;

      // 1) Delete duplicate rows: keep MIN(id) per (province, prize_type, number)
      const delRes = await exec(
        `
          DELETE FROM lottery_results
          WHERE date = ? AND region = ?
            AND id NOT IN (
              SELECT MIN(id) FROM lottery_results
              WHERE date = ? AND region = ?
              GROUP BY province, prize_type, number
            )
        `,
        [d.date, region, d.date, region]
      );

      // 2) Rebuild lo_daily for this (date, region)
      await exec("DELETE FROM lo_daily WHERE date = ? AND region = ?", [d.date, region]);
      await exec(
        `
          INSERT INTO lo_daily (date, lo_number, count, region)
          SELECT date, lo_number, COUNT(*), region
          FROM lottery_results
          WHERE date = ? AND region = ?
          GROUP BY date, lo_number, region
        `,
        [d.date, region]
      );

      cleaned.push({
        date: d.date,
        region,
        removed_rows: delRes.rowsAffected,
        kept_rows: d.unique_rows,
        duplicate_factor: Number((d.total_rows / d.unique_rows).toFixed(2)),
      });
    }

    // Recalc lo_status for affected regions (incremental — last 5 dates each)
    const affectedRegions = new Set(cleaned.map((c) => c.region));
    for (const region of affectedRegions) {
      const recent = await query<{ date: string }>(
        "SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date DESC LIMIT 5",
        [region]
      );
      for (const { date } of recent.reverse()) {
        await updateAllLoStatus(date, region);
      }
    }

    // Per-region tally for response
    const byRegion: Record<string, { dates_cleaned: number; total_rows_removed: number }> = {};
    for (const r of VALID_REGIONS) byRegion[r] = { dates_cleaned: 0, total_rows_removed: 0 };
    for (const c of cleaned) {
      byRegion[c.region].dates_cleaned++;
      byRegion[c.region].total_rows_removed += c.removed_rows;
    }

    return NextResponse.json({
      status: "success",
      message:
        cleaned.length === 0
          ? "Không tìm thấy duplicate nào — DB đã sạch."
          : `Đã dedupe ${cleaned.length} (date, region) bị lặp.`,
      duplicates_found: cleaned.length,
      total_rows_removed: cleaned.reduce((s, c) => s + c.removed_rows, 0),
      by_region: byRegion,
      details: cleaned,
    });
  } catch (err) {
    return jsonError(err);
  }
}
