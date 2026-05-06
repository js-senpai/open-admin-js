#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { cancel, confirm, intro, isCancel, outro, select, text } from "@clack/prompts";
import fsExtra from "fs-extra";
import pc from "picocolors";
import { packageName } from "./package-name.js";
import { renderFiles } from "./render-files.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { copySync, ensureDirSync } = fsExtra;

type PackageManager = "pnpm" | "npm" | "yarn";

async function main(): Promise<void> {
  intro(pc.green("Create OpenAdminJS"));
  const argName = process.argv[2];
  const projectName = argName || (await text({ message: "Project name", defaultValue: "my-app" }));
  if (isCancel(projectName)) return cancel("Cancelled");

  const manager = await select<PackageManager>({
    message: "Package manager",
    options: [
      { value: "pnpm", label: "pnpm" },
      { value: "npm", label: "npm" },
      { value: "yarn", label: "yarn" }
    ],
    initialValue: "pnpm"
  });
  if (isCancel(manager)) return cancel("Cancelled");

  const database = await select({
    message: "Database",
    options: [{ value: "postgresql", label: "PostgreSQL" }],
    initialValue: "postgresql"
  });
  if (isCancel(database)) return cancel("Cancelled");

  const git = await confirm({ message: "Initialize git?", initialValue: true });
  if (isCancel(git)) return cancel("Cancelled");

  const appName = String(projectName);
  const pkgName = packageName(appName);
  const target = resolve(process.cwd(), appName);
  if (existsSync(target)) {
    console.error(pc.red(`${target} already exists.`));
    process.exit(1);
  }

  ensureDirSync(target);
  copySync(resolve(__dirname, "../template"), target, { overwrite: false, errorOnExist: true });
  renderFiles(target, {
    __APP_NAME__: appName,
    __PACKAGE_NAME__: pkgName,
    __DATABASE_PROVIDER__: "postgresql",
    __DATABASE_URL__: `postgresql://openadminjs:openadminjs@localhost:5432/${pkgName}?schema=public`
  });

  if (git) spawnSync("git", ["init"], { cwd: target, stdio: "ignore" });
  spawnSync(manager, manager === "yarn" ? [] : ["install"], { cwd: target, stdio: "inherit" });

outro(`${pc.green("Project created.")}\n\nDependencies installed automatically.\n\nNext steps:\n  cd ${appName}\n  ${manager} db:migrate\n  ${manager} db:seed\n  ${manager} dev\n\nAdmin: http://localhost:3000\nAPI: http://localhost:4000\nDocs: http://localhost:4000/api/docs\n\nSuperadmin credentials are requested during seed.`);
}

main().catch((error: unknown) => {
  console.error(pc.red(error instanceof Error ? error.message : "Failed to create project."));
  process.exit(1);
});
