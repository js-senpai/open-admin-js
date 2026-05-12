import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 20_000,
    include: ["src/**/*.test.ts"],
    exclude: ["template/**", "dist/**"]
  }
});
