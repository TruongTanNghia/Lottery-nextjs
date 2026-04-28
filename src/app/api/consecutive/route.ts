import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { getConsecutiveLos } from "@/lib/limit-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const data = await getConsecutiveLos(region);
    return NextResponse.json({ status: "success", region, data });
  } catch (err) {
    return jsonError(err);
  }
}
