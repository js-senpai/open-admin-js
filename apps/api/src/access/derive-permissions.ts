import type { ResourceConfig } from "@openadminjs/core";

/** Collects every permission slug referenced by resource metadata (for seeds & audits). */
export function collectPermissionSlugsFromResources(resources: readonly ResourceConfig[]): Set<string> {
  const out = new Set<string>();
  for (const r of resources) {
    for (const v of Object.values(r.permissions)) {
      if (typeof v === "string" && v.trim()) out.add(v);
    }
    for (const f of Object.values(r.fields)) {
      if (!f.permissions) continue;
      for (const v of Object.values(f.permissions)) {
        if (typeof v === "string" && v.trim()) out.add(v);
      }
    }
    if (r.actions) {
      for (const a of Object.values(r.actions)) {
        if (a.permission?.trim()) out.add(a.permission);
      }
    }
    const ls = r.listScope;
    if (ls && "bypassPermissions" in ls && ls.bypassPermissions) {
      for (const p of ls.bypassPermissions) {
        if (typeof p === "string" && p.trim()) out.add(p);
      }
    }
  }
  return out;
}

/** Fallback labels when no override exists (seed stores EN string; RU kept for parity). */
export function slugToDefaultLabels(slug: string): { en: string; ru: string } {
  const readable = slug.replace(/\./g, " · ").replace(/-/g, " ");
  const title = readable.replace(/\b\w/g, (c) => c.toUpperCase());
  return { en: title, ru: title };
}
