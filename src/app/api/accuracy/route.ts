/**
 * GET /api/accuracy?region=xsmn&days=14&top_n=10&window=60
 *
 * For each of the last `days` historical dates that have data:
 *   1. Compute prediction using only data BEFORE that date
 *   2. Compare top_n predicted lô vs actual lô that came out that date
 *   3. Return per-date results + aggregate stats
 *
 * Deterministic — re-runs the prediction algorithm on historical data.
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { predict } from "@/lib/prediction";
import { query, getLoAppearedOnDate } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "14"), 1), 60);
    const topN = Math.min(Math.max(parseInt(url.searchParams.get("top_n") ?? "10"), 5), 50);
    const window = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "60"), 7), 180);

    // Get the most recent N+1 dates with data; need at least `window` more before
    // them to form a usable history. We require at least 7 prior dates per replay.
    const allDates = await query<{ date: string }>(
      "SELECT DISTINCT date FROM lo_daily WHERE region = ? ORDER BY date ASC",
      [region]
    );
    if (allDates.length < 8) {
      return NextResponse.json({
        status: "success",
        region,
        warning: "Cần ≥ 8 ngày data để chấm điểm độ chính xác.",
        results: [],
      });
    }

    // Pick the last `days` dates to replay (skip too-early dates without enough prior data)
    const eligible = allDates.slice(7);   // need >= 7 days before each replay target
    const replayDates = eligible.slice(-days).map((r) => r.date);

    const results: Array<{
      date: string;
      predicted: { lo_number: string; rank: number; probability: number }[];
      actual_lo: string[];
      actual_count: number;
      matched: string[];
      match_count: number;
      hit_rate: number;          // matched / topN
      precision_vs_baseline: number; // hit_rate / baseline_rate
    }> = [];

    for (const date of replayDates) {
      try {
        const pred = await predict(region, window, date);
        if (!pred.predictions || pred.predictions.length === 0) continue;

        const topPicks = pred.predictions.slice(0, topN);
        const predictedSet = new Set(topPicks.map((p) => p.lo_number));

        const actualSet = await getLoAppearedOnDate(date, region);
        const matched = [...predictedSet].filter((lo) => actualSet.has(lo)).sort();

        const baselineRate = actualSet.size / 100; // P(any random lo hits) ≈ actual_unique / 100
        const hitRate = matched.length / topN;

        results.push({
          date,
          predicted: topPicks.map((p) => ({
            lo_number: p.lo_number,
            rank: p.rank,
            probability: p.probability,
          })),
          actual_lo: [...actualSet].sort(),
          actual_count: actualSet.size,
          matched,
          match_count: matched.length,
          hit_rate: hitRate,
          precision_vs_baseline: baselineRate > 0 ? hitRate / baselineRate : 0,
        });
      } catch (e) {
        console.error(`[Accuracy] replay failed for ${date}:`, e);
      }
    }

    // Aggregate
    const totalDays = results.length;
    const avgHitRate =
      totalDays > 0 ? results.reduce((s, r) => s + r.hit_rate, 0) / totalDays : 0;
    const avgMatchCount =
      totalDays > 0 ? results.reduce((s, r) => s + r.match_count, 0) / totalDays : 0;
    const avgBaseline =
      totalDays > 0
        ? results.reduce((s, r) => s + r.actual_count / 100, 0) / totalDays
        : 0;
    const avgLift = avgBaseline > 0 ? avgHitRate / avgBaseline : 0;

    // Top-1 hit rate (rank #1 hit?)
    const top1Hits = results.filter((r) => {
      const top1 = r.predicted[0]?.lo_number;
      return top1 && r.matched.includes(top1);
    }).length;

    return NextResponse.json({
      status: "success",
      region,
      days_analyzed: totalDays,
      top_n: topN,
      window_days: window,
      summary: {
        avg_match_count: Number(avgMatchCount.toFixed(2)),
        avg_hit_rate: Number((avgHitRate * 100).toFixed(2)),
        avg_baseline_rate: Number((avgBaseline * 100).toFixed(2)),
        avg_lift: Number(avgLift.toFixed(2)),
        top1_hit_count: top1Hits,
        top1_hit_rate: totalDays > 0 ? Number(((top1Hits / totalDays) * 100).toFixed(2)) : 0,
      },
      results: results.reverse(), // newest first
    });
  } catch (err) {
    return jsonError(err);
  }
}
