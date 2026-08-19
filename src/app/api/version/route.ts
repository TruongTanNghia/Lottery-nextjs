/**
 * GET /api/version — which commit is actually running.
 *
 * Public on purpose, and deliberately boring: every other route sits behind
 * the login, so when a change did not appear on screen there was no way to
 * tell a stuck deployment from a caching browser from a real bug. This answers
 * that in one request.
 *
 * Carries nothing but the commit id and branch — no configuration, no secrets.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    env: process.env.VERCEL_ENV ?? "development",
  });
}
