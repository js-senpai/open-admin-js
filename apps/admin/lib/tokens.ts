/**
 * Isomorphic token helpers.
 *
 * Server components / Route Handlers: use `getServerTokens()`.
 * Client components / browser code:  use `token()`, `setTokenCookies()`, `clearTokenCookies()`.
 * Middleware: reads cookies via `request.cookies.get()` directly.
 *
 * Tokens are stored as non-HttpOnly Lax-SameSite cookies so they are:
 *  - Accessible from Next.js middleware (server-side SSR redirect)
 *  - Accessible from server components via `cookies()` from `next/headers`
 *  - Readable by client JS to build Authorization headers for cross-origin NestJS calls
 *
 * NOTE: If you switch to a same-origin proxy setup (all API calls through Next.js Route Handlers)
 * you can safely upgrade to `HttpOnly` by removing `token()` from client code and reading
 * from the cookie only server-side.
 */

export const TOKEN_COOKIE_AT = "oajs_at";
export const TOKEN_COOKIE_RT = "oajs_rt";

/** Cookie max-age in seconds — 7 days */
const MAX_AGE = 60 * 60 * 24 * 7;

// ──────────────────────────────────────────────
// Client-side helpers (browser only)
// ──────────────────────────────────────────────

function parseCookieValue(cookieStr: string, key: string): string | null {
  const match = cookieStr.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
  const value = match?.[1];
  return value ? decodeURIComponent(value) : null;
}

/** Read access token from cookie (client-side). */
export function token(): string | null {
  if (typeof document === "undefined") return null;
  return parseCookieValue(document.cookie, TOKEN_COOKIE_AT);
}

/** Read refresh token from cookie (client-side). */
export function refreshToken(): string | null {
  if (typeof document === "undefined") return null;
  return parseCookieValue(document.cookie, TOKEN_COOKIE_RT);
}

/** Persist access + refresh tokens to cookies (client-side, called after login/refresh). */
export function setTokenCookies(accessToken: string, refreshTokenValue: string): void {
  if (typeof document === "undefined") return;
  const opts = `path=/; max-age=${MAX_AGE}; SameSite=Lax`;
  document.cookie = `${TOKEN_COOKIE_AT}=${encodeURIComponent(accessToken)}; ${opts}`;
  document.cookie = `${TOKEN_COOKIE_RT}=${encodeURIComponent(refreshTokenValue)}; ${opts}`;
}

/** Remove tokens (client-side logout or failed refresh). */
export function clearTokenCookies(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE_AT}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${TOKEN_COOKIE_RT}=; path=/; max-age=0; SameSite=Lax`;
}

// ──────────────────────────────────────────────
// Server-side helpers (Server Components / Route Handlers)
// ──────────────────────────────────────────────

/** Read tokens from cookies in Server Components or Route Handlers. */
export async function getServerTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return {
    accessToken: jar.get(TOKEN_COOKIE_AT)?.value ?? null,
    refreshToken: jar.get(TOKEN_COOKIE_RT)?.value ?? null
  };
}

// ──────────────────────────────────────────────
// Shared JWT freshness check (used by both client and middleware Edge runtime)
// ──────────────────────────────────────────────

export function isTokenFresh(value: string | null | undefined): boolean {
  if (!value) return false;
  const [, payloadPart] = value.split(".");
  if (!payloadPart) return false;
  try {
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = typeof atob !== "undefined" ? atob(padded) : Buffer.from(padded, "base64").toString("utf-8");
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== "number") return true;
    return payload.exp > Math.floor(Date.now() / 1000) + 5;
  } catch {
    return false;
  }
}
