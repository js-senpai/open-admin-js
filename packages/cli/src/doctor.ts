import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { detectPackageManager } from "./detect-package-manager.js";
import { isPackageManagerAvailable, MIN_NODE_MAJOR } from "./create-project.js";
import { inspectPassword, inspectSecret } from "./secrets.js";

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckResult = { name: string; status: CheckStatus; message: string };

export type DoctorReport = {
  results: CheckResult[];
  ok: boolean;
};

function parseEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function readFileSafe(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

async function tcpReachable(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("error", () => done(false));
    socket.once("connect", () => done(true));
  });
}

export async function runDoctorChecks(cwd: string, opts: { skipNetwork?: boolean } = {}): Promise<DoctorReport> {
  const results: CheckResult[] = [];
  const add = (name: string, status: CheckStatus, message: string) => results.push({ name, status, message });

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor >= MIN_NODE_MAJOR) add("node-version", "pass", `Node.js ${process.versions.node}`);
  else add("node-version", "fail", `Node.js ${process.versions.node} is below the required ${MIN_NODE_MAJOR}.`);

  const pm = detectPackageManager(cwd);
  if (opts.skipNetwork) {
    add("package-manager", "pass", `Detected ${pm} (availability check skipped).`);
  } else if (isPackageManagerAvailable(pm)) {
    add("package-manager", "pass", `${pm} is installed.`);
  } else {
    add("package-manager", "fail", `${pm} is not installed or not on PATH.`);
  }

  const hasNodeModules = existsSync(join(cwd, "node_modules"));
  if (hasNodeModules) add("node-modules", "pass", "Dependencies are installed.");
  else add("node-modules", "fail", `node_modules missing — run "${pm} install".`);

  const schemaPath = join(cwd, "prisma", "schema.prisma");
  const schema = readFileSafe(schemaPath);
  if (schema) add("prisma-schema", "pass", "prisma/schema.prisma present.");
  else add("prisma-schema", "fail", "prisma/schema.prisma is missing.");

  const envPath = join(cwd, "apps", "api", ".env");
  const envRaw = readFileSafe(envPath);
  const env = envRaw ? parseEnv(envRaw) : {};
  if (envRaw) add("env-file", "pass", "apps/api/.env present.");
  else add("env-file", "fail", "apps/api/.env is missing.");

  const requiredEnv = ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "JWT_REFRESH_SECRET"];
  const missingEnv = requiredEnv.filter((k) => !env[k]);
  if (envRaw) {
    if (missingEnv.length === 0) add("env-vars", "pass", "Required environment variables are set.");
    else add("env-vars", "fail", `Missing env vars: ${missingEnv.join(", ")}.`);
  }

  const prismaClient =
    existsSync(join(cwd, "node_modules", ".prisma", "client")) ||
    existsSync(join(cwd, "node_modules", "@prisma", "client"));
  if (prismaClient) add("prisma-client", "pass", "Prisma Client is available.");
  else add("prisma-client", "warn", `Prisma Client not generated — run "${pm} db:migrate" or prisma generate.`);

  // prisma validate (best-effort; only when deps + a local prisma binary exist)
  const prismaBin = join(cwd, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
  if (schema && existsSync(prismaBin)) {
    const res = spawnSync(prismaBin, ["validate", "--schema", schemaPath], { cwd, encoding: "utf8" });
    if (res.status === 0) add("prisma-validate", "pass", "prisma validate succeeded.");
    else add("prisma-validate", "fail", `prisma validate failed: ${(res.stderr || res.stdout || "").trim().split("\n").pop() ?? "error"}`);
  } else {
    add("prisma-validate", "warn", "Skipped prisma validate (install dependencies first).");
  }

  // migration provider consistency
  const lockPath = join(cwd, "prisma", "migrations", "migration_lock.toml");
  const lockRaw = readFileSafe(lockPath);
  // Read the provider from the `datasource` block, not the `generator` block.
  const schemaProvider = schema
    ?.match(/datasource\s+\w+\s*\{[^}]*?provider\s*=\s*"([^"]+)"/m)?.[1];
  const lockProvider = lockRaw?.match(/provider\s*=\s*"([^"]+)"/)?.[1];
  if (lockRaw && schemaProvider && lockProvider) {
    if (schemaProvider === lockProvider) {
      add("migration-provider", "pass", `Migration provider matches schema (${schemaProvider}).`);
    } else {
      add(
        "migration-provider",
        "fail",
        `Schema provider "${schemaProvider}" does not match migration_lock.toml "${lockProvider}".`
      );
    }
  }

  // incompatible migration SQL for non-postgres providers
  if (schemaProvider && schemaProvider !== "postgresql" && lockProvider === "postgresql") {
    add("migration-compat", "fail", "Migrations were generated for PostgreSQL but the schema uses a different provider.");
  }

  const pkgRaw = readFileSafe(join(cwd, "package.json"));
  if (pkgRaw) {
    try {
      const scripts = (JSON.parse(pkgRaw) as { scripts?: Record<string, string> }).scripts ?? {};
      const requiredScripts = ["dev", "build", "test", "db:migrate", "db:seed"];
      const missingScripts = requiredScripts.filter((s) => !scripts[s]);
      if (missingScripts.length === 0) add("root-scripts", "pass", "Required root scripts are present.");
      else add("root-scripts", "fail", `Missing root scripts: ${missingScripts.join(", ")}.`);
    } catch {
      add("root-scripts", "fail", "Root package.json is not valid JSON.");
    }
  }

  const lockfiles = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"].filter((f) => existsSync(join(cwd, f)));
  if (lockfiles.length <= 1) add("lockfiles", "pass", lockfiles.length ? `Single lockfile (${lockfiles[0]}).` : "No lockfile yet.");
  else add("lockfiles", "fail", `Conflicting lockfiles: ${lockfiles.join(", ")}.`);

  if (!existsSync(join(cwd, ".gitignore"))) add("gitignore", "fail", ".gitignore is missing.");
  else add("gitignore", "pass", ".gitignore present.");

  // .env tracked by git?
  if (existsSync(join(cwd, ".git"))) {
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "apps/api/.env"], { cwd, stdio: "ignore" });
    if (tracked.status === 0) add("env-tracked", "fail", "apps/api/.env is tracked by Git — remove it and rotate secrets.");
    else add("env-tracked", "pass", "apps/api/.env is not tracked by Git.");
  }

  // weak secrets
  if (envRaw) {
    const weak: string[] = [];
    const jwt = inspectSecret(env.JWT_SECRET, "JWT_SECRET");
    const jwtR = inspectSecret(env.JWT_REFRESH_SECRET, "JWT_REFRESH_SECRET");
    if (jwt.weak) weak.push(jwt.reason!);
    if (jwtR.weak) weak.push(jwtR.reason!);
    if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) weak.push("JWT_SECRET equals JWT_REFRESH_SECRET");
    const pw = inspectPassword(env.SUPERADMIN_PASSWORD);
    if (env.SUPERADMIN_PASSWORD && pw.weak) weak.push(pw.reason!);
    if (weak.length === 0) add("secrets", "pass", "Secrets look strong.");
    else add("secrets", "fail", weak.join("; ") + ".");
  }

  // redis connectivity (only meaningful when configured)
  if (env.REDIS_URL && !opts.skipNetwork) {
    try {
      const url = new URL(env.REDIS_URL);
      const ok = await tcpReachable(url.hostname, Number(url.port) || 6379);
      add("redis", ok ? "pass" : "warn", ok ? "Redis is reachable." : "Redis is not reachable (start it before running queues).");
    } catch {
      add("redis", "warn", "REDIS_URL is not a valid URL.");
    }
  }

  // database connectivity (skip for SQLite file URLs — no server to ping)
  if (env.DATABASE_URL && !opts.skipNetwork && !env.DATABASE_URL.trim().toLowerCase().startsWith("file:")) {
    try {
      const url = new URL(env.DATABASE_URL);
      const port = Number(url.port) || (schemaProvider === "mysql" ? 3306 : 5432);
      const ok = await tcpReachable(url.hostname, port);
      add("database", ok ? "pass" : "warn", ok ? "Database is reachable." : "Database is not reachable (is it running?).");
    } catch {
      add("database", "warn", "DATABASE_URL is not a valid URL.");
    }
  }

  const ok = !results.some((r) => r.status === "fail");
  return { results, ok };
}
