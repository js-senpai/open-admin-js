"use client";
import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!pathname || pathname === "/login" || pathname.startsWith("/login/")) return;
    let cancelled = false;
    api("/auth/me").catch(error => {
      if (!cancelled && error?.status === 401) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    });
    return () => { cancelled = true; };
  }, [pathname, router]);
  return <>{children}</>;
}
