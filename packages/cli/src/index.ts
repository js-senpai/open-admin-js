#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { cac } from "cac";
import pc from "picocolors";
import { createProjectInteractive } from "./create-project.js";
import { modelNameToResourceSlug } from "./resource-slug.js";

const cli = cac("openadminjs");

function runScript(name: string): void {
  const commands: Record<string, [string, string[]]> = {
    dev: ["pnpm", ["--parallel", "--filter", "@openadminjs/api", "--filter", "@openadminjs/admin", "dev"]],
    build: ["pnpm", ["-r", "build"]],
    start: ["pnpm", ["--parallel", "--filter", "@openadminjs/api", "--filter", "@openadminjs/admin", "start"]]
  };
  const entry = commands[name];
  if (!entry) {
    console.error(pc.red(`Unknown script: ${name}`));
    process.exitCode = 1;
    return;
  }
  const [cmd, args] = entry;
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: process.cwd() });
  if (result.status !== 0 || result.error) {
    process.exitCode = result.status ?? 1;
  }
}

function doctor(): void {
  const cwd = process.cwd();
  const required = ["package.json", "pnpm-workspace.yaml", "prisma/schema.prisma"];
  const missing = required.filter((file) => !existsSync(join(cwd, file)));
  const hasEnvSample =
    existsSync(join(cwd, ".env.example")) || existsSync(join(cwd, "apps", "api", ".env"));
  if (!hasEnvSample) {
    missing.push("apps/api/.env (or .env.example at repo root)");
  }
  if (missing.length) {
    console.error(pc.red("OpenAdminJS doctor found missing files:"));
    for (const file of missing) console.error(` - ${file}`);
    process.exitCode = 1;
    return;
  }
  console.log(pc.green("OpenAdminJS doctor passed."));
}

function securityCheck(): void {
  const cwd = process.cwd();
  const envSample = existsSync(join(cwd, ".env.example"))
    ? readFileSync(join(cwd, ".env.example"), "utf8")
    : existsSync(join(cwd, "apps", "api", ".env"))
      ? readFileSync(join(cwd, "apps", "api", ".env"), "utf8")
      : "";
  const findings: string[] = [];
  if (!envSample) {
    findings.push("No .env.example or apps/api/.env found for security checklist");
  } else if (!envSample.includes("JWT_SECRET")) {
    findings.push("JWT_SECRET is missing from env sample (.env.example or apps/api/.env)");
  }
  if (envSample.includes("DATABASE_URL=postgresql://") && !envSample.includes("localhost")) {
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

function normalizeFieldType(raw: string): "text" | "number" | "boolean" | "date" | "json" {
  const t = raw.trim().toLowerCase();
  if (["number", "int", "integer", "float", "decimal"].includes(t)) return "number";
  if (["boolean", "bool"].includes(t)) return "boolean";
  if (["datetime", "date", "timestamp"].includes(t)) return "date";
  if (["json", "object"].includes(t)) return "json";
  return "text";
}

function prismaFieldFragment(fieldName: string, fieldType: string, required: boolean): string {
  switch (fieldType) {
    case "number":
      return `${fieldName} Int${required ? " @default(0)" : "?"}`;
    case "boolean":
      return `${fieldName} Boolean${required ? " @default(false)" : "?"}`;
    case "date":
      return `${fieldName} DateTime${required ? "" : "?"}`;
    case "json":
      return `${fieldName} Json${required ? "" : "?"}`;
    default:
      return `${fieldName} String${required ? "" : "?"}`;
  }
}

function resolveResourceFile(raw: string): string | null {
  const targetDir = join(process.cwd(), "apps/api/src/resources");
  const clean = raw.replace(/\.resource\.ts$/i, "").replace(/^.*\//, "");
  const candidates = [
    clean,
    modelNameToResourceSlug(clean),
    clean.endsWith("s") ? clean.slice(0, -1) : `${clean}s`,
    clean.endsWith("s") ? modelNameToResourceSlug(clean.slice(0, -1)) : modelNameToResourceSlug(`${clean}s`)
  ];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c) continue;
    const filepath = join(targetDir, `${c}.resource.ts`);
    if (seen.has(filepath)) continue;
    seen.add(filepath);
    if (existsSync(filepath)) return filepath;
  }
  return null;
}

function startCase(input: string): string {
  const withSpaces = input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return withSpaces ? withSpaces[0]!.toUpperCase() + withSpaces.slice(1) : input;
}

function generateResourceField(
  resourceArg: string,
  fieldName: string,
  fieldTypeRaw: string,
  options: {
    force?: boolean;
    required?: boolean;
    list?: boolean;
    sortable?: boolean;
    filterable?: boolean;
    searchable?: boolean;
    label?: string;
  }
): void {
  const target = resolveResourceFile(resourceArg);
  if (!target) {
    console.error(pc.red(`Could not find *.resource.ts for "${resourceArg}" under apps/api/src/resources`));
    process.exitCode = 1;
    return;
  }
  if (!/^[a-z][a-zA-Z0-9]*$/.test(fieldName)) {
    console.error(pc.red("fieldName must be camelCase"));
    process.exitCode = 1;
    return;
  }
  const fieldType = normalizeFieldType(fieldTypeRaw);
  const content = readFileSync(target, "utf8");
  if (new RegExp(`^\\s*${fieldName}\\s*:`, "m").test(content) && !options.force) {
    console.error(pc.red(`Field "${fieldName}" already present. Use --force to add anyway.`));
    process.exitCode = 1;
    return;
  }
  const fieldsBlock = content.match(/fields:\s*\{[\s\S]*?\n\s*\},\n\s*(permissions|actions|i18n|seo|listScope|hooks|})/m);
  if (fieldsBlock?.index == null) {
    console.error(pc.red('Could not locate fields block (`fields: { ... }`).'));
    process.exitCode = 1;
    return;
  }
  const fieldsStart = fieldsBlock.index;
  const fieldsEnd = fieldsStart + fieldsBlock[0].length;
  const head = content.slice(0, fieldsEnd - fieldsBlock[1]!.length - 1);
  const tail = content.slice(fieldsEnd - fieldsBlock[1]!.length - 1);
  const lb = head.lastIndexOf("},");
  if (lb < 0) {
    console.error(pc.red("Malformed resource file near fields."));
    process.exitCode = 1;
    return;
  }
  const labelJson = JSON.stringify(options.label?.trim() || startCase(fieldName));
  const attributes = [
    `type: '${fieldType}'`,
    `label: ${labelJson}`,
    options.required ? "required: true" : "",
    options.list ? "list: true" : "",
    options.sortable ? "sortable: true" : "",
    options.filterable ? "filterable: true" : "",
    options.searchable ? "searchable: true" : ""
  ].filter(Boolean);
  const snippet = `\n    ${fieldName}: { ${attributes.join(", ")} },`;
  writeFileSync(target, `${head.slice(0, lb + 2)}${snippet}${tail}`);
  console.log(pc.green(`Updated ${target}`));
  console.log(pc.dim("// Prisma model fragment — merge into schema.prisma, then pnpm db:migrate"));
  console.log(pc.dim(`//   ${prismaFieldFragment(fieldName, fieldType, Boolean(options.required))}`));
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
  .command("generate field <resource> <fieldName>", "Append a field to an existing resource and emit Prisma fragment")
  .option("--type <type>", "Field type (text, number, boolean, date, json)", { default: "text" })
  .option("--label <label>", "Field label override")
  .option("--required", "Mark field as required")
  .option("--list", "Show field in list views")
  .option("--sortable", "Mark field as sortable")
  .option("--filterable", "Mark field as filterable")
  .option("--searchable", "Mark field as searchable")
  .option("--force", "Write even when the field key already exists")
  .action((resource: string, fieldName: string, options: {
    type?: string;
    force?: boolean;
    required?: boolean;
    list?: boolean;
    sortable?: boolean;
    filterable?: boolean;
    searchable?: boolean;
    label?: string;
  }) => {
    generateResourceField(resource, fieldName, options.type ?? "text", {
      force: options.force,
      required: options.required,
      list: options.list,
      sortable: options.sortable,
      filterable: options.filterable,
      searchable: options.searchable,
      label: options.label
    });
  });

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
