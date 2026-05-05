"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { api } from "../../lib/api";

type NotificationRecord = {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

type ListResponse<T> = {
  data: T[];
  meta: { total: number };
};

export default function NotificationsPage() {
  const [rows, setRows] = useState<NotificationRecord[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await api<ListResponse<NotificationRecord>>("/admin/resources/notifications?sort=createdAt:desc&limit=50");
      setRows(response.data ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createNotification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      await api("/admin/resources/notifications", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), body: body.trim() || null })
      });
      setTitle("");
      setBody("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create notification");
    }
  }

  async function act(id: string, action: "mark-read" | "mark-unread") {
    try {
      await api(`/admin/resources/notifications/${id}/actions/${action}`, { method: "POST" });
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update notification");
    }
  }

  async function remove(id: string) {
    try {
      await api(`/admin/resources/notifications/${id}`, { method: "DELETE" });
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete notification");
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#0b8585]">Workspace communication</p>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-[#24324b]">Notifications</h1>
          <p className="text-sm text-[#637083]">Create, read, and manage notification lifecycle.</p>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <section className="rounded-2xl border border-[#e4e8f0] bg-white p-5 shadow-[0_12px_34px_rgba(36,50,75,0.07)]">
          <h2 className="text-lg font-bold text-[#24324b]">Create notification</h2>
          <form onSubmit={createNotification} className="mt-4 grid gap-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-xl border border-[#e4e8f0] bg-[#f6f8fc] px-3 py-2 text-sm"
              placeholder="Title"
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-24 rounded-xl border border-[#e4e8f0] bg-[#f6f8fc] px-3 py-2 text-sm"
              placeholder="Body"
            />
            <button type="submit" className="w-fit rounded-xl bg-gradient-to-r from-[#2454ff] to-[#0ea5a4] px-4 py-2 text-sm font-bold text-white">
              Create notification
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-[#e4e8f0] bg-white p-5 shadow-[0_12px_34px_rgba(36,50,75,0.07)]">
          <h2 className="text-lg font-bold text-[#24324b]">Inbox</h2>
          <div className="mt-4 space-y-3">
            {loading ? <p className="text-sm text-[#637083]">Loading notifications...</p> : null}
            {!loading && rows.length === 0 ? <p className="text-sm text-[#637083]">No notifications yet.</p> : null}
            {rows.map((row) => (
              <article key={row.id} className="rounded-xl border border-[#eef2fb] bg-[#f9fbff] p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-[#24324b]">{row.title}</h3>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.readAt ? "bg-[#e5ecff] text-[#2454ff]" : "bg-[#e9fbfa] text-[#0b8585]"}`}>
                    {row.readAt ? "Read" : "Unread"}
                  </span>
                </div>
                {row.body ? <p className="mt-1 text-sm text-[#637083]">{row.body}</p> : null}
                <p className="mt-1 text-xs text-[#8a95a8]">{new Date(row.createdAt).toLocaleString()}</p>
                <div className="mt-2 flex items-center gap-2">
                  {row.readAt ? (
                    <button type="button" onClick={() => act(row.id, "mark-unread")} className="rounded-lg border border-[#dce4f6] bg-white px-3 py-1.5 text-xs font-semibold text-[#24324b]">
                      Mark unread
                    </button>
                  ) : (
                    <button type="button" onClick={() => act(row.id, "mark-read")} className="rounded-lg border border-[#dce4f6] bg-white px-3 py-1.5 text-xs font-semibold text-[#24324b]">
                      Mark read
                    </button>
                  )}
                  <button type="button" onClick={() => remove(row.id)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
