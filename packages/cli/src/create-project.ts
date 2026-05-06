import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cancel, confirm, intro, isCancel, outro, select, text } from "@clack/prompts";
import fsExtra from "fs-extra";
import pc from "picocolors";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { copySync, ensureDirSync, readFileSync, writeFileSync } = fsExtra;

export type PackageManager = "pnpm" | "npm" | "yarn";
export type DatabaseDriver = "postgresql";

export type CreateProjectOptions = {
  projectName?: string;
  cwd?: string;
  packageManager?: PackageManager;
  database?: DatabaseDriver;
  superadminEmail?: string;
  superadminPassword?: string;
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
  /__APP_NAME__|__PACKAGE_NAME__|__DATABASE_URL__|__DATABASE_PROVIDER__/g;

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
  return "";
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
  renderTemplateFiles(targetDir, {
    __APP_NAME__: appName,
    __PACKAGE_NAME__: packageName,
    __DATABASE_PROVIDER__: options.database,
    __DATABASE_URL__: databaseUrl(packageName, options.database)
  });

  if (options.git) {
    spawnSync("git", ["init"], { cwd: targetDir, stdio: "ignore" });
  }

  if (options.install) {
    const installArgs = options.packageManager === "yarn" ? [] : ["install"];
    spawnSync(options.packageManager, installArgs, { cwd: targetDir, stdio: "inherit" });
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
  outro(
    `${pc.green("Project created.")}\n\nNext steps:\n  cd ${result.appName}\n  ${pm} install\n  docker compose up -d\n  ${pm} db:migrate\n  ${pm} db:seed\n  ${pm} dev\n\nAdmin: http://localhost:3000\nAPI: http://localhost:4000\nDocs: http://localhost:4000/api/docs\n\nSuperadmin: ${result.superadminEmail} / <your password>`
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
      options: [{ value: "postgresql", label: "PostgreSQL" }],
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

  const git = options.git ?? (await confirm({ message: "Initialize git?", initialValue: true }));
  if (isCancel(git)) {
    cancel("Cancelled");
    return undefined;
  }

  const install = options.install ?? (await confirm({ message: "Install dependencies now?", initialValue: false }));
  if (isCancel(install)) {
    cancel("Cancelled");
    return undefined;
  }

  const result = createProject({
    projectName: String(projectName),
    cwd: options.cwd ?? process.cwd(),
    packageManager,
    database,
    superadminEmail: String(superadminEmail),
    superadminPassword: String(superadminPassword),
    git,
    install,
    templateDir: options.templateDir ?? defaultTemplateDir()
  });
  printNextSteps(result);
  return result;
}
