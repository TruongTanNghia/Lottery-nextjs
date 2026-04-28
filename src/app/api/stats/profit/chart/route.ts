import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { getProfitChartData } from "@/lib/profit-calculator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30"), 1), 90);

    const data = await getProfitChartData(days, region);
    return NextResponse.json({ status: "success", data });
  } catch (err) {
    return jsonError(err);
  }
}
