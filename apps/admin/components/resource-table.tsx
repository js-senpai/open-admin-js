"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2
} from "lucide-react";
import type { ResourceMeta } from "../lib/api";
import { api } from "../lib/api";
import { loadColumnOrder, loadDensity, saveColumnOrder, saveDensity, type TableDensity } from "../lib/resource-table-prefs";

export type SortState = { field: string; dir: "asc" | "desc" } | null;

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

type FieldEntry = [string, ResourceMeta["fields"][string]];

type Props = {
  resource: ResourceMeta;
  rows: Record<string, unknown>[];
  search?: string;
  onSearchChange?: (value: string) => void;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  pagination?: PaginationMeta;
  onPageChange?: (page: number) => void;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void | Promise<void>;
};

function format(value: unknown, type?: string) {
  if (value == null) return "-";
  if (type === "datetime" || type === "date") return new Date(String(value)).toLocaleString();
  if (type === "boolean") return value ? "Yes" : "No";
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

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="skeleton h-4" style={{ width: `${50 + ((i * 23) % 40)}%` }} />
        </td>
      ))}
      <td className="px-4 py-3.5 text-right">
        <div className="skeleton ml-auto h-6 w-12 rounded-lg" />
      </td>
    </tr>
  );
}

function SortIcon({ field, sort }: { field: string; sort?: SortState }) {
  if (!sort || sort.field !== field) return <ArrowUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-400" />;
  return sort.dir === "asc"
    ? <ArrowUp className="h-3 w-3 text-[#2454ff]" />
    : <ArrowDown className="h-3 w-3 text-[#2454ff]" />;
}

function canInlineEdit(field: ResourceMeta["fields"][string], canUpdate: boolean): boolean {
  if (!canUpdate || field.edit === false || field.sensitive) return false;
  return ["text", "number", "boolean", "select", "badge"].includes(field.type);
}

export function ResourceTable({
  resource,
  rows,
  search = "",
  onSearchChange,
  sort,
  onSortChange,
  pagination,
  onPageChange,
  loading = false,
  error,
  onRefresh
}: Props) {
  const canUpdate = Boolean(resource.permissions.update);
  const listFieldEntries = useMemo(
    () => Object.entries(resource.fields).filter(([, f]) => f.list !== false).slice(0, 12) as FieldEntry[],
    [resource.fields]
  );
  const defaultColumnKeys = useMemo(() => listFieldEntries.map(([n]) => n), [listFieldEntries]);

  const [columnOrder, setColumnOrder] = useState<string[]>(defaultColumnKeys);
  const [density, setDensity] = useState<TableDensity>("comfortable");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [inlineBusy, setInlineBusy] = useState<string | null>(null);
  const [tableMessage, setTableMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ rowId: string; field: string; value: string } | null>(null);
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragCol, setDragCol] = useState<string | null>(null);

  const listReorderEnabled =
    resource.fields.order?.type === "number" && resource.fields.order.list !== false && canUpdate;
  const bulkEnabled =
    Boolean(resource.permissions.delete) || Boolean(resource.actions && Object.keys(resource.actions).length > 0);

  useEffect(() => {
    setColumnOrder(loadColumnOrder(resource.name, defaultColumnKeys));
    setDensity(loadDensity(resource.name));
  }, [resource.name, defaultColumnKeys]);

  useEffect(() => {
    setSelected(new Set());
  }, [resource.name, rows, search, sort, pagination?.page]);

  const fields = useMemo(() => {
    const map = new Map(listFieldEntries);
    const ordered: FieldEntry[] = [];
    for (const key of columnOrder) {
      const f = resource.fields[key];
      if (f && f.list !== false) ordered.push([key, f]);
    }
    for (const [k, f] of listFieldEntries) {
      if (!ordered.some(([n]) => n === k)) ordered.push([k, f]);
    }
    return ordered.slice(0, 12);
  }, [columnOrder, listFieldEntries, resource.fields]);

  const padClass = density === "compact" ? "px-3 py-2" : "px-4 py-3.5";
  const textClass = density === "compact" ? "text-xs" : "text-sm";

  function handleSort(name: string) {
    if (!onSortChange) return;
    const field = resource.fields[name];
    if (!field?.sortable) return;
    if (sort?.field === name) {
      onSortChange({ field: name, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ field: name, dir: "asc" });
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    const pageIds = rows.map((r) => String(r.id)).filter(Boolean);
    const allOn = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    setSelected(() => {
      if (allOn) return new Set();
      return new Set(pageIds);
    });
  }

  const persistReorder = useCallback(
    async (orderedIds: string[]) => {
      const base =
        pagination && pagination.limit ? Math.max(0, (pagination.page - 1) * pagination.limit) : 0;
      try {
        await api(`/admin/resources/${resource.name}/reorder`, {
          method: "POST",
          body: JSON.stringify({ ids: orderedIds, baseIndex: base })
        });
        setTableMessage(null);
        await onRefresh?.();
      } catch (e) {
        setTableMessage(e instanceof Error ? e.message : "Reorder failed");
      }
    },
    [resource.name, pagination, onRefresh]
  );

  const onRowDragStart = (id: string) => setDragRowId(id);
  const onRowDragEnd = () => setDragRowId(null);

  const onRowDrop = (targetId: string) => {
    if (!listReorderEnabled || !dragRowId || dragRowId === targetId) return;
    const ids = rows.map((r) => String(r.id));
    const from = ids.indexOf(dragRowId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...rows];
    const removed = next.splice(from, 1);
    const moved = removed[0];
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    void persistReorder(next.map((r) => String(r.id)));
    setDragRowId(null);
  };

  const runBulkAction = async (action: string) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    setTableMessage(null);
    try {
      const res = await api<{ ok: number; failures: { id: string; message: string }[] }>(`/admin/resources/${resource.name}/bulk`, {
        method: "POST",
        body: JSON.stringify({ action, ids })
      });
      if (res.failures?.length) {
        setTableMessage(`${res.ok} ok, ${res.failures.length} failed: ${res.failures[0]?.message ?? ""}`);
      } else {
        setTableMessage(`Applied to ${res.ok} record(s).`);
      }
      setSelected(new Set());
      await onRefresh?.();
    } catch (e) {
      setTableMessage(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const saveInline = async (rowId: string, fieldName: string, raw: string, field: ResourceMeta["fields"][string]) => {
    let value: unknown = raw;
    if (field.type === "number") {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        setTableMessage("Invalid number");
        return;
      }
      value = n;
    } else if (field.type === "boolean") value = raw === "true" || raw === "1";
    setInlineBusy(`${rowId}:${fieldName}`);
    setTableMessage(null);
    try {
      await api(`/admin/resources/${resource.name}/${rowId}`, {
        method: "PATCH",
        body: JSON.stringify({ [fieldName]: value })
      });
      setEditing(null);
      await onRefresh?.();
    } catch (e) {
      setTableMessage(e instanceof Error ? e.message : "Update failed");
    } finally {
      setInlineBusy(null);
    }
  };

  const densityToggle = () => {
    const next = density === "comfortable" ? "compact" : "comfortable";
    setDensity(next);
    saveDensity(resource.name, next);
  };

  const onColDragStart = (name: string) => setDragCol(name);
  const onColDragEnd = () => setDragCol(null);
  const onColDrop = (target: string) => {
    if (!dragCol || dragCol === target) return;
    const keys = fields.map(([n]) => n);
    const from = keys.indexOf(dragCol);
    const to = keys.indexOf(target);
    if (from < 0 || to < 0) return;
    const next = [...keys];
    const removed = next.splice(from, 1);
    const c = removed[0];
    if (c === undefined) return;
    next.splice(to, 0, c);
    setColumnOrder(next);
    saveColumnOrder(resource.name, next);
    setDragCol(null);
  };

  const extraCols = (bulkEnabled ? 1 : 0) + (listReorderEnabled ? 1 : 0) + 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between animate-in stagger-1">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#0ea5a4]">Resource</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {resource.label}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage and search {resource.label.toLowerCase()} records.
            {pagination && (
              <span className="ml-1 font-medium text-slate-700 dark:text-slate-300">{pagination.total} total</span>
            )}
          </p>
        </div>
        {resource.permissions.create && (
          <Link href={`/resources/${resource.name}/create`} className="btn-primary shrink-0">
            <Plus className="h-4 w-4" />
            Create {resource.label}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 animate-in stagger-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all focus-within:border-[#2454ff] focus-within:shadow-[0_0_0_3px_rgba(36,84,255,0.1)] dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
            placeholder={`Search ${resource.label.toLowerCase()}...`}
          />
          {search && (
            <button type="button" onClick={() => onSearchChange?.("")} className="text-xs text-slate-400 hover:text-slate-600">
              Clear
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={densityToggle}
          className="btn-ghost flex items-center gap-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          title={density === "comfortable" ? "Switch to compact density" : "Switch to comfortable density"}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">{density === "comfortable" ? "Comfortable" : "Compact"}</span>
        </button>
      </div>

      {selected.size > 0 && bulkEnabled && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#2454ff]/30 bg-[#eef3ff] px-4 py-3 text-sm dark:border-blue-500/30 dark:bg-slate-800/80">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{selected.size} selected</span>
          {resource.permissions.delete && (
            <button
              type="button"
              disabled={bulkBusy}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400"
              onClick={() => {
                if (typeof window !== "undefined" && !window.confirm(`Delete ${selected.size} record(s)?`)) return;
                void runBulkAction("delete");
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
          {resource.actions &&
            Object.entries(resource.actions).map(([key, action]) => (
              <button
                key={key}
                type="button"
                disabled={bulkBusy}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                onClick={() => {
                  if (action.confirm && typeof window !== "undefined" && !window.confirm(`Run “${action.label}” on ${selected.size} row(s)?`)) {
                    return;
                  }
                  void runBulkAction(key);
                }}
              >
                {action.label}
              </button>
            ))}
        </div>
      )}

      {tableMessage && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {tableMessage}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 fade-in">
          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] animate-in stagger-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className={`w-full text-left ${textClass}`}>
            <thead className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/50">
              <tr>
                {listReorderEnabled && (
                  <th className={`${padClass} w-8`} aria-hidden />
                )}
                {bulkEnabled && (
                  <th className={`${padClass} w-10`}>
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={rows.length > 0 && rows.every((r) => selected.has(String(r.id)))}
                      onChange={toggleSelectAllOnPage}
                      aria-label="Select all on this page"
                    />
                  </th>
                )}
                {fields.map(([name, field]) => {
                  const sortable = Boolean(field.sortable) && Boolean(onSortChange);
                  return (
                    <th
                      key={name}
                      draggable
                      onDragStart={() => onColDragStart(name)}
                      onDragEnd={() => onColDragEnd()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onColDrop(name)}
                      className={`${padClass} ${sortable ? "cursor-pointer select-none" : "cursor-grab active:cursor-grabbing"}`}
                      onClick={() => sortable && handleSort(name)}
                    >
                      <div className="group flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {field.label ?? name}
                        {sortable && <SortIcon field={name} sort={sort} />}
                      </div>
                    </th>
                  );
                })}
                <th className={`${padClass} text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonRow
                    key={i}
                    cols={fields.length + (bulkEnabled ? 1 : 0) + (listReorderEnabled ? 1 : 0)}
                  />
                ))
              ) : rows.length > 0 ? (
                rows.map((row, index) => {
                  const rowId = String(row.id ?? index);
                  return (
                    <tr
                      key={rowId}
                      className={`group transition-colors hover:bg-blue-50/30 dark:hover:bg-slate-800/50 ${dragRowId === rowId ? "opacity-70" : ""}`}
                      onDragOver={(e) => listReorderEnabled && e.preventDefault()}
                      onDrop={() => onRowDrop(rowId)}
                    >
                      {listReorderEnabled && (
                        <td
                          className={`${padClass} w-8 cursor-grab text-slate-400`}
                          draggable
                          onDragStart={() => onRowDragStart(rowId)}
                          onDragEnd={() => onRowDragEnd()}
                          title="Drag to reorder"
                        >
                          <GripVertical className="h-4 w-4" />
                        </td>
                      )}
                      {bulkEnabled && (
                        <td className={padClass}>
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={selected.has(rowId)}
                            onChange={() => toggleSelect(rowId)}
                            aria-label={`Select row ${rowId}`}
                          />
                        </td>
                      )}
                      {fields.map(([name, field]) => {
                        const showEdit =
                          editing?.rowId === rowId && editing.field === name && canInlineEdit(field, canUpdate);
                        const busy = inlineBusy === `${rowId}:${name}`;
                        const cellEdit = () => {
                          if (!canInlineEdit(field, canUpdate) || busy) return;
                          setEditing({
                            rowId,
                            field: name,
                            value: String(row[name] ?? "")
                          });
                        };
                        return (
                          <td
                            key={name}
                            className={`${padClass} text-slate-700 dark:text-slate-300 ${canInlineEdit(field, canUpdate) ? "cursor-cell" : ""}`}
                            onDoubleClick={cellEdit}
                          >
                            {showEdit ? (
                              <div className="flex items-center gap-1">
                                {field.type === "boolean" ? (
                                  <select
                                    autoFocus
                                    className="input-base max-w-[10rem] py-1 text-xs"
                                    value={editing.value === "true" || editing.value === "1" ? "true" : "false"}
                                    onChange={(e) =>
                                      setEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                                    }
                                    onBlur={() =>
                                      void saveInline(rowId, name, editing.value === "true" ? "true" : "false", field)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        void saveInline(rowId, name, editing.value === "true" ? "true" : "false", field);
                                      }
                                      if (e.key === "Escape") setEditing(null);
                                    }}
                                  >
                                    <option value="true">Yes</option>
                                    <option value="false">No</option>
                                  </select>
                                ) : field.type === "select" || (field.type === "badge" && (field.options?.length ?? 0) > 0) ? (
                                  <select
                                    autoFocus
                                    className="input-base max-w-[12rem] py-1 text-xs"
                                    value={editing.value}
                                    onChange={(e) =>
                                      setEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                                    }
                                    onBlur={() => void saveInline(rowId, name, editing.value, field)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") void saveInline(rowId, name, editing.value, field);
                                      if (e.key === "Escape") setEditing(null);
                                    }}
                                  >
                                    {(field.options ?? []).map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    autoFocus
                                    className="input-base max-w-[14rem] py-1 text-xs"
                                    type={field.type === "number" ? "number" : "text"}
                                    value={editing.value}
                                    onChange={(e) =>
                                      setEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                                    }
                                    onBlur={() => void saveInline(rowId, name, editing.value, field)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") void saveInline(rowId, name, editing.value, field);
                                      if (e.key === "Escape") setEditing(null);
                                    }}
                                  />
                                )}
                              </div>
                            ) : field.type === "badge" || name === "status" ? (
                              <span className={statusBadgeClass(format(row[name], field.type))}>
                                {format(row[name], field.type)}
                              </span>
                            ) : (
                              <span className="line-clamp-1 block max-w-[220px]">
                                {busy ? "…" : format(row[name], field.type)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className={`${padClass} text-right`}>
                        <Link
                          href={`/resources/${resource.name}/${rowId}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-all hover:bg-[#eef3ff] hover:text-[#2454ff] dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="py-16 text-center" colSpan={fields.length + extraCols}>
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                        <Search className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No records found</p>
                        <p className="mt-0.5 text-xs">
                          {search ? "Try a different search term." : "Create your first record."}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-xs text-slate-400">
              Page {pagination.page} of {pagination.pages} · {pagination.total} records
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => onPageChange?.(pagination.page - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                const p = Math.max(1, Math.min(pagination.page - 2, pagination.pages - 4)) + i;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPageChange?.(p)}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition ${
                      p === pagination.page
                        ? "bg-[#2454ff] text-white shadow-[0_2px_6px_rgba(36,84,255,0.35)]"
                        : "border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={pagination.page >= pagination.pages}
                onClick={() => onPageChange?.(pagination.page + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {!loading && rows.length > 0 && (!pagination || pagination.pages <= 1) && (
          <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-xs text-slate-400">
              {pagination?.total ?? rows.length} record{(pagination?.total ?? rows.length) !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
