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
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "Invalid request body" }, { status: 400 });

  const upstream = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
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
      { status: upstream.status }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TOKEN_COOKIE_AT, data.accessToken, COOKIE_OPTS);
  res.cookies.set(TOKEN_COOKIE_RT, data.refreshToken, COOKIE_OPTS);
  return res;
}
