import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createProject, defaultTemplateDir } from "./create-project.js";

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

  it("creates project with rendered .env.example values", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, projectName: "my-app", cwd, templateDir: defaultTemplateDir() });

      const envExample = readFileSync(join(result.targetDir, ".env.example"), "utf8");
      const env = readFileSync(join(result.targetDir, ".env"), "utf8");
      expect(envExample).toContain("DATABASE_URL=postgresql://localhost:5432/my-app?schema=public");
      expect(envExample).toContain("REDIS_URL=redis://localhost:6379");
      expect(envExample).toContain("JWT_SECRET=test-jwt-secret");
      expect(envExample).toContain("JWT_REFRESH_SECRET=test-jwt-refresh-secret");
      expect(envExample).toContain("ADMIN_ORIGIN=http://localhost:3000");
      expect(envExample).toContain("API_PORT=4000");

      expect(env).toBe(envExample);
      expect(existsSync(join(result.targetDir, "tsconfig.base.json"))).toBe(true);
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
