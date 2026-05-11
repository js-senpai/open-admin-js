"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { api } from "../../lib/api";

type LogRow = {
  timestamp: string;
  level: string;
  message: string;
  method?: string;
  path?: string;
  statusCode?: number;
  errorMessage?: string;
};

type LogsResponse = {
  data: LogRow[];
  meta: { page: number; limit: number; total: number; pages: number };
};

function formatDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export default function SystemLogsPage() {
  const [level, setLevel] = useState<"info" | "error">("info");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("level", level);
    params.set("page", String(page));
    params.set("limit", "50");
    if (search.trim()) params.set("search", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [level, page, search, from, to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api<LogsResponse>(`/admin/logs?${query}`)
      .then((res) => {
        if (cancelled) return;
        setRows(res.data);
        setPages(res.meta.pages || 1);
        setTotal(res.meta.total || 0);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(e instanceof Error ? e.message : "Failed to load logs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">System Logs</h1>
          <p className="text-sm text-slate-500">Filter and inspect application log files.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 md:grid-cols-5">
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as "info" | "error");
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="info">Info</option>
            <option value="error">Error</option>
          </select>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search text"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 md:col-span-2"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
            <span className="text-slate-500">{total} log entries</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-700"
              >
                Prev
              </button>
              <span className="text-slate-500">
                {page} / {pages}
              </span>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-700"
              >
                Next
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800">
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Level</th>
                  <th className="px-4 py-2">Message</th>
                  <th className="px-4 py-2">Request</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={5}>
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td className="px-4 py-4 text-red-500" colSpan={5}>
                      {error}
                    </td>
                  </tr>
                )}
                {!loading &&
                  !error &&
                  rows.map((row, idx) => (
                    <tr key={`${row.timestamp}-${idx}`} className="border-b border-slate-100 dark:border-slate-900">
                      <td className="whitespace-nowrap px-4 py-2">{formatDate(row.timestamp)}</td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            row.level === "error"
                              ? "rounded bg-red-100 px-2 py-0.5 text-xs text-red-700"
                              : "rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                          }
                        >
                          {row.level}
                        </span>
                      </td>
                      <td className="max-w-xl truncate px-4 py-2" title={row.errorMessage ?? row.message}>
                        {row.errorMessage ?? row.message}
                      </td>
                      <td className="px-4 py-2">
                        {row.method && row.path ? `${row.method} ${row.path}` : "-"}
                      </td>
                      <td className="px-4 py-2">{row.statusCode ?? "-"}</td>
                    </tr>
                  ))}
                {!loading && !error && rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={5}>
                      No log entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

