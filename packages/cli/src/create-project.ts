import { existsSync, mkdirSync, readdirSync } from "node:fs";
import net from "node:net";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cancel, confirm, intro, isCancel, outro, select, text } from "@clack/prompts";
import fsExtra from "fs-extra";
import pc from "picocolors";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { copySync, ensureDirSync, readFileSync, writeFileSync } = fsExtra;

const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot"]);

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
  dbInitialized: boolean;
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

function parseUrlHostPort(input: string): { host: string; port: number } | undefined {
  try {
    const url = new URL(input);
    if (!url.hostname) return undefined;
    const port = url.port ? Number(url.port) : undefined;
    if (port !== undefined && (!Number.isFinite(port) || port <= 0)) return undefined;
    return { host: url.hostname, port: port ?? 0 };
  } catch {
    return undefined;
  }
}

async function checkTcpConnection(host: string, port: number, timeoutMs = 1500): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const onError = (err: unknown) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => onError(new Error("timeout")));
    socket.once("error", onError);
    socket.once("connect", () => {
      socket.end();
      resolve();
    });
  });
}

async function pingRedis(urlInput: string, timeoutMs = 1500): Promise<void> {
  const parsed = parseUrlHostPort(urlInput);
  if (!parsed) throw new Error("Invalid Redis URL");
  const port = parsed.port || 6379;

  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host: parsed.host, port });
    const onError = (err: unknown) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => onError(new Error("timeout")));
    socket.once("error", onError);
    socket.once("connect", () => {
      socket.write("*1\r\n$4\r\nPING\r\n");
    });
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes("+PONG")) {
        socket.end();
        resolve();
      }
      if (buffer.includes("-ERR")) {
        onError(new Error("redis error"));
      }
    });
  });
}

async function validateDbConnectivity(database: DatabaseDriver, databaseUrlInput: string): Promise<string | undefined> {
  if (database === "sqlite") return undefined;
  const parsed = parseUrlHostPort(databaseUrlInput);
  if (!parsed) return "Invalid database URL.";

  const port = parsed.port || (database === "postgresql" ? 5432 : 3306);
  try {
    await checkTcpConnection(parsed.host, port);
    return undefined;
  } catch {
    return `Cannot connect to ${parsed.host}:${port}.`;
  }
}

async function validateRedisConnectivity(redisUrlInput: string): Promise<string | undefined> {
  try {
    await pingRedis(redisUrlInput);
    return undefined;
  } catch {
    const parsed = parseUrlHostPort(redisUrlInput);
    if (!parsed) return "Invalid Redis URL.";
    const port = parsed.port || 6379;
    return `Cannot connect to Redis at ${parsed.host}:${port}.`;
  }
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
  if (BINARY_EXTENSIONS.has(extname(file).toLowerCase())) return;
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

function runPackageManagerScript(packageManager: PackageManager, script: "db:migrate" | "db:seed", cwd: string): void {
  const command = packageManager === "npm" ? "npm" : packageManager;
  const args = packageManager === "npm" ? ["run", script] : [script];
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0 || result.error) {
    const displayCommand = packageManager === "npm" ? `npm run ${script}` : `${packageManager} ${script}`;
    throw new Error(`Failed to run "${displayCommand}" in ${cwd}.`);
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
    filter: (source) => {
      const segments = relative(options.templateDir, source).split(sep);
      return !segments.some(
        (segment) =>
          segment === "node_modules" || segment === ".next" || segment === "dist" || segment === ".env.example"
      );
    }
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

  // Write the real .env for apps/api so the app starts and seed runs without
  // manual intervention. Superadmin credentials are picked up by prisma/seed.ts
  // via the SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD env vars.
  const apiEnvDir = join(targetDir, "apps", "api");
  if (existsSync(apiEnvDir)) {
    mkdirSync(apiEnvDir, { recursive: true });
    writeFileSync(
      join(apiEnvDir, ".env"),
      [
        `DATABASE_URL=${options.databaseUrl}`,
        `REDIS_URL=${options.redisUrl}`,
        `JWT_SECRET=${options.jwtSecret}`,
        `JWT_REFRESH_SECRET=${options.jwtRefreshSecret}`,
        `ADMIN_ORIGIN=${options.adminOrigin}`,
        `API_PORT=${options.apiPort}`,
        `SUPERADMIN_EMAIL=${options.superadminEmail}`,
        `SUPERADMIN_PASSWORD=${options.superadminPassword}`
      ].join("\n") + "\n"
    );
  }

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
    runPackageManagerScript(options.packageManager, "db:migrate", targetDir);
    runPackageManagerScript(options.packageManager, "db:seed", targetDir);
  }

  return {
    appName,
    packageName,
    targetDir,
    packageManager: options.packageManager,
    database: options.database,
    superadminEmail: options.superadminEmail,
    git: options.git,
    install: options.install,
    dbInitialized: options.install
  };
}

export function printNextSteps(result: CreateProjectResult): void {
  const pm = result.packageManager;
  const installStep = result.install ? "" : `\n  ${pm} install\n  ${pm} db:migrate\n  ${pm} db:seed`;
  const dbStepNote = result.dbInitialized ? "\nDatabase initialized: migrations + seed completed automatically." : "";
  outro(
    `${pc.green("Project created.")}\n\nNext steps:\n  cd ${result.appName}${installStep}\n  ${pm} dev${dbStepNote}\n\nAdmin:  http://localhost:3000\nAPI:    http://localhost:4000\nSwagger: http://localhost:4000/api/docs\nWeb:    http://localhost:3001\n\nSuperadmin: ${result.superadminEmail} / <your password>`
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

  let checkedDatabaseUrl = String(selectedDatabaseUrl).trim();
  while (true) {
    const dbError = await validateDbConnectivity(database, checkedDatabaseUrl);
    if (!dbError) break;
    const retry = await confirm({
      message: `${dbError} Retry entering DATABASE_URL?`,
      initialValue: true
    });
    if (isCancel(retry)) {
      cancel("Cancelled");
      return undefined;
    }
    if (!retry) break;
    const next = await text({
      message: "Database URL",
      defaultValue: checkedDatabaseUrl
    });
    if (isCancel(next)) {
      cancel("Cancelled");
      return undefined;
    }
    checkedDatabaseUrl = String(next).trim();
  }

  let checkedRedisUrl = (options.redisUrl ?? "").trim();
  while (!checkedRedisUrl) {
    const entered =
      options.redisUrl ??
      (await text({
        message: "Redis URL",
        defaultValue: "redis://localhost:6379",
        validate(value) {
          return value.trim().length > 0 ? undefined : "Redis URL is required.";
        }
      }));
    if (isCancel(entered)) {
      cancel("Cancelled");
      return undefined;
    }
    checkedRedisUrl = String(entered).trim();
  }

  while (true) {
    const redisError = await validateRedisConnectivity(checkedRedisUrl);
    if (!redisError) break;
    const retry = await confirm({
      message: `${redisError} Retry entering REDIS_URL?`,
      initialValue: true
    });
    if (isCancel(retry)) {
      cancel("Cancelled");
      return undefined;
    }
    if (!retry) break;
    const next = await text({
      message: "Redis URL",
      defaultValue: checkedRedisUrl
    });
    if (isCancel(next)) {
      cancel("Cancelled");
      return undefined;
    }
    checkedRedisUrl = String(next).trim();
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
    databaseUrl: checkedDatabaseUrl,
    redisUrl: checkedRedisUrl,
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
