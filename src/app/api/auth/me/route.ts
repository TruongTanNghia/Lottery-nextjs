import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Read auth_session cookie via header parsing (works even if cookie is HttpOnly)
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    })
  );

  const session = cookies.auth_session;
  const user = cookies.auth_user;
  const expected = process.env.AUTH_SECRET;

  if (!expected || !session || session !== expected) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, user: user ?? "admin" });
}
