import { NextResponse } from "next/server";
import { ensureDb, jsonError } from "@/lib/api-utils";
import { recalculateAllFromHistory } from "@/lib/limit-engine";
import type { Region } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = (url.searchParams.get("region") as Region | null) ?? undefined;
    await recalculateAllFromHistory(region);
    return NextResponse.json({
      status: "success",
      message: region ? `Recalculated ${region}` : "Recalculated all regions",
    });
  } catch (err) {
    return jsonError(err);
  }
}
