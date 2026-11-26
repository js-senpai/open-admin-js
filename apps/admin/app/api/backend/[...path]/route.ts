import { NextRequest, NextResponse } from "next/server";
import { API_URL, isSameOrigin } from "../../../../lib/server-api";
import { TOKEN_COOKIE_AT } from "../../../../lib/tokens";

type RouteContext = { params: Promise<{ path: string[] }> };
async function proxy(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  if (!path.length || path.some(part => !/^[A-Za-z0-9_.@-]+$/.test(part) || part === "." || part === "..")) return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  const route = "/" + path.map(encodeURIComponent).join("/");
  if (!(route.startsWith("/admin/") || route.startsWith("/jobs/") || route === "/auth/me" || route === "/auth/me/realms")) return NextResponse.json({ message: "Route not allowed" }, { status: 404 });
  if (req.method !== "GET" && req.method !== "HEAD" && !isSameOrigin(req)) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const token = req.cookies.get(TOKEN_COOKIE_AT)?.value;
  if (!token) return NextResponse.json({ message: "Session required" }, { status: 401 });
  const headers = new Headers({ authorization: `Bearer ${token}` });
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const init: RequestInit = { method: req.method, headers, cache: "no-store", redirect: "error" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();
  const response = await fetch(API_URL + route + req.nextUrl.search, init).catch(() => null);
  if (!response) return NextResponse.json({ message: "API unavailable" }, { status: 502 });
  const outgoing = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
  for (const name of ["content-type", "content-disposition", "retry-after"]) {
    const value = response.headers.get(name);
    if (value) outgoing.set(name, value);
  }
  return new NextResponse(response.body, { status: response.status, headers: outgoing });
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
