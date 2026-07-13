import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { inspectPassword, inspectSecret } from "./secrets.js";

export type Severity = "info" | "warning" | "critical";
export type Finding = { id: string; severity: Severity; message: string };

export type SecurityReport = {
  findings: Finding[];
  ok: boolean;
};

function readFileSafe(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

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

function gitignoreIgnoresEnv(cwd: string): boolean {
  const gi = readFileSafe(join(cwd, ".gitignore"));
  if (!gi) return false;
  const lines = gi.split(/\r?\n/).map((l) => l.trim());
  return lines.includes(".env") || lines.includes(".env.*") || lines.includes("*.env");
}

function scanForHardcodedSecrets(cwd: string): string[] {
  const hits: string[] = [];
  const roots = [join(cwd, "apps"), join(cwd, "packages")].filter((d) => existsSync(d));
  const patterns: Array<[RegExp, string]> = [
    [/(?:jwt[_-]?secret|refresh[_-]?secret)\s*[:=]\s*["'][^"']{6,}["']/i, "hardcoded JWT secret"],
    [/(?:password|passwd)\s*[:=]\s*["'][^"']{4,}["']/i, "hardcoded password"],
    [/(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"']{8,}["']/i, "hardcoded API key/token"]
  ];
  const stack = [...roots];
  let scanned = 0;
  while (stack.length && scanned < 4000) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (
          ["node_modules", ".next", "dist", ".turbo", ".git", "storybook-static", "coverage", "build", "out"].includes(
            entry.name
          )
        ) {
          continue;
        }
        stack.push(path);
      } else if (
        /\.(ts|tsx|js|jsx|mts|cts)$/.test(entry.name) &&
        !/\.(test|spec)\./.test(entry.name) &&
        !/\.min\.js$/.test(entry.name)
      ) {
        scanned++;
        const content = readFileSafe(path);
        if (!content) continue;
        for (const [re, label] of patterns) {
          if (re.test(content) && !/process\.env/.test(content.match(re)?.[0] ?? "")) {
            hits.push(`${label} in ${path.replace(cwd + "/", "")}`);
            break;
          }
        }
      }
    }
  }
  return hits;
}

export function runSecurityChecks(cwd: string, opts: { skipNetwork?: boolean } = {}): SecurityReport {
  const findings: Finding[] = [];
  const add = (id: string, severity: Severity, message: string) => findings.push({ id, severity, message });

  const envRaw = readFileSafe(join(cwd, "apps", "api", ".env"));
  const env = envRaw ? parseEnv(envRaw) : undefined;

  if (!env) {
    add("env-missing", "warning", "apps/api/.env not found — cannot assess runtime secrets.");
  } else {
    const jwt = inspectSecret(env.JWT_SECRET, "JWT_SECRET");
    if (jwt.weak) add("jwt-secret", "critical", jwt.reason!);
    const jwtR = inspectSecret(env.JWT_REFRESH_SECRET, "JWT_REFRESH_SECRET");
    if (jwtR.weak) add("jwt-refresh-secret", "critical", jwtR.reason!);
    if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      add("jwt-identical", "critical", "JWT_SECRET and JWT_REFRESH_SECRET must not be identical.");
    }
    if (env.SUPERADMIN_PASSWORD) {
      const pw = inspectPassword(env.SUPERADMIN_PASSWORD);
      if (pw.weak) add("admin-password", "critical", pw.reason!);
    }
    if (!jwt.weak && !jwtR.weak) add("jwt-ok", "info", "JWT secrets have sufficient length and entropy.");
  }

  // .env handling
  if (!gitignoreIgnoresEnv(cwd)) {
    add("gitignore-env", "critical", ".env is not excluded by .gitignore.");
  } else {
    add("gitignore-env-ok", "info", ".env is excluded by .gitignore.");
  }
  if (existsSync(join(cwd, ".git"))) {
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "apps/api/.env"], { cwd, stdio: "ignore" });
    if (tracked.status === 0) add("env-tracked", "critical", "apps/api/.env is tracked by Git. Untrack it and rotate all secrets.");
  }

  // npm tarball exposure — only relevant if the package is publishable
  const rootPkgRaw = readFileSafe(join(cwd, "package.json"));
  if (rootPkgRaw) {
    try {
      const pkg = JSON.parse(rootPkgRaw) as { private?: boolean; files?: string[] };
      if (pkg.private !== true && pkg.files && pkg.files.some((f) => f.includes(".env"))) {
        add("npm-env", "critical", "package.json `files` would publish a .env file.");
      }
    } catch {
      /* ignore */
    }
  }

  // production config scans
  const mainCandidates = [join(cwd, "apps", "api", "src", "main.ts")];
  for (const file of mainCandidates) {
    const content = readFileSafe(file);
    if (!content) continue;
    if (/origin\s*:\s*["']\*["']/.test(content) && /credentials\s*:\s*true/.test(content)) {
      add("cors-credentials", "critical", "CORS is configured with origin '*' together with credentials.");
    }
  }

  const hardcoded = scanForHardcodedSecrets(cwd);
  for (const hit of hardcoded) add("hardcoded-secret", "warning", hit);

  // dependency audit (best-effort, network-dependent)
  if (!opts.skipNetwork && existsSync(join(cwd, "node_modules"))) {
    const audit = spawnSync("npm", ["audit", "--production", "--audit-level=high", "--json"], { cwd, encoding: "utf8" });
    if (audit.stdout) {
      try {
        const parsed = JSON.parse(audit.stdout) as { metadata?: { vulnerabilities?: Record<string, number> } };
        const vulns = parsed.metadata?.vulnerabilities ?? {};
        const high = (vulns.high ?? 0) + (vulns.critical ?? 0);
        if (high > 0) add("dependency-audit", "warning", `${high} high/critical dependency vulnerabilities reported by npm audit.`);
        else add("dependency-audit", "info", "No high/critical dependency vulnerabilities reported.");
      } catch {
        /* ignore audit parse errors */
      }
    }
  }

  add("https-guidance", "info", "In production, terminate TLS at a reverse proxy and set secure cookie flags + trust proxy.");

  const ok = !findings.some((f) => f.severity === "critical");
  return { findings, ok };
}
