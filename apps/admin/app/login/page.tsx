"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, Loader2, Mail } from "lucide-react";
import { hasUsableAccessToken } from "../../lib/api";
import { setTokenCookies } from "../../lib/tokens";
import { Logo } from "../../components/logo";
import { safeNextParam } from "./safe-next-param";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const oidcEnabled = process.env.NEXT_PUBLIC_OIDC_LOGIN === "true";
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("sso_error") === "1") {
      const code = sp.get("sso_code");
      const message = sp.get("sso_message");
      const detail = message?.trim() || "Single sign-on failed. Try again or sign in with email and password.";
      setError(code ? `${detail} (${code})` : detail);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.includes("sso=1")) return;
    const params = new URLSearchParams(hash);
    if (params.get("sso") !== "1") return;
    const access = params.get("access_token");
    const refresh = params.get("refresh_token");
    if (access && refresh) {
      setTokenCookies(access, refresh);
      const next = safeNextParam(new URLSearchParams(window.location.search).get("next"));
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      router.replace(next);
    }
  }, [router]);

  useEffect(() => {
    if (!hasUsableAccessToken()) return;
    const next = safeNextParam(new URLSearchParams(window.location.search).get("next"));
    router.replace(next);
  }, [router]);

  async function submit(formData: FormData) {
    setError("");
    setLoading(true);
    try {
      // POST to the Next.js BFF route — it proxies to the NestJS API and sets HttpOnly-friendly cookies
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
          realm: "admin"
        })
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok) {
        let msg =
          typeof data.message === "string" && data.message.length > 0
            ? data.message
            : "Invalid email or password. Please try again.";
        if (res.status >= 500 && (msg === "Internal Server Error" || msg === "Internal server error")) {
          msg =
            "Server error while signing in. Check that the API is running, PostgreSQL is up, migrations are applied, and apps/api/.env defines JWT_SECRET (see README).";
        }
        setError(msg);
        return;
      }
      const next = safeNextParam(new URLSearchParams(window.location.search).get("next"));
      router.push(next);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Cannot reach the server. Ensure the app is running and NEXT_PUBLIC_API_URL is set correctly."
          : e instanceof Error
            ? e.message
            : "Network error"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f8fafc] px-4">
      {/* Background decorations */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-48 -top-48 h-[600px] w-[600px] rounded-full bg-blue-100/70 blur-3xl" />
        <div className="absolute -bottom-48 -right-48 h-[600px] w-[600px] rounded-full bg-teal-100/70 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-50/50 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-[420px] animate-in">
        {/* Card */}
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_8px_40px_rgba(0,0,0,0.1)] backdrop-blur-sm">
          {/* Top gradient bar */}
          <div className="h-1 w-full bg-gradient-to-r from-[#2454ff] via-[#7c3aed] to-[#0ea5a4]" />

          <div className="px-8 pb-8 pt-7">
            {/* Logo */}
            <div className="mb-7">
              <Logo />
            </div>

            {/* Heading */}
            <div className="mb-6">
              <h1 className="text-[1.6rem] font-bold tracking-tight text-slate-900">
                Welcome back
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Sign in to continue to your admin panel
              </p>
            </div>

            {/* Form */}
            <form action={submit} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Email address</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    className="input-base pl-10"
                    autoComplete="email"
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Password</span>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    name="password"
                    type="password"
                    placeholder="Enter your password"
                    className="input-base pl-10"
                    autoComplete="current-password"
                  />
                </div>
              </label>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 fade-in">
                  <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                  {error}
                </div>
              )}

              {oidcEnabled && (
                <a
                  href={`${apiBase}/auth/sso/oidc/login?realm=admin`}
                  className="btn-ghost flex w-full items-center justify-center gap-2 py-3"
                >
                  Continue with SSO
                </a>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary mt-2 w-full py-3"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-5 text-center text-xs text-slate-400">
          OpenAdminJS · Free open-source admin framework for Node.js
        </p>
      </div>
    </main>
  );
}
