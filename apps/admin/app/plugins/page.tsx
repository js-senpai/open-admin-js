"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { api } from "../../lib/api";

type Plugin = { id: string; name?: string; version?: string; enabled?: boolean; packageName?: string };
type State = { plugins?: Plugin[] };
export default function PluginsPage() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<State>("/admin/plugins").then(setState).catch(err => setError(err instanceof Error ? err.message : "Unable to load plugins")); }, []);
  return <AppShell><h1 className="text-3xl font-bold">Plugins</h1>
    <p className="mt-3 max-w-2xl text-sm text-slate-500">Plugins execute trusted server-side code. Installation and configuration are deployment-operator actions, not browser operations.</p>
    <section className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-700">
      <h2 className="font-semibold">Installed plugins (read only)</h2>
      {error ? <p role="alert" className="mt-4">{error}</p> : !state ? <p role="status" className="mt-4">Loading…</p> :
        !(state.plugins?.length) ? <p className="mt-4 text-sm text-slate-500">No plugins configured.</p> :
        <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">{state.plugins.map(plugin =>
          <li key={plugin.id} className="flex justify-between gap-4 py-3"><span>{plugin.name ?? plugin.packageName ?? plugin.id} {plugin.version}</span><span>{plugin.enabled === false ? "Disabled" : "Configured"}</span></li>)}</ul>}
    </section></AppShell>;
}
