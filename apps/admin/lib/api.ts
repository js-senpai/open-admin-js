import { getUiLocale } from "./locale";
export const API_URL = "/api/backend";

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

export type { ResourceMeta } from "@openadminjs/admin-client";

function withAdminLocale(path: string): string {
  if (!path.startsWith("/admin/resources")) return path;
  const loc = getUiLocale();
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}locale=${encodeURIComponent(loc)}`;
}

// ──────────────────────────────────────────────
// Refresh flow (server-side BFF or direct fallback)
// ──────────────────────────────────────────────

let refreshInFlight: Promise<boolean> | undefined;
let authGeneration = 0;
function tryRefreshToken(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!refreshInFlight) {
    const refresh = async () => {
      // Another tab may already have refreshed the shared cookies. Check after obtaining a browser-wide lock.
      const response = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
      if (response.ok) authGeneration++;
      return response.ok;
    };
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    const run = async (): Promise<boolean> => {
      if (!locks) return refresh();
      return await locks.request("openadminjs-refresh", async () => {
      const check = await fetch("/api/backend/auth/me", { credentials: "same-origin", cache: "no-store" });
      if(check.ok) { authGeneration++; return true; }
      return refresh();
    });
    };
    refreshInFlight = run().catch(() => false).finally(() => { refreshInFlight = undefined; });
  }
  return refreshInFlight;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new Error("Invalid API path");
  const url = path === "/auth/logout" ? "/api/auth/logout" : `${API_URL}${withAdminLocale(path)}`;
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
  const body = options.body ?? (method !== "GET" && method !== "HEAD" && method !== "DELETE" ? "{}" : undefined);
  const headers = new Headers(options.headers);
  headers.delete("authorization");
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  const makeRequest = () => fetch(url, { ...options, headers, credentials: "same-origin", ...(body !== undefined ? { body } : {}) });
  const generation = authGeneration;
  const res = await makeRequest();
  if (res.status === 401 && typeof window !== "undefined") {
    if (authGeneration !== generation || await tryRefreshToken()) return makeRequest();
    if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
  }
  return res;
}
