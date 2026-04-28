import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ status: "success" });
  res.cookies.delete("auth_session");
  res.cookies.delete("auth_user");
  return res;
}
