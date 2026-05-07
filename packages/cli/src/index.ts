#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cac } from "cac";
import pc from "picocolors";
import { createProjectInteractive } from "./create-project.js";
import { modelNameToResourceSlug } from "./resource-slug.js";

const cli = cac("openadminjs");

function runScript(name: string): void {
  const scripts: Record<string, string> = {
    dev: "pnpm --parallel --filter @openadminjs/api --filter @openadminjs/admin dev",
    build: "pnpm -r build",
    start: "pnpm --parallel --filter @openadminjs/api --filter @openadminjs/admin start"
  };
  console.log(pc.cyan(`Run: ${scripts[name]}`));
}

function doctor(): void {
  const required = ["package.json", "pnpm-workspace.yaml", ".env.example", "prisma/schema.prisma"];
  const missing = required.filter((file) => !existsSync(join(process.cwd(), file)));
  if (missing.length) {
    console.error(pc.red("OpenAdminJS doctor found missing files:"));
    for (const file of missing) console.error(` - ${file}`);
    process.exitCode = 1;
    return;
  }
  console.log(pc.green("OpenAdminJS doctor passed."));
}

function securityCheck(): void {
  const envExample = existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "";
  const findings: string[] = [];
  if (!envExample.includes("JWT_SECRET")) findings.push("JWT_SECRET is missing from .env.example");
  if (envExample.includes("DATABASE_URL=postgresql://") && !envExample.includes("localhost")) {
    findings.push("DATABASE_URL example should not point to production");
  }
  if (existsSync("apps/admin/app")) {
    const login = existsSync("apps/admin/app/login/page.tsx");
    if (!login) findings.push("Admin login route is missing");
  }
  if (findings.length) {
    console.error(pc.red("Security check failed:"));
    for (const finding of findings) console.error(` - ${finding}`);
    process.exitCode = 1;
    return;
  }
  console.log(pc.green("Security check passed."));
}

function generateResource(modelName: string, options: { force?: boolean }): void {
  const name = modelNameToResourceSlug(modelName);
  const targetDir = join(process.cwd(), "apps/api/src/resources");
  const target = join(targetDir, `${name}.resource.ts`);
  if (existsSync(target) && !options.force) {
    console.error(pc.red(`${target} already exists. Use --force to overwrite.`));
    process.exitCode = 1;
    return;
  }
  mkdirSync(targetDir, { recursive: true });
  const plural = `${name}s`;
  writeFileSync(
    target,
    `import { defineResource } from '@openadminjs/core';\n\nexport default defineResource({\n  name: '${plural}',\n  label: '${modelName}s',\n  model: '${modelName}',\n  titleField: 'id',\n  icon: 'Database',\n  permissions: {\n    read: '${plural}.read',\n    create: '${plural}.create',\n    update: '${plural}.update',\n    delete: '${plural}.delete',\n  },\n  fields: {\n    id: { type: 'id', label: 'ID', create: false, edit: false },\n  },\n});\n`
  );
  console.log(pc.green(`Created ${target}`));
}

function generatePlugin(pluginId: string, options: { force?: boolean }): void {
  const safeId = pluginId.trim().toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
  const slug = safeId.replace(/\./g, "-");
  const targetDir = join(process.cwd(), "apps/api/src/plugins/custom");
  const target = join(targetDir, `${slug}.plugin.ts`);
  if (existsSync(target) && !options.force) {
    console.error(pc.red(`${target} already exists. Use --force to overwrite.`));
    process.exitCode = 1;
    return;
  }
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(
    target,
    `import type { OpenAdminPlugin } from "@openadminjs/plugin-sdk";\n\nexport const ${slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Plugin: OpenAdminPlugin = {\n  id: "${safeId}",\n  version: "0.1.0",\n  register({ registerSurface }) {\n    registerSurface({\n      seo: {\n        metadata({ resourceName, record }) {\n          if (resourceName !== "posts") return {};\n          return { title: record.title ?? "Untitled" };\n        }\n      }\n    });\n  }\n};\n`
  );
  console.log(pc.green(`Created ${target}`));
}

cli.command("dev", "Start API and admin apps").action(() => runScript("dev"));
cli.command("create [projectName]", "Create a new OpenAdminJS project").action(async (projectName?: string) => {
  try {
    await createProjectInteractive({ projectName });
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : "Failed to create project."));
    process.exitCode = 1;
  }
});
cli.command("build", "Build all workspaces").action(() => runScript("build"));
cli.command("start", "Start production apps").action(() => runScript("start"));
cli
  .command("db <action>", "Run database helper commands")
  .action((action?: string) => {
    switch (action) {
      case "migrate":
        console.log("Run: pnpm --filter @openadminjs/api prisma migrate dev");
        return;
      case "seed":
        console.log("Run: pnpm --filter @openadminjs/api prisma db seed");
        return;
      case "studio":
        console.log("Run: pnpm --filter @openadminjs/api prisma studio");
        return;
      default:
        console.error(pc.red("Unknown db action. Use: migrate, seed, studio."));
        process.exitCode = 1;
    }
  });

function runGenerateCommand(kind: string | undefined, name: string | undefined, options: { force?: boolean }): void {
  if (!kind || !name) {
    console.error(pc.red("Usage: openadminjs generate <resource|plugin> <name> [--force]"));
    process.exitCode = 1;
    return;
  }
  if (kind === "resource") {
    generateResource(name, options);
    return;
  }
  if (kind === "plugin") {
    generatePlugin(name, options);
    return;
  }
  console.error(pc.red(`Unknown generate kind: ${kind}. Use resource or plugin.`));
  process.exitCode = 1;
}

cli
  .command("generate <kind> <name>", "Generate resource or plugin starter")
  .option("--force", "Overwrite existing file")
  .action(runGenerateCommand);

cli
  .command("make <kind> <name>", "Alias for generate")
  .option("--force", "Overwrite existing file")
  .action(runGenerateCommand);
cli.command("doctor", "Check generated project health").action(doctor);
cli.command("security", "Run security checklist").action(securityCheck);
cli.command("security check", "Run security checklist").action(securityCheck);
cli.help();
cli.parse();
