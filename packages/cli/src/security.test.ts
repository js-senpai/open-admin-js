import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSecurityChecks, type Finding } from "./security.js";
import { generateSecret } from "./secrets.js";

let dir: string;

function sev(findings: Finding[], id: string): string | undefined {
  return findings.find((f) => f.id === id)?.severity;
}

function writeEnv(root: string, content: string): void {
  mkdirSync(join(root, "apps", "api"), { recursive: true });
  writeFileSync(join(root, "apps", "api", ".env"), content);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oaj-sec-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("runSecurityChecks", () => {
  it("flags weak/identical JWT secrets and weak admin password as critical", () => {
    writeEnv(
      dir,
      "JWT_SECRET=secret\nJWT_REFRESH_SECRET=secret\nSUPERADMIN_PASSWORD=admin\n"
    );
    writeFileSync(join(dir, ".gitignore"), ".env\n");
    const { findings, ok } = runSecurityChecks(dir, { skipNetwork: true });
    expect(sev(findings, "jwt-secret")).toBe("critical");
    expect(sev(findings, "jwt-identical")).toBe("critical");
    expect(sev(findings, "admin-password")).toBe("critical");
    expect(ok).toBe(false);
  });

  it("flags missing .env exclusion in .gitignore as critical", () => {
    writeEnv(dir, `JWT_SECRET=${generateSecret()}\nJWT_REFRESH_SECRET=${generateSecret()}\n`);
    writeFileSync(join(dir, ".gitignore"), "node_modules\n");
    const { findings, ok } = runSecurityChecks(dir, { skipNetwork: true });
    expect(sev(findings, "gitignore-env")).toBe("critical");
    expect(ok).toBe(false);
  });

  it("passes for a hardened project", () => {
    writeEnv(
      dir,
      `JWT_SECRET=${generateSecret()}\nJWT_REFRESH_SECRET=${generateSecret()}\nSUPERADMIN_PASSWORD=a-strong-passphrase\n`
    );
    writeFileSync(join(dir, ".gitignore"), ".env\n.env.*\n!.env.example\n");
    const { findings, ok } = runSecurityChecks(dir, { skipNetwork: true });
    expect(ok).toBe(true);
    expect(sev(findings, "jwt-ok")).toBe("info");
  });

  it("detects CORS '*' with credentials", () => {
    writeEnv(dir, `JWT_SECRET=${generateSecret()}\nJWT_REFRESH_SECRET=${generateSecret()}\n`);
    writeFileSync(join(dir, ".gitignore"), ".env\n");
    mkdirSync(join(dir, "apps", "api", "src"), { recursive: true });
    writeFileSync(
      join(dir, "apps", "api", "src", "main.ts"),
      "app.enableCors({ origin: '*', credentials: true });\n"
    );
    const { findings, ok } = runSecurityChecks(dir, { skipNetwork: true });
    expect(sev(findings, "cors-credentials")).toBe("critical");
    expect(ok).toBe(false);
  });
});
