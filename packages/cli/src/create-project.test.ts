import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createProject, defaultTemplateDir } from "./create-project.js";

describe("create project", () => {
  it("ships template env defaults for admin origin and api port", () => {
    const envExample = readFileSync(join(defaultTemplateDir(), ".env.example"), "utf8");
    expect(envExample).toContain("ADMIN_ORIGIN=http://localhost:3000");
    expect(envExample).toContain("API_PORT=4000");
    expect(envExample).not.toContain("__ADMIN_ORIGIN__");
    expect(envExample).not.toContain("__API_PORT__");
  });

  it("creates project with rendered env values", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-cli-test-"));
    try {
      const result = createProject({
        projectName: "my-app",
        cwd,
        packageManager: "pnpm",
        database: "postgresql",
        superadminEmail: "admin@localhost.dev",
        superadminPassword: "12345678",
        databaseUrl: "postgresql://localhost:5432/my-app?schema=public",
        redisUrl: "redis://localhost:6379",
        jwtSecret: "test-jwt-secret",
        jwtRefreshSecret: "test-jwt-refresh-secret",
        adminOrigin: "http://localhost:3000",
        apiPort: "4000",
        git: false,
        install: false,
        templateDir: defaultTemplateDir()
      });

      const envExample = readFileSync(join(result.targetDir, ".env.example"), "utf8");
      expect(envExample).toContain("DATABASE_URL=postgresql://localhost:5432/my-app?schema=public");
      expect(envExample).toContain("REDIS_URL=redis://localhost:6379");
      expect(envExample).toContain("JWT_SECRET=test-jwt-secret");
      expect(envExample).toContain("JWT_REFRESH_SECRET=test-jwt-refresh-secret");
      expect(envExample).toContain("ADMIN_ORIGIN=http://localhost:3000");
      expect(envExample).toContain("API_PORT=4000");
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
        createProject({
          projectName: "broken-app",
          cwd,
          packageManager: "pnpm",
          database: "postgresql",
          superadminEmail: "admin@localhost.dev",
          superadminPassword: "12345678",
          databaseUrl: "postgresql://localhost:5432/broken-app?schema=public",
          redisUrl: "redis://localhost:6379",
          jwtSecret: "test-jwt-secret",
          jwtRefreshSecret: "test-jwt-refresh-secret",
          adminOrigin: "http://localhost:3000",
          apiPort: "4000",
          git: false,
          install: false,
          templateDir: badTemplate
        })
      ).toThrow(/package\.json not found/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(badTemplate, { recursive: true, force: true });
    }
  });
});
