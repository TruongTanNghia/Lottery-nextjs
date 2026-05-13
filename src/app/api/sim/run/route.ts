/**
 * GET /api/sim/run?region=xsmn&mode=player&capital=1000000&days=30&top_n=10&strategy=smart
 *
 * Replays last `days` of history with the chosen strategy and returns the
 * full timeline + summary stats. Stateless (no DB writes).
 *
 * Modes:
 *  - player: AI bets on adaptive top-N picks
 *      strategy: aggressive | conservative | smart | skip_bad
 *  - house:  AI adjusts limits based on top-N predictions
 *      strategy: none | mild | aggressive | smart
 */
import { NextResponse } from "next/server";
import { ensureDb, jsonError, validateRegion } from "@/lib/api-utils";
import {
  simulatePlayer,
  simulateHouse,
  type PlayerStrategy,
  type HouseStrategy,
} from "@/lib/simulation";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PLAYER_STRATS = new Set(["aggressive", "conservative", "smart", "skip_bad"]);
const HOUSE_STRATS = new Set(["none", "mild", "aggressive", "smart"]);

export async function GET(req: Request) {
  try {
    await ensureDb();
    const url = new URL(req.url);
    const region = validateRegion(url.searchParams.get("region"));
    const mode = url.searchParams.get("mode") ?? "player";
    const capital = Math.max(parseInt(url.searchParams.get("capital") ?? "1000000"), 100_000);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30"), 3), 60);
    const topN = Math.min(Math.max(parseInt(url.searchParams.get("top_n") ?? "10"), 5), 20);
    const strategy = url.searchParams.get("strategy") ?? (mode === "player" ? "smart" : "smart");
    const perf = Math.min(Math.max(parseInt(url.searchParams.get("perf") ?? "30"), 3), 60);

    if (mode !== "player" && mode !== "house") {
      return NextResponse.json({ status: "error", detail: "mode must be player|house" }, { status: 400 });
    }

    if (mode === "player" && !PLAYER_STRATS.has(strategy)) {
      return NextResponse.json({ status: "error", detail: `Bad player strategy: ${strategy}` }, { status: 400 });
    }
    if (mode === "house" && !HOUSE_STRATS.has(strategy)) {
      return NextResponse.json({ status: "error", detail: `Bad house strategy: ${strategy}` }, { status: 400 });
    }

    const result =
      mode === "player"
        ? await simulatePlayer(region, capital, days, topN, strategy as PlayerStrategy, perf)
        : await simulateHouse(region, capital, days, topN, strategy as HouseStrategy, perf);

    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    return jsonError(err);
  }
}
