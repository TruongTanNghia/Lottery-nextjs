import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import { loadSchedule, recalculateAllFromHistory, saveSchedule, type Schedule } from "@/lib/limit-engine";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    const sched = await loadSchedule(region);
    return NextResponse.json({
      status: "success",
      data: {
        base: Object.fromEntries(Object.entries(sched.base).map(([k, v]) => [String(k), v])),
        min_limit: sched.min_limit,
        consecutive: Object.fromEntries(
          Object.entries(sched.consecutive).map(([k, v]) => [String(k), v])
        ),
        consecutive_reset_after: sched.consecutive_reset_after,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    await ensureDb();
    const region = validateRegion(new URL(req.url).searchParams.get("region"));
    const body = await req.json();
    if (!body || typeof body !== "object") throw new ApiError(400, "Body must be JSON");

    const cfg: Schedule = {
      base: Object.fromEntries(
        Object.entries(body.base ?? {}).map(([k, v]) => [Number(k), Number(v)])
      ),
      min_limit: Number(body.min_limit ?? 10),
      consecutive: Object.fromEntries(
        Object.entries(body.consecutive ?? {}).map(([k, v]) => [Number(k), Number(v)])
      ),
      consecutive_reset_after: Number(body.consecutive_reset_after ?? 4),
    };

    if (Object.keys(cfg.base).length === 0) {
      throw new ApiError(400, "base schedule is required");
    }

    // Only this region — editing one region must not touch the other two.
    await saveSchedule(region, cfg);
    await recalculateAllFromHistory(region);

    return NextResponse.json({
      status: "success",
      region,
      message: `Đã lưu schedule ${region} và tính lại hạn mức.`,
    });
  } catch (err) {
    return jsonError(err);
  }
}
