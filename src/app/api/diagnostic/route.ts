/**
 * GET /api/diagnostic
 *
 * Health check: counts rows per (date, region, province) so user can quickly
 * verify if data is complete (XSMN/XSMT province → 18 numbers, XSMB → 27).
 *
 * Highlights anomalies:
 *   - count != expected_per_province
 *   - province name like "Province_N" (old buggy scrape)
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError } from "@/lib/api-utils";
import { query, VALID_REGIONS } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Expected total numbers per province per day for each region
const EXPECTED_PER_PROVINCE: Record<string, number> = {
  xsmn: 18, // 1+1+1+2+7+1+3+1+1
  xsmt: 18,
  xsmb: 27, // 1+1+2+6+4+6+3+4
};

export async function GET() {
  try {
    await ensureDb();

    type Row = { date: string; region: string; province: string; n: number };
    const rows = await query<Row>(`
      SELECT date, region, province, COUNT(*) as n
      FROM lottery_results
      GROUP BY date, region, province
      ORDER BY date DESC, region, province
    `);

    // Group by region → count anomalies
    const byRegion: Record<string, {
      total_dates: number;
      total_provinces: number;
      total_rows: number;
      expected_per_province: number;
      anomalies: Array<{ date: string; province: string; actual: number; expected: number }>;
      placeholder_provinces: string[];
    }> = {};

    for (const r of VALID_REGIONS) {
      byRegion[r] = {
        total_dates: 0,
        total_provinces: 0,
        total_rows: 0,
        expected_per_province: EXPECTED_PER_PROVINCE[r] ?? 0,
        anomalies: [],
        placeholder_provinces: [],
      };
    }

    const datesPerRegion: Record<string, Set<string>> = {};
    for (const r of VALID_REGIONS) datesPerRegion[r] = new Set();

    for (const row of rows) {
      const region = row.region as keyof typeof byRegion;
      if (!byRegion[region]) continue;

      datesPerRegion[region].add(row.date);
      byRegion[region].total_provinces++;
      byRegion[region].total_rows += row.n;

      const expected = EXPECTED_PER_PROVINCE[region] ?? 0;
      if (expected && row.n !== expected) {
        byRegion[region].anomalies.push({
          date: row.date,
          province: row.province,
          actual: row.n,
          expected,
        });
      }
      if (/^Province_\d+$/.test(row.province)) {
        if (!byRegion[region].placeholder_provinces.includes(row.province)) {
          byRegion[region].placeholder_provinces.push(row.province);
        }
      }
    }

    for (const r of VALID_REGIONS) {
      byRegion[r].total_dates = datesPerRegion[r].size;
      byRegion[r].anomalies = byRegion[r].anomalies.slice(0, 50); // cap for response size
    }

    const totalAnomalies = Object.values(byRegion).reduce((s, x) => s + x.anomalies.length, 0);
    const totalPlaceholders = Object.values(byRegion).reduce(
      (s, x) => s + x.placeholder_provinces.length,
      0
    );
    const overallStatus =
      totalAnomalies === 0 && totalPlaceholders === 0 ? "healthy" : "has_issues";

    return NextResponse.json({
      status: "success",
      health: overallStatus,
      summary: {
        total_dates_xsmn: byRegion.xsmn.total_dates,
        total_dates_xsmb: byRegion.xsmb.total_dates,
        total_dates_xsmt: byRegion.xsmt.total_dates,
        total_anomalies: totalAnomalies,
        total_placeholder_provinces: totalPlaceholders,
      },
      details: byRegion,
      hint:
        overallStatus === "healthy"
          ? "✅ DB sạch, mỗi đài có đủ số."
          : "⚠️ Có data bất thường. Bấm 🔁 Quét lại từ đầu trên History page hoặc gọi POST /api/reset-data + /api/scrape/all.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
