"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { api } from "../../lib/api";

type Profile = {
  id: string;
  email: string;
  name?: string | null;
  roles: string[];
  permissions: string[];
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        const me = await api<Profile>("/auth/me");
        setProfile(me);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load profile");
      }
    }
    loadProfile();
  }, []);

  async function logout() {
    setLoggingOut(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      localStorage.removeItem("openadminjs.accessToken");
      localStorage.removeItem("openadminjs.refreshToken");
      router.push("/login");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5 animate-in">
        <div className="stagger-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#0ea5a4]">Account</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Profile</h1>
          <p className="text-sm text-slate-500">Your authenticated user profile and access scopes.</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 fade-in">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            {error}
          </div>
        )}

        <div className="card stagger-2 divide-y divide-slate-100 overflow-hidden">
          {/* Avatar header */}
          <div className="flex items-center gap-4 p-6">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2454ff] to-[#0ea5a4] text-xl font-bold text-white shadow-[0_4px_14px_rgba(36,84,255,0.3)]">
              {profile?.name?.charAt(0).toUpperCase() ?? profile?.email?.charAt(0).toUpperCase() ?? "A"}
            </span>
            <div>
              <p className="font-semibold text-slate-900">{profile?.name ?? "—"}</p>
              <p className="text-sm text-slate-500">{profile?.email ?? "—"}</p>
            </div>
          </div>

          {/* Fields */}
          <div className="grid gap-0 divide-y divide-slate-100">
            <div className="flex items-center justify-between px-6 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Email</p>
              <p className="text-sm font-medium text-slate-700">{profile?.email ?? "—"}</p>
            </div>
            <div className="flex items-center justify-between px-6 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Name</p>
              <p className="text-sm font-medium text-slate-700">{profile?.name ?? "—"}</p>
            </div>
            <div className="px-6 py-4">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Roles</p>
              <div className="flex flex-wrap gap-2">
                {(profile?.roles ?? []).map((role) => (
                  <span key={role} className="badge badge-blue">{role}</span>
                ))}
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Permissions</p>
              <div className="flex flex-wrap gap-2">
                {(profile?.permissions ?? []).map((permission) => (
                  <span key={permission} className="badge badge-teal">{permission}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Sign out */}
          <div className="px-6 py-4">
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="btn-primary"
            >
              {loggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
