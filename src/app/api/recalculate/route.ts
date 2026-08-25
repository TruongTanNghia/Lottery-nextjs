import { NextResponse } from "next/server";
import { ensureDb, jsonError } from "@/lib/api-utils";
import { recalculateAllFromHistory } from "@/lib/limit-engine";
import { rebuildLoDaily, VALID_REGIONS, type Region } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = (url.searchParams.get("region") as Region | null) ?? undefined;

    // lo_daily is derived from lottery_results through the đài rule, so it is
    // rebuilt before the limits are replayed. Skipping this was how the board
    // ended up counting every đài while the price assumed two: the rule
    // changed, but the table it feeds never caught up.
    for (const r of region ? [region] : VALID_REGIONS) {
      await rebuildLoDaily(r);
    }

    await recalculateAllFromHistory(region);
    return NextResponse.json({
      status: "success",
      message: region ? `Recalculated ${region}` : "Recalculated all regions",
    });
  } catch (err) {
    return jsonError(err);
  }
}
