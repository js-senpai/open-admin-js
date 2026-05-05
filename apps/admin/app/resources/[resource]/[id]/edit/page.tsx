"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "../../../../../components/app-shell";
import { ResourceForm } from "../../../../../components/resource-form";
import { api, type ResourceMeta } from "../../../../../lib/api";

export default function EditResourcePage() {
  const params = useParams<{ resource: string; id: string }>();
  const resourceName = useMemo(() => String(params.resource ?? ""), [params.resource]);
  const id = useMemo(() => String(params.id ?? ""), [params.id]);
  const [resource, setResource] = useState<ResourceMeta | null>(null);
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const all = await api<ResourceMeta[]>("/admin/resources");
        const match = all.find((item) => item.name === resourceName) ?? null;
        if (!match) {
          setError("Resource not found or no access granted.");
          return;
        }
        setResource(match);
        const currentRecord = await api<Record<string, unknown>>(`/admin/resources/${resourceName}/${id}`);
        setRecord(currentRecord);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load record");
      }
    }
    load();
  }, [resourceName, id]);

  return (
    <AppShell>
      {resource ? (
        <ResourceForm resource={resource} mode="edit" recordId={id} initialData={record} />
      ) : (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error ?? "Loading record..."}</div>
      )}
    </AppShell>
  );
}
