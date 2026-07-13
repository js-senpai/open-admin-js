import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(here, "..");
const distEntry = join(cliRoot, "dist", "index.js");
const pkgVersion = (JSON.parse(readFileSync(join(cliRoot, "package.json"), "utf8")) as { version: string }).version;

function run(args: string[], cwd = cliRoot) {
  return spawnSync(process.execPath, [distEntry, ...args], { cwd, encoding: "utf8" });
}

beforeAll(() => {
  // Compile the CLI to dist via the TypeScript compiler entry (works in CI and sandbox).
  const tsc = join(cliRoot, "node_modules", "typescript", "bin", "tsc");
  const res = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json"], { cwd: cliRoot, encoding: "utf8" });
  if (res.status !== 0) throw new Error(`tsc build failed: ${res.stderr || res.stdout}`);
  if (!existsSync(distEntry)) throw new Error("dist/index.js not produced");
}, 60000);

describe("openadminjs CLI e2e", () => {
  it("--version prints the package version and exits 0", () => {
    const r = run(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`openadminjs ${pkgVersion}`);
  });

  it("-v behaves like --version", () => {
    const r = run(["-v"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`openadminjs ${pkgVersion}`);
  });

  it("--help exits 0 and lists commands", () => {
    const r = run(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/create/);
    expect(r.stdout).toMatch(/generate/);
    expect(r.stdout).toMatch(/doctor/);
  });

  it("unknown command errors and exits non-zero", () => {
    const r = run(["definitely-not-a-command"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Unknown command/);
    expect(r.stderr).toMatch(/--help/);
  });

  it("db migrate --dry-run prints the command without running it", () => {
    const r = run(["db", "migrate", "dev", "--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/db:migrate/);
  });

  it("generate field is routed to its own handler (not the generic generate)", () => {
    const proj = mkdtempSync(join(tmpdir(), "oaj-e2e-"));
    try {
      const resDir = join(proj, "apps", "api", "src", "resources");
      mkdirSync(resDir, { recursive: true });
      writeFileSync(
        join(resDir, "post.resource.ts"),
        `import { defineResource } from '@openadminjs/core';\n\nexport default defineResource({\n  name: 'posts',\n  model: 'Post',\n  fields: {\n    id: { type: 'id', label: 'ID' },\n  },\n  permissions: {},\n});\n`
      );
      const r = run(["generate", "field", "post", "title", "--type", "text", "--required"], proj);
      expect(r.status).toBe(0);
      const updated = readFileSync(join(resDir, "post.resource.ts"), "utf8");
      expect(updated).toContain("title:");
      expect(updated).toContain("required: true");
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it("generate resource creates a resource file and rejects unsafe names", () => {
    const proj = mkdtempSync(join(tmpdir(), "oaj-e2e-"));
    try {
      const ok = run(["generate", "resource", "BlogPost"], proj);
      expect(ok.status).toBe(0);
      expect(existsSync(join(proj, "apps", "api", "src", "resources", "blog-post.resource.ts"))).toBe(true);

      const bad = run(["generate", "resource", "../evil"], proj);
      expect(bad.status).not.toBe(0);
      expect(existsSync(join(proj, "..", "evil.resource.ts"))).toBe(false);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it("generate with unknown kind errors", () => {
    const r = run(["generate", "bogus", "x"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Unknown generate kind/);
  });
});
