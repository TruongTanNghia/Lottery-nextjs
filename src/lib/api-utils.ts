/**
 * Shared utilities for API route handlers.
 */
import { NextResponse } from "next/server";
import { initDb, VALID_REGIONS, type Region } from "./db";

let _dbReady = false;
export async function ensureDb(): Promise<void> {
  if (_dbReady) return;
  await initDb();
  _dbReady = true;
}

export function validateRegion(region: string | null | undefined): Region {
  const r = (region ?? "xsmn").toLowerCase().trim();
  if (!VALID_REGIONS.includes(r as Region)) {
    throw new ApiError(400, `Invalid region '${r}'. Must be one of: ${VALID_REGIONS.join(", ")}`);
  }
  return r as Region;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function jsonError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ status: "error", detail: err.message }, { status: err.status });
  }
  console.error("[API] unexpected error:", err);
  const msg = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ status: "error", detail: msg }, { status: 500 });
}

export function checkCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // require secret in production
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export const REGION_LABELS: Record<Region, string> = {
  xsmn: "Xổ Số Miền Nam",
  xsmb: "Xổ Số Miền Bắc",
  xsmt: "Xổ Số Miền Trung",
};
