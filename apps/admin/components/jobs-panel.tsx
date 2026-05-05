"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

type JobLog = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
};

type JobStats = {
  counts: Record<string, number>;
  recent: JobLog[];
};

export function JobsPanel() {
  const [stats, setStats] = useState<JobStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const data = await api<JobStats>("/jobs/stats");
      setStats(data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load jobs");
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function enqueueDemoJob() {
    setSubmitting(true);
    try {
      await api("/jobs/dispatch", { method: "POST" });
      await loadStats();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to enqueue job");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#637083] dark:text-zinc-300">BullMQ queue telemetry and recent lifecycle logs from real dispatched jobs.</p>
        <button
          type="button"
          onClick={enqueueDemoJob}
          disabled={submitting}
          className="rounded-xl bg-[#0b8585] px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#0a7474] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Dispatching..." : "Dispatch sync job"}
        </button>
      </div>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 md:grid-cols-5">
        {["waiting", "active", "completed", "failed", "delayed"].map((key) => (
          <div key={key} className="rounded-xl border border-[#e4e8f0] bg-[#fafcff] p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs uppercase tracking-wide text-[#637083]">{key}</p>
            <p className="mt-2 text-2xl font-semibold text-[#24324b] dark:text-zinc-100">{stats?.counts[key] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e4e8f0] dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f4f7fb] text-[#637083] dark:bg-zinc-900 dark:text-zinc-300">
            <tr>
              <th className="px-4 py-3 font-medium">Job</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.recent ?? []).map((row) => (
              <tr key={row.id} className="border-t border-[#e4e8f0] dark:border-zinc-800">
                <td className="px-4 py-3 text-[#24324b] dark:text-zinc-100">{row.name}</td>
                <td className="px-4 py-3 capitalize text-[#637083] dark:text-zinc-300">{row.status}</td>
                <td className="px-4 py-3 text-[#637083] dark:text-zinc-300">{new Date(row.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {stats?.recent?.length ? null : (
              <tr>
                <td className="px-4 py-5 text-[#637083] dark:text-zinc-300" colSpan={3}>
                  No jobs logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
