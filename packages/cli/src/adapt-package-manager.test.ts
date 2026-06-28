import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { adaptProjectForPackageManager } from "./adapt-package-manager.js";
import { createProject } from "./create-project.js";

const BASE_OPTIONS = {
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

describe("adaptProjectForPackageManager", () => {
  it("keeps pnpm layout unchanged", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-adapt-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, packageManager: "pnpm", projectName: "pnpm-app", cwd });
      expect(existsSync(join(result.targetDir, "pnpm-workspace.yaml"))).toBe(true);
      const root = JSON.parse(readFileSync(join(result.targetDir, "package.json"), "utf8")) as {
        packageManager?: string;
      };
      expect(root.packageManager).toContain("pnpm");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("adapts npm projects with workspaces and npm scripts", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-adapt-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, packageManager: "npm", projectName: "npm-app", cwd });
      expect(existsSync(join(result.targetDir, "pnpm-workspace.yaml"))).toBe(false);
      const root = JSON.parse(readFileSync(join(result.targetDir, "package.json"), "utf8")) as {
        workspaces?: string[];
        scripts?: Record<string, string>;
        overrides?: Record<string, string>;
        pnpm?: unknown;
      };
      expect(root.workspaces).toEqual(["apps/*", "packages/*"]);
      expect(root.scripts?.["db:migrate"]).toContain("--workspace=@openadminjs/api");
      expect(root.overrides?.["@nestjs/common"]).toBeTruthy();
      expect(root.pnpm).toBeUndefined();

      const apiPkg = JSON.parse(readFileSync(join(result.targetDir, "apps", "api", "package.json"), "utf8")) as {
        dependencies: Record<string, string>;
      };
      expect(apiPkg.dependencies["@openadminjs/core"]).toBe("workspace:*");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("adapts yarn projects and replaces workspace protocol with *", () => {
    const cwd = mkdtempSync(join(tmpdir(), "openadminjs-adapt-"));
    try {
      const result = createProject({ ...BASE_OPTIONS, packageManager: "yarn", projectName: "yarn-app", cwd });
      expect(existsSync(join(result.targetDir, "pnpm-workspace.yaml"))).toBe(false);
      const root = JSON.parse(readFileSync(join(result.targetDir, "package.json"), "utf8")) as {
        scripts?: Record<string, string>;
      };
      expect(root.scripts?.dev).toContain("yarn workspace @openadminjs/api dev");

      const apiPkg = JSON.parse(readFileSync(join(result.targetDir, "apps", "api", "package.json"), "utf8")) as {
        dependencies: Record<string, string>;
      };
      expect(apiPkg.dependencies["@openadminjs/core"]).toBe("*");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("is a no-op for pnpm when called directly", () => {
    const dir = mkdtempSync(join(tmpdir(), "openadminjs-adapt-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        `${JSON.stringify({ name: "x", scripts: { dev: "pnpm dev" }, packageManager: "pnpm@9.15.0" }, null, 2)}\n`
      );
      writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
      adaptProjectForPackageManager(dir, "pnpm");
      expect(existsSync(join(dir, "pnpm-workspace.yaml"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
