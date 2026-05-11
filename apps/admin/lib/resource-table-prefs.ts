const PREFIX = "openadminjs.resourceTable.";

function keyColumnOrder(resourceName: string): string {
  return `${PREFIX}${resourceName}.columnOrder`;
}

function keyDensity(resourceName: string): string {
  return `${PREFIX}${resourceName}.density`;
}

export type TableDensity = "comfortable" | "compact";

export function loadColumnOrder(resourceName: string, allowed: string[]): string[] {
  if (typeof window === "undefined") return allowed;
  try {
    const raw = window.localStorage.getItem(keyColumnOrder(resourceName));
    if (!raw) return allowed;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return allowed;
    const set = new Set(allowed);
    const ordered = parsed.map(String).filter((n) => set.has(n));
    for (const n of allowed) {
      if (!ordered.includes(n)) ordered.push(n);
    }
    return ordered;
  } catch {
    return allowed;
  }
}

export function saveColumnOrder(resourceName: string, order: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyColumnOrder(resourceName), JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

export function loadDensity(resourceName: string): TableDensity {
  if (typeof window === "undefined") return "comfortable";
  try {
    const v = window.localStorage.getItem(keyDensity(resourceName));
    return v === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function saveDensity(resourceName: string, density: TableDensity): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyDensity(resourceName), density);
  } catch {
    /* ignore */
  }
}
