import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LoginBody {
  username?: string;
  password?: string;
}

export async function POST(req: Request) {
  let body: LoginBody = {};
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ status: "error", detail: "Invalid body" }, { status: 400 });
  }

  const expectedUser = process.env.ADMIN_USERNAME ?? "admin";
  const expectedPass = process.env.ADMIN_PASSWORD ?? "admin123";
  const secret = process.env.AUTH_SECRET ?? "lottery-default-secret-please-set-AUTH_SECRET-env-var";

  if (body.username !== expectedUser || body.password !== expectedPass) {
    return NextResponse.json(
      { status: "error", detail: "Sai tài khoản hoặc mật khẩu" },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ status: "success", user: expectedUser });
  res.cookies.set("auth_session", secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
  // Also set a non-HttpOnly cookie so client UI can show "logged in as X"
  res.cookies.set("auth_user", expectedUser, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
