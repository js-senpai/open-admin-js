import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { OpenAdminPlugin, OpenAdminPluginModule, PluginRegistrationContext } from "@openadminjs/plugin-sdk";
import { Logger } from "@nestjs/common";
import { registerResourceHooks, unregisterResourceHooksBySource } from "../resources/resource-hooks.registry";
import { bundledOpenAdminPlugins } from "./bundled/registry";
import { getManifestCandidateStrings, toAbsoluteManifestPath } from "./manifest-path";
import { pluginManifestSchema, type PluginManifestEntry } from "./manifest.schema";

const log = new Logger("OpenAdminPlugins");

const require = createRequire(import.meta.url);

function readManifest(): unknown | undefined {
  for (const candidate of getManifestCandidateStrings()) {
    const path = toAbsoluteManifestPath(candidate);
    if (existsSync(path)) {
      log.log(`Loading plugin manifest: ${path}`);
      return JSON.parse(readFileSync(path, "utf8")) as unknown;
    }
  }
  return undefined;
}

/** Clears the main module entry so the next `require` re-reads from disk (e.g. after `pnpm add`). */
export function invalidateNpmPluginMainModule(packageSpec: string): void {
  try {
    const resolved = require.resolve(packageSpec);
    delete require.cache[resolved];
  } catch {
    /* not resolved yet — fine */
  }
}

function resolveNpmPlugin(entry: PluginManifestEntry): OpenAdminPlugin {
  const spec = entry.package!;
  if (process.env.NODE_ENV === "production" && (spec.includes("..") || spec.startsWith(".") || spec.startsWith("/"))) {
    throw new Error(`Refusing to load plugin package path in production: ${entry.id}`);
  }
  const mod = require(spec) as OpenAdminPluginModule;
  const plugin = mod.openAdminPlugin ?? mod.default;
  if (!plugin) {
    throw new Error(`Package "${spec}" has no openAdminPlugin or default export (${entry.id})`);
  }
  if (plugin.id !== entry.id) {
    log.warn(`Plugin manifest id "${entry.id}" differs from plugin.id "${plugin.id}" — manifest id is used as source label`);
  }
  return plugin;
}

function resolveBundledPlugin(entry: PluginManifestEntry): OpenAdminPlugin {
  const key = entry.bundled!;
  const plugin = bundledOpenAdminPlugins[key];
  if (!plugin) {
    throw new Error(`Unknown bundled plugin "${key}" for ${entry.id}. Known: ${Object.keys(bundledOpenAdminPlugins).join(", ")}`);
  }
  return plugin;
}

function createContext(entry: PluginManifestEntry): PluginRegistrationContext {
  const config = (entry.config ?? {}) as Record<string, unknown>;
  return {
    pluginId: entry.id,
    config,
    registerResourceHooks: (resourceName, hooks, options) =>
      registerResourceHooks(resourceName, hooks, { ...options, source: entry.id })
  };
}

/** Register hooks for one manifest entry (same as bootstrap). Throws on failure. */
export function applyManifestPluginEntry(entry: PluginManifestEntry): void {
  if (entry.enabled === false) return;
  const plugin: OpenAdminPlugin = entry.bundled ? resolveBundledPlugin(entry) : resolveNpmPlugin(entry);
  const ctx = createContext(entry);
  const result = plugin.register(ctx as PluginRegistrationContext);
  if (result && typeof (result as Promise<void>).then === "function") {
    throw new Error(`Plugin ${entry.id} must use synchronous register() at bootstrap`);
  }
  log.log(`Loaded plugin ${entry.id} (${entry.bundled ? `bundled:${entry.bundled}` : `package:${entry.package}`})`);
}

/** Drop all hook registrations attributed to this plugin id (before re-apply or disable). */
export function removeManifestPluginHooks(pluginId: string): void {
  unregisterResourceHooksBySource(pluginId);
  log.log(`Removed runtime hooks for plugin ${pluginId}`);
}

export function loadPluginsFromManifestSync(): void {
  const raw = readManifest();
  if (!raw) {
    log.log("No plugins.manifest.json found — skipping plugins");
    return;
  }
  const parsed = pluginManifestSchema.safeParse(raw);
  if (!parsed.success) {
    log.error(`Invalid plugins.manifest.json: ${parsed.error.message}`);
    return;
  }
  const manifest = parsed.data;
  for (const entry of manifest.plugins) {
    if (entry.enabled === false) continue;
    try {
      applyManifestPluginEntry(entry);
    } catch (e) {
      log.error(`Failed to load plugin ${entry.id}: ${(e as Error).message}`);
      if (process.env.NODE_ENV === "production") throw e;
    }
  }
}
