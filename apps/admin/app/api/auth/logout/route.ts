import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_AT, TOKEN_COOKIE_RT } from "../../../../lib/tokens";
import { API_URL, isSameOrigin } from "../../../../lib/server-api";

const CLEAR_OPTS = { path: "/", maxAge: 0, sameSite: "lax" as const, httpOnly: true, secure: process.env.NODE_ENV === "production" } as const;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const at = req.cookies.get(TOKEN_COOKIE_AT)?.value;
  if (!at) return NextResponse.json({ message: "Session required" }, { status: 401 });
  const upstream = await fetch(`${API_URL}/auth/logout`, {
    method: "POST", headers: { authorization: `Bearer ${at}` }, cache: "no-store", redirect: "error"
  }).catch(() => null);
  if (!upstream?.ok) return NextResponse.json({ message: "Logout failed" }, { status: upstream?.status ?? 502 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TOKEN_COOKIE_AT, "", CLEAR_OPTS);
  res.cookies.set(TOKEN_COOKIE_RT, "", CLEAR_OPTS);
  return res;
}
