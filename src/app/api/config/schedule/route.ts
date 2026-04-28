import { NextResponse } from "next/server";
import { ApiError, ensureDb, jsonError } from "@/lib/api-utils";
import { loadSchedule, recalculateAllFromHistory, saveSchedule, type Schedule } from "@/lib/limit-engine";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDb();
    const sched = await loadSchedule();
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

    await saveSchedule(cfg);
    await recalculateAllFromHistory();

    return NextResponse.json({
      status: "success",
      message: "Schedule saved. All regions recalculated.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
