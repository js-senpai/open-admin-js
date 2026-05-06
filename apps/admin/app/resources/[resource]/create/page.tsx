"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "../../../../components/app-shell";
import { ResourceForm } from "../../../../components/resource-form";
import { api, type ResourceMeta } from "../../../../lib/api";

export default function CreateResourcePage() {
  const params = useParams<{ resource: string }>();
  const resourceName = useMemo(() => String(params.resource ?? ""), [params.resource]);
  const [resource, setResource] = useState<ResourceMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadResource() {
      try {
        const all = await api<ResourceMeta[]>("/admin/resources");
        const match = all.find((item) => item.name === resourceName) ?? null;
        setResource(match);
        if (!match) setError("Resource not found or no access granted.");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load resource");
      }
    }
    loadResource();
  }, [resourceName]);

  return (
    <AppShell>
      {resource ? <ResourceForm resource={resource} mode="create" /> : <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error ?? "Loading resource..."}</div>}
    </AppShell>
  );
}
