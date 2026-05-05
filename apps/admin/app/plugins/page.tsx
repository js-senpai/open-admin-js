"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Package,
  Power,
  RefreshCw,
  Trash2,
  Boxes,
  Terminal
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { API_URL, api } from "../../lib/api";

type PluginRow = {
  id: string;
  enabled?: boolean;
  bundled?: string;
  package?: string;
  config?: Record<string, unknown>;
};

type PluginsState = {
  manifestPath: string;
  bundledAvailable: string[];
  plugins: PluginRow[];
};

export default function PluginsPage() {
  const [state, setState] = useState<PluginsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addMode, setAddMode] = useState<"bundled" | "package">("bundled");
  const [newId, setNewId] = useState("");
  const [bundledKey, setBundledKey] = useState("hello");
  const [packageName, setPackageName] = useState("");
  const [runPnpm, setRunPnpm] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<PluginsState>("/admin/plugins");
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plugins");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!state?.bundledAvailable.length) return;
    if (!state.bundledAvailable.includes(bundledKey)) {
      setBundledKey(state.bundledAvailable[0]!);
    }
  }, [state, bundledKey]);

  async function addPlugin() {
    if (!newId.trim()) {
      setError("Plugin id is required");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await api("/admin/plugins", {
        method: "POST",
        body: JSON.stringify(
          addMode === "bundled"
            ? { id: newId.trim(), bundled: bundledKey, enabled: true, config: {} }
            : {
                id: newId.trim(),
                package: packageName.trim(),
                enabled: true,
                config: {},
                runPnpmInstall: runPnpm
              }
        )
      });
      setNewId("");
      setPackageName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add plugin");
    } finally {
      setAdding(false);
    }
  }

  async function toggleEnabled(row: PluginRow, enabled: boolean) {
    setBusyId(row.id);
    setError(null);
    try {
      await api(`/admin/plugins/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled })
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update plugin");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: PluginRow) {
    if (!window.confirm(`Remove plugin "${row.id}" from the manifest?`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      await api(`/admin/plugins/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove plugin");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 animate-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#0ea5a4]">Extensions</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Plugins</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Manage <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">plugins.manifest.json</code>.
              Enable/disable and config changes apply <strong className="font-medium text-slate-700">in the same running API</strong>{" "}
              (hooks are removed and re-registered). In <strong className="font-medium text-slate-700">development</strong>, adding an
              npm plugin runs <span className="font-mono text-xs">pnpm add … --filter @openadminjs/api</span> for you, then loads the
              plugin with <span className="font-mono text-xs">require</span> — no process restart, so users are not kicked offline.
              In <strong className="font-medium text-slate-700">production</strong>, install packages in your deploy pipeline; optional env{" "}
              <span className="font-mono text-xs">OPENADMIN_PLUGIN_PNPM_INSTALL=1</span> plus explicit opt-in in the API enables automated
              install (use carefully).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="btn-ghost flex items-center gap-2 self-start"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            {error}
          </div>
        )}

        <div className="card p-5">
          <div className="flex items-start gap-3">
            <Terminal className="mt-0.5 h-5 w-5 text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-slate-800">API endpoint</p>
              <p className="mt-1 text-xs text-slate-500">
                Admin UI talks to <span className="font-mono text-slate-700">{API_URL}</span>. If login fails with a
                network error, start the API (<span className="font-mono">pnpm dev</span> from repo root) and ensure{" "}
                <span className="font-mono">NEXT_PUBLIC_API_URL</span> matches.
              </p>
              {state?.manifestPath && (
                <p className="mt-2 text-xs text-slate-500">
                  Manifest file:{" "}
                  <span className="break-all font-mono text-slate-700">{state.manifestPath}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Add plugin */}
        <div className="card p-6">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Boxes className="h-4 w-4 text-[#2454ff]" />
            Add plugin
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAddMode("bundled")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                addMode === "bundled"
                  ? "bg-[#2454ff] text-white shadow-[0_2px_6px_rgba(36,84,255,0.3)]"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Bundled
            </button>
            <button
              type="button"
              onClick={() => setAddMode("package")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                addMode === "package"
                  ? "bg-[#2454ff] text-white shadow-[0_2px_6px_rgba(36,84,255,0.3)]"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              npm package
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plugin id</span>
              <input
                className="input-base"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder={addMode === "bundled" ? "io.openadminjs.hello" : "com.vendor.my-plugin"}
              />
            </label>
            {addMode === "bundled" ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bundled key</span>
                <select
                  className="input-base"
                  value={bundledKey}
                  onChange={(e) => setBundledKey(e.target.value)}
                >
                  {(state?.bundledAvailable ?? ["hello"]).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Package name</span>
                <input
                  className="input-base font-mono text-xs"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  placeholder="@scope/openadminjs-example"
                />
              </label>
            )}
          </div>

          {addMode === "package" && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={runPnpm}
                onChange={(e) => setRunPnpm(e.target.checked)}
                className="rounded border-slate-300"
              />
              Run <span className="font-mono text-xs">pnpm add … --filter @openadminjs/api</span> automatically (recommended in dev;
              uncheck only if the package is already installed)
            </label>
          )}

          <button
            type="button"
            onClick={() => void addPlugin()}
            disabled={adding}
            className="btn-primary mt-4"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Register in manifest
          </button>
        </div>

        {/* List */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Installed entries</h2>
          </div>
          {loading && !state ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (state?.plugins.length ?? 0) === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">No plugins in the manifest yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {state!.plugins.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-slate-900">{row.id}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {row.bundled ? (
                        <>
                          bundled: <span className="font-mono text-slate-700">{row.bundled}</span>
                        </>
                      ) : (
                        <>
                          package: <span className="font-mono text-slate-700">{row.package}</span>
                        </>
                      )}
                    </p>
                    <span
                      className={`badge mt-2 ${row.enabled === false ? "badge-slate" : "badge-green"}`}
                    >
                      {row.enabled === false ? "Disabled" : "Enabled"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void toggleEnabled(row, row.enabled === false)}
                      className="btn-ghost flex items-center gap-1.5 py-2 text-xs"
                      title={row.enabled === false ? "Enable" : "Disable"}
                    >
                      {busyId === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                      {row.enabled === false ? "Enable" : "Disable"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void remove(row)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
