/** Session cookies are server-only. Do not export browser token readers. */
export const TOKEN_COOKIE_AT = "oajs_at";
export const TOKEN_COOKIE_RT = "oajs_rt";

export async function getServerTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return { accessToken: jar.get(TOKEN_COOKIE_AT)?.value ?? null, refreshToken: jar.get(TOKEN_COOKIE_RT)?.value ?? null };
}

/** UI hint only; the API verifies signature and session on every request. */
export function isTokenFresh(value: string | null | undefined): boolean {
  if (!value) return false;
  const [, part] = value.split(".");
  if (!part) return false;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000 + 5;
  } catch { return false; }
}
