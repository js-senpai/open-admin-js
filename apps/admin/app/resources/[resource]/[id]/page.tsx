"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Pencil, Save, Trash2, X, Zap } from "lucide-react";
import { AppShell } from "../../../../components/app-shell";
import { api, type ResourceMeta } from "../../../../lib/api";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatValue(value: unknown, type?: string): string {
  if (value == null || value === "") return "—";
  if (type === "datetime" || type === "date") return new Date(String(value)).toLocaleString();
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "json" || typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function statusBadgeClass(value: string) {
  const v = value.toLowerCase();
  if (v === "published" || v === "active" || v === "completed") return "badge badge-green";
  if (v === "draft" || v === "inactive" || v === "pending") return "badge badge-slate";
  if (v === "archived" || v === "failed") return "badge badge-red";
  if (v === "processing" || v === "review") return "badge badge-yellow";
  return "badge badge-blue";
}

// ──────────────────────────────────────────────
// Delete confirmation modal
// ──────────────────────────────────────────────

function DeleteModal({
  resourceLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  resourceLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-100">Delete {resourceLabel}</h2>
            <p className="mt-0.5 text-sm text-slate-500">This action cannot be undone.</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn-ghost" disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Quick-edit row
// ──────────────────────────────────────────────

type QuickEditRowProps = {
  fieldName: string;
  field: ResourceMeta["fields"][string];
  value: unknown;
  onSave: (name: string, newValue: unknown) => Promise<void>;
};

function QuickEditRow({ fieldName, field, value, onSave }: QuickEditRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const canEdit = field.edit !== false && !["id", "hidden", "computed"].includes(field.type);

  function startEdit() {
    if (!canEdit) return;
    const str = value == null ? "" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
    setDraft(str);
    setEditing(true);
  }

  async function commitEdit() {
    setSaving(true);
    try {
      let parsed: unknown = draft;
      if (field.type === "number" || field.type === "money") parsed = draft === "" ? null : Number(draft);
      else if (field.type === "boolean") parsed = draft === "true";
      else if (field.type === "json") { try { parsed = JSON.parse(draft); } catch { /* keep string */ } }
      await onSave(fieldName, parsed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const displayValue = formatValue(value, field.type);
  const isStatus = field.type === "badge" || fieldName === "status";

  return (
    <div className="group flex items-start gap-4 rounded-xl px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <dt className="w-40 shrink-0 text-sm font-medium text-slate-500 dark:text-slate-400">{field.label ?? fieldName}</dt>
      <dd className="flex min-w-0 flex-1 items-start gap-2">
        {editing ? (
          <div className="flex flex-1 items-center gap-2">
            {field.type === "boolean" ? (
              <select
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="input-base flex-1"
                autoFocus
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            ) : field.type === "select" || field.type === "badge" ? (
              <select
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="input-base flex-1"
                autoFocus
              >
                {(field.options ?? []).map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            ) : field.type === "textarea" || field.type === "json" || field.type === "markdown" ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="input-base min-h-20 flex-1 resize-y font-mono text-xs"
                autoFocus
              />
            ) : (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                type={field.type === "number" || field.type === "money" ? "number" : field.type === "email" ? "email" : "text"}
                className="input-base flex-1"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") void commitEdit(); if (e.key === "Escape") setEditing(false); }}
              />
            )}
            <button
              type="button"
              onClick={() => void commitEdit()}
              disabled={saving}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2454ff] text-white disabled:opacity-60"
              aria-label="Save"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            {isStatus && typeof value === "string" && value ? (
              <span className={statusBadgeClass(displayValue)}>{displayValue}</span>
            ) : field.type === "json" || typeof value === "object" ? (
              <pre className="flex-1 overflow-x-auto rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {displayValue}
              </pre>
            ) : (
              <span className="flex-1 break-words text-sm text-slate-800 dark:text-slate-200">{displayValue}</span>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={startEdit}
                className="invisible ml-auto shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-[#2454ff] group-hover:visible dark:hover:bg-slate-700"
                aria-label={`Edit ${field.label ?? fieldName}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </dd>
    </div>
  );
}

// ──────────────────────────────────────────────
// Detail page
// ──────────────────────────────────────────────

export default function DetailPage() {
  const router = useRouter();
  const params = useParams<{ resource: string; id: string }>();
  const resourceName = useMemo(() => String(params.resource ?? ""), [params.resource]);
  const id = useMemo(() => String(params.id ?? ""), [params.id]);

  const [resource, setResource] = useState<ResourceMeta | null>(null);
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const all = await api<ResourceMeta[]>("/admin/resources");
        const match = all.find((item) => item.name === resourceName) ?? null;
        if (!match) { setError("Resource not found or no access granted."); return; }
        setResource(match);
        const currentRecord = await api<Record<string, unknown>>(`/admin/resources/${resourceName}/${id}`);
        setRecord(currentRecord);
        if (typeof window !== "undefined") {
          const key = `openadminjs.plainToken.${id}`;
          const maybeToken = window.sessionStorage.getItem(key);
          if (maybeToken) { setPlainToken(maybeToken); window.sessionStorage.removeItem(key); }
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load record");
      }
    }
    void load();
  }, [resourceName, id]);

  async function removeRecord() {
    setBusyAction("delete");
    try {
      await api(`/admin/resources/${resourceName}/${id}`, { method: "DELETE" });
      router.push(`/resources/${resourceName}`);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to delete record");
      setConfirmDelete(false);
    } finally {
      setBusyAction(null);
    }
  }

  async function runAction(actionName: string) {
    setBusyAction(actionName);
    setError(null);
    try {
      const updated = await api<Record<string, unknown>>(
        `/admin/resources/${resourceName}/${id}/actions/${actionName}`,
        { method: "POST" }
      );
      setRecord(updated);
      setSuccessMsg(`Action "${actionName}" completed.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to run action");
    } finally {
      setBusyAction(null);
    }
  }

  async function quickSave(fieldName: string, newValue: unknown) {
    setError(null);
    try {
      const updated = await api<Record<string, unknown>>(
        `/admin/resources/${resourceName}/${id}`,
        { method: "PATCH", body: JSON.stringify({ [fieldName]: newValue }) }
      );
      setRecord(updated);
      setSuccessMsg(`"${resource?.fields[fieldName]?.label ?? fieldName}" updated.`);
      setTimeout(() => setSuccessMsg(null), 2500);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save");
      throw saveError;
    }
  }

  const displayFields = resource
    ? Object.entries(resource.fields).filter(
        ([, f]) => f.type !== "hidden" && !f.sensitive
      )
    : [];

  const titleField = resource?.titleField ?? "id";
  const title = record ? String(record[titleField] ?? record.id ?? id) : id;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 animate-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between stagger-1">
          <div className="flex items-center gap-3">
            <Link
              href={`/resources/${resourceName}`}
              className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#0ea5a4]">
                {resource?.label ?? "Resource"}
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {title}
              </h1>
              <p className="mt-0.5 font-mono text-[11px] text-slate-400">id: {id}</p>
            </div>
          </div>

          {/* Actions bar */}
          <div className="flex flex-wrap items-center gap-2">
            {resource?.actions
              ? Object.entries(resource.actions).map(([actionName, config]) => (
                  <button
                    key={actionName}
                    type="button"
                    onClick={() => void runAction(actionName)}
                    disabled={Boolean(busyAction)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[#2454ff] hover:text-[#2454ff] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {busyAction === actionName
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Zap className="h-3.5 w-3.5" />}
                    {config.label}
                  </button>
                ))
              : null}
            {resource?.permissions.update ? (
              <Link
                href={`/resources/${resourceName}/${id}/edit`}
                className="btn-primary"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            ) : null}
            {resource?.permissions.delete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={Boolean(busyAction)}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            ) : null}
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 fade-in dark:bg-red-900/20 dark:text-red-400">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            {error}
          </div>
        )}
        {successMsg && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 fade-in dark:bg-emerald-900/20 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {successMsg}
          </div>
        )}

        {/* One-time plain token */}
        {plainToken && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-900/20">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Copy this token now — it will not be shown again.
            </p>
            <code className="mt-2 block overflow-auto rounded-lg bg-white p-3 font-mono text-xs text-amber-900 dark:bg-slate-900 dark:text-amber-200">
              {plainToken}
            </code>
          </div>
        )}

        {/* Field values card */}
        <div className="card stagger-2 overflow-hidden dark:border-slate-700 dark:bg-slate-900">
          {record && resource ? (
            <dl>
              {displayFields.map(([name, field], idx) => (
                <div
                  key={name}
                  className={idx > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""}
                >
                  <QuickEditRow
                    fieldName={name}
                    field={field}
                    value={record[name]}
                    onSave={quickSave}
                  />
                </div>
              ))}
            </dl>
          ) : (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="skeleton h-4 w-32" />
                  <div className="skeleton h-4 flex-1" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick-edit hint */}
        {resource?.permissions.update && record && (
          <p className="text-center text-xs text-slate-400">
            Hover a field and click the <Pencil className="inline h-3 w-3" /> icon to edit inline.
          </p>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && resource && (
        <DeleteModal
          resourceLabel={resource.label}
          onConfirm={() => void removeRecord()}
          onCancel={() => setConfirmDelete(false)}
          busy={busyAction === "delete"}
        />
      )}
    </AppShell>
  );
}
