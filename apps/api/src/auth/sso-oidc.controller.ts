import { Controller, Get, Inject, Query, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { DEFAULT_AUTH_REALM } from "@openadminjs/permissions";
import type { Request, Response } from "express";
import { SsoOidcService } from "./sso-oidc.service";

@SkipThrottle({ default: true, perUser: true })
@Controller("auth/sso/oidc")
export class SsoOidcController {
  constructor(@Inject(SsoOidcService) private readonly sso: SsoOidcService) {}

  @Get("status")
  status() {
    return { enabled: this.sso.isEnabled() };
  }

  @Get("login")
  async login(
    @Query("realm") realm: string | undefined,
    @Res({ passthrough: false }) res: Response
  ) {
    const { authorizeUrl, setCookie } = await this.sso.startLogin(realm?.trim() || DEFAULT_AUTH_REALM);
    const secure = process.env.NODE_ENV === "production";
    res.cookie(setCookie.name, setCookie.value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: setCookie.maxAge * 1000,
      path: "/"
    });
    return res.redirect(302, authorizeUrl);
  }

  @Get("callback")
  async callback(
    @Req() req: Request,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Res({ passthrough: false }) res: Response
  ) {
    const adminOrigin =
      (process.env.ADMIN_ORIGIN ?? "http://localhost:3000")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)[0] ?? "http://localhost:3000";
    try {
      const session = await this.sso.handleCallback(req, code, state);
      res.clearCookie(this.sso.clearCookieName(), { path: "/" });
      const frag = new URLSearchParams({
        sso: "1",
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
        realm: session.realm ?? "admin"
      });
      return res.redirect(302, `${adminOrigin}/login#${frag.toString()}`);
    } catch (error: unknown) {
      res.clearCookie(this.sso.clearCookieName(), { path: "/" });
      const payload =
        typeof error === "object" && error !== null && "getResponse" in error
          ? (error as { getResponse?: () => unknown }).getResponse?.()
          : null;
      const code =
        payload && typeof payload === "object" && "code" in payload
          ? String((payload as { code?: unknown }).code ?? "OIDC_CALLBACK")
          : "OIDC_CALLBACK";
      const message =
        payload && typeof payload === "object" && "message" in payload
          ? String((payload as { message?: unknown }).message ?? "Single Sign-On failed")
          : "Single Sign-On failed";
      const params = new URLSearchParams({
        sso_error: "1",
        sso_code: code,
        sso_message: message.slice(0, 180)
      });
      return res.redirect(302, `${adminOrigin}/login?${params.toString()}`);
    }
  }
}
