import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { renderFiles } from "./render-files.js";

describe("renderFiles", () => {
  it("replaces template tokens in nested files", () => {
    const root = join(tmpdir(), `oajs-render-${Date.now()}`);
    mkdirSync(join(root, "nested"), { recursive: true });
    writeFileSync(join(root, "a.txt"), "app=__APP_NAME__ pkg=__PACKAGE_NAME__");
    writeFileSync(join(root, "nested", "b.txt"), "__DATABASE_URL__ __DATABASE_PROVIDER__");

    renderFiles(root, {
      __APP_NAME__: "Demo",
      __PACKAGE_NAME__: "demo",
      __DATABASE_URL__: "postgres://x",
      __DATABASE_PROVIDER__: "postgresql"
    });

    expect(readFileSync(join(root, "a.txt"), "utf8")).toBe("app=Demo pkg=demo");
    expect(readFileSync(join(root, "nested", "b.txt"), "utf8")).toBe("postgres://x postgresql");

    rmSync(root, { recursive: true, force: true });
  });
});
