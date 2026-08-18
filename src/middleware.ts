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

// The Telegram webhook has no browser cookie to present. It is not open,
// though: it checks Telegram's secret header and a chat-id whitelist itself.
const PUBLIC_PREFIXES = ["/api/cron/", "/api/init-db", "/api/telegram/", "/_next/"];

// Images in /public carry nothing secret, and gating them breaks things that
// cannot log in: the favicon on the login page itself, and link-preview
// crawlers (Telegram, Zalo) fetching og:image — those got a 307 to /login and
// silently rendered no thumbnail.
const PUBLIC_FILE = /\.(?:png|jpe?g|gif|svg|webp|ico|avif)$/i;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (PUBLIC_FILE.test(pathname)) return NextResponse.next();

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
