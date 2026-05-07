import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function renderFiles(targetDir: string, replacements: Record<string, string>): void {
  const stack = [targetDir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = resolve(current, entry.name);
      if (entry.isDirectory()) stack.push(file);
      if (entry.isFile()) {
        const content = readFileSync(file, "utf8").replace(
          /__APP_NAME__|__PACKAGE_NAME__|__DATABASE_URL__|__DATABASE_PROVIDER__|__REDIS_URL__|__JWT_SECRET__|__JWT_REFRESH_SECRET__|__ADMIN_ORIGIN__|__API_PORT__/g,
          (key) => replacements[key] ?? key
        );
        writeFileSync(file, content);
      }
    }
  }
}
