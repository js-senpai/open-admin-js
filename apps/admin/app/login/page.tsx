"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, Loader2, Mail } from "lucide-react";
import { Logo } from "../../components/logo";
import { safeNextParam } from "./safe-next-param";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oidcEnabled,setOidcEnabled]=useState(false);
  useEffect(()=>{fetch("/api/auth/oidc/status").then(r=>r.json()).then(x=>setOidcEnabled(x.enabled===true)).catch(()=>undefined);if(new URLSearchParams(window.location.search).has("sso_error"))setError("Single sign-on could not be completed.");},[]);
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

  return <main className="oc-login">
    <section className="oc-login-story"><Logo/><div className="oc-login-copy"><p className="oc-kicker"><span/> OPEN CORE / WORKSPACE</p><h1>Define once.<br/><em>Build your admin.</em></h1><p>One resource model. A connected workspace for your data, access and operations.</p><div className="oc-login-terminal"><div><span>● ● ●</span><small>resource.ts</small></div><pre>{'defineResource({\n  name: "posts",\n  model: "post",\n  permissions: { read: "posts.read" },\n  fields: { title: { type: "text" } }\n});'}</pre></div></div><p className="oc-login-footer">NESTJS / PRISMA / NEXT.JS</p></section>
    <section className="oc-login-panel"><div className="oc-login-form"><p className="oc-kicker oc-kicker-dark"><span/> SECURE SIGN IN</p><h2>Welcome back.</h2><p className="oc-login-subtitle">Sign in to continue to your admin panel</p>
      <form action={submit} className="space-y-5"><label className="block space-y-2"><span className="text-sm font-semibold">Email address</span><div className="oc-login-input"><Mail size={17}/><input required name="email" type="email" placeholder="you@company.com" autoComplete="email" className="input-base"/></div></label>
      <label className="block space-y-2"><span className="text-sm font-semibold">Password</span><div className="oc-login-input"><Lock size={17}/><input required name="password" type="password" placeholder="Enter your password" autoComplete="current-password" className="input-base"/></div></label>
      {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <button type="submit" disabled={loading} className="btn-primary w-full py-3">{loading ? <><Loader2 className="h-4 w-4 animate-spin"/>Signing in...</> : <>Sign in<ArrowRight size={17}/></>}</button></form>
      {oidcEnabled&&<a href="/api/auth/oidc/start" className="btn-secondary mt-3 block w-full text-center">Sign in with SSO</a>}
      <p className="oc-login-meta"><Lock size={13}/> Session protected by HttpOnly cookies</p></div></section>
  </main>;
}
