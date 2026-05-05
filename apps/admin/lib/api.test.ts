import { afterEach, describe, expect, it, vi } from "vitest";

// Helper: encode a JWT-like payload for testing
function fakeJwt(payload: Record<string, unknown>): string {
  const part = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${part}.sig`;
}

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("token returns null without document (SSR context)", async () => {
    const { token } = await import("./tokens");
    expect(token()).toBeNull();
  });

  it("token reads from document.cookie in browser", async () => {
    const cookieValue = `oajs_at=${encodeURIComponent("my-access-token")}`;
    vi.stubGlobal("document", { cookie: cookieValue });
    const { token } = await import("./tokens");
    expect(token()).toBe("my-access-token");
  });

  it("api parses JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true })
      })
    );
    const { api } = await import("./api");
    const body = await api<{ ok: boolean }>("/test");
    expect(body.ok).toBe(true);
  });

  it("api throws with message on error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Bad",
        json: vi.fn().mockResolvedValue({ message: "Nope" })
      })
    );
    const { api } = await import("./api");
    await expect(api("/x")).rejects.toThrow("Nope");
  });

  it("isAccessTokenFresh returns false for malformed token", async () => {
    const { isTokenFresh } = await import("./tokens");
    expect(isTokenFresh("bad")).toBe(false);
  });

  it("isAccessTokenFresh returns true for a far-future token", async () => {
    vi.stubGlobal("atob", (v: string) => Buffer.from(v, "base64").toString("utf-8"));
    const { isTokenFresh } = await import("./tokens");
    const jwt = fakeJwt({ exp: 9_999_999_999 });
    expect(isTokenFresh(jwt)).toBe(true);
  });

  it("api refreshes token on 401 via BFF /api/auth/refresh route", async () => {
    const locationAssign = vi.fn();
    const freshJwt = fakeJwt({ exp: 9_999_999_999 });

    // Simulate document.cookie returning a fresh access token
    let cookieStore = `oajs_at=${encodeURIComponent(freshJwt)}; oajs_rt=${encodeURIComponent("rt-token")}`;
    const cookieDescriptor = { get: () => cookieStore, set: (v: string) => { cookieStore = v; } };
    vi.stubGlobal("document", Object.defineProperty({}, "cookie", cookieDescriptor));
    vi.stubGlobal("atob", (v: string) => Buffer.from(v, "base64").toString("utf-8"));
    vi.stubGlobal("window", {
      location: { pathname: "/dashboard", assign: locationAssign }
    });

    const fetchMock = vi
      .fn()
      // First call: original request → 401
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized", json: vi.fn().mockResolvedValue({ message: "Unauthorized" }) })
      // Second call: BFF /api/auth/refresh → ok
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ ok: true }) })
      // Third call: retry original → 200
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ data: "result" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("./api");
    const response = await api<{ data: string }>("/admin/resources/overview");
    expect(response.data).toBe("result");
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it("api clears cookies and redirects to login when all refresh attempts fail", async () => {
    const locationAssign = vi.fn();
    const freshJwt = fakeJwt({ exp: 9_999_999_999 });
    let cookieStore = `oajs_at=${encodeURIComponent(freshJwt)}; oajs_rt=${encodeURIComponent("rt")}`;
    const cookieDescriptor = { get: () => cookieStore, set: (v: string) => { cookieStore = v; } };
    vi.stubGlobal("document", Object.defineProperty({}, "cookie", cookieDescriptor));
    vi.stubGlobal("atob", (v: string) => Buffer.from(v, "base64").toString("utf-8"));
    vi.stubGlobal("window", { location: { pathname: "/dashboard", assign: locationAssign } });

    const fetchMock = vi
      .fn()
      // Original request → 401
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized", json: vi.fn().mockResolvedValue({ message: "Unauthorized" }) })
      // BFF /api/auth/refresh → fails
      .mockResolvedValueOnce({ ok: false, status: 401, json: vi.fn().mockResolvedValue({ message: "No refresh" }) })
      // Direct NestJS /auth/refresh fallback → also fails
      .mockResolvedValueOnce({ ok: false, status: 401, json: vi.fn().mockResolvedValue({ message: "No refresh direct" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("./api");
    await expect(api("/admin/resources/overview")).rejects.toThrow("Unauthorized");
    expect(locationAssign).toHaveBeenCalledWith("/login");
  });
});
