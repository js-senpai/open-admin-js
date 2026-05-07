import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { OpenAdminPlugin, OpenAdminPluginModule, PluginRegistrationContext, PluginSurfaceRegistry } from "@openadminjs/plugin-sdk";
import { Logger } from "@nestjs/common";
import { registerResourceHooks, unregisterResourceHooksBySource } from "../resources/resource-hooks.registry";
import { bundledOpenAdminPlugins } from "./bundled/registry";
import { getManifestCandidateStrings, toAbsoluteManifestPath } from "./manifest-path";
import { pluginManifestSchema, type PluginManifestEntry } from "./manifest.schema";
import { pluginRuntime } from "./plugin-runtime";

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
  const capabilities = new Set(entry.capabilities ?? []);
  const ensureCap = (name: string) => {
    if ((entry.trustMode ?? "trusted") === "trusted" && capabilities.size === 0) return;
    if (!capabilities.has(name as never)) {
      throw new Error(`Plugin "${entry.id}" attempted to use capability "${name}" but it is not declared in manifest.`);
    }
  };
  const registerSurface = (surface: PluginSurfaceRegistry) => {
    if (surface.resource) {
      ensureCap("resource.hooks");
      throw new Error('Use registerResourceHooks(resourceName, hooks) for resource lifecycle hooks.');
    }
    if (surface.api) {
      if (surface.api.routes?.length) ensureCap("api.routes");
      else ensureCap("api.hooks");
    }
    if (surface.media) ensureCap("media.pipeline");
    if (surface.seo) ensureCap("seo.extend");
    if (surface.jobs?.length) ensureCap("jobs.run");
    if (surface.adminUi?.length) ensureCap("admin.ui.extend");
    pluginRuntime.register(entry.id, surface);
  };
  return {
    pluginId: entry.id,
    config,
    trustMode: entry.trustMode ?? "trusted",
    capabilities: [...capabilities],
    registerResourceHooks: (resourceName, hooks, options) =>
      registerResourceHooks(resourceName, hooks, { ...options, source: entry.id }),
    registerSurface
  };
}

/** Register hooks for one manifest entry (same as bootstrap). Throws on failure. */
export async function applyManifestPluginEntry(entry: PluginManifestEntry): Promise<void> {
  if (entry.enabled === false) return;
  const plugin: OpenAdminPlugin = entry.bundled ? resolveBundledPlugin(entry) : resolveNpmPlugin(entry);
  const ctx = createContext(entry);
  await plugin.register(ctx as PluginRegistrationContext);
  if (plugin.onStart) await plugin.onStart(ctx as PluginRegistrationContext);
  log.log(`Loaded plugin ${entry.id} (${entry.bundled ? `bundled:${entry.bundled}` : `package:${entry.package}`})`);
}

/** Drop all hook registrations attributed to this plugin id (before re-apply or disable). */
export function removeManifestPluginHooks(pluginId: string): void {
  unregisterResourceHooksBySource(pluginId);
  pluginRuntime.removeBySource(pluginId);
  log.log(`Removed runtime hooks for plugin ${pluginId}`);
}

export async function loadPluginsFromManifest(): Promise<void> {
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
      await applyManifestPluginEntry(entry);
    } catch (e) {
      log.error(`Failed to load plugin ${entry.id}: ${(e as Error).message}`);
      if (process.env.NODE_ENV === "production") throw e;
    }
  }
}
