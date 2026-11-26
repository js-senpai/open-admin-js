import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_AT, TOKEN_COOKIE_RT } from "../../../../lib/tokens";

import { API_URL, isSameOrigin } from "../../../../lib/server-api";

const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: true
} as const;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "Invalid request body" }, { status: 400 });

  const upstream = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password, realm: "admin" })
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json(
      { message: "Server error while signing in. Check that the API is running." },
      { status: 502 }
    );
  }

  const data = (await upstream.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
    message?: string;
  };

  if (!upstream.ok || !data.accessToken || !data.refreshToken) {
    return NextResponse.json(
      { message: data.message ?? "Invalid credentials" },
      { status: upstream.ok ? 502 : upstream.status }
    );
  }

  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(TOKEN_COOKIE_AT, data.accessToken, { ...COOKIE_OPTS, maxAge: 900 });
  res.cookies.set(TOKEN_COOKIE_RT, data.refreshToken, COOKIE_OPTS);
  return res;
}
