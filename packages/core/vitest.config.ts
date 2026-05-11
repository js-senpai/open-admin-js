import { defineConfig } from "vitest/config";

/** Prefer workspace package `development` export (TS sources) when `dist/` is not built yet (CI). */
export default defineConfig({
  resolve: {
    conditions: ["development", "node", "import", "module", "browser", "default"]
  },
  test: { environment: "node" }
});
