import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SsoOidcService } from "./sso-oidc.service";

function configMock(values: Record<string, string | undefined>) {
  return {
    get: vi.fn((key: string) => values[key])
  };
}

describe("SsoOidcService", () => {
  it("isEnabled uses provider preset issuer", () => {
    const cfg = configMock({
      OIDC_PROVIDER: "google",
      OIDC_CLIENT_ID: "cid",
      OIDC_CLIENT_SECRET: "sec",
      OIDC_REDIRECT_URI: "http://localhost:4000/auth/sso/oidc/callback"
    });
    const auth = { loginWithOidcProfile: vi.fn() };
    const service = new SsoOidcService(cfg as never, auth as never);
    expect(service.isEnabled()).toBe(true);
  });

  it("startLogin fails without issuer or known preset", async () => {
    const cfg = configMock({
      OIDC_PROVIDER: "custom",
      OIDC_CLIENT_ID: "cid",
      OIDC_CLIENT_SECRET: "sec",
      OIDC_REDIRECT_URI: "http://localhost:4000/auth/sso/oidc/callback",
      JWT_SECRET: "jwt-secret"
    });
    const auth = { loginWithOidcProfile: vi.fn() };
    const service = new SsoOidcService(cfg as never, auth as never);
    await expect(service.startLogin("admin")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("handleCallback rejects malformed state", async () => {
    const cfg = configMock({
      OIDC_ISSUER: "https://accounts.google.com",
      OIDC_CLIENT_ID: "cid",
      OIDC_CLIENT_SECRET: "sec",
      OIDC_REDIRECT_URI: "http://localhost:4000/auth/sso/oidc/callback",
      JWT_SECRET: "jwt-secret"
    });
    const auth = { loginWithOidcProfile: vi.fn() };
    const service = new SsoOidcService(cfg as never, auth as never);
    const req = { cookies: { oajs_oidc: "x.y" }, headers: {}, ip: "127.0.0.1", path: "/auth/sso/oidc/callback" };
    await expect(service.handleCallback(req as never, "code", "bad")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("handleCallback rejects callback host mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
          token_endpoint: "https://oauth2.googleapis.com/token",
          userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo"
        })
      })
    );
    const cfg = configMock({
      OIDC_ISSUER: "https://accounts.google.com",
      OIDC_CLIENT_ID: "cid",
      OIDC_CLIENT_SECRET: "sec",
      OIDC_REDIRECT_URI: "http://localhost:4000/auth/sso/oidc/callback",
      JWT_SECRET: "jwt-secret"
    });
    const auth = { loginWithOidcProfile: vi.fn() };
    const service = new SsoOidcService(cfg as never, auth as never);
    const started = await service.startLogin("admin");
    const state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";
    const req = {
      cookies: { oajs_oidc: started.setCookie.value },
      headers: { host: "evil.example.com" },
      ip: "127.0.0.1",
      path: "/auth/sso/oidc/callback"
    };
    await expect(service.handleCallback(req as never, "code", state)).rejects.toBeInstanceOf(UnauthorizedException);
    vi.unstubAllGlobals();
  });
});

