#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
type DatabaseDriver = "postgresql" | "mysql" | "sqlite";

function databaseUrl(database: DatabaseDriver, packageName: string): string {
  if (database === "postgresql") return `postgresql://openadminjs:openadminjs@localhost:5432/${packageName}?schema=public`;
  if (database === "mysql") return `mysql://openadminjs:openadminjs@localhost:3306/${packageName}`;
  return "file:./prisma/dev.db";
}

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

  const database = await select<DatabaseDriver>({
    message: "Database",
    options: [
      { value: "postgresql", label: "PostgreSQL" },
      { value: "mysql", label: "MySQL" },
      { value: "sqlite", label: "SQLite" }
    ],
    initialValue: "postgresql"
  });
  if (isCancel(database)) return cancel("Cancelled");

  const selectedDatabaseUrl = await text({
    message: "Database URL",
    defaultValue: databaseUrl(database, packageName(String(projectName)))
  });
  if (isCancel(selectedDatabaseUrl)) return cancel("Cancelled");

  const redisUrl = await text({
    message: "Redis URL (optional for queues)",
    defaultValue: "redis://localhost:6379"
  });
  if (isCancel(redisUrl)) return cancel("Cancelled");

  const jwtSecret = await text({
    message: "JWT secret",
    defaultValue: "change-me-to-a-long-random-secret"
  });
  if (isCancel(jwtSecret)) return cancel("Cancelled");

  const jwtRefreshSecret = await text({
    message: "JWT refresh secret",
    defaultValue: "change-me-too"
  });
  if (isCancel(jwtRefreshSecret)) return cancel("Cancelled");

  const adminOrigin = "http://localhost:3000";
  const apiPort = "4000";

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
  if (!existsSync(join(target, "package.json"))) {
    throw new Error(`Template copy failed: package.json not found in ${target}`);
  }
  renderFiles(target, {
    __APP_NAME__: appName,
    __PACKAGE_NAME__: pkgName,
    __DATABASE_PROVIDER__: database,
    __DATABASE_URL__: String(selectedDatabaseUrl),
    __REDIS_URL__: String(redisUrl),
    __JWT_SECRET__: String(jwtSecret),
    __JWT_REFRESH_SECRET__: String(jwtRefreshSecret),
    __ADMIN_ORIGIN__: String(adminOrigin),
    __API_PORT__: String(apiPort)
  });

  if (git) {
    const gitResult = spawnSync("git", ["init"], { cwd: target, stdio: "ignore" });
    if (gitResult.status !== 0 || gitResult.error) throw new Error("Failed to initialize git repository.");
  }
  const installArgs = manager === "yarn" ? [] : ["install"];
  const installResult = spawnSync(manager, installArgs, { cwd: target, stdio: "inherit" });
  if (installResult.status !== 0 || installResult.error) {
    throw new Error(`Dependency installation failed. Run "${manager} ${installArgs.join(" ")}" inside ${target}.`);
  }

outro(`${pc.green("Project created.")}\n\nDependencies installed automatically.\n\nNext steps:\n  cd ${appName}\n  ${manager} db:migrate\n  ${manager} db:seed\n  ${manager} dev\n\nAdmin: http://localhost:3000\nAPI: http://localhost:4000\nDocs: http://localhost:4000/api/docs\n\nSuperadmin credentials are requested during seed.`);
}

main().catch((error: unknown) => {
  console.error(pc.red(error instanceof Error ? error.message : "Failed to create project."));
  process.exit(1);
});
