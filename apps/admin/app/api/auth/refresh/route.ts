import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_AT, TOKEN_COOKIE_RT } from "../../../../lib/tokens";

const API_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:4000";

const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: false
} as const;

export async function POST(req: NextRequest) {
  const rt = req.cookies.get(TOKEN_COOKIE_RT)?.value;
  if (!rt) return NextResponse.json({ message: "No refresh token" }, { status: 401 });

  const upstream = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: rt, realm: "admin" })
  }).catch(() => null);

  if (!upstream) return NextResponse.json({ message: "API unavailable" }, { status: 502 });

  const data = (await upstream.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
    message?: string;
  };

  if (!upstream.ok || !data.accessToken || !data.refreshToken) {
    const res = NextResponse.json({ message: data.message ?? "Refresh failed" }, { status: 401 });
    res.cookies.set(TOKEN_COOKIE_AT, "", { ...COOKIE_OPTS, maxAge: 0 });
    res.cookies.set(TOKEN_COOKIE_RT, "", { ...COOKIE_OPTS, maxAge: 0 });
    return res;
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TOKEN_COOKIE_AT, data.accessToken, COOKIE_OPTS);
  res.cookies.set(TOKEN_COOKIE_RT, data.refreshToken, COOKIE_OPTS);
  return res;
}
