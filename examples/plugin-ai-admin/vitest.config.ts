import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: {
      "@openadminjs/plugin-sdk": resolve(repoRoot, "packages/plugin-sdk/src/index.ts")
    }
  }
});
