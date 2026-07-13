import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createProject,
  defaultTemplateDir,
  DEFAULT_SUPERADMIN_EMAIL,
  resolveSuperadminEmail,
  validateSuperadminEmailInput
} from "./create-project.js";

describe("superadmin email default (press Enter)", () => {
  it("accepts an empty input by resolving to the default", () => {
    // Simulates pressing Enter without typing an email.
    expect(validateSuperadminEmailInput("")).toBeUndefined();
    expect(resolveSuperadminEmail("")).toBe(DEFAULT_SUPERADMIN_EMAIL);
  });
  it("validates the final value, not the raw input", () => {
    expect(validateSuperadminEmailInput("not-an-email")).toMatch(/valid email/);
    expect(validateSuperadminEmailInput("me@example.com")).toBeUndefined();
    expect(resolveSuperadminEmail("  me@example.com  ")).toBe("me@example.com");
  });
});

const BASE_OPTIONS = {
  packageManager: "pnpm",
  database: "postgresql",
  superadminEmail: "admin@localhost.dev",
  superadminPassword: "password1234",
  databaseUrl: "postgresql://localhost:5432/my-app?schema=public",
  redisUrl: "redis://localhost:6379",
  jwtSecret: "test-jwt-secret",
  jwtRefreshSecret: "test-jwt-refresh-secret",
  adminOrigin: "http://localhost:3000",
  apiPort: "4000",
  git: false,
  install: false
} as const;

describe("create project", () => {
  it("template .env.example contains placeholder keys for every secret", () => {
    const envExample = readFileSync(join(defaultTemplateDir(), ".env.example"), "utf8");
    for (const key of ["__DATABASE_URL__", "__REDIS_URL__", "__JWT_SECRET__", "__JWT_REFRESH_SECRET__", "__ADMIN_ORIGIN__", "__API_PORT__"]) {
      expect(envExample, `missing placeholder ${key}`).toContain(key);
    }
  });

  it("defaults templateDir when omitted", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, projectName: "default-template", cwd });
      expect(existsSync(join(result.targetDir, "package.json"))).toBe(true);
      expect(existsSync(join(result.targetDir, "pnpm-workspace.yaml"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("adapts npm projects when packageManager is npm", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, packageManager: "npm", projectName: "npm-app", cwd });
      expect(result.packageManager).toBe("npm");
      expect(existsSync(join(result.targetDir, "pnpm-workspace.yaml"))).toBe(false);
      const root = JSON.parse(readFileSync(join(result.targetDir, "package.json"), "utf8")) as { workspaces?: string[] };
      expect(root.workspaces).toEqual(["apps/*", "packages/*"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("generates a tracked .env.example but no root .env with secrets", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, projectName: "my-app", cwd, templateDir: defaultTemplateDir() });
      expect(existsSync(join(result.targetDir, ".env.example"))).toBe(true);
      expect(existsSync(join(result.targetDir, ".env"))).toBe(false);
      const envExample = readFileSync(join(result.targetDir, ".env.example"), "utf8");
      expect(envExample).toContain("JWT_SECRET=");
      // placeholders only — never the real secret
      expect(envExample).not.toContain("test-jwt-secret");
      expect(existsSync(join(result.targetDir, "tsconfig.base.json"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("generates a .gitignore that excludes .env and matches apps/api/.env", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, projectName: "my-app", cwd, templateDir: defaultTemplateDir() });
      const gitignore = readFileSync(join(result.targetDir, ".gitignore"), "utf8");
      for (const entry of ["node_modules", ".pnpm-store", ".next", "dist", "coverage", ".env", ".env.*", "!.env.example", "*.log", ".DS_Store"]) {
        expect(gitignore, `missing ${entry}`).toContain(entry);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("writes .gitignore before git init so .env is never staged", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, projectName: "git-app", cwd, git: true, templateDir: defaultTemplateDir() });
      // .git exists and .gitignore present at the same time
      expect(existsSync(join(result.targetDir, ".git"))).toBe(true);
      expect(existsSync(join(result.targetDir, ".gitignore"))).toBe(true);
      const status = execFileSync("git", ["status", "--porcelain", "--ignored"], {
        cwd: result.targetDir,
        encoding: "utf8"
      });
      // apps/api/.env must be ignored, never listed as untracked (??)
      expect(status).not.toMatch(/^\?\? apps\/api\/\.env$/m);
      expect(status).toMatch(/!! apps\/api\/\.env/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("never prints real secrets to stdout/stderr", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    const logs: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...a: unknown[]) => void logs.push(a.join(" "));
    console.error = (...a: unknown[]) => void logs.push(a.join(" "));
    try {
      createProject({
        ...BASE_OPTIONS,
        projectName: "secret-app",
        cwd,
        jwtSecret: "SUPER-SECRET-JWT-VALUE-1234567890",
        superadminPassword: "SUPER-SECRET-PASSWORD",
        templateDir: defaultTemplateDir()
      });
      const output = logs.join("\n");
      expect(output).not.toContain("SUPER-SECRET-JWT-VALUE-1234567890");
      expect(output).not.toContain("SUPER-SECRET-PASSWORD");
    } finally {
      console.log = origLog;
      console.error = origErr;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("cleans up the staging directory and leaves no partial project on failure", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    const badTemplate = mkdtempSync(join(tmpdir(), "openadminjs-cli-template-"));
    try {
      mkdirSync(join(badTemplate, "apps"), { recursive: true });
      expect(() =>
        createProject({ ...BASE_OPTIONS, projectName: "broken-app", cwd, templateDir: badTemplate })
      ).toThrow(/package\.json not found/);
      // No target and no leftover staging directory next to it
      const leftovers = readdirSync(cwd);
      expect(leftovers).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(badTemplate, { recursive: true, force: true });
    }
  });

  it("scaffolds prisma.config.ts that loads apps/api/.env for Prisma CLI", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, projectName: "my-app", cwd, templateDir: defaultTemplateDir() });
      const prismaConfig = readFileSync(join(result.targetDir, "apps", "api", "prisma.config.ts"), "utf8");
      expect(prismaConfig).toContain("dotenv");
      expect(prismaConfig).toContain('.env")');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("writes apps/api/.env with real secrets and superadmin credentials", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, projectName: "my-app", cwd, templateDir: defaultTemplateDir() });

      const apiEnv = readFileSync(join(result.targetDir, "apps", "api", ".env"), "utf8");
      expect(apiEnv).toContain("DATABASE_URL=postgresql://localhost:5432/my-app?schema=public");
      expect(apiEnv).toContain("JWT_SECRET=test-jwt-secret");
      expect(apiEnv).toContain("SUPERADMIN_EMAIL=admin@localhost.dev");
      expect(apiEnv).toContain("SUPERADMIN_PASSWORD=password1234");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("generates a SQLite project: String columns for Json/scopes, no postgres migrations", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({
        ...BASE_OPTIONS,
        database: "sqlite",
        projectName: "sqlite-app",
        cwd,
        databaseUrl: "file:./dev.db",
        templateDir: defaultTemplateDir()
      });
      const schema = readFileSync(join(result.targetDir, "prisma", "schema.prisma"), "utf8");
      expect(schema).toMatch(/datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*"sqlite"/);
      expect(schema).not.toContain("String[]");
      expect(schema).not.toMatch(/\bJson\b/);
      expect(schema).toMatch(/scopes\s+String/);
      expect(existsSync(join(result.targetDir, "prisma", "migrations"))).toBe(false);
      const apiEnv = readFileSync(join(result.targetDir, "apps", "api", ".env"), "utf8");
      expect(apiEnv).toContain("DATABASE_URL=file:./dev.db");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("generates a MySQL project: correct provider, Json scopes, no postgres migrations", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({
        ...BASE_OPTIONS,
        database: "mysql",
        projectName: "mysql-app",
        cwd,
        databaseUrl: "mysql://openadminjs:openadminjs@localhost:3306/mysql-app",
        templateDir: defaultTemplateDir()
      });
      const schema = readFileSync(join(result.targetDir, "prisma", "schema.prisma"), "utf8");
      expect(schema).toMatch(/datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*"mysql"/);
      // Scalar lists are unsupported on MySQL — must be converted to Json.
      expect(schema).not.toContain("String[]");
      expect(schema).toMatch(/scopes\s+Json/);
      // PostgreSQL baseline migration must not be reused for MySQL.
      expect(existsSync(join(result.targetDir, "prisma", "migrations"))).toBe(false);
      // apps/api/.env gets the MySQL URL.
      const apiEnv = readFileSync(join(result.targetDir, "apps", "api", ".env"), "utf8");
      expect(apiEnv).toContain("DATABASE_URL=mysql://openadminjs:openadminjs@localhost:3306/mysql-app");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("keeps the PostgreSQL baseline migration for postgresql projects", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, projectName: "pg-app", cwd, templateDir: defaultTemplateDir() });
      expect(existsSync(join(result.targetDir, "prisma", "migrations", "migration_lock.toml"))).toBe(true);
      const schema = readFileSync(join(result.targetDir, "prisma", "schema.prisma"), "utf8");
      expect(schema).toContain("String[]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("fails fast when template package.json is missing", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    const badTemplate = mkdtempSync(join(tmpdir(), "openadminjs-cli-template-"));
    try {
      writeFileSync(join(badTemplate, ".env.example"), "DATABASE_URL=__DATABASE_URL__\n");
      mkdirSync(join(badTemplate, "apps"), { recursive: true });

      expect(() =>
        createProject({ ...BASE_OPTIONS, projectName: "broken-app", cwd, templateDir: badTemplate })
      ).toThrow(/package\.json not found/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(badTemplate, { recursive: true, force: true });
    }
  });

  it("copies template when installed inside node_modules (npx scenario)", () => {
    // The old filter `source.includes("node_modules")` matched the entire absolute path when the
    // package was installed via npx (~/.npm/_npx/.../node_modules/openadminjs/template/...) and
    // blocked every file, so package.json never landed in the target.
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    const fakeNpx = mkdtempSync(join(tmpdir(), "openadminjs-npx-"));
    const templateDir = join(fakeNpx, "node_modules", "openadminjs", "template");
    try {
      mkdirSync(templateDir, { recursive: true });
      writeFileSync(
        join(templateDir, "package.json"),
        JSON.stringify({ name: "__APP_NAME__", private: true }, null, 2) + "\n"
      );
      writeFileSync(join(templateDir, ".env.example"), "DATABASE_URL=__DATABASE_URL__\n");

      const result = createProject({ ...BASE_OPTIONS, projectName: "npx-app", cwd, templateDir });

      const packageJson = readFileSync(join(result.targetDir, "package.json"), "utf8");
      expect(packageJson).toContain('"name": "npx-app"');
      expect(existsSync(join(result.targetDir, "apps", "api", ".env"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(fakeNpx, { recursive: true, force: true });
    }
  });
});
