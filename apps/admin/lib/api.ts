import { getUiLocale } from "./locale";
import {
  token,
  refreshToken,
  setTokenCookies,
  clearTokenCookies,
  isTokenFresh
} from "./tokens";

const rawApi = process.env.NEXT_PUBLIC_API_URL;
export const API_URL =
  typeof rawApi === "string" && rawApi.trim().length > 0 ? rawApi.trim() : "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  retryAfterSec?: number;

  constructor(message: string, status: number, retryAfterSec?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

const API_ERROR_EVENT = "openadmin:api-error";

function emitApiError(error: ApiError): void {
  if (typeof window === "undefined") return;
  if (typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent<ApiError>(API_ERROR_EVENT, { detail: error }));
}

export type ResourceMeta = {
  name: string;
  label: string;
  icon?: string;
  titleField?: string;
  permissions: Record<string, string>;
  fields: Record<
    string,
    {
      type: string;
      label?: string;
      list?: boolean;
      create?: boolean;
      edit?: boolean;
      required?: boolean;
      sortable?: boolean;
      searchable?: boolean;
      filterable?: boolean;
      sensitive?: boolean;
      resource?: string;
      displayField?: string;
      options?: string[];
    }
  >;
  actions?: Record<string, { label: string; variant?: string; confirm?: boolean; permission: string }>;
  i18n?: { defaultLocale?: string; locales?: readonly string[] };
  seo?: { public?: boolean; slugField?: string; pathPattern?: string; titleField?: string; descriptionField?: string };
};

// Re-export for backward compat and convenience
export { token, isTokenFresh as isAccessTokenFresh };

/** True when the stored access token exists and has not expired (with 5-second buffer). */
export function hasUsableAccessToken(): boolean {
  return isTokenFresh(token());
}

// ──────────────────────────────────────────────
// Locale helper
// ──────────────────────────────────────────────

function withAdminLocale(path: string): string {
  if (!path.startsWith("/admin/resources")) return path;
  const loc = getUiLocale();
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}locale=${encodeURIComponent(loc)}`;
}

// ──────────────────────────────────────────────
// Refresh flow (server-side BFF or direct fallback)
// ──────────────────────────────────────────────

async function tryRefreshToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // Prefer the Next.js BFF route (same-origin, handles cookie setting)
  const bffRes = await fetch("/api/auth/refresh", { method: "POST" }).catch(() => null);
  if (bffRes?.ok) return true;

  // Direct NestJS fallback (e.g. in dev when BFF route is unavailable)
  const rt = refreshToken();
  if (!rt) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: rt, realm: "admin" })
  }).catch(() => null);
  const data = (await res?.json().catch(() => ({}))) as { accessToken?: string; refreshToken?: string };
  if (!res?.ok || !data.accessToken || !data.refreshToken) return false;
  setTokenCookies(data.accessToken, data.refreshToken);
  return true;
}

// ──────────────────────────────────────────────
// Core fetch wrapper
// ──────────────────────────────────────────────

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_URL}${withAdminLocale(path)}`;
  const response = await requestWithAuthRetry(url, options);
  if (!response.ok) {
    const retryAfterHeader = response.headers?.get?.("retry-after") ?? null;
    const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    const error = await response.json().catch(() => ({ message: response.statusText }));
    if (response.status === 429) {
      const seconds = Number.isFinite(retryAfterSec) ? Math.max(1, Number(retryAfterSec)) : undefined;
      const message = seconds
        ? `Too many requests. Try again in ${seconds}s.`
        : "Too many requests. Please try again in a moment.";
      const err = new ApiError(message, 429, seconds);
      emitApiError(err);
      throw err;
    }
    const err = new ApiError((error as { message?: string }).message ?? "Request failed", response.status);
    emitApiError(err);
    throw err;
  }
  return response.json() as Promise<T>;
}

export function onApiError(listener: (error: ApiError) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<ApiError>;
    if (custom.detail) listener(custom.detail);
  };
  window.addEventListener(API_ERROR_EVENT, handler as EventListener);
  return () => window.removeEventListener(API_ERROR_EVENT, handler as EventListener);
}

async function requestWithAuthRetry(url: string, options: RequestInit): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const body =
    options.body ??
    (method !== "GET" && method !== "HEAD" && method !== "DELETE" ? "{}" : undefined);

  const makeRequest = (tok: string | null) =>
    fetch(url, {
      ...options,
      ...(body !== undefined ? { body } : {}),
      headers: {
        "content-type": "application/json",
        ...(tok ? { authorization: `Bearer ${tok}` } : {}),
        ...options.headers
      }
    });

  const res = await makeRequest(hasUsableAccessToken() ? token() : null);

  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !url.includes("/auth/login") &&
    !url.includes("/auth/refresh")
  ) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return makeRequest(token());

    clearTokenCookies();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
  }
  return res;
}
