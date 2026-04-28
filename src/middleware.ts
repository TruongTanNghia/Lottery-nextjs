import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Paths that bypass auth (Vercel cron, initial setup, static assets)
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/favicon.ico",
]);

const PUBLIC_PREFIXES = ["/api/cron/", "/api/init-db", "/_next/"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const session = req.cookies.get("auth_session")?.value;
  const expected = process.env.AUTH_SECRET;

  if (!expected || !session || session !== expected) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ status: "error", detail: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
