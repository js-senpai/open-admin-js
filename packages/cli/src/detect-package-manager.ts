import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackageManager } from "./adapt-package-manager.js";

/**
 * Detects the package manager a generated project uses, preferring an explicit
 * `packageManager` field, then lockfiles, then workspace config. Defaults to pnpm.
 */
export function detectPackageManager(cwd: string): PackageManager {
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { packageManager?: string };
      const pm = pkg.packageManager ?? "";
      if (pm.startsWith("pnpm")) return "pnpm";
      if (pm.startsWith("yarn")) return "yarn";
      if (pm.startsWith("npm")) return "npm";
    } catch {
      // fall through to lockfile detection
    }
  }
  if (existsSync(join(cwd, "pnpm-lock.yaml")) || existsSync(join(cwd, "pnpm-workspace.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  return "pnpm";
}

/** Returns [command, prefixArgs] to run an npm-style script with the given PM. */
export function runScriptPrefix(pm: PackageManager, script: string): [string, string[]] {
  if (pm === "npm") return ["npm", ["run", script]];
  return [pm, [script]];
}
