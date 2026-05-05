"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Loader2, Save, Search, X } from "lucide-react";
import { api, type ResourceMeta } from "../lib/api";

type Props = {
  resource: ResourceMeta;
  mode: "create" | "edit";
  recordId?: string;
  initialData?: Record<string, unknown> | null;
};

function normalizeValue(value: unknown, type: string) {
  if (value == null) return "";
  if (type === "json") return JSON.stringify(value, null, 2);
  if (type === "boolean") return String(Boolean(value));
  return String(value);
}

function parseValue(value: string, type: string): unknown {
  if (value === "") return null;
  if (type === "number" || type === "money") return Number(value);
  if (type === "boolean") return value === "true";
  if (type === "json") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

// ──────────────────────────────────────────────
// Relation picker component
// ──────────────────────────────────────────────

type RelationPickerProps = {
  field: ResourceMeta["fields"][string];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
};

function RelationPicker({ field, value, onChange, disabled }: RelationPickerProps) {
  const relatedResource = field.resource;
  const displayField = field.displayField ?? "name";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Load initial label for the current value
  useEffect(() => {
    if (!value || !relatedResource) return;
    api<Record<string, unknown>>(`/admin/resources/${relatedResource}/${value}`)
      .then((rec) => setSelectedLabel(String(rec[displayField] ?? rec.name ?? rec.title ?? value)))
      .catch(() => setSelectedLabel(value));
  }, [value, relatedResource, displayField]);

  // Load options when popover opens or search changes
  useEffect(() => {
    if (!open || !relatedResource) return;
    setLoading(true);
    const q = search ? `?search=${encodeURIComponent(search)}` : "?limit=20";
    api<{ data: Record<string, unknown>[] }>(`/admin/resources/${relatedResource}${q}`)
      .then((res) => {
        setOptions((res.data ?? []).map((row) => ({
          id: String(row.id ?? ""),
          label: String(row[displayField] ?? row.name ?? row.title ?? row.id ?? "")
        })));
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [open, search, relatedResource, displayField]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="input-base flex items-center justify-between text-left"
      >
        <span className={selectedLabel || value ? "text-slate-900 dark:text-slate-100" : "text-slate-400"}>
          {selectedLabel || value || `Select ${field.label ?? relatedResource}…`}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && (onChange(""), setSelectedLabel(""))}
              onClick={(e) => { e.stopPropagation(); onChange(""); setSelectedLabel(""); }}
              className="rounded p-0.5 hover:bg-slate-200"
              aria-label="Clear"
            >
              <X className="h-3 w-3 text-slate-400" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:border-slate-700 dark:bg-slate-900">
          {/* Search box */}
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          {/* Options */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {loading ? (
              <li className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </li>
            ) : options.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-400">No records found</li>
            ) : (
              options.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(opt.id); setSelectedLabel(opt.label); setOpen(false); setSearch(""); }}
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-blue-50 hover:text-[#2454ff] dark:hover:bg-slate-800 ${
                      opt.id === value ? "bg-[#eef3ff] font-semibold text-[#2454ff] dark:bg-slate-800" : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {opt.label}
                    {opt.id === value && <span className="ml-2 text-[10px] text-slate-400">#{opt.id.slice(-6)}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main form
// ──────────────────────────────────────────────

export function ResourceForm({ resource, mode, recordId, initialData }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [values, setValues] = useState<Record<string, string>>({});

  const fields = Object.entries(resource.fields).filter(
    ([, field]) => field[mode] !== false && !["id", "hidden", "computed"].includes(field.type)
  );

  const fieldMap = useMemo(() => Object.fromEntries(Object.entries(resource.fields)), [resource.fields]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const [name, field] of fields) {
      next[name] = normalizeValue(initialData?.[name], field.type);
    }
    setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const payload = Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
          name,
          parseValue(value, fieldMap[name]?.type ?? "text")
        ])
      );
      if (mode === "create") {
        const created = await api<Record<string, unknown>>(
          `/admin/resources/${resource.name}`,
          { method: "POST", body: JSON.stringify(payload) }
        );
        if (typeof window !== "undefined" && created.id && typeof created.plainToken === "string") {
          window.sessionStorage.setItem(
            `openadminjs.plainToken.${String(created.id)}`,
            created.plainToken
          );
        }
        router.push(`/resources/${resource.name}/${String(created.id ?? "")}`);
      } else {
        await api(`/admin/resources/${resource.name}/${recordId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        router.push(`/resources/${resource.name}/${recordId}`);
      }
      router.refresh();
    } catch (submitError) {
      if (submitError instanceof Error) {
        // Try to parse structured validation errors
        try {
          const body = JSON.parse(submitError.message) as { issues?: { fieldErrors?: Record<string, string[]> } };
          if (body.issues?.fieldErrors) {
            setFieldErrors(body.issues.fieldErrors);
            setError("Please fix the validation errors below.");
            return;
          }
        } catch { /* not JSON */ }
        setError(submitError.message);
      } else {
        setError("Failed to save record");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center gap-3 stagger-1">
        <Link
          href={`/resources/${resource.name}`}
          className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#0ea5a4]">
            {mode === "create" ? "New record" : "Edit record"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {mode === "create" ? "Create" : "Edit"} {resource.label}
          </h1>
        </div>
      </div>

      {/* Fields card */}
      <div className="card stagger-2 p-6 space-y-5 dark:border-slate-700 dark:bg-slate-900">
        {fields.map(([name, field]) => {
          const errs = fieldErrors[name];
          return (
            <label key={name} className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {field.label ?? name}
                {field.required && <span className="ml-1 text-red-500">*</span>}
              </span>

              {field.type === "relation" ? (
                <RelationPicker
                  field={field}
                  value={values[name] ?? ""}
                  onChange={(id) => setValues((cur) => ({ ...cur, [name]: id }))}
                  disabled={submitting}
                />
              ) : field.type === "select" || field.type === "badge" ? (
                <select
                  value={values[name] ?? ""}
                  onChange={(e) => setValues((cur) => ({ ...cur, [name]: e.target.value }))}
                  className="input-base"
                  disabled={submitting}
                >
                  <option value="">— select —</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <select
                  value={values[name] ?? "false"}
                  onChange={(e) => setValues((cur) => ({ ...cur, [name]: e.target.value }))}
                  className="input-base"
                  disabled={submitting}
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : field.type === "textarea" || field.type === "richtext" || field.type === "markdown" || field.type === "json" ? (
                <textarea
                  value={values[name] ?? ""}
                  onChange={(e) => setValues((cur) => ({ ...cur, [name]: e.target.value }))}
                  className="input-base min-h-32 resize-y font-mono text-xs"
                  spellCheck={field.type !== "json"}
                  disabled={submitting}
                />
              ) : (
                <input
                  value={values[name] ?? ""}
                  onChange={(e) => setValues((cur) => ({ ...cur, [name]: e.target.value }))}
                  type={
                    field.type === "password" ? "password" :
                    field.type === "email" ? "email" :
                    field.type === "number" || field.type === "money" ? "number" :
                    "text"
                  }
                  className="input-base"
                  disabled={submitting}
                />
              )}

              {errs && errs.length > 0 && (
                <p className="text-xs text-red-500">{errs.join(", ")}</p>
              )}
            </label>
          );
        })}

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 fade-in">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            {error}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between stagger-3">
        <Link href={`/resources/${resource.name}`} className="btn-ghost">
          Cancel
        </Link>
        <button disabled={submitting} className="btn-primary">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {submitting ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
