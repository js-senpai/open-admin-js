"use client";

/**
 * Client-side auth guard — secondary fallback after the Next.js middleware SSR check.
 * The middleware handles the primary redirect before any page renders.
 * This component catches edge cases where the client navigates directly (e.g. browser back/forward
 * cache) and the cookie has expired between page loads without the middleware re-running.
 */

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { hasUsableAccessToken } from "../lib/api";

function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/login" || pathname.startsWith("/login/");
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const checked = useRef(false);

  useEffect(() => {
    if (isPublicPath(pathname)) return;
    if (checked.current) return;
    checked.current = true;

    if (!hasUsableAccessToken()) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
    }
  }, [pathname, router]);

  // Render children immediately — no loading flash.
  // The middleware already protected this route server-side; if somehow we reach here
  // without a valid token, the router.replace above will kick in on the next tick.
  return <>{children}</>;
}
