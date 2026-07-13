import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDoctorChecks, type CheckResult } from "./doctor.js";
import { generateSecret } from "./secrets.js";

let dir: string;

function status(results: CheckResult[], name: string): string | undefined {
  return results.find((r) => r.name === name)?.status;
}

function scaffoldHealthyProject(root: string): void {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "demo",
        packageManager: "pnpm@9.15.0",
        scripts: { dev: "x", build: "x", test: "x", "db:migrate": "x", "db:seed": "x" }
      },
      null,
      2
    )
  );
  writeFileSync(join(root, ".gitignore"), "node_modules\n.env\n.env.*\n!.env.example\n");
  writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  mkdirSync(join(root, "prisma", "migrations"), { recursive: true });
  writeFileSync(
    join(root, "prisma", "schema.prisma"),
    'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n'
  );
  writeFileSync(join(root, "prisma", "migrations", "migration_lock.toml"), 'provider = "postgresql"\n');
  mkdirSync(join(root, "apps", "api"), { recursive: true });
  writeFileSync(
    join(root, "apps", "api", ".env"),
    [
      "DATABASE_URL=postgresql://localhost:5432/demo?schema=public",
      "REDIS_URL=redis://localhost:6379",
      `JWT_SECRET=${generateSecret()}`,
      `JWT_REFRESH_SECRET=${generateSecret()}`,
      "SUPERADMIN_PASSWORD=a-strong-enough-password"
    ].join("\n") + "\n"
  );
  mkdirSync(join(root, "node_modules"), { recursive: true });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oaj-doctor-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("runDoctorChecks", () => {
  it("passes core checks for a healthy project", async () => {
    scaffoldHealthyProject(dir);
    const { results, ok } = await runDoctorChecks(dir, { skipNetwork: true });
    expect(status(results, "prisma-schema")).toBe("pass");
    expect(status(results, "env-file")).toBe("pass");
    expect(status(results, "env-vars")).toBe("pass");
    expect(status(results, "root-scripts")).toBe("pass");
    expect(status(results, "gitignore")).toBe("pass");
    expect(status(results, "migration-provider")).toBe("pass");
    expect(status(results, "secrets")).toBe("pass");
    expect(status(results, "lockfiles")).toBe("pass");
    expect(ok).toBe(true);
  });

  it("fails an unprepared project (missing schema, env, node_modules, gitignore)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", scripts: {} }));
    const { results, ok } = await runDoctorChecks(dir, { skipNetwork: true });
    expect(status(results, "prisma-schema")).toBe("fail");
    expect(status(results, "env-file")).toBe("fail");
    expect(status(results, "node-modules")).toBe("fail");
    expect(status(results, "gitignore")).toBe("fail");
    expect(ok).toBe(false);
  });

  it("detects provider mismatch between schema and migration_lock", async () => {
    scaffoldHealthyProject(dir);
    writeFileSync(join(dir, "prisma", "migrations", "migration_lock.toml"), 'provider = "mysql"\n');
    const { results, ok } = await runDoctorChecks(dir, { skipNetwork: true });
    expect(status(results, "migration-provider")).toBe("fail");
    expect(ok).toBe(false);
  });

  it("detects weak/default secrets", async () => {
    scaffoldHealthyProject(dir);
    writeFileSync(
      join(dir, "apps", "api", ".env"),
      "DATABASE_URL=postgresql://localhost:5432/demo\nREDIS_URL=redis://localhost:6379\nJWT_SECRET=secret\nJWT_REFRESH_SECRET=secret\n"
    );
    const { results, ok } = await runDoctorChecks(dir, { skipNetwork: true });
    expect(status(results, "secrets")).toBe("fail");
    expect(ok).toBe(false);
  });
});
