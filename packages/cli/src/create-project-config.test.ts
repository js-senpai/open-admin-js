import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createProject,
  createProjectInteractive,
  DEFAULT_REDIS_URL,
  firstAvailablePackageManager,
  generatePassword,
  PACKAGE_MANAGERS,
  SetupIncompleteError,
  validateDatabaseUrlInput,
  validateRedisUrlInput,
  type PackageManager
} from "./create-project.js";
import { inspectPassword } from "./secrets.js";

const BASE = {
  packageManager: "pnpm" as const,
  database: "sqlite" as const,
  superadminEmail: "admin@localhost.dev",
  superadminPassword: "password1234",
  databaseUrl: "file:./dev.db",
  jwtSecret: "test-jwt-secret-value-1234567890",
  jwtRefreshSecret: "different-jwt-refresh-value-0987654321",
  adminOrigin: "http://localhost:3000",
  apiPort: "4000",
  git: false,
  install: false
};

describe("validateRedisUrlInput (Enter accepts default; blank disables)", () => {
  it("treats a blank value as valid (queues disabled)", () => {
    expect(validateRedisUrlInput("")).toBeUndefined();
    expect(validateRedisUrlInput("   ")).toBeUndefined();
  });
  it("accepts the displayed default", () => {
    expect(validateRedisUrlInput(DEFAULT_REDIS_URL)).toBeUndefined();
    expect(validateRedisUrlInput("rediss://user:pass@host:6380")).toBeUndefined();
  });
  it("rejects a non-redis URL", () => {
    expect(validateRedisUrlInput("http://localhost:6379")).toMatch(/redis:\/\//);
    expect(validateRedisUrlInput("not a url")).toMatch(/valid Redis URL/);
  });
});

describe("validateDatabaseUrlInput (validates final resolved value)", () => {
  it("accepts blank by falling back to the default", () => {
    expect(validateDatabaseUrlInput("postgresql", "", "postgresql://localhost:5432/x")).toBeUndefined();
  });
  it("requires file: for sqlite", () => {
    expect(validateDatabaseUrlInput("sqlite", "postgres://x", "file:./dev.db")).toMatch(/file:/);
    expect(validateDatabaseUrlInput("sqlite", "file:./dev.db", "file:./dev.db")).toBeUndefined();
  });
  it("rejects an unparseable url for server databases", () => {
    expect(validateDatabaseUrlInput("postgresql", "::::", "postgresql://localhost:5432/x")).toMatch(/valid database/);
  });
});

describe("firstAvailablePackageManager", () => {
  it("returns an installed manager or undefined", () => {
    const pm = firstAvailablePackageManager();
    expect(pm === undefined || (PACKAGE_MANAGERS as readonly string[]).includes(pm)).toBe(true);
  });
});

describe("generatePassword", () => {
  it("produces a strong, non-weak password", () => {
    const pw = generatePassword();
    expect(pw.length).toBeGreaterThanOrEqual(16);
    expect(inspectPassword(pw).weak).toBe(false);
  });
});

describe("Redis is optional", () => {
  it("disables Redis when no URL is supplied (REDIS_URL empty, redisEnabled false)", () => {
    const cwd = mkdtempSync(join(tmpdir(), "oaj-redis-"));
    try {
      const result = createProject({ ...BASE, projectName: "no-redis", cwd });
      expect(result.redisEnabled).toBe(false);
      const env = readFileSync(join(result.targetDir, "apps", "api", ".env"), "utf8");
      expect(env).toMatch(/^REDIS_URL=$/m);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("skipRedis forces queues off even if a URL is passed", () => {
    const cwd = mkdtempSync(join(tmpdir(), "oaj-redis-"));
    try {
      const result = createProject({
        ...BASE,
        projectName: "skip-redis",
        cwd,
        redisUrl: "redis://localhost:6379",
        skipRedis: true
      });
      expect(result.redisEnabled).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("enables Redis when a URL is supplied", () => {
    const cwd = mkdtempSync(join(tmpdir(), "oaj-redis-"));
    try {
      const result = createProject({ ...BASE, projectName: "with-redis", cwd, redisUrl: DEFAULT_REDIS_URL });
      expect(result.redisEnabled).toBe(true);
      const env = readFileSync(join(result.targetDir, "apps", "api", ".env"), "utf8");
      expect(env).toContain(`REDIS_URL=${DEFAULT_REDIS_URL}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("no workspace: protocol leaks for npm/yarn", () => {
  for (const pm of ["npm", "yarn"] as PackageManager[]) {
    it(`rewrites every workspace:* to * for ${pm}`, () => {
      const cwd = mkdtempSync(join(tmpdir(), `oaj-${pm}-`));
      try {
        const result = createProject({ ...BASE, packageManager: pm, projectName: `app-${pm}`, cwd, database: "postgresql", databaseUrl: "postgresql://localhost:5432/x" });
        for (const rel of ["package.json", "apps/api/package.json", "apps/admin/package.json"]) {
          const f = join(result.targetDir, rel);
          if (!existsSync(f)) continue;
          expect(readFileSync(f, "utf8").includes("workspace:"), `${rel} still has workspace:`).toBe(false);
        }
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});

describe("non-interactive createProjectInteractive", () => {
  it("throws an actionable error when no project name is given", async () => {
    await expect(createProjectInteractive({ nonInteractive: true })).rejects.toThrow(/project name is required/i);
  });

  it("generates with safe defaults and a generated password (no prompts)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "oaj-ni-"));
    try {
      const result = await createProjectInteractive({
        projectName: "ni-app",
        cwd,
        database: "sqlite",
        packageManager: "pnpm",
        install: false,
        git: false,
        nonInteractive: true
      });
      expect(result).toBeDefined();
      expect(result!.passwordGenerated).toBe(true);
      expect(result!.redisEnabled).toBe(false);
      expect(existsSync(join(result!.targetDir, "package.json"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("SetupIncompleteError", () => {
  it("carries an exact resume command and preserved directory", () => {
    const err = new SetupIncompleteError("install failed", {
      targetDir: "/tmp/foo",
      appName: "foo",
      packageManager: "npm"
    });
    expect(err.targetDir).toBe("/tmp/foo");
    expect(err.resumeCommand).toContain("cd foo");
    expect(err.resumeCommand).toContain("npm install");
    expect(err.message).toContain("left in place");
  });
});
