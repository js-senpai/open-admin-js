import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: {
      "@openadminjs/core": resolve(repoRoot, "packages/core/src/index.ts"),
      "@openadminjs/resource": resolve(repoRoot, "packages/resource/src/index.ts")
    }
  }
});
