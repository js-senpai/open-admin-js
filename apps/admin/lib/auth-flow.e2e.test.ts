// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";

function fakeJwt(payload: Record<string, unknown>): string {
  const part = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${part}.sig`;
}

describe("auth flow e2e-like (cookie-based tokens)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("expired token + failed refresh → clears cookies and redirects to login", async () => {
    const locationAssign = vi.fn();

    // Expired access token (exp in the past)
    const expiredJwt = fakeJwt({ exp: 10 });

    let cookieStore = `oajs_at=${encodeURIComponent(expiredJwt)}; oajs_rt=${encodeURIComponent("refresh-token")}`;
    const cookieDescriptor = { get: () => cookieStore, set: (v: string) => { cookieStore = v; } };
    vi.stubGlobal("document", Object.defineProperty({}, "cookie", cookieDescriptor));
    vi.stubGlobal("atob", (v: string) => Buffer.from(v, "base64").toString("utf-8"));
    vi.stubGlobal("window", { location: { pathname: "/dashboard", assign: locationAssign } });

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // Original request → 401 (no auth header since token is expired)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: vi.fn().mockResolvedValue({ message: "Unauthorized" })
        })
        // BFF /api/auth/refresh → fails
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: vi.fn().mockResolvedValue({ message: "Bad refresh" })
        })
        // Direct NestJS /auth/refresh fallback → also fails
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: vi.fn().mockResolvedValue({ message: "Bad refresh direct" })
        })
    );

    const { api } = await import("./api");
    await expect(api("/admin/resources/overview")).rejects.toThrow("Unauthorized");
    expect(locationAssign).toHaveBeenCalledWith("/login");
  });

  it("fresh token succeeds without redirect", async () => {
    const freshJwt = fakeJwt({ exp: 9_999_999_999 });
    const cookieStore = `oajs_at=${encodeURIComponent(freshJwt)}`;
    vi.stubGlobal("document", { cookie: cookieStore });
    vi.stubGlobal("atob", (v: string) => Buffer.from(v, "base64").toString("utf-8"));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ rows: [] })
      })
    );

    const { api } = await import("./api");
    const result = await api<{ rows: unknown[] }>("/admin/resources/posts");
    expect(result.rows).toEqual([]);
  });
});
