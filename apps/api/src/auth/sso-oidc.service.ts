import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { DEFAULT_AUTH_REALM } from "@openadminjs/permissions";
import { AuthService } from "./auth.service";

const COOKIE = "oajs_oidc";

type OidcDiscovery = {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
};

type Sealed = { v: string; s: string; r: string; exp: number };
type OidcPreset = { issuer: string; scopes: string };

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sealCookie(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function unsealCookie<T>(raw: string, secret: string): T | null {
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const body = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  try {
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const pad = parts[1].length % 4 === 0 ? "" : "=".repeat(4 - (parts[1].length % 4));
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad;
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

@Injectable()
export class SsoOidcService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuthService) private readonly auth: AuthService
  ) {}

  isEnabled(): boolean {
    const issuer = this.resolveIssuer();
    const id = this.config.get<string>("OIDC_CLIENT_ID")?.trim();
    const secret = this.config.get<string>("OIDC_CLIENT_SECRET")?.trim();
    const redirect = this.config.get<string>("OIDC_REDIRECT_URI")?.trim();
    return Boolean(issuer && id && secret && redirect);
  }

  private cookieSecret(): string {
    const s = this.config.get<string>("JWT_SECRET")?.trim() ?? process.env.JWT_SECRET?.trim();
    if (!s) throw new BadRequestException({ message: "JWT_SECRET required for OIDC state cookie", code: "OIDC_CONFIG" });
    return s;
  }

  private async discover(issuerRaw: string): Promise<OidcDiscovery> {
    const issuer = issuerRaw.replace(/\/$/, "");
    if (process.env.NODE_ENV === "production" && !issuer.startsWith("https://")) {
      throw new BadRequestException({ message: "OIDC_ISSUER must use https in production", code: "OIDC_CONFIG" });
    }
    const r = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!r.ok) {
      throw new BadRequestException({ message: "OpenID Connect discovery failed", code: "OIDC_DISCOVERY" });
    }
    return (await r.json()) as OidcDiscovery;
  }

  private resolvePreset(): OidcPreset | null {
    const provider = this.config.get<string>("OIDC_PROVIDER")?.trim().toLowerCase();
    if (!provider) return null;
    const presets: Record<string, OidcPreset> = {
      google: { issuer: "https://accounts.google.com", scopes: "openid email profile" },
      microsoft: { issuer: "https://login.microsoftonline.com/common/v2.0", scopes: "openid email profile" },
      auth0: { issuer: "", scopes: "openid email profile" },
      okta: { issuer: "", scopes: "openid email profile" }
    };
    return presets[provider] ?? null;
  }

  private resolveIssuer(): string | undefined {
    const explicit = this.config.get<string>("OIDC_ISSUER")?.trim();
    if (explicit) return explicit;
    const preset = this.resolvePreset();
    if (preset?.issuer) return preset.issuer;
    return undefined;
  }

  async startLogin(realm: string): Promise<{ authorizeUrl: string; setCookie: { name: string; value: string; maxAge: number } }> {
    if (!this.isEnabled()) {
      throw new BadRequestException({ message: "OIDC is not configured (set OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI)", code: "OIDC_DISABLED" });
    }
    const issuer = this.resolveIssuer();
    const clientId = this.config.get<string>("OIDC_CLIENT_ID")!.trim();
    const redirectUri = this.config.get<string>("OIDC_REDIRECT_URI")!.trim();
    if (!issuer) {
      throw new BadRequestException({ message: "OIDC_ISSUER is required (or use OIDC_PROVIDER preset)", code: "OIDC_CONFIG" });
    }
    const scopes =
      this.config.get<string>("OIDC_SCOPES")?.trim() ??
      this.resolvePreset()?.scopes ??
      "openid email profile";

    const d = await this.discover(issuer);
    const codeVerifier = base64url(randomBytes(32));
    const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
    const state = base64url(randomBytes(24));
    const sealed: Sealed = { v: codeVerifier, s: state, r: realm || DEFAULT_AUTH_REALM, exp: Date.now() + 600_000 };
    const cookie = sealCookie(sealed, this.cookieSecret());

    const url = new URL(d.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", scopes);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return {
      authorizeUrl: url.toString(),
      setCookie: { name: COOKIE, value: cookie, maxAge: 600 }
    };
  }

  async handleCallback(req: Request, code: string | undefined, state: string | undefined) {
    if (!this.isEnabled()) {
      throw new BadRequestException({ message: "OIDC is not configured", code: "OIDC_DISABLED" });
    }
    if (!code || !state) {
      throw new BadRequestException({ message: "Missing code or state", code: "OIDC_CALLBACK" });
    }
    if (!/^[A-Za-z0-9_-]{16,}$/.test(state)) {
      throw new UnauthorizedException({ message: "Malformed OIDC state", code: "OIDC_STATE" });
    }
    const rawCookie = req.cookies?.[COOKIE] as string | undefined;
    if (!rawCookie) {
      throw new UnauthorizedException({ message: "Missing OIDC session cookie", code: "OIDC_COOKIE" });
    }
    const data = unsealCookie<Sealed>(rawCookie, this.cookieSecret());
    if (!data || data.s !== state || data.exp < Date.now()) {
      throw new UnauthorizedException({ message: "Invalid or expired OIDC state", code: "OIDC_STATE" });
    }

    const issuerRaw = this.resolveIssuer();
    if (!issuerRaw) {
      throw new BadRequestException({ message: "OIDC_ISSUER is required (or use OIDC_PROVIDER preset)", code: "OIDC_CONFIG" });
    }
    const issuer = issuerRaw.trim().replace(/\/$/, "");
    const clientId = this.config.get<string>("OIDC_CLIENT_ID")!.trim();
    const clientSecret = this.config.get<string>("OIDC_CLIENT_SECRET")!.trim();
    const redirectUri = this.config.get<string>("OIDC_REDIRECT_URI")!.trim();

    const d = await this.discover(issuer);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: data.v
    });

    this.assertCallbackMatchesConfig(req, redirectUri);

    const tr = await fetch(d.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    const tok = (await tr.json()) as {
      access_token?: string;
      id_token?: string;
      token_type?: string;
      error?: string;
      error_description?: string;
    };
    if (!tr.ok) {
      throw new UnauthorizedException({
        message: tok.error_description ?? tok.error ?? "Token exchange failed",
        code: "OIDC_TOKEN"
      });
    }
    if (tok.token_type && tok.token_type.toLowerCase() !== "bearer") {
      throw new UnauthorizedException({ message: "Unsupported token_type returned by provider", code: "OIDC_TOKEN" });
    }

    let sub = "";
    let email = "";
    let name: string | null = null;
    let picture: string | null = null;

    if (tok.id_token) {
      const claims = decodeJwtPayload(tok.id_token);
      if (claims) {
        sub = String(claims.sub ?? "");
        email = String(claims.email ?? "");
        name = claims.name != null ? String(claims.name) : null;
        picture = claims.picture != null ? String(claims.picture) : null;
      }
    }

    if ((!email || !sub) && tok.access_token && d.userinfo_endpoint) {
      const ui = await fetch(d.userinfo_endpoint, {
        headers: { authorization: `Bearer ${tok.access_token}` }
      });
      if (ui.ok) {
        const profile = (await ui.json()) as Record<string, unknown>;
        sub = sub || String(profile.sub ?? "");
        email = email || String(profile.email ?? "");
        name = name ?? (profile.name != null ? String(profile.name) : null);
        picture = picture ?? (profile.picture != null ? String(profile.picture) : null);
      }
    }

    if (!sub || !email) {
      throw new UnauthorizedException({
        message: "IdP did not return sub and email (check scopes and claims)",
        code: "OIDC_CLAIMS"
      });
    }

    return this.auth.loginWithOidcProfile(
      { sub, issuer, email, name, picture },
      { ipAddress: req.ip, userAgent: req.headers["user-agent"] },
      data.r || DEFAULT_AUTH_REALM
    );
  }

  clearCookieName(): string {
    return COOKIE;
  }

  private assertCallbackMatchesConfig(req: Request, redirectUri: string): void {
    let expected: URL;
    try {
      expected = new URL(redirectUri);
    } catch {
      throw new BadRequestException({ message: "OIDC_REDIRECT_URI must be an absolute URL", code: "OIDC_CONFIG" });
    }
    const forwardedHost = req.headers["x-forwarded-host"];
    const hostHeader = Array.isArray(forwardedHost)
      ? forwardedHost[0]
      : typeof forwardedHost === "string"
        ? forwardedHost
        : req.headers.host;
    const host = hostHeader?.split(",")[0]?.trim();
    const path = req.path;
    if (!host || !path) return;
    if (expected.host !== host || expected.pathname !== path) {
      throw new UnauthorizedException({
        message: "Callback request does not match configured OIDC_REDIRECT_URI",
        code: "OIDC_CALLBACK_MISMATCH"
      });
    }
  }
}
