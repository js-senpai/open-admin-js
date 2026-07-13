import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import { createProject, databaseUrl, defaultTemplateDir, type DatabaseDriver } from "./create-project.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const prismaBin = join(repoRoot, "node_modules", ".bin", "prisma");

const BASE = {
  packageManager: "pnpm" as const,
  superadminEmail: "admin@localhost.dev",
  superadminPassword: "password1234",
  redisUrl: "redis://localhost:6379",
  jwtSecret: "test-jwt-secret-01234567890123456789012",
  jwtRefreshSecret: "test-jwt-refresh-0123456789012345678",
  adminOrigin: "http://localhost:3000",
  apiPort: "4000",
  git: false,
  install: false,
  templateDir: defaultTemplateDir()
};

const PROVIDERS: Array<{ database: DatabaseDriver; url: string }> = [
  { database: "postgresql", url: "postgresql://localhost:5432/it-app?schema=public" },
  { database: "mysql", url: "mysql://openadminjs:openadminjs@localhost:3306/it-app" },
  { database: "sqlite", url: "file:./dev.db" }
];

function prismaValidate(schemaPath: string, databaseUrl: string): { ok: boolean; output: string } {
  const result = spawnSync(prismaBin, ["validate", "--schema", schemaPath], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8"
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout}\n${result.stderr}`.trim()
  };
}

describe("database provider integration", () => {
  const cwd = mkdtempSync(join(tmpdir(), "oaj-db-int-"));
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  for (const { database, url } of PROVIDERS) {
    it(`generated ${database} schema passes prisma validate`, () => {
      const result = createProject({
        ...BASE,
        projectName: `${database}-validate`,
        cwd,
        database,
        databaseUrl: url
      });
      const schemaPath = join(result.targetDir, "prisma", "schema.prisma");
      expect(existsSync(schemaPath)).toBe(true);
      const validation = prismaValidate(schemaPath, url);
      expect(validation.ok, validation.output).toBe(true);
    });
  }
});

describe("databaseUrl defaults", () => {
  it("returns provider-appropriate connection strings", () => {
    expect(databaseUrl("my-app", "postgresql")).toMatch(/^postgresql:\/\//);
    expect(databaseUrl("my-app", "mysql")).toMatch(/^mysql:\/\//);
    expect(databaseUrl("my-app", "sqlite")).toBe("file:./dev.db");
  });
});
