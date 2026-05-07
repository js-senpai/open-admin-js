import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cancel, confirm, intro, isCancel, outro, select, text } from "@clack/prompts";
import fsExtra from "fs-extra";
import pc from "picocolors";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { copySync, ensureDirSync, readFileSync, writeFileSync } = fsExtra;

export type PackageManager = "pnpm" | "npm" | "yarn";
export type DatabaseDriver = "postgresql" | "mysql" | "sqlite";

export type CreateProjectOptions = {
  projectName?: string;
  cwd?: string;
  packageManager?: PackageManager;
  database?: DatabaseDriver;
  superadminEmail?: string;
  superadminPassword?: string;
  databaseUrl?: string;
  redisUrl?: string;
  jwtSecret?: string;
  jwtRefreshSecret?: string;
  adminOrigin?: string;
  apiPort?: string;
  git?: boolean;
  install?: boolean;
  templateDir?: string;
};

export type CreateProjectResult = {
  appName: string;
  packageName: string;
  targetDir: string;
  packageManager: PackageManager;
  database: DatabaseDriver;
  superadminEmail: string;
  git: boolean;
  install: boolean;
};

const placeholderPattern =
  /__APP_NAME__|__PACKAGE_NAME__|__DATABASE_URL__|__DATABASE_PROVIDER__|__REDIS_URL__|__JWT_SECRET__|__JWT_REFRESH_SECRET__|__ADMIN_ORIGIN__|__API_PORT__/g;

export function toPackageName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function defaultTemplateDir(): string {
  return resolve(__dirname, "../template");
}

function databaseUrl(packageName: string, database: DatabaseDriver): string {
  if (database === "postgresql") {
    return `postgresql://openadminjs:openadminjs@localhost:5432/${packageName}?schema=public`;
  }
  if (database === "mysql") {
    return `mysql://openadminjs:openadminjs@localhost:3306/${packageName}`;
  }
  return "file:./prisma/dev.db";
}

function renderFile(file: string, replacements: Record<string, string>): void {
  const content = readFileSync(file, "utf8");
  writeFileSync(file, content.replace(placeholderPattern, (key) => replacements[key] ?? key));
}

function renderTemplateFiles(targetDir: string, replacements: Record<string, string>): void {
  const stack = [targetDir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile()) {
        renderFile(path, replacements);
      }
    }
  }
}

export function createProject(options: Required<CreateProjectOptions>): CreateProjectResult {
  const appName = options.projectName;
  const packageName = toPackageName(appName);
  if (!packageName) throw new Error("Project name must contain at least one letter or number.");

  const targetDir = resolve(options.cwd, appName);
  if (existsSync(targetDir)) throw new Error(`${targetDir} already exists.`);

  ensureDirSync(targetDir);
  copySync(options.templateDir, targetDir, {
    overwrite: false,
    errorOnExist: true,
    filter: (source) => !source.includes("node_modules") && !source.includes(".next") && !source.includes("dist")
  });
  if (!existsSync(join(targetDir, "package.json"))) {
    throw new Error(`Template copy failed: package.json not found in ${targetDir}`);
  }
  renderTemplateFiles(targetDir, {
    __APP_NAME__: appName,
    __PACKAGE_NAME__: packageName,
    __DATABASE_PROVIDER__: options.database,
    __DATABASE_URL__: options.databaseUrl,
    __REDIS_URL__: options.redisUrl,
    __JWT_SECRET__: options.jwtSecret,
    __JWT_REFRESH_SECRET__: options.jwtRefreshSecret,
    __ADMIN_ORIGIN__: options.adminOrigin,
    __API_PORT__: options.apiPort
  });

  if (options.git) {
    const gitResult = spawnSync("git", ["init"], { cwd: targetDir, stdio: "ignore" });
    if (gitResult.status !== 0 || gitResult.error) {
      throw new Error("Failed to initialize git repository.");
    }
  }

  if (options.install) {
    const installArgs = options.packageManager === "yarn" ? [] : ["install"];
    const installResult = spawnSync(options.packageManager, installArgs, { cwd: targetDir, stdio: "inherit" });
    if (installResult.status !== 0 || installResult.error) {
      throw new Error(
        `Dependency installation failed. Run "${options.packageManager} ${installArgs.join(" ")}" inside ${targetDir}.`
      );
    }
  }

  return {
    appName,
    packageName,
    targetDir,
    packageManager: options.packageManager,
    database: options.database,
    superadminEmail: options.superadminEmail,
    git: options.git,
    install: options.install
  };
}

export function printNextSteps(result: CreateProjectResult): void {
  const pm = result.packageManager;
  const installStep = result.install ? "" : `\n  ${pm} install`;
  outro(
    `${pc.green("Project created.")}\n\nNext steps:\n  cd ${result.appName}${installStep}\n  docker compose up -d\n  ${pm} db:migrate\n  ${pm} db:seed\n  ${pm} dev\n\nAdmin: http://localhost:3000\nAPI: http://localhost:4000\nDocs: http://localhost:4000/api/docs\n\nSuperadmin: ${result.superadminEmail} / <your password>`
  );
}

export async function createProjectInteractive(options: CreateProjectOptions = {}): Promise<CreateProjectResult | undefined> {
  intro(pc.green("Create OpenAdminJS"));

  const projectName =
    options.projectName ??
    (await text({
      message: "Project name",
      defaultValue: "my-app",
      placeholder: "my-app"
    }));
  if (isCancel(projectName)) {
    cancel("Cancelled");
    return undefined;
  }

  const packageManager =
    options.packageManager ??
    (await select<PackageManager>({
      message: "Package manager",
      options: [
        { value: "pnpm", label: "pnpm" },
        { value: "npm", label: "npm" },
        { value: "yarn", label: "yarn" }
      ],
      initialValue: "pnpm"
    }));
  if (isCancel(packageManager)) {
    cancel("Cancelled");
    return undefined;
  }

  const database =
    options.database ??
    (await select<DatabaseDriver>({
      message: "Database",
      options: [
        { value: "postgresql", label: "PostgreSQL" },
        { value: "mysql", label: "MySQL" },
        { value: "sqlite", label: "SQLite" }
      ],
      initialValue: "postgresql"
    }));
  if (isCancel(database)) {
    cancel("Cancelled");
    return undefined;
  }

  const superadminEmail =
    options.superadminEmail ??
    (await text({
      message: "Superadmin email",
      defaultValue: "admin@localhost.dev",
      placeholder: "admin@localhost.dev",
      validate(value) {
        return /^\S+@\S+\.\S+$/.test(value) ? undefined : "Enter a valid email address.";
      }
    }));
  if (isCancel(superadminEmail)) {
    cancel("Cancelled");
    return undefined;
  }

  const superadminPassword =
    options.superadminPassword ??
    (await text({
      message: "Superadmin password",
      placeholder: "At least 8 characters",
      validate(value) {
        return value.length >= 8 ? undefined : "Password must be at least 8 characters.";
      }
    }));
  if (isCancel(superadminPassword)) {
    cancel("Cancelled");
    return undefined;
  }

  const selectedDatabaseUrl =
    options.databaseUrl ??
    (await text({
      message: "Database URL",
      defaultValue: databaseUrl(toPackageName(String(projectName)), database)
    }));
  if (isCancel(selectedDatabaseUrl)) {
    cancel("Cancelled");
    return undefined;
  }

  const redisUrl =
    options.redisUrl ??
    (await text({
      message: "Redis URL (optional for queues)",
      defaultValue: "redis://localhost:6379"
    }));
  if (isCancel(redisUrl)) {
    cancel("Cancelled");
    return undefined;
  }

  const jwtSecret =
    options.jwtSecret ??
    (await text({
      message: "JWT secret",
      defaultValue: "change-me-to-a-long-random-secret",
      placeholder: "at least 32 chars recommended"
    }));
  if (isCancel(jwtSecret)) {
    cancel("Cancelled");
    return undefined;
  }

  const jwtRefreshSecret =
    options.jwtRefreshSecret ??
    (await text({
      message: "JWT refresh secret",
      defaultValue: "change-me-too",
      placeholder: "at least 32 chars recommended"
    }));
  if (isCancel(jwtRefreshSecret)) {
    cancel("Cancelled");
    return undefined;
  }

  const adminOrigin = options.adminOrigin ?? "http://localhost:3000";
  const apiPort = options.apiPort ?? "4000";

  const git = options.git ?? (await confirm({ message: "Initialize git?", initialValue: true }));
  if (isCancel(git)) {
    cancel("Cancelled");
    return undefined;
  }

  const install = options.install ?? true;

  const result = createProject({
    projectName: String(projectName),
    cwd: options.cwd ?? process.cwd(),
    packageManager,
    database,
    superadminEmail: String(superadminEmail),
    superadminPassword: String(superadminPassword),
    databaseUrl: String(selectedDatabaseUrl),
    redisUrl: String(redisUrl),
    jwtSecret: String(jwtSecret),
    jwtRefreshSecret: String(jwtRefreshSecret),
    adminOrigin: String(adminOrigin),
    apiPort: String(apiPort),
    git,
    install,
    templateDir: options.templateDir ?? defaultTemplateDir()
  });
  printNextSteps(result);
  return result;
}
