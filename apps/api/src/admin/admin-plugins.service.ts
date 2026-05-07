import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { bundledOpenAdminPlugins } from "../plugins/bundled/registry";
import {
  applyManifestPluginEntry,
  invalidateNpmPluginMainModule,
  removeManifestPluginHooks
} from "../plugins/plugin-loader";
import { defaultWritableManifestPath, resolveWritableManifestPath } from "../plugins/manifest-path";
import {
  pluginManifestEntrySchema,
  pluginManifestSchema,
  type PluginManifest,
  type PluginManifestEntry
} from "../plugins/manifest.schema";
import { pluginRuntime } from "../plugins/plugin-runtime";

const execFileAsync = promisify(execFile);

const log = new Logger("AdminPlugins");

const emptyManifest = (): PluginManifest => ({ version: 1, plugins: [] });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isModuleNotFoundError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as NodeJS.ErrnoException & { code?: string };
  if (err.code === "MODULE_NOT_FOUND") return true;
  const msg = typeof (e as Error).message === "string" ? (e as Error).message : "";
  return msg.includes("Cannot find module") || msg.includes("MODULE_NOT_FOUND");
}

@Injectable()
export class AdminPluginsService {
  readManifestOrEmpty(): PluginManifest {
    const path = resolveWritableManifestPath();
    if (!existsSync(path)) return emptyManifest();
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
      const parsed = pluginManifestSchema.safeParse(raw);
      if (!parsed.success) {
        log.warn(`Invalid manifest at ${path}, treating as empty`);
        return emptyManifest();
      }
      return parsed.data;
    } catch {
      return emptyManifest();
    }
  }

  getState() {
    const path = existsSync(resolveWritableManifestPath())
      ? resolveWritableManifestPath()
      : defaultWritableManifestPath();
    const manifest = this.readManifestOrEmpty();
    return {
      manifestPath: path,
      bundledAvailable: Object.keys(bundledOpenAdminPlugins),
      plugins: manifest.plugins,
      runtime: {
        adminUiExtensions: pluginRuntime.getAdminUiExtensions().length,
        jobs: pluginRuntime.getJobs().length,
        apiHooks: pluginRuntime.getApiHooks().length,
        mediaHooks: pluginRuntime.getMediaHooks().length,
        seoHooks: pluginRuntime.getSeoHooks().length
      }
    };
  }

  private writeManifest(manifest: PluginManifest) {
    const path = resolveWritableManifestPath();
    const parsed = pluginManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    writeFileSync(path, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
  }

  async add(dto: {
    id: string;
    bundled?: string;
    package?: string;
    enabled?: boolean;
    config?: Record<string, unknown>;
    trustMode?: "trusted" | "sandboxed";
    capabilities?: string[];
    runPnpmInstall?: boolean;
  }) {
    const hasBundled = Boolean(dto.bundled);
    const hasPackage = Boolean(dto.package);
    if (hasBundled === hasPackage) {
      throw new BadRequestException("Provide exactly one of: bundled or package");
    }
    if (dto.bundled && !bundledOpenAdminPlugins[dto.bundled]) {
      throw new BadRequestException(
        `Unknown bundled plugin "${dto.bundled}". Available: ${Object.keys(bundledOpenAdminPlugins).join(", ")}`
      );
    }

    const manifest = this.readManifestOrEmpty();
    if (manifest.plugins.some((p) => p.id === dto.id)) {
      throw new BadRequestException(`Plugin id already exists: ${dto.id}`);
    }

    const entry = {
      id: dto.id,
      enabled: dto.enabled ?? true,
      ...(dto.bundled ? { bundled: dto.bundled } : { package: dto.package! }),
      config: dto.config ?? {},
      trustMode: dto.trustMode ?? "trusted",
      capabilities: dto.capabilities ?? []
    };

    const entryParsed = pluginManifestEntrySchema.safeParse(entry);
    if (!entryParsed.success) {
      throw new BadRequestException(entryParsed.error.message);
    }

    manifest.plugins.push(entryParsed.data);
    this.writeManifest(manifest);

    let pnpmMessage: string | undefined;
    if (dto.package) {
      const allowPnpm =
        process.env.NODE_ENV !== "production"
          ? dto.runPnpmInstall !== false
          : dto.runPnpmInstall === true && process.env.OPENADMIN_PLUGIN_PNPM_INSTALL === "1";
      if (allowPnpm) {
        pnpmMessage = await this.runPnpmAdd(dto.package);
      }
    }

    try {
      if (entryParsed.data.enabled !== false) {
        await this.applyEntryRuntime(entryParsed.data, { afterPnpm: Boolean(pnpmMessage) });
      }
    } catch (e) {
      manifest.plugins = manifest.plugins.filter((p) => p.id !== dto.id);
      this.writeManifest(manifest);
      throw new BadRequestException(
        `Plugin was not activated: ${(e as Error).message}. Manifest entry was rolled back.`
      );
    }

    return {
      ok: true as const,
      restartRequired: false as const,
      pnpm: pnpmMessage
    };
  }

  async patch(id: string, dto: { enabled?: boolean; config?: Record<string, unknown>; trustMode?: "trusted" | "sandboxed"; capabilities?: string[] }) {
    const manifest = this.readManifestOrEmpty();
    const idx = manifest.plugins.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new BadRequestException(`Plugin not found: ${id}`);
    }
    const cur = { ...manifest.plugins[idx]! };
    if (dto.enabled !== undefined) cur.enabled = dto.enabled;
    if (dto.config !== undefined) cur.config = dto.config;
    if (dto.trustMode !== undefined) cur.trustMode = dto.trustMode;
    if (dto.capabilities !== undefined) cur.capabilities = dto.capabilities;

    const entryParsed = pluginManifestEntrySchema.safeParse(cur);
    if (!entryParsed.success) {
      throw new BadRequestException(entryParsed.error.message);
    }

    manifest.plugins[idx] = entryParsed.data;
    this.writeManifest(manifest);

    try {
      removeManifestPluginHooks(id);
      if (entryParsed.data.enabled !== false) {
        await this.applyEntryRuntime(entryParsed.data, { afterPnpm: false });
      }
    } catch (e) {
      throw new InternalServerErrorException(
        `Manifest saved but runtime sync failed: ${(e as Error).message}. Try toggling the plugin off and on, or restart the API.`
      );
    }

    return { ok: true as const, restartRequired: false as const };
  }

  remove(id: string) {
    const manifest = this.readManifestOrEmpty();
    const next = manifest.plugins.filter((p) => p.id !== id);
    if (next.length === manifest.plugins.length) {
      throw new BadRequestException(`Plugin not found: ${id}`);
    }
    manifest.plugins = next;
    this.writeManifest(manifest);
    removeManifestPluginHooks(id);
    return { ok: true as const, restartRequired: false as const };
  }

  private async runPnpmAdd(packageName: string): Promise<string> {
    const repoRoot = findPnpmWorkspaceRoot();
    try {
      const { stdout, stderr } = await execFileAsync(
        "pnpm",
        ["add", packageName, "--filter", "@openadminjs/api"],
        {
          cwd: repoRoot,
          timeout: 180_000,
          maxBuffer: 10 * 1024 * 1024,
          env: process.env as NodeJS.ProcessEnv
        }
      );
      const out = [stdout, stderr].filter(Boolean).join("\n").trim();
      return out || "pnpm add completed";
    } catch (e) {
      const err = e as Error & { stderr?: string };
      log.error(err.message);
      throw new InternalServerErrorException(
        `pnpm add failed: ${err.stderr ?? err.message}. Install the package in @openadminjs/api, then add the plugin again from the admin.`
      );
    }
  }

  /**
   * Load plugin hooks in the running process. Retries on MODULE_NOT_FOUND so `pnpm add` can settle on disk.
   * No full app restart: Node resolves a package the first time it is `require`d after it appears under node_modules.
   */
  private async applyEntryRuntime(entry: PluginManifestEntry, opts: { afterPnpm: boolean }): Promise<void> {
    const attempts = entry.package ? (opts.afterPnpm ? 12 : 6) : 1;
    let last: Error | undefined;
    for (let i = 0; i < attempts; i++) {
      if (entry.package) {
        invalidateNpmPluginMainModule(entry.package);
      }
      try {
        await applyManifestPluginEntry(entry);
        return;
      } catch (e) {
        last = e instanceof Error ? e : new Error(String(e));
        const retryable = entry.package && isModuleNotFoundError(last);
        if (!retryable || i === attempts - 1) {
          throw last;
        }
        const delay = 120 + i * 100;
        log.warn(`Plugin ${entry.id} not yet resolvable (${last.message}), retry in ${delay}ms (${i + 1}/${attempts})`);
        await sleep(delay);
      }
    }
    throw last ?? new Error("applyEntryRuntime failed");
  }
}

function findPnpmWorkspaceRoot(): string {
  let dir = fileURLToPath(new URL("../..", import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new InternalServerErrorException("Could not find pnpm-workspace.yaml — run pnpm from the monorepo root");
}
