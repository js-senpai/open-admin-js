/**
 * Syncs the full-stack source (apps/, packages/, prisma/) into the CLI template so that
 * `openadminjs create` scaffolds a working monorepo out of the box.
 *
 * Run manually:  node scripts/sync-template.mjs
 * Auto-run:      included in `packages/cli` build via "presync-template" npm lifecycle.
 *
 * Exclusions (relative to each source root):
 *   - node_modules/, .next/, dist/, .turbo/
 *   - *.test.ts, *.e2e.test.ts, vitest.config.ts  (internal framework tests)
 *   - packages/cli, packages/create-openadminjs    (the scaffolder itself)
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const templateDir = join(root, "packages", "cli", "template");

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".turbo"]);
const SKIP_PKG_NAMES = new Set(["cli", "create-openadminjs"]);

function filter(source) {
  const name = basename(source);
  return !SKIP_DIRS.has(name);
}

function copyDir(src, dest) {
  cpSync(src, dest, { recursive: true, filter });
}

// ── apps ──────────────────────────────────────────────────────────────────────
rmSync(join(templateDir, "apps"), { recursive: true, force: true });
mkdirSync(join(templateDir, "apps"), { recursive: true });
for (const app of readdirSync(join(root, "apps"))) {
  copyDir(join(root, "apps", app), join(templateDir, "apps", app));
}

// ── packages (exclude cli scaffolders) ────────────────────────────────────────
rmSync(join(templateDir, "packages"), { recursive: true, force: true });
mkdirSync(join(templateDir, "packages"), { recursive: true });
for (const pkg of readdirSync(join(root, "packages"))) {
  if (SKIP_PKG_NAMES.has(pkg)) continue;
  copyDir(join(root, "packages", pkg), join(templateDir, "packages", pkg));
}

// ── prisma ────────────────────────────────────────────────────────────────────
rmSync(join(templateDir, "prisma"), { recursive: true, force: true });
copyDir(join(root, "prisma"), join(templateDir, "prisma"));

// Patch prisma schema: replace hardcoded provider with template placeholder so
// createProject can substitute the user's chosen database driver.
const schemaPath = join(templateDir, "prisma", "schema.prisma");
const schema = readFileSync(schemaPath, "utf8");
writeFileSync(schemaPath, schema.replace(/provider\s*=\s*"postgresql"/, 'provider = "__DATABASE_PROVIDER__"'));

console.log("✓ Template synced from apps/, packages/, prisma/");
