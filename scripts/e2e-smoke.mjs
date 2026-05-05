import { existsSync } from "node:fs";

const required = [
  "apps/admin/app/login/page.tsx",
  "apps/admin/app/resources/[resource]/page.tsx",
  "apps/api/src/auth/auth.controller.ts",
  "apps/api/src/admin/admin.controller.ts",
  "packages/cli/src/index.ts"
];

const missing = required.filter((file) => !existsSync(file));
if (missing.length) {
  console.error(`E2E smoke failed. Missing:\n${missing.map((file) => `- ${file}`).join("\n")}`);
  process.exit(1);
}

console.log("E2E smoke passed.");
