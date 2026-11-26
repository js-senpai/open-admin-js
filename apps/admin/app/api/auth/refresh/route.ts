import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_AT, TOKEN_COOKIE_RT } from "../../../../lib/tokens";

import { API_URL, isSameOrigin } from "../../../../lib/server-api";

const noStore = { "cache-control": "no-store" };
const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: true
} as const;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: "Invalid origin" }, { status: 403, headers: noStore });
  const rt = req.cookies.get(TOKEN_COOKIE_RT)?.value;
  if (!rt) return NextResponse.json({ message: "No refresh token" }, { status: 401, headers: noStore });

  const upstream = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: rt, realm: "admin" })
  }).catch(() => null);

  if (!upstream) return NextResponse.json({ message: "API unavailable" }, { status: 502, headers: noStore });

  const data = (await upstream.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
    message?: string;
  };

  if (upstream.status === 401 || upstream.status === 403) {
    const res = NextResponse.json({ message: "Session expired" }, { status: 401, headers: noStore });
    res.cookies.set(TOKEN_COOKIE_AT, "", { ...COOKIE_OPTS, maxAge: 0 });
    res.cookies.set(TOKEN_COOKIE_RT, "", { ...COOKIE_OPTS, maxAge: 0 });
    return res;
  }

  if (!upstream.ok || typeof data.accessToken !== "string" || !data.accessToken || typeof data.refreshToken !== "string" || !data.refreshToken) {
    const headers = new Headers(noStore);
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) headers.set("retry-after", retryAfter);
    return NextResponse.json({ message: "Session refresh temporarily unavailable" }, { status: upstream.status === 429 ? 429 : 502, headers });
  }
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(TOKEN_COOKIE_AT, data.accessToken, { ...COOKIE_OPTS, maxAge: 900 });
  res.cookies.set(TOKEN_COOKIE_RT, data.refreshToken, COOKIE_OPTS);
  return res;
}
