"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { api } from "../../lib/api";

type Overview = { metrics: Record<string, number | null>; recentActivity: { id: string; action: string; resource: string | null; createdAt: string }[] };
const cards = [
  { key: "usersTotal", label: "Users", href: "/resources/users" },
  { key: "postsTotal", label: "Posts", href: "/resources/posts" },
  { key: "publishedPosts", label: "Published posts", href: "/resources/posts" },
  { key: "filesTotal", label: "Files", href: "/files" }
] as const;

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("30d");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    api<Overview>("/admin/resources/overview?period=" + period)
      .then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Unable to load overview"); });
    return () => { active = false; };
  }, [period, attempt]);
  return <AppShell>
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">OpenAdminJS / workspace</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Overview</h1>
        <p className="mt-2 text-sm text-slate-500">Live database totals and recent audit activity.</p></div>
      <label className="text-sm">Activity period <select className="ml-2 rounded-lg border bg-transparent p-2" value={period} onChange={e => setPeriod(e.target.value)}>
        <option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option>
      </select></label>
    </div>
    {error ? <div role="alert" className="rounded-xl border p-5">{error}<button className="ml-3 underline" onClick={() => setAttempt(x => x + 1)}>Retry</button></div> :
      !data ? <p role="status">Loading overview…</p> : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.filter(card => data.metrics[card.key] != null).map(card =>
            <Link key={card.key} href={card.href} className="rounded-xl border border-slate-200 bg-white p-5 hover:border-lime-500 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-4 text-4xl font-semibold tabular-nums">{data.metrics[card.key]}</p>
            </Link>)}
        </div>
        <section className="mt-8 rounded-xl border border-slate-200 p-5 dark:border-slate-700">
          <h2 className="mb-4 font-semibold">Recent activity</h2>
          {data.recentActivity.length === 0 ? <p className="text-sm text-slate-500">No visible audit activity for this period.</p> :
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col" className="p-2">Action</th><th scope="col" className="p-2">Resource</th><th scope="col" className="p-2">Time</th></tr></thead><tbody>
            {data.recentActivity.map(row => <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700"><td className="p-2">{row.action}</td><td className="p-2">{row.resource ?? "—"}</td><td className="p-2">{new Date(row.createdAt).toLocaleString()}</td></tr>)}
            </tbody></table></div>}
        </section>
      </>}
  </AppShell>;
}
