"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { ResourceTable, type PaginationMeta, type SortState } from "../../../components/resource-table";
import { api, type ResourceMeta } from "../../../lib/api";

type ListResponse = {
  data: Record<string, unknown>[];
  meta: PaginationMeta;
};

const PAGE_SIZE = 20;

export default function ResourcePage() {
  const params = useParams<{ resource: string }>();
  const resourceName = useMemo(() => String(params.resource ?? ""), [params.resource]);

  const [resources, setResources] = useState<ResourceMeta[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resource = resources.find((item) => item.name === resourceName);

  useEffect(() => {
    api<ResourceMeta[]>("/admin/resources")
      .then(setResources)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load resources"));
  }, []);

  const loadRows = useCallback(async () => {
    if (!resourceName) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("limit", String(PAGE_SIZE));
      if (search) qs.set("search", search);
      if (sort) qs.set("sort", `${sort.field}:${sort.dir}`);
      const response = await api<ListResponse>(`/admin/resources/${resourceName}?${qs.toString()}`);
      setRows(response.data ?? []);
      setPagination(response.meta);
      setError(null);
    } catch (loadError) {
      setRows([]);
      setPagination(undefined);
      setError(loadError instanceof Error ? loadError.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, [resourceName, search, sort, page]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  // Reset to page 1 when search or sort changes
  useEffect(() => { setPage(1); }, [search, sort]);

  if (!loading && !resource && resources.length > 0) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Resource not found or no access granted.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {resource ? (
        <ResourceTable
          resource={resource}
          rows={rows}
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          pagination={pagination}
          onPageChange={setPage}
          loading={loading}
          error={error}
        />
      ) : (
        <div className="space-y-5">
          {/* Skeleton header while resources load */}
          <div className="skeleton h-8 w-48 rounded-xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      )}
    </AppShell>
  );
}
