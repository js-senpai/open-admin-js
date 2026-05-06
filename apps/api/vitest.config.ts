import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: [resolve(__dirname, "src/test-setup.ts")]
  },
  resolve: {
    alias: {
      "@openadminjs/core": resolve(repoRoot, "packages/core/src/index.ts"),
      "@openadminjs/resource": resolve(repoRoot, "packages/resource/src/index.ts"),
      "@openadminjs/permissions": resolve(repoRoot, "packages/permissions/src/index.ts"),
      "@openadminjs/plugin-sdk": resolve(repoRoot, "packages/plugin-sdk/src/index.ts")
    }
  }
});
