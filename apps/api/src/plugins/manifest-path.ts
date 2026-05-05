import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Same resolution order as plugin-loader (env → cwd → beside apps/api). */
export function getManifestCandidateStrings(): string[] {
  const fromEnv = process.env.OPENADMIN_PLUGINS_MANIFEST;
  const fromCwd = join(process.cwd(), "plugins.manifest.json");
  const apiPkgDir = fileURLToPath(new URL("../..", import.meta.url));
  const besideApi = join(apiPkgDir, "plugins.manifest.json");
  return [...new Set([fromEnv, fromCwd, besideApi].filter(Boolean) as string[])];
}

export function toAbsoluteManifestPath(candidate: string): string {
  return isAbsolute(candidate) ? candidate : resolve(process.cwd(), candidate);
}

/** First existing manifest file, if any. */
export function resolveExistingManifestPath(): string | undefined {
  for (const candidate of getManifestCandidateStrings()) {
    const abs = toAbsoluteManifestPath(candidate);
    if (existsSync(abs)) return abs;
  }
  return undefined;
}

/** Path to write when no file exists yet (beside apps/api). */
export function defaultWritableManifestPath(): string {
  const apiPkgDir = fileURLToPath(new URL("../..", import.meta.url));
  return join(apiPkgDir, "plugins.manifest.json");
}

export function resolveWritableManifestPath(): string {
  return resolveExistingManifestPath() ?? defaultWritableManifestPath();
}
