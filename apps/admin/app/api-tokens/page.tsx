"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { api } from "../../lib/api";

type ApiTokenRecord = {
  id: string;
  name: string;
  scopes: string[];
  revokedAt: string | null;
  createdAt: string;
};

type AuditLogRecord = {
  id: string;
  action: string;
  resourceId: string | null;
  userId: string | null;
  createdAt: string;
};

type ListResponse<T> = {
  data: T[];
  meta: { total: number };
};

function maskTokenId(id: string) {
  return `${id.slice(0, 6)}••••${id.slice(-4)}`;
}

export default function ApiTokensPage() {
  const [tokens, setTokens] = useState<ApiTokenRecord[]>([]);
  const [history, setHistory] = useState<AuditLogRecord[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("posts.read");
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyTokenId, setBusyTokenId] = useState<string | null>(null);

  const parsedScopes = useMemo(
    () =>
      scopes
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean),
    [scopes]
  );

  async function loadData() {
    try {
      const [tokenRes, auditRes] = await Promise.all([
        api<ListResponse<ApiTokenRecord>>("/admin/resources/api-tokens?sort=createdAt:desc&limit=50"),
        api<ListResponse<AuditLogRecord>>("/admin/resources/audit-logs?filter[resource]=api-tokens&sort=createdAt:desc&limit=15").catch(() => ({ data: [], meta: { total: 0 } }))
      ]);
      setTokens(tokenRes.data ?? []);
      setHistory(auditRes.data ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load API token data");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function createToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setCopied(false);
    try {
      const created = await api<{ plainToken?: string }>("/admin/resources/api-tokens", {
        method: "POST",
        body: JSON.stringify({ name: name || "Token", scopes: parsedScopes })
      });
      setPlainToken(created.plainToken ?? null);
      setName("");
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create token");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeToken(id: string) {
    setBusyTokenId(id);
    setError(null);
    try {
      await api(`/admin/resources/api-tokens/${id}/actions/revoke`, { method: "POST" });
      await loadData();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke token");
    } finally {
      setBusyTokenId(null);
    }
  }

  async function copyPlainToken() {
    if (!plainToken) return;
    try {
      await navigator.clipboard.writeText(plainToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#496C24]">Security</p>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-[#101820]">API Tokens</h1>
          <p className="text-sm text-[#53615b]">Issue scoped tokens, reveal once, and revoke instantly.</p>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {plainToken ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Token generated successfully. Copy it now: it will never be shown again.</p>
            <code className="mt-2 block overflow-auto rounded-xl bg-white p-3 text-xs text-amber-900">{plainToken}</code>
            <button
              type="button"
              onClick={copyPlainToken}
              className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
            >
              {copied ? "Copied" : "Copy token"}
            </button>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-2xl border border-[#dce2d9] bg-white p-5 shadow-[0_12px_34px_rgba(36,50,75,0.07)] lg:col-span-2">
            <h2 className="text-lg font-bold text-[#101820]">Create token</h2>
            <form onSubmit={createToken} className="mt-4 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#53615b]">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-xl border border-[#dce2d9] bg-[#F5F7F2] px-3 py-2 text-sm"
                  placeholder="Read-only integration"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#53615b]">Read-only scopes (comma separated)</span>
                <input
                  value={scopes}
                  onChange={(event) => setScopes(event.target.value)}
                  className="w-full rounded-xl border border-[#dce2d9] bg-[#F5F7F2] px-3 py-2 text-sm"
                  placeholder="posts.read"
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="w-fit rounded-xl bg-[#B9F56D] px-4 py-2 text-sm font-bold text-[#101820] disabled:cursor-not-allowed disabled:opacity-65"
              >
                {submitting ? "Creating..." : "Create token"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-[#dce2d9] bg-white p-5 shadow-[0_12px_34px_rgba(36,50,75,0.07)]">
            <h2 className="text-lg font-bold text-[#101820]">Summary</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#53615b]">Total tokens</span>
                <span className="font-semibold text-[#101820]">{tokens.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#53615b]">Active</span>
                <span className="font-semibold text-[#101820]">{tokens.filter((token) => !token.revokedAt).length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#53615b]">Revoked</span>
                <span className="font-semibold text-[#101820]">{tokens.filter((token) => token.revokedAt).length}</span>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-[#dce2d9] bg-white p-5 shadow-[0_12px_34px_rgba(36,50,75,0.07)]">
          <h2 className="text-lg font-bold text-[#101820]">Issued tokens</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#dce2d9]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F5F7F2] text-xs uppercase text-[#53615b]">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Token ID</th>
                  <th className="px-3 py-2">Scopes</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id} className="border-t border-[#dce2d9]">
                    <td className="px-3 py-2 font-semibold text-[#101820]">{token.name}</td>
                    <td className="px-3 py-2 text-[#53615b]">{maskTokenId(token.id)}</td>
                    <td className="px-3 py-2 text-[#53615b]">{(Array.isArray(token.scopes) ? token.scopes.join(", ") : "Legacy scope") || "None"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${token.revokedAt ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {token.revokedAt ? "Revoked" : "Active"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => revokeToken(token.id)}
                        disabled={Boolean(token.revokedAt) || busyTokenId === token.id}
                        className="rounded-lg border border-[#dce2d9] bg-white px-3 py-1.5 text-xs font-semibold text-[#101820] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {busyTokenId === token.id ? "Revoking..." : token.revokedAt ? "Revoked" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                ))}
                {tokens.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-[#53615b]" colSpan={5}>
                      No API tokens issued yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-[#dce2d9] bg-white p-5 shadow-[0_12px_34px_rgba(36,50,75,0.07)]">
          <h2 className="text-lg font-bold text-[#101820]">Revoke history</h2>
          <div className="mt-4 space-y-2">
            {history.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dce2d9] bg-[#F5F7F2] px-3 py-2 text-sm">
                <span className="font-semibold text-[#101820]">{entry.action}</span>
                <span className="text-[#53615b]">resourceId: {entry.resourceId ?? "-"}</span>
                <span className="text-[#53615b]">{new Date(entry.createdAt).toLocaleString()}</span>
              </div>
            ))}
            {history.length === 0 ? <p className="text-sm text-[#53615b]">No token audit events yet.</p> : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
