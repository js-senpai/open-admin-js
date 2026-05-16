import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Prisma skips default .env discovery when prisma.config.ts is present; load apps/api/.env explicitly.
config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

export default defineConfig({
  schema: "../../prisma/schema.prisma",
  seed: "tsx ../../prisma/seed.ts",
});
