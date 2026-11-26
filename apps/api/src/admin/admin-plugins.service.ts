import { existsSync, readFileSync } from "node:fs";
import { Injectable, Logger } from "@nestjs/common";
import { bundledOpenAdminPlugins } from "../plugins/bundled/registry";
import { resolveWritableManifestPath } from "../plugins/manifest-path";
import { pluginManifestSchema, type PluginManifest } from "../plugins/manifest.schema";
import { pluginRuntime } from "../plugins/plugin-runtime";

const log = new Logger("AdminPlugins");
@Injectable()
export class AdminPluginsService {
  readManifestOrEmpty(): PluginManifest {
    const path = resolveWritableManifestPath();
    if (!existsSync(path)) return { version: 1, plugins: [] };
    try {
      const result = pluginManifestSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
      if (result.success) return result.data;
    } catch { /* report a safe diagnostic */ }
    log.warn("Invalid plugin manifest");
    return { version: 1, plugins: [] };
  }

  getState() {
    const manifest = this.readManifestOrEmpty();
    return {
      bundledAvailable: Object.keys(bundledOpenAdminPlugins),
      plugins: manifest.plugins.map(({ id, enabled, bundled, package: pkg, trustMode, capabilities }) => ({ id, enabled, bundled, package: pkg, trustMode, capabilities })),
      runtime: {
        adminUiExtensions: pluginRuntime.getAdminUiExtensions().length,
        jobs: pluginRuntime.getJobs().length,
        apiHooks: pluginRuntime.getApiHooks().length,
        mediaHooks: pluginRuntime.getMediaHooks().length,
        seoHooks: pluginRuntime.getSeoHooks().length
      },
      management: "deployment-only"
    };
  }

  getDashboardWidgets() {
    return pluginRuntime.getAdminUiExtensions().filter(item => item.kind === "widget")
      .map(item => ({ id: item.id, title: item.title, config: item.config ?? {} }));
  }
}
