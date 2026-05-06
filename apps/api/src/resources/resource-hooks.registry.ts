import type { ResourceLifecycleHooks } from "@openadminjs/plugin-sdk";

export type {
  AfterCreateCtx,
  AfterDeleteCtx,
  AfterUpdateCtx,
  BeforeCreateCtx,
  BeforeDeleteCtx,
  BeforeUpdateCtx,
  ResourceHookUser,
  ResourceLifecycleHooks
} from "@openadminjs/plugin-sdk";

type HookEntry = { hooks: ResourceLifecycleHooks; source?: string };

const registry = new Map<string, HookEntry[]>();

/** Clears all hooks (Vitest only). */
export function resetResourceHookRegistryForTests(): void {
  registry.clear();
}

export type RegisterResourceHooksOptions = {
  /** Replace the whole chain for this resource (default: append). */
  replace?: boolean;
  /** e.g. plugin id or `core` */
  source?: string;
};

/**
 * Register server-only hooks (not serialised to the admin client).
 * Multiple callers stack in registration order unless `replace: true`.
 */
export function registerResourceHooks(
  resourceName: string,
  hooks: ResourceLifecycleHooks,
  options?: RegisterResourceHooksOptions
): void {
  const entry: HookEntry = { hooks, source: options?.source };
  if (options?.replace) {
    registry.set(resourceName, [entry]);
    return;
  }
  const list = registry.get(resourceName) ?? [];
  list.push(entry);
  registry.set(resourceName, list);
}

export function getResourceHookChain(resourceName: string): readonly HookEntry[] {
  return registry.get(resourceName) ?? [];
}

/**
 * Remove all hook entries registered with this source (e.g. plugin manifest id).
 * Core hooks use source `"core"` — never pass that for plugin toggles.
 */
export function unregisterResourceHooksBySource(source: string): void {
  const names = [...registry.keys()];
  for (const resourceName of names) {
    const list = registry.get(resourceName);
    if (!list?.length) continue;
    const next = list.filter((e) => e.source !== source);
    if (next.length === 0) registry.delete(resourceName);
    else if (next.length !== list.length) registry.set(resourceName, next);
  }
}
