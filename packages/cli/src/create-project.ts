import { accessSync, constants as fsConstants, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import net from "node:net";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cancel, confirm, intro, isCancel, note, outro, select, text } from "@clack/prompts";
import fsExtra from "fs-extra";
import pc from "picocolors";
import { adaptProjectForPackageManager, type PackageManager } from "./adapt-package-manager.js";
import { generateSecret } from "./secrets.js";
import { renderSchemaForProvider } from "./render-schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { copySync, ensureDirSync, readFileSync, writeFileSync } = fsExtra;

const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot"]);

/** Minimum supported Node.js major version (kept in sync with package.json engines). */
export const MIN_NODE_MAJOR = 20;

export type { PackageManager } from "./adapt-package-manager.js";
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

/**
 * Root .gitignore written into every generated project. Written BEFORE `git init`
 * so a subsequent `git add .` can never stage `.env` files or build output.
 */
const GITIGNORE_CONTENTS = `# dependencies
node_modules
.pnpm-store

# build output
.next
dist
build
out
coverage
*.tsbuildinfo
.turbo

# environment / secrets
.env
.env.*
!.env.example

# logs
*.log

# local databases
*.db
*.db-journal
*.sqlite
*.sqlite3

# OS / editor
.DS_Store
.idea
.vscode
`;

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

/** Returns the current Node.js major version. */
export function currentNodeMajor(): number {
  return Number(process.versions.node.split(".")[0]);
}

/** Throws if the running Node.js is older than the supported minimum. */
export function assertSupportedNode(): void {
  const major = currentNodeMajor();
  if (Number.isFinite(major) && major < MIN_NODE_MAJOR) {
    throw new Error(
      `Node.js ${MIN_NODE_MAJOR}+ is required (found ${process.versions.node}). Please upgrade Node.js.`
    );
  }
}

/** Returns true when the given package manager is on PATH. */
export function isPackageManagerAvailable(packageManager: PackageManager): boolean {
  const result = spawnSync(packageManager, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

/** Throws with an actionable message when pnpm is not installed. */
export function assertPnpmAvailable(): void {
  if (!isPackageManagerAvailable("pnpm")) {
    throw new Error(
      "pnpm is required but was not found on your PATH.\n" +
        "Install it with one of:\n" +
        "  corepack enable && corepack prepare pnpm@latest --activate\n" +
        "  npm install -g pnpm"
    );
  }
}

function assertWritableParent(cwd: string): void {
  try {
    accessSync(cwd, fsConstants.W_OK);
  } catch {
    throw new Error(`No write permission for ${cwd}. Choose a writable directory.`);
  }
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
  await new Promise<void>((resolvePromise, reject) => {
    const socket = net.createConnection({ host, port });
    const onError = (err: unknown) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => onError(new Error("timeout")));
    socket.once("error", onError);
    socket.once("connect", () => {
      socket.end();
      resolvePromise();
    });
  });
}

async function pingRedis(urlInput: string, timeoutMs = 1500): Promise<void> {
  const parsed = parseUrlHostPort(urlInput);
  if (!parsed) throw new Error("Invalid Redis URL");
  const port = parsed.port || 6379;

  await new Promise<void>((resolvePromise, reject) => {
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
        resolvePromise();
      }
      if (buffer.includes("-ERR")) {
        onError(new Error("redis error"));
      }
    });
  });
}

async function validateDbConnectivity(database: DatabaseDriver, databaseUrlInput: string): Promise<string | undefined> {
  // SQLite is a local file — there is no server to reach.
  if (database === "sqlite") {
    return /^file:/.test(databaseUrlInput.trim()) ? undefined : 'SQLite DATABASE_URL must start with "file:".';
  }
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

export const DEFAULT_SUPERADMIN_EMAIL = "admin@localhost.dev";

/** Resolves the final email, applying the default when the user pressed Enter. */
export function resolveSuperadminEmail(value: string, fallback = DEFAULT_SUPERADMIN_EMAIL): string {
  return value.trim() || fallback;
}

/**
 * Validates the superadmin email against the FINAL value (after default
 * resolution), so pressing Enter to accept the default is always valid.
 */
export function validateSuperadminEmailInput(value: string, fallback = DEFAULT_SUPERADMIN_EMAIL): string | undefined {
  const finalValue = resolveSuperadminEmail(value, fallback);
  return /^\S+@\S+\.\S+$/.test(finalValue) ? undefined : "Enter a valid email address.";
}

export function databaseUrl(packageName: string, database: DatabaseDriver): string {
  if (database === "sqlite") {
    return "file:./dev.db";
  }
  if (database === "mysql") {
    return `mysql://openadminjs:openadminjs@localhost:3306/${packageName}`;
  }
  return `postgresql://openadminjs:openadminjs@localhost:5432/${packageName}?schema=public`;
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
  const args = packageManager === "npm" ? ["run", script] : [script];
  const result = spawnSync(packageManager, args, { cwd, stdio: "inherit" });
  if (result.status !== 0 || result.error) {
    const display = packageManager === "npm" ? `npm run ${script}` : `${packageManager} ${script}`;
    throw new Error(`Failed to run "${display}" in ${cwd}.`);
  }
}

function runInstall(packageManager: PackageManager, cwd: string): void {
  const args = packageManager === "yarn" ? [] : ["install"];
  const result = spawnSync(packageManager, args, { cwd, stdio: "inherit" });
  if (result.status !== 0 || result.error) {
    throw new Error(`Dependency installation failed. Run "${packageManager} install" inside ${cwd}.`);
  }
}

/** Writes the root .gitignore. Must run before `git init`. */
function writeGitignore(targetDir: string): void {
  writeFileSync(join(targetDir, ".gitignore"), GITIGNORE_CONTENTS);
}

/** Writes a root .env.example with variable names and safe placeholders only. */
function writeEnvExample(targetDir: string, database: DatabaseDriver): void {
  const dbUrl =
    database === "sqlite"
      ? "file:./dev.db"
      : database === "mysql"
        ? "mysql://user:password@localhost:3306/openadminjs"
        : "postgresql://user:password@localhost:5432/openadminjs?schema=public";
  const lines = [
    "# Copy this file to apps/api/.env and fill in real values.",
    "# NEVER commit the real .env — it is ignored by .gitignore.",
    `DATABASE_URL=${dbUrl}`,
    "REDIS_URL=redis://localhost:6379",
    "# Generate strong secrets, e.g. `node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"`",
    "JWT_SECRET=replace-with-a-long-random-secret",
    "JWT_REFRESH_SECRET=replace-with-a-different-long-random-secret",
    "ADMIN_ORIGIN=http://localhost:3000",
    "API_PORT=4000",
    "SUPERADMIN_EMAIL=admin@localhost.dev",
    "SUPERADMIN_PASSWORD=replace-with-a-strong-password"
  ];
  writeFileSync(join(targetDir, ".env.example"), lines.join("\n") + "\n");
}

type ResolvedCreateProjectOptions = Required<Omit<CreateProjectOptions, "templateDir">> & {
  projectName: string;
  templateDir: string;
};

function resolveCreateProjectOptions(
  options: CreateProjectOptions & { projectName: string }
): ResolvedCreateProjectOptions {
  if (options.packageManager && !["pnpm", "npm", "yarn"].includes(options.packageManager)) {
    throw new Error('packageManager must be "pnpm", "npm", or "yarn".');
  }
  if (options.database && !["postgresql", "mysql", "sqlite"].includes(options.database)) {
    throw new Error('database must be "postgresql", "mysql", or "sqlite".');
  }
  const missing: string[] = [];
  if (!options.database) missing.push("database");
  if (!options.superadminEmail) missing.push("superadminEmail");
  if (!options.superadminPassword) missing.push("superadminPassword");
  if (!options.databaseUrl) missing.push("databaseUrl");
  if (!options.redisUrl) missing.push("redisUrl");
  if (!options.jwtSecret) missing.push("jwtSecret");
  if (!options.jwtRefreshSecret) missing.push("jwtRefreshSecret");
  if (!options.adminOrigin) missing.push("adminOrigin");
  if (!options.apiPort) missing.push("apiPort");
  if (missing.length) {
    throw new Error(`createProject() missing required option(s): ${missing.join(", ")}`);
  }

  return {
    projectName: options.projectName,
    cwd: options.cwd ?? process.cwd(),
    packageManager: options.packageManager ?? "pnpm",
    database: options.database!,
    superadminEmail: options.superadminEmail!,
    superadminPassword: options.superadminPassword!,
    databaseUrl: options.databaseUrl!,
    redisUrl: options.redisUrl!,
    jwtSecret: options.jwtSecret!,
    jwtRefreshSecret: options.jwtRefreshSecret!,
    adminOrigin: options.adminOrigin!,
    apiPort: options.apiPort!,
    git: options.git ?? false,
    install: options.install ?? false,
    templateDir: options.templateDir ?? defaultTemplateDir()
  };
}

/**
 * Generates the scaffold into a sibling staging directory and atomically renames
 * it into place only after generation succeeds. On failure the staging directory
 * is removed and an existing target directory is never touched.
 */
export function createProject(options: CreateProjectOptions & { projectName: string }): CreateProjectResult {
  const resolved = resolveCreateProjectOptions(options);
  const appName = resolved.projectName;
  const packageName = toPackageName(appName);
  if (!packageName) throw new Error("Project name must contain at least one letter or number.");

  const targetDir = resolve(resolved.cwd, appName);
  if (existsSync(targetDir)) throw new Error(`${targetDir} already exists.`);
  assertWritableParent(resolved.cwd);

  const stagingDir = mkdtempSync(`${targetDir}.tmp-`);
  try {
    generateIntoDir(stagingDir, resolved, { appName, packageName });
    renameSync(stagingDir, targetDir);
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }

  // git init + install happen in the final directory (post-atomic-rename).
  if (resolved.git) {
    const gitResult = spawnSync("git", ["init"], { cwd: targetDir, stdio: "ignore" });
    if (gitResult.status !== 0 || gitResult.error) {
      throw new Error("Failed to initialize git repository.");
    }
  }

  if (resolved.install) {
    runInstall(resolved.packageManager, targetDir);
    runPackageManagerScript(resolved.packageManager, "db:migrate", targetDir);
    runPackageManagerScript(resolved.packageManager, "db:seed", targetDir);
  }

  return {
    appName,
    packageName,
    targetDir,
    packageManager: resolved.packageManager,
    database: resolved.database,
    superadminEmail: resolved.superadminEmail,
    git: resolved.git,
    install: resolved.install,
    dbInitialized: resolved.install
  };
}

function generateIntoDir(
  targetDir: string,
  resolved: ResolvedCreateProjectOptions,
  meta: { appName: string; packageName: string }
): void {
  ensureDirSync(targetDir);
  copySync(resolved.templateDir, targetDir, {
    overwrite: true,
    errorOnExist: false,
    filter: (source) => {
      const segments = relative(resolved.templateDir, source).split(sep);
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
    __APP_NAME__: meta.appName,
    __PACKAGE_NAME__: meta.packageName,
    __DATABASE_PROVIDER__: resolved.database,
    __DATABASE_URL__: resolved.databaseUrl,
    __REDIS_URL__: resolved.redisUrl,
    __JWT_SECRET__: resolved.jwtSecret,
    __JWT_REFRESH_SECRET__: resolved.jwtRefreshSecret,
    __ADMIN_ORIGIN__: resolved.adminOrigin,
    __API_PORT__: resolved.apiPort
  });

  // The shipped baseline migration + migration_lock.toml are PostgreSQL-specific.
  // For any other provider they would make `prisma migrate deploy` fail, so drop
  // them and let the user create a provider-correct migration via `prisma migrate dev`.
  // The schema itself is also transformed to remove provider-incompatible types
  // (e.g. MySQL has no scalar lists, so `String[]` becomes a `Json` array).
  if (resolved.database !== "postgresql") {
    rmSync(join(targetDir, "prisma", "migrations"), { recursive: true, force: true });
    const schemaPath = join(targetDir, "prisma", "schema.prisma");
    if (existsSync(schemaPath)) {
      const schema = readFileSync(schemaPath, "utf8");
      writeFileSync(schemaPath, renderSchemaForProvider(schema, resolved.database));
    }
  }

  adaptProjectForPackageManager(targetDir, resolved.packageManager);

  // Git safety: write .gitignore + .env.example (tracked, placeholders only) as
  // part of generation, i.e. before any `git init`.
  writeGitignore(targetDir);
  writeEnvExample(targetDir, resolved.database);

  // Real secrets live only in apps/api/.env (ignored by the .gitignore above).
  const templateApiDir = join(resolved.templateDir, "apps", "api");
  const apiEnvDir = join(targetDir, "apps", "api");
  if (existsSync(templateApiDir)) {
    mkdirSync(apiEnvDir, { recursive: true });
    writeFileSync(
      join(apiEnvDir, ".env"),
      [
        `DATABASE_URL=${resolved.databaseUrl}`,
        `REDIS_URL=${resolved.redisUrl}`,
        `JWT_SECRET=${resolved.jwtSecret}`,
        `JWT_REFRESH_SECRET=${resolved.jwtRefreshSecret}`,
        `ADMIN_ORIGIN=${resolved.adminOrigin}`,
        `API_PORT=${resolved.apiPort}`,
        `SUPERADMIN_EMAIL=${resolved.superadminEmail}`,
        `SUPERADMIN_PASSWORD=${resolved.superadminPassword}`
      ].join("\n") + "\n"
    );
  }
}

export function printNextSteps(result: CreateProjectResult): void {
  const pm = result.packageManager;
  const installStep = result.install ? "" : `\n  ${pm} install\n  ${pm} db:migrate\n  ${pm} db:seed`;
  const dbStepNote = result.dbInitialized ? "\nDatabase initialized: migrations + seed completed automatically." : "";
  outro(
    `${pc.green("Project created.")}\n\nNext steps:\n  cd ${result.appName}${installStep}\n  ${pm} dev${dbStepNote}\n\nAdmin:  http://localhost:3000\nAPI:    http://localhost:4000\nSwagger: http://localhost:4000/api/docs\nWeb:    http://localhost:3001\n\nSuperadmin: ${result.superadminEmail} / <the password you entered>`
  );
}

/** Warns where secrets live and that they must never be committed. Never prints secret values. */
export function printSecurityNotice(result: CreateProjectResult): void {
  note(
    [
      `Secrets (DB URL, JWT keys, admin password) were written to ${pc.bold("apps/api/.env")}.`,
      `A ${pc.bold(".gitignore")} was created that excludes ${pc.bold(".env")} files.`,
      `${pc.bold(".env.example")} (placeholders only) is tracked in Git.`,
      pc.yellow("Do NOT commit apps/api/.env or share it. Rotate secrets before production.")
    ].join("\n"),
    "Security"
  );
}

export async function createProjectInteractive(options: CreateProjectOptions = {}): Promise<CreateProjectResult | undefined> {
  intro(pc.green("Create OpenAdminJS"));

  // Preflight checks that don't require project files run before anything is written.
  assertSupportedNode();
  const packageManager: PackageManager = options.packageManager ?? "pnpm";
  if (packageManager === "pnpm") assertPnpmAvailable();

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

  const database: DatabaseDriver =
    options.database ??
    ((await select<DatabaseDriver>({
      message: "Database",
      options: [
        { value: "postgresql", label: "PostgreSQL" },
        { value: "mysql", label: "MySQL" },
        { value: "sqlite", label: "SQLite (local file, zero-setup)" }
      ],
      initialValue: "postgresql"
    })) as DatabaseDriver);
  if (isCancel(database)) {
    cancel("Cancelled");
    return undefined;
  }

  const superadminEmail =
    options.superadminEmail ??
    (await text({
      message: "Superadmin email",
      defaultValue: DEFAULT_SUPERADMIN_EMAIL,
      placeholder: DEFAULT_SUPERADMIN_EMAIL,
      validate: (value) => validateSuperadminEmailInput(value)
    }));
  if (isCancel(superadminEmail)) {
    cancel("Cancelled");
    return undefined;
  }
  const resolvedEmail = resolveSuperadminEmail(String(superadminEmail));

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

  let checkedDatabaseUrl = String(selectedDatabaseUrl).trim() || databaseUrl(toPackageName(String(projectName)), database);
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

  // JWT secrets are generated with a CSPRNG — never prompted with predictable defaults.
  const jwtSecret = options.jwtSecret ?? generateSecret();
  const jwtRefreshSecret = options.jwtRefreshSecret ?? generateSecret();

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
    superadminEmail: resolvedEmail,
    superadminPassword: String(superadminPassword),
    databaseUrl: checkedDatabaseUrl,
    redisUrl: checkedRedisUrl,
    jwtSecret: String(jwtSecret),
    jwtRefreshSecret: String(jwtRefreshSecret),
    adminOrigin: String(adminOrigin),
    apiPort: String(apiPort),
    git,
    install,
    templateDir: options.templateDir
  });
  printSecurityNotice(result);
  printNextSteps(result);
  return result;
}
