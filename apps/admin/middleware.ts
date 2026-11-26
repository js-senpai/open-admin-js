import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_AT, TOKEN_COOKIE_RT, isTokenFresh } from "./lib/tokens";

const PUBLIC_PREFIXES = ["/login", "/api", "/_next", "/brand", "/icons"];
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/")) || pathname === "/favicon.ico") return NextResponse.next();
  // Let the same-origin client perform a single-flight refresh; middleware must not race it.
  if (isTokenFresh(req.cookies.get(TOKEN_COOKIE_AT)?.value) || req.cookies.get(TOKEN_COOKIE_RT)?.value) return NextResponse.next();
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon\\.ico|brand/|icons/).*)"] };
