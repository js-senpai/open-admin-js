import { NextResponse } from "next/server";
import { TOKEN_COOKIE_AT, TOKEN_COOKIE_RT } from "../../../../lib/tokens";

const CLEAR_OPTS = { path: "/", maxAge: 0, sameSite: "lax" as const, httpOnly: false } as const;

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TOKEN_COOKIE_AT, "", CLEAR_OPTS);
  res.cookies.set(TOKEN_COOKIE_RT, "", CLEAR_OPTS);
  return res;
}
