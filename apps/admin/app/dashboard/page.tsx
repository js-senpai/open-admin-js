/* eslint-disable react/no-unstable-nested-components */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, Database, FileText, Image, ShieldCheck, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { AppShell } from "../../components/app-shell";
import { api } from "../../lib/api";

const periodOptions = ["7d", "30d", "90d"] as const;
type Period = (typeof periodOptions)[number];

type ActivityEntry = {
  id: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  createdAt: string;
  user: string;
};

type OverviewResponse = {
  metrics: {
    usersTotal: number;
    postsTotal: number;
    publishedPosts: number;
    filesTotal: number;
  };
  charts: {
    revenue: Array<{ name: string; revenue: number; signups: number }>;
    trafficChannels: Array<{ label: string; value: number; color: string }>;
    conversion: Array<{ label: string; value: number; percent: number }>;
    crmPipeline: Array<{ stage: string; value: number }>;
    ecommerceRevenue: Array<{ month: string; value: number }>;
    marketingMix: Array<{ name: string; value: number; color: string }>;
  };
  jobs: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  };
  recentActivity: ActivityEntry[];
  health: {
    api: string;
    db: string;
    redis: string;
  };
};

const emptyOverview: OverviewResponse = {
  metrics: { usersTotal: 0, postsTotal: 0, publishedPosts: 0, filesTotal: 0 },
  charts: { revenue: [], trafficChannels: [], conversion: [], crmPipeline: [], ecommerceRevenue: [], marketingMix: [] },
  jobs: { queued: 0, processing: 0, completed: 0, failed: 0 },
  recentActivity: [],
  health: { api: "unknown", db: "unknown", redis: "unknown" }
};

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [overview, setOverview] = useState<OverviewResponse>(emptyOverview);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartsReady, setChartsReady] = useState(false);
  const revenueData = useMemo(() => overview.charts.revenue, [overview.charts.revenue]);

  useEffect(() => {
    async function loadOverview() {
      setLoading(true);
      try {
        const response = await api<OverviewResponse>(`/admin/resources/overview?period=${period}`);
        setOverview(response);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    }
    void loadOverview();
  }, [period]);
  useEffect(() => {
    setChartsReady(true);
  }, []);

  const metrics = [
    { label: "Total users", value: String(overview.metrics.usersTotal), change: `${overview.jobs.processing} processing`, icon: Users },
    { label: "Total posts", value: String(overview.metrics.postsTotal), change: `${overview.metrics.publishedPosts} published`, icon: FileText },
    { label: "Published posts", value: String(overview.metrics.publishedPosts), change: `${overview.jobs.completed} jobs done`, icon: Activity },
    { label: "Uploaded files", value: String(overview.metrics.filesTotal), change: `${overview.jobs.failed} failed jobs`, icon: Image }
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        {error ? (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            {error}
          </div>
        ) : null}

        {/* Hero banner */}
        <div className="animate-in stagger-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_300px] lg:items-center">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#0ea5a4]">Admin workspace</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Your generated admin is ready with resources, API guards, SEO routes and public web pages.
              </p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-[#eef3ff] to-[#e9fbfa] p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">System score</span>
                <ShieldCheck className="h-5 w-5 text-[#0ea5a4]" />
              </div>
              <div className="mt-4 flex items-end gap-3">
                <strong className="text-4xl font-bold tracking-tight text-slate-900">
                  {Math.max(90, overview.metrics.postsTotal + overview.metrics.usersTotal + 90)}
                </strong>
                <span className="pb-1 text-sm font-semibold text-[#0ea5a4]">
                  {loading ? "syncing..." : "live status"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric, i) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                className={`card card-hover animate-in stagger-${i + 2} p-5`}
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef3ff] text-[#2454ff]">
                    <Icon className="h-[1.05rem] w-[1.05rem]" />
                  </span>
                  <span className="badge badge-teal">{metric.change}</span>
                </div>
                <p className="mt-4 text-sm text-slate-500">{metric.label}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{metric.value}</p>
              </div>
            );
          })}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card animate-in stagger-6 p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Revenue trend</h2>
              <div className="flex items-center gap-1.5">
                {periodOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPeriod(option)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      period === option
                        ? "bg-[#2454ff] text-white shadow-[0_2px_6px_rgba(36,84,255,0.3)]"
                        : "bg-[#eef3ff] text-[#2454ff] hover:bg-[#dce6ff]"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-500">Interactive analytics with period switch.</p>
            <div className="mt-4 h-64 rounded-xl bg-slate-50/80 p-3">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#5b7bff" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#5b7bff" stopOpacity={0.04} />
                      </linearGradient>
                      <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#20d2c2" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#20d2c2" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dbe5ff" />
                    <XAxis dataKey="name" tick={{ fill: "#637083", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#637083", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="revenue" stroke="#2454ff" strokeWidth={2.2} fill="url(#revenueFill)" />
                    <Area type="monotone" dataKey="signups" stroke="#20d2c2" strokeWidth={2} fill="url(#signupFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </section>
          <section className="card animate-in stagger-7 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">System health</h2>
              <Database className="h-4 w-4 text-[#0ea5a4]" />
            </div>
            <div className="mt-5 space-y-3 text-sm">
              {[
                { name: "API", status: overview.health.api },
                { name: "DB", status: overview.health.db },
                { name: "Redis", status: overview.health.redis }
              ].map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                  <span className="font-medium text-slate-600">{item.name}</span>
                  <span className={`badge ${item.status === "ok" || item.status === "healthy" ? "badge-green" : item.status === "unknown" ? "badge-slate" : "badge-red"}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card animate-in stagger-2 p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Quick actions</h2>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Link href="/resources/posts/create" className="btn-primary justify-center py-3">
                Create post
              </Link>
              <Link href="/settings" className="btn-ghost justify-center py-3">
                Open settings
              </Link>
              <Link href="/audit-logs" className="btn-ghost justify-center py-3">
                View audit log
              </Link>
            </div>
          </section>
          <section className="card animate-in stagger-3 p-5">
            <h2 className="font-bold text-slate-900">Traffic channels</h2>
            <div className="mt-4 space-y-4">
              {overview.charts.trafficChannels.map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-500">
                    <span>{item.label}</span>
                    <span className="font-semibold text-slate-700">{item.value}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div
                      className={`h-1.5 rounded-full ${item.color} transition-all duration-700`}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="card animate-in stagger-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Conversion funnel</h2>
            <span className="badge badge-teal">Q2 benchmark</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {overview.charts.conversion.map((step) => (
              <div key={step.label}>
                <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>{step.label}</span>
                  <span className="font-semibold text-slate-700">{step.value.toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-[#2454ff] to-[#0ea5a4] transition-all duration-700"
                    style={{ width: `${step.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent activity feed */}
        <section className="card animate-in stagger-8 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 dark:text-slate-100">Recent activity</h2>
            <Link href="/resources/audit-logs" className="text-xs font-semibold text-[#2454ff] hover:underline">
              View all
            </Link>
          </div>
          {overview.recentActivity.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No activity yet.</p>
          ) : (
            <ol className="mt-4 space-y-2.5">
              {overview.recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    entry.action === "create" ? "bg-emerald-100 text-emerald-700" :
                    entry.action === "delete" ? "bg-red-100 text-red-600" :
                    "bg-blue-50 text-[#2454ff]"
                  }`}>
                    {entry.action[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-slate-700 dark:text-slate-300">
                      <span className="font-semibold capitalize">{entry.action}</span>{" "}
                      <span className="text-slate-500">{entry.resource ?? "record"}</span>
                      {entry.resourceId && (
                        <span className="ml-1 font-mono text-[11px] text-slate-400">#{entry.resourceId.slice(-6)}</span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      by {entry.user} · {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card animate-in stagger-5 p-5">
            <h2 className="font-bold text-slate-900">CRM template</h2>
            <p className="mt-1 text-sm text-slate-500">Lead pipeline snapshot</p>
            <div className="mt-3 h-44">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.charts.crmPipeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f5" />
                    <XAxis dataKey="stage" tick={{ fill: "#637083", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#637083", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#5b7bff" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </section>
          <section className="card animate-in stagger-6 p-5">
            <h2 className="font-bold text-slate-900">Ecommerce template</h2>
            <p className="mt-1 text-sm text-slate-500">Monthly revenue performance</p>
            <div className="mt-3 h-44">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={overview.charts.ecommerceRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f5" />
                    <XAxis dataKey="month" tick={{ fill: "#637083", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#637083", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="value" stroke="#20d2c2" strokeWidth={2} fill="#20d2c233" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </section>
          <section className="card animate-in stagger-7 p-5">
            <h2 className="font-bold text-slate-900">Marketing template</h2>
            <p className="mt-1 text-sm text-slate-500">Channel mix and attribution</p>
            <div className="mt-3 h-44">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={overview.charts.marketingMix} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={3}>
                      {overview.charts.marketingMix.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
