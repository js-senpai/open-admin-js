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

  it("does not expose browser token helpers", async () => {
    const tokens = await import("./tokens");
    expect("token" in tokens).toBe(false);
    expect("refreshToken" in tokens).toBe(false);
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

  const reply = (status: number, data: unknown = {}) => new Response(JSON.stringify(data), { status });
  function browser(withLock = false) {
    const assign = vi.fn();
    vi.stubGlobal("window", {location:{pathname:"/dashboard",assign}});
    const request = vi.fn(async (_name:string, callback:()=>Promise<unknown>)=>callback());
    vi.stubGlobal("navigator", withLock ? {locks:{request}} : {});
    return {assign,request};
  }

  it("refreshes via BFF when Web Locks are unavailable", async () => {
    const {assign}=browser();
    const f=vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200,{data:"result"}));
    vi.stubGlobal("fetch",f);
    const {api}=await import("./api");
    expect(await api("/admin/resources/overview")).toEqual({data:"result"});
    expect(f.mock.calls[0]?.[0]).toContain("/api/backend/admin/resources/overview");
    expect(f.mock.calls[1]?.[0]).toBe("/api/auth/refresh");
    expect(f.mock.calls[2]?.[0]).toBe(f.mock.calls[0]?.[0]);
    expect(assign).not.toHaveBeenCalled();
  });

  it("checks the shared session inside a browser lock and refreshes when expired", async ()=>{
    const {assign,request}=browser(true);
    const f=vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200,{ok:true}));
    vi.stubGlobal("fetch",f);
    const {api}=await import("./api");
    expect(await api("/auth/me")).toEqual({ok:true});
    expect(f.mock.calls.map(c=>c[0])).toEqual(["/api/backend/auth/me","/api/backend/auth/me","/api/auth/refresh","/api/backend/auth/me"]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not rotate again if another tab already refreshed",async()=>{
    browser(true);
    const f=vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200,{ok:true}));
    vi.stubGlobal("fetch",f);
    const {api}=await import("./api");
    expect(await api("/auth/me")).toEqual({ok:true});
    expect(f.mock.calls.map(c=>c[0])).not.toContain("/api/auth/refresh");
  });

  it("coalesces parallel 401 responses into one refresh",async()=>{
    browser();
    let refreshed=false;
    const f=vi.fn(async (url:string)=>{
      if(url==="/api/auth/refresh"){await Promise.resolve();refreshed=true;return reply(200);}
      return refreshed?reply(200,{ok:true}):reply(401);
    });
    vi.stubGlobal("fetch",f);
    const {api}=await import("./api");
    await expect(Promise.all([api("/auth/me"),api("/auth/me"),api("/auth/me")])).resolves.toEqual([{ok:true},{ok:true},{ok:true}]);
    expect(f.mock.calls.filter(c=>c[0]==="/api/auth/refresh")).toHaveLength(1);
  });

  it.each([429,500,502,503])("keeps session on transient refresh status %s",async status=>{
    const {assign}=browser();
    vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(status)));
    const {api}=await import("./api");
    await expect(api("/auth/me")).rejects.toMatchObject({status:503});
    expect(assign).not.toHaveBeenCalled();
  });

  it("redirects only after confirmed denial",async()=>{
    const {assign}=browser();
    vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401)));
    const {api}=await import("./api");
    await expect(api("/auth/me")).rejects.toMatchObject({status:401});
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("does not retry endlessly when the new access token is rejected",async()=>{
    const {assign}=browser();
    const f=vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(401));
    vi.stubGlobal("fetch",f);
    const {api}=await import("./api");
    await expect(api("/auth/me")).rejects.toMatchObject({status:401});
    expect(f).toHaveBeenCalledTimes(3);
    expect(assign).toHaveBeenCalledWith("/login");
  });
});
