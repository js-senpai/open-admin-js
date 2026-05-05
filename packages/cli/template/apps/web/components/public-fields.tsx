import type { PublicRecord, PublicResourceConfig } from "../lib/openadmin-client";

export function PublicFields({ resource, record }: { resource: PublicResourceConfig; record: PublicRecord }) {
  const fields = Object.entries(resource.fields).filter(([, field]) => field.public);

  return (
    <dl className="grid gap-4">
      {fields.map(([name, field]) => (
        <div key={name} className="rounded-md border border-slate-200 bg-white p-4">
          <dt className="text-sm font-medium text-slate-500">{field.label ?? name}</dt>
          <dd className="mt-2 text-slate-950">{formatValue(record[name], field.type)}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatValue(value: unknown, type: string): string {
  if (value == null) return "";
  if (type === "datetime" || type === "date") return new Date(String(value)).toLocaleDateString();
  return String(value);
}
