import { accessSync, constants as fsConstants, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import net from "node:net";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cancel, confirm, intro, isCancel, note, outro, password, select, text } from "@clack/prompts";
import fsExtra from "fs-extra";
import pc from "picocolors";
import { adaptProjectForPackageManager, type PackageManager } from "./adapt-package-manager.js";
import { generateSecret, inspectPassword } from "./secrets.js";
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
  /** Empty string disables Redis-backed queues (see `skipRedis`). */
  redisUrl?: string;
  /** When true, force Redis (and background job queues) off. */
  skipRedis?: boolean;
  jwtSecret?: string;
  jwtRefreshSecret?: string;
  adminOrigin?: string;
  apiPort?: string;
  git?: boolean;
  install?: boolean;
  templateDir?: string;
  /**
   * Skip all interactive prompts. Missing optional values fall back to safe
   * defaults; a missing superadmin password is generated (CSPRNG). Used for
   * CI / scripting and auto-enabled when stdin is not a TTY.
   */
  nonInteractive?: boolean;
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
  /** True when a REDIS_URL was configured (background job queues enabled). */
  redisEnabled: boolean;
  /** True when the superadmin password was generated (non-interactive). */
  passwordGenerated: boolean;
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

export const DEFAULT_REDIS_URL = "redis://localhost:6379";
export const PACKAGE_MANAGERS: readonly PackageManager[] = ["pnpm", "npm", "yarn"];

/** Returns the first package manager that is installed on PATH, or undefined. */
export function firstAvailablePackageManager(
  preference: readonly PackageManager[] = PACKAGE_MANAGERS
): PackageManager | undefined {
  return preference.find((pm) => isPackageManagerAvailable(pm));
}

/**
 * Validates a Redis URL. An empty value is VALID — it disables background job
 * queues. A non-empty value must be a parseable redis:// (or rediss://) URL so
 * pressing Enter on the shown default is always accepted.
 */
export function validateRedisUrlInput(value: string): string | undefined {
  const v = value.trim();
  if (v === "") return undefined;
  try {
    const url = new URL(v);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      return "Redis URL must start with redis:// or rediss:// (or be blank to disable queues).";
    }
    return undefined;
  } catch {
    return "Enter a valid Redis URL (or leave blank to disable queues).";
  }
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

/** Applies schema to the database after install — non-interactive and provider-aware. */
function runDatabaseSetup(packageManager: PackageManager, database: DatabaseDriver, cwd: string): void {
  const schemaFlag = ["--schema", "../../prisma/schema.prisma"];
  const prismaArgs =
    database === "postgresql"
      ? ["migrate", "deploy", ...schemaFlag]
      : ["db", "push", ...schemaFlag, "--accept-data-loss"];
  const label = database === "postgresql" ? "prisma migrate deploy" : "prisma db push";

  if (packageManager === "npm") {
    const result = spawnSync("npm", ["exec", "prisma", ...prismaArgs], { cwd: join(cwd, "apps", "api"), stdio: "inherit" });
    if (result.status !== 0 || result.error) {
      throw new Error(
        `Failed to run "${label}" in ${cwd}/apps/api.\n` +
          "If Prisma engine binaries could not download, check your network/proxy and retry.\n" +
          `Resume with: cd <project> && npm exec prisma ${prismaArgs.join(" ")} (from apps/api).`
      );
    }
    return;
  }

  const filterArgs =
    packageManager === "pnpm"
      ? ["--filter", "@openadminjs/api", "exec", "prisma", ...prismaArgs]
      : ["workspace", "@openadminjs/api", "exec", "prisma", ...prismaArgs];
  const result = spawnSync(packageManager, filterArgs, { cwd, stdio: "inherit" });
  if (result.status !== 0 || result.error) {
    throw new Error(
      `Failed to run "${label}" via ${packageManager}.\n` +
        "If Prisma engine binaries could not download, check your network/proxy and retry."
    );
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
    "# REDIS_URL is optional. Leave it blank to disable background job queues.",
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
  // Redis is optional: an empty REDIS_URL disables background job queues, which
  // the generated API handles gracefully at runtime.
  const redisUrl = options.skipRedis ? "" : (options.redisUrl ?? "");

  const missing: string[] = [];
  if (!options.database) missing.push("database");
  if (!options.superadminEmail) missing.push("superadminEmail");
  if (!options.superadminPassword) missing.push("superadminPassword");
  if (!options.databaseUrl) missing.push("databaseUrl");
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
    redisUrl,
    skipRedis: options.skipRedis ?? redisUrl.trim() === "",
    jwtSecret: options.jwtSecret!,
    jwtRefreshSecret: options.jwtRefreshSecret!,
    adminOrigin: options.adminOrigin!,
    apiPort: options.apiPort!,
    git: options.git ?? false,
    install: options.install ?? false,
    nonInteractive: options.nonInteractive ?? false,
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

  let dbInitialized = false;
  if (resolved.install) {
    // The scaffold is fully written at this point. If install / db setup fails
    // we keep the project directory and surface an exact resume command rather
    // than deleting the user's freshly generated files.
    try {
      runInstall(resolved.packageManager, targetDir);
      runDatabaseSetup(resolved.packageManager, resolved.database, targetDir);
      runPackageManagerScript(resolved.packageManager, "db:seed", targetDir);
      dbInitialized = true;
    } catch (error) {
      throw new SetupIncompleteError(
        error instanceof Error ? error.message : "Setup failed after the project was created.",
        { targetDir, appName, packageManager: resolved.packageManager }
      );
    }
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
    dbInitialized,
    redisEnabled: resolved.redisUrl.trim() !== "",
    passwordGenerated: false
  };
}

/**
 * Thrown when the scaffold was generated successfully but a later step
 * (install, migrate, seed) failed. Carries the exact command to resume so the
 * user never has to guess, and signals that the directory was intentionally
 * preserved (never auto-deleted).
 */
export class SetupIncompleteError extends Error {
  readonly targetDir: string;
  readonly resumeCommand: string;
  constructor(
    message: string,
    meta: { targetDir: string; appName: string; packageManager: PackageManager }
  ) {
    const pm = meta.packageManager;
    const install = pm === "yarn" ? "yarn" : `${pm} install`;
    const resume = `cd ${meta.appName} && ${install} && ${pm} run db:migrate && ${pm} run db:seed`;
    super(`${message}\n\nThe project was created at ${meta.targetDir} and left in place.\nResume setup with:\n  ${resume}`);
    this.name = "SetupIncompleteError";
    this.targetDir = meta.targetDir;
    this.resumeCommand = resume;
  }
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
    const redisLine =
      resolved.redisUrl.trim() === ""
        ? "# REDIS_URL is unset — background job queues are disabled.\n# Set it (e.g. redis://localhost:6379) to enable BullMQ queues.\nREDIS_URL="
        : `REDIS_URL=${resolved.redisUrl}`;
    writeFileSync(
      join(apiEnvDir, ".env"),
      [
        `DATABASE_URL=${resolved.databaseUrl}`,
        redisLine,
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

/** Returns the shell form to run a root script with the given package manager. */
function pmRun(pm: PackageManager, script: string): string {
  if (pm === "yarn") return `yarn ${script}`;
  if (pm === "npm") return `npm run ${script}`;
  return `pnpm ${script}`;
}

export function printNextSteps(result: CreateProjectResult): void {
  const pm = result.packageManager;
  const install = pm === "yarn" ? "yarn" : `${pm} install`;
  const installStep = result.install
    ? ""
    : `\n  ${install}\n  ${pmRun(pm, "db:migrate")}\n  ${pmRun(pm, "db:seed")}`;
  const dbStepNote = result.dbInitialized
    ? "\nDatabase initialized: migrations + seed completed automatically."
    : "";
  // `dev` starts ONLY the admin UI and the API (see root "dev" script). The
  // public web app is optional and started separately, so we do not advertise
  // a URL the default command never serves.
  const password = result.passwordGenerated
    ? "a generated password (see apps/api/.env)"
    : "<the password you entered>";
  const webNote = `\n\nOptional public web app (not started by "${pmRun(pm, "dev")}"):\n  ${
    pm === "yarn" ? "yarn workspace @openadminjs/web dev" : pm === "npm" ? "npm run dev --workspace=@openadminjs/web" : "pnpm --filter @openadminjs/web dev"
  }  →  http://localhost:3001`;
  const redisNote = result.redisEnabled
    ? ""
    : "\n\nBackground job queues are disabled (no REDIS_URL). Set REDIS_URL in apps/api/.env to enable them.";
  outro(
    `${pc.green("Project created.")}\n\nNext steps:\n  cd ${result.appName}${installStep}\n  ${pmRun(pm, "dev")}${dbStepNote}\n\nAdmin:   http://localhost:3000\nAPI:     http://localhost:4000\nSwagger: http://localhost:4000/api/docs${webNote}${redisNote}\n\nSuperadmin: ${result.superadminEmail} / ${password}`
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

/** Cancellation sentinel used to unwind prompts without throwing. */
const CANCELLED = Symbol("cancelled");

/** Generates a strong, human-usable password (used in non-interactive mode). */
export function generatePassword(): string {
  return generateSecret(18);
}

/**
 * Resolves the package manager, honoring an explicit choice, detecting what is
 * actually installed, and offering a recovery path when the desired manager is
 * missing (issue: pnpm-unavailable should not hard-exit).
 */
async function resolvePackageManager(
  options: CreateProjectOptions,
  interactive: boolean
): Promise<PackageManager | typeof CANCELLED> {
  const available = PACKAGE_MANAGERS.filter(isPackageManagerAvailable);

  let desired = options.packageManager;
  if (!desired) {
    if (interactive) {
      const pool = available.length ? available : PACKAGE_MANAGERS;
      const answer = await select<PackageManager>({
        message: "Package manager",
        options: pool.map((pm) => ({
          value: pm,
          label: pm === "pnpm" ? "pnpm (recommended)" : pm
        })),
        initialValue: pool.includes("pnpm") ? "pnpm" : pool[0]
      });
      if (isCancel(answer)) return CANCELLED;
      desired = answer;
    } else {
      desired = firstAvailablePackageManager() ?? "npm";
    }
  }

  if (isPackageManagerAvailable(desired)) return desired;

  const fallback = firstAvailablePackageManager();
  const corepackHint =
    desired === "pnpm" ? " Enable it with `corepack enable && corepack prepare pnpm@latest --activate`." : "";

  if (!interactive) {
    if (options.packageManager) {
      throw new Error(
        `${desired} was requested but is not installed.${corepackHint}` +
          (fallback ? ` Or re-run with --package-manager ${fallback}.` : "")
      );
    }
    if (!fallback) {
      throw new Error("No supported package manager (pnpm, npm, or yarn) was found on PATH.");
    }
    return fallback;
  }

  if (available.length) {
    const answer = await select<PackageManager>({
      message: `${desired} is not installed. Choose an available package manager`,
      options: available.map((pm) => ({ value: pm, label: pm })),
      initialValue: available[0]
    });
    if (isCancel(answer)) return CANCELLED;
    return answer;
  }

  throw new Error(
    `${desired} is not installed and no supported package manager was found on PATH.${corepackHint}`
  );
}

/** Prints a plain (non-clack) summary suitable for non-interactive / CI output. */
function printSummaryPlain(result: CreateProjectResult): void {
  const pm = result.packageManager;
  const lines = [
    "",
    `Project created at ${result.targetDir}`,
    `Package manager: ${pm}   Database: ${result.database}`,
    result.dbInitialized ? "Database initialized (migrate + seed)." : "Run migrate + seed before starting.",
    result.redisEnabled ? "Redis queues: enabled." : "Redis queues: disabled (no REDIS_URL).",
    "Secrets written to apps/api/.env (git-ignored). Never commit it.",
    result.passwordGenerated
      ? "Superadmin password was generated — read it from apps/api/.env (SUPERADMIN_PASSWORD)."
      : `Superadmin: ${result.superadminEmail}`,
    ""
  ];
  console.log(lines.join("\n"));
}

export async function createProjectInteractive(
  options: CreateProjectOptions = {}
): Promise<CreateProjectResult | undefined> {
  // Preflight checks that don't require project files run before anything is written.
  assertSupportedNode();

  // Interactive only when stdin is a TTY and the caller did not opt out. This
  // avoids `uv_tty_init EINVAL` crashes in CI / piped environments.
  const interactive = !options.nonInteractive && Boolean(process.stdin.isTTY);

  if (!interactive && !options.projectName) {
    throw new Error(
      "A project name is required in non-interactive mode.\n" +
        "  Example: openadminjs create my-app --yes --database sqlite\n" +
        "(stdin is not a TTY, or --yes / --non-interactive was passed.)"
    );
  }

  if (interactive) intro(pc.green("Create OpenAdminJS"));

  // ── project name ──
  let projectName = options.projectName;
  if (!projectName) {
    const answer = await text({ message: "Project name", defaultValue: "my-app", placeholder: "my-app" });
    if (isCancel(answer)) return cancelledUndefined();
    projectName = String(answer);
  }

  // ── package manager (with availability fallback) ──
  const packageManager = await resolvePackageManager(options, interactive);
  if (packageManager === CANCELLED) return cancelledUndefined();

  // ── database ──
  let database = options.database;
  if (!database) {
    if (interactive) {
      const answer = await select<DatabaseDriver>({
        message: "Database",
        options: [
          { value: "postgresql", label: "PostgreSQL" },
          { value: "mysql", label: "MySQL" },
          { value: "sqlite", label: "SQLite (local file, zero-setup)" }
        ],
        initialValue: "postgresql"
      });
      if (isCancel(answer)) return cancelledUndefined();
      database = answer;
    } else {
      database = "sqlite";
    }
  }

  // ── superadmin email ──
  let email = options.superadminEmail;
  if (!email) {
    if (interactive) {
      const answer = await text({
        message: "Superadmin email",
        defaultValue: DEFAULT_SUPERADMIN_EMAIL,
        placeholder: DEFAULT_SUPERADMIN_EMAIL,
        validate: (value) => validateSuperadminEmailInput(value)
      });
      if (isCancel(answer)) return cancelledUndefined();
      email = String(answer);
    } else {
      email = DEFAULT_SUPERADMIN_EMAIL;
    }
  }
  const resolvedEmail = resolveSuperadminEmail(String(email));

  // ── superadmin password (masked in interactive mode; generated otherwise) ──
  let passwordGenerated = false;
  let superadminPassword = options.superadminPassword;
  if (!superadminPassword) {
    if (interactive) {
      const answer = await password({
        message: "Superadmin password (input hidden, min 8 chars)",
        validate(value) {
          const { weak, reason } = inspectPassword(value);
          return weak ? capitalize(reason ?? "Password is too weak.") : undefined;
        }
      });
      if (isCancel(answer)) return cancelledUndefined();
      superadminPassword = String(answer);
    } else {
      superadminPassword = generatePassword();
      passwordGenerated = true;
    }
  }

  // ── database URL (Enter accepts the shown default) ──
  const defaultDbUrl = databaseUrl(toPackageName(String(projectName)), database);
  let checkedDatabaseUrl = (options.databaseUrl ?? "").trim();
  if (!checkedDatabaseUrl) {
    if (interactive) {
      const answer = await text({
        message: "Database URL",
        defaultValue: defaultDbUrl,
        placeholder: defaultDbUrl,
        validate: (value) => validateDatabaseUrlInput(database!, value, defaultDbUrl)
      });
      if (isCancel(answer)) return cancelledUndefined();
      checkedDatabaseUrl = String(answer).trim() || defaultDbUrl;
    } else {
      checkedDatabaseUrl = defaultDbUrl;
    }
  }

  // Connectivity is checked only interactively and never blocks: the user can
  // decline to retry and continue (e.g. DB not started yet).
  if (interactive) {
    const outcome = await confirmConnectivityLoop(
      () => validateDbConnectivity(database!, checkedDatabaseUrl),
      "DATABASE_URL",
      () => text({ message: "Database URL", defaultValue: checkedDatabaseUrl, placeholder: checkedDatabaseUrl }),
      (next) => {
        checkedDatabaseUrl = next.trim() || checkedDatabaseUrl;
      }
    );
    if (outcome === CANCELLED) return cancelledUndefined();
  }

  // ── Redis (optional; blank disables background job queues) ──
  let checkedRedisUrl: string;
  if (options.skipRedis) {
    checkedRedisUrl = "";
  } else if (options.redisUrl !== undefined) {
    checkedRedisUrl = options.redisUrl.trim();
  } else if (interactive) {
    const def = database === "sqlite" ? "" : DEFAULT_REDIS_URL;
    const answer = await text({
      message: "Redis URL (blank to disable background job queues)",
      defaultValue: def,
      placeholder: def || "blank = queues disabled",
      validate: (value) => validateRedisUrlInput(value)
    });
    if (isCancel(answer)) return cancelledUndefined();
    checkedRedisUrl = String(answer).trim();
  } else {
    checkedRedisUrl = "";
  }

  if (interactive && checkedRedisUrl) {
    const outcome = await confirmConnectivityLoop(
      () => validateRedisConnectivity(checkedRedisUrl),
      "REDIS_URL",
      () => text({ message: "Redis URL (blank to disable)", defaultValue: checkedRedisUrl }),
      (next) => {
        checkedRedisUrl = next.trim();
      }
    );
    if (outcome === CANCELLED) return cancelledUndefined();
  }

  // JWT secrets are generated with a CSPRNG — never prompted with predictable defaults.
  const jwtSecret = options.jwtSecret ?? generateSecret();
  const jwtRefreshSecret = options.jwtRefreshSecret ?? generateSecret();

  const adminOrigin = options.adminOrigin ?? "http://localhost:3000";
  const apiPort = options.apiPort ?? "4000";

  let git = options.git;
  if (git === undefined) {
    if (interactive) {
      const answer = await confirm({ message: "Initialize git?", initialValue: true });
      if (isCancel(answer)) return cancelledUndefined();
      git = answer;
    } else {
      git = true;
    }
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
    nonInteractive: !interactive,
    templateDir: options.templateDir
  });
  result.passwordGenerated = passwordGenerated;

  if (interactive) {
    printSecurityNotice(result);
    printNextSteps(result);
  } else {
    printSummaryPlain(result);
  }
  return result;
}

function cancelledUndefined(): undefined {
  cancel("Cancelled");
  return undefined;
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/**
 * Validates a DATABASE_URL against the FINAL resolved value so pressing Enter to
 * accept the shown default is always valid.
 */
export function validateDatabaseUrlInput(
  database: DatabaseDriver,
  value: string,
  fallback: string
): string | undefined {
  const v = value.trim() || fallback;
  if (database === "sqlite") {
    return /^file:/.test(v) ? undefined : 'SQLite DATABASE_URL must start with "file:".';
  }
  try {
    // eslint-disable-next-line no-new
    new URL(v);
    return undefined;
  } catch {
    return "Enter a valid database URL.";
  }
}

/**
 * Runs a non-blocking connectivity check with an interactive retry loop. Returns
 * CANCELLED if the user cancels; otherwise resolves once the check passes or the
 * user declines to retry.
 */
async function confirmConnectivityLoop(
  check: () => Promise<string | undefined>,
  label: string,
  reprompt: () => Promise<string | symbol>,
  apply: (next: string) => void
): Promise<typeof CANCELLED | void> {
  for (;;) {
    const error = await check();
    if (!error) return;
    const retry = await confirm({ message: `${error} Retry entering ${label}?`, initialValue: true });
    if (isCancel(retry)) return CANCELLED;
    if (!retry) return;
    const next = await reprompt();
    if (isCancel(next)) return CANCELLED;
    apply(String(next));
  }
}
