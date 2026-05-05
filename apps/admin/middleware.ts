import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_AT, isTokenFresh } from "./lib/tokens";

/** Paths that don't require authentication */
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/_next", "/favicon", "/brand"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const at = req.cookies.get(TOKEN_COOKIE_AT)?.value;

  if (isTokenFresh(at)) return NextResponse.next();

  // Access token missing or expired — try a server-side refresh before redirecting
  const rtCookie = req.cookies.get("oajs_rt")?.value;
  if (rtCookie) {
    const refreshUrl = new URL("/api/auth/refresh", req.url);
    const refreshRes = await fetch(refreshUrl.toString(), {
      method: "POST",
      headers: { cookie: req.headers.get("cookie") ?? "" }
    }).catch(() => null);

    if (refreshRes?.ok) {
      // Forward the new Set-Cookie from the refresh route to the browser,
      // then let the original request through (the browser will carry new cookies on next request)
      const next = NextResponse.next();
      refreshRes.headers.getSetCookie?.().forEach((c) => next.headers.append("set-cookie", c));
      return next;
    }
  }

  // No valid token — redirect to /login with the original path as `next`
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  const redirect = NextResponse.redirect(loginUrl);

  // Clear stale cookies on the way out
  redirect.cookies.set(TOKEN_COOKIE_AT, "", { path: "/", maxAge: 0 });
  redirect.cookies.set("oajs_rt", "", { path: "/", maxAge: 0 });
  return redirect;
}

export const config = {
  /**
   * Run middleware on all routes except:
   * - Static assets (_next/static, _next/image)
   * - Public brand/favicon files
   * - API routes are handled separately
   */
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|brand/|icons/).*)"]
};
