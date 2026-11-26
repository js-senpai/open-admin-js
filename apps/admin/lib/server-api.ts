import type { NextRequest } from "next/server";
export const API_URL = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const expected = (process.env.ADMIN_ORIGIN || req.nextUrl.origin).split(",").map(value => value.trim());
  return Boolean(origin && expected.includes(origin));
}
