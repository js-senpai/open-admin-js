import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "pnpm" | "npm" | "yarn";

const WORKSPACE_GLOBS = ["apps/*", "packages/*"];

const ROOT_SCRIPTS: Record<PackageManager, Record<string, string>> = {
  pnpm: {
    dev: "pnpm --parallel --filter @openadminjs/api --filter @openadminjs/admin dev",
    build: "pnpm -r build",
    start: "pnpm --parallel --filter @openadminjs/api --filter @openadminjs/admin start",
    lint: "pnpm -r lint",
    typecheck: "pnpm -r typecheck",
    test: "pnpm -r test",
    "db:migrate": "pnpm --filter @openadminjs/api db:migrate",
    "db:seed": "pnpm --filter @openadminjs/api db:seed",
    "db:studio": "pnpm --filter @openadminjs/api db:studio",
    generate: "pnpm --filter @openadminjs/api generate"
  },
  npm: {
    dev: "npm run dev --workspace=@openadminjs/api --workspace=@openadminjs/admin --if-present",
    build: "npm run build --workspaces --if-present",
    start: "npm run start --workspace=@openadminjs/api --workspace=@openadminjs/admin --if-present",
    lint: "npm run lint --workspaces --if-present",
    typecheck: "npm run typecheck --workspaces --if-present",
    test: "npm run test --workspaces --if-present",
    "db:migrate": "npm run db:migrate --workspace=@openadminjs/api",
    "db:seed": "npm run db:seed --workspace=@openadminjs/api",
    "db:studio": "npm run db:studio --workspace=@openadminjs/api",
    generate: "npm run generate --workspace=@openadminjs/api"
  },
  yarn: {
    dev: "yarn workspace @openadminjs/api dev & yarn workspace @openadminjs/admin dev",
    build: "yarn workspaces run build",
    start: "yarn workspace @openadminjs/api start & yarn workspace @openadminjs/admin start",
    lint: "yarn workspaces run lint",
    typecheck: "yarn workspaces run typecheck",
    test: "yarn workspaces run test",
    "db:migrate": "yarn workspace @openadminjs/api db:migrate",
    "db:seed": "yarn workspace @openadminjs/api db:seed",
    "db:studio": "yarn workspace @openadminjs/api db:studio",
    generate: "yarn workspace @openadminjs/api generate"
  }
};

type PackageJson = Record<string, unknown> & {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

function findPackageJsonFiles(dir: string): string[] {
  const files: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist" || entry.name === ".turbo") {
        continue;
      }
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.name === "package.json") files.push(path);
    }
  }
  return files;
}

function replaceWorkspaceProtocol(pkg: PackageJson, replacement: string): void {
  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const) {
    const deps = pkg[section];
    if (!deps) continue;
    for (const [name, version] of Object.entries(deps)) {
      if (version.startsWith("workspace:")) {
        deps[name] = replacement;
      }
    }
  }
}

function readPackageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

function writePackageJson(path: string, pkg: PackageJson): void {
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

/** Rewrites a scaffolded monorepo for npm or yarn (template ships pnpm-first). */
export function adaptProjectForPackageManager(targetDir: string, packageManager: PackageManager): void {
  if (packageManager === "pnpm") return;

  const rootPath = join(targetDir, "package.json");
  if (!existsSync(rootPath)) return;

  const root = readPackageJson(rootPath);
  const pnpmOverrides =
    typeof root.pnpm === "object" && root.pnpm !== null && "overrides" in root.pnpm
      ? (root.pnpm as { overrides?: Record<string, string> }).overrides
      : undefined;

  root.workspaces = WORKSPACE_GLOBS;
  root.scripts = { ...(root.scripts as Record<string, string>), ...ROOT_SCRIPTS[packageManager] };
  delete root.packageManager;
  delete root.pnpm;

  if (packageManager === "npm" && pnpmOverrides) {
    root.overrides = pnpmOverrides;
  }

  writePackageJson(rootPath, root);

  const pnpmWorkspaceFile = join(targetDir, "pnpm-workspace.yaml");
  if (existsSync(pnpmWorkspaceFile)) {
    rmSync(pnpmWorkspaceFile);
  }

  const workspaceReplacement = packageManager === "yarn" ? "*" : "workspace:*";
  for (const file of findPackageJsonFiles(targetDir)) {
    const pkg = readPackageJson(file);
    replaceWorkspaceProtocol(pkg, workspaceReplacement);
    writePackageJson(file, pkg);
  }
}
