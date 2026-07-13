#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cac } from "cac";
import pc from "picocolors";
import { createProjectInteractive } from "./create-project.js";
import { modelNameToResourceSlug } from "./resource-slug.js";
import {
  assertInsideDir,
  toCamelCase,
  toKebabCase,
  toPascalCase,
  validateName,
  validatePluginId
} from "./validate-name.js";
import { buildDbCommand, runInherit, type DbAction } from "./db-commands.js";
import { detectPackageManager } from "./detect-package-manager.js";
import { runDoctorChecks, type CheckResult } from "./doctor.js";
import { runSecurityChecks, type Finding } from "./security.js";

export {
  createProject,
  createProjectInteractive,
  defaultTemplateDir,
  printNextSteps,
  toPackageName,
  type CreateProjectOptions,
  type CreateProjectResult,
  type DatabaseDriver,
  type PackageManager
} from "./create-project.js";
export { modelNameToResourceSlug } from "./resource-slug.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const cli = cac("openadminjs");

// ── generators ──────────────────────────────────────────────────────────────

function generateResource(rawName: string, options: { force?: boolean }): void {
  const validated = validateName(rawName, "resource name");
  const model = toPascalCase(validated);
  const slug = toKebabCase(validated);
  const plural = `${slug}s`;
  const projectRoot = process.cwd();
  const targetDir = join(projectRoot, "apps/api/src/resources");
  const target = assertInsideDir(targetDir, `${slug}.resource.ts`);
  if (existsSync(target) && !options.force) {
    console.error(pc.red(`${target} already exists. Use --force to overwrite.`));
    process.exitCode = 1;
    return;
  }
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(
    target,
    `import { defineResource } from '@openadminjs/core';\n\nexport default defineResource({\n  name: '${plural}',\n  label: '${model}s',\n  model: '${model}',\n  titleField: 'id',\n  icon: 'Database',\n  permissions: {\n    read: '${plural}.read',\n    create: '${plural}.create',\n    update: '${plural}.update',\n    delete: '${plural}.delete',\n  },\n  fields: {\n    id: { type: 'id', label: 'ID', create: false, edit: false },\n  },\n});\n`
  );
  console.log(pc.green(`Created ${target}`));
}

function generatePlugin(rawId: string, options: { force?: boolean }): void {
  const safeId = validatePluginId(rawId);
  const slug = safeId.replace(/\./g, "-").toLowerCase();
  const varName = slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  const projectRoot = process.cwd();
  const targetDir = join(projectRoot, "apps/api/src/plugins/custom");
  const target = assertInsideDir(targetDir, `${slug}.plugin.ts`);
  if (existsSync(target) && !options.force) {
    console.error(pc.red(`${target} already exists. Use --force to overwrite.`));
    process.exitCode = 1;
    return;
  }
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(
    target,
    `import type { OpenAdminPlugin } from "@openadminjs/plugin-sdk";\n\nexport const ${varName}Plugin: OpenAdminPlugin = {\n  id: ${JSON.stringify(safeId)},\n  version: "0.1.0",\n  register({ registerSurface }) {\n    registerSurface({\n      seo: {\n        metadata({ resourceName, record }) {\n          if (resourceName !== "posts") return {};\n          return { title: record.title ?? "Untitled" };\n        }\n      }\n    });\n  }\n};\n`
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
  // resourceArg is only used to resolve an existing file; validate to block traversal.
  validateName(resourceArg.replace(/\.resource\.ts$/i, ""), "resource");
  const target = resolveResourceFile(resourceArg);
  if (!target) {
    console.error(pc.red(`Could not find *.resource.ts for "${resourceArg}" under apps/api/src/resources`));
    process.exitCode = 1;
    return;
  }
  if (!/^[a-z][a-zA-Z0-9]*$/.test(fieldName)) {
    console.error(pc.red("fieldName must be camelCase (e.g. publishedAt)."));
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
    console.error(pc.red("Could not locate fields block (`fields: { ... }`)."));
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
  console.log(pc.dim("// Prisma model fragment — merge into schema.prisma, then run: openadminjs db migrate dev"));
  console.log(pc.dim(`//   ${prismaFieldFragment(fieldName, fieldType, Boolean(options.required))}`));
}

// ── doctor / security ─────────────────────────────────────────────────────────

async function doctor(options: { json?: boolean; skipNetwork?: boolean }): Promise<void> {
  const report = await runDoctorChecks(process.cwd(), { skipNetwork: options.skipNetwork });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(pc.bold("OpenAdminJS doctor"));
    for (const r of report.results) printCheck(r);
    console.log(report.ok ? pc.green("\nDoctor: no blocking issues.") : pc.red("\nDoctor: failed checks found."));
  }
  if (!report.ok) process.exitCode = 1;
}

function printCheck(r: CheckResult): void {
  const icon = r.status === "pass" ? pc.green("PASS") : r.status === "warn" ? pc.yellow("WARN") : pc.red("FAIL");
  console.log(`  [${icon}] ${r.name}: ${r.message}`);
}

function securityCheck(options: { json?: boolean; skipNetwork?: boolean }): void {
  const report = runSecurityChecks(process.cwd(), { skipNetwork: options.skipNetwork });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(pc.bold("OpenAdminJS security check"));
    for (const f of report.findings) printFinding(f);
    console.log(report.ok ? pc.green("\nSecurity: no critical issues.") : pc.red("\nSecurity: critical issues found."));
  }
  if (!report.ok) process.exitCode = 1;
}

function printFinding(f: Finding): void {
  const sev =
    f.severity === "critical" ? pc.red("CRIT") : f.severity === "warning" ? pc.yellow("WARN") : pc.cyan("INFO");
  console.log(`  [${sev}] ${f.id}: ${f.message}`);
}

// ── db commands ────────────────────────────────────────────────────────────

async function dbCommand(
  action: string | undefined,
  mode: string | undefined,
  options: { dryRun?: boolean; yes?: boolean }
): Promise<void> {
  if (!action) {
    console.error(pc.red("Usage: openadminjs db <migrate [dev|deploy]|seed|studio|reset> [--dry-run]"));
    process.exitCode = 1;
    return;
  }
  const cwd = process.cwd();
  const pm = detectPackageManager(cwd);
  let command;
  try {
    command = buildDbCommand(action as DbAction, mode, pm);
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : "Invalid db command."));
    process.exitCode = 1;
    return;
  }

  if (options.dryRun) {
    console.log(command.label);
    return;
  }

  if (command.destructive && !options.yes) {
    console.error(
      pc.red(`"${command.label}" is destructive and will drop data. Re-run with --yes to confirm.`)
    );
    process.exitCode = 1;
    return;
  }

  const code = await runInherit(command.cmd, command.args, cwd);
  if (code !== 0) process.exitCode = code;
}

// ── command registrations ─────────────────────────────────────────────────────

cli.command("create [projectName]", "Create a new OpenAdminJS project").action(async (projectName?: string) => {
  try {
    await createProjectInteractive({ projectName });
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : "Failed to create project."));
    process.exitCode = 1;
  }
});

cli
  .command("db <action> [mode]", "Database commands: migrate [dev|deploy], seed, studio, reset")
  .option("--dry-run", "Print the command without executing it")
  .option("--yes", "Confirm destructive commands (e.g. reset)")
  .action((action: string, mode: string | undefined, options: { dryRun?: boolean; yes?: boolean }) =>
    dbCommand(action, mode, options)
  );

cli
  .command("generate <kind> [name] [fieldName]", "Generate a resource, plugin, or field")
  .option("--type <type>", "Field type for `generate field` (text, number, boolean, date, json)", { default: "text" })
  .option("--label <label>", "Field label override (generate field)")
  .option("--required", "Mark field as required (generate field)")
  .option("--list", "Show field in list views (generate field)")
  .option("--sortable", "Mark field as sortable (generate field)")
  .option("--filterable", "Mark field as filterable (generate field)")
  .option("--searchable", "Mark field as searchable (generate field)")
  .option("--force", "Overwrite / append even when the target already exists")
  .action(runGenerate);

cli
  .command("make <kind> [name] [fieldName]", "Alias for generate")
  .option("--type <type>", "Field type for `make field`", { default: "text" })
  .option("--label <label>", "Field label override")
  .option("--required", "Mark field as required")
  .option("--list", "Show field in list views")
  .option("--sortable", "Mark field as sortable")
  .option("--filterable", "Mark field as filterable")
  .option("--searchable", "Mark field as searchable")
  .option("--force", "Overwrite existing file")
  .action(runGenerate);

type GenerateOptions = {
  type?: string;
  force?: boolean;
  required?: boolean;
  list?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  label?: string;
};

function runGenerate(
  kind: string | undefined,
  name: string | undefined,
  fieldName: string | undefined,
  options: GenerateOptions
): void {
  try {
    switch (kind) {
      case "resource":
        if (!name) return usageError("openadminjs generate resource <Model> [--force]");
        generateResource(name, { force: options.force });
        return;
      case "plugin":
        if (!name) return usageError("openadminjs generate plugin <plugin.id> [--force]");
        generatePlugin(name, { force: options.force });
        return;
      case "field":
        if (!name || !fieldName) {
          return usageError("openadminjs generate field <resource> <fieldName> [--type <type>] [--required] ...");
        }
        generateResourceField(name, fieldName, options.type ?? "text", {
          force: options.force,
          required: options.required,
          list: options.list,
          sortable: options.sortable,
          filterable: options.filterable,
          searchable: options.searchable,
          label: options.label
        });
        return;
      default:
        console.error(pc.red(`Unknown generate kind "${kind ?? ""}". Use: resource, plugin, or field.`));
        process.exitCode = 1;
    }
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : "Generation failed."));
    process.exitCode = 1;
  }
}

function usageError(usage: string): void {
  console.error(pc.red(`Usage: ${usage}`));
  process.exitCode = 1;
}

cli
  .command("doctor", "Check generated project health")
  .option("--json", "Output machine-readable JSON")
  .option("--skip-network", "Skip network-dependent checks (db/redis/pm)")
  .action((options: { json?: boolean; skipNetwork?: boolean }) => doctor(options));

cli
  .command("security [check]", "Run the security checklist")
  .option("--json", "Output machine-readable JSON")
  .option("--skip-network", "Skip network-dependent checks (npm audit)")
  .action((_sub: string | undefined, options: { json?: boolean; skipNetwork?: boolean }) => securityCheck(options));

// NOTE: we intentionally do NOT call cli.version() — cac's built-in prints a
// "name/version platform node" line. We handle --version/-v manually below to
// output the exact "openadminjs <version>" format.
cli.help();

async function main(): Promise<void> {
  const argv = process.argv;
  let parsed;
  try {
    parsed = cli.parse(argv, { run: false });
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : String(error)));
    console.error(pc.dim("Run `openadminjs --help` for usage."));
    process.exit(1);
  }

  if (parsed.options.version || parsed.options.v) {
    console.log(`openadminjs ${readPackageVersion()}`);
    process.exit(0);
  }
  if (parsed.options.help || parsed.options.h) {
    cli.outputHelp();
    process.exit(0);
  }

  if (!cli.matchedCommand) {
    const requested = parsed.args[0];
    if (requested) {
      console.error(pc.red(`Unknown command: ${requested}`));
      console.error(pc.dim("Run `openadminjs --help` to see available commands."));
      process.exit(1);
    }
    cli.outputHelp();
    process.exit(0);
  }

  try {
    await cli.runMatchedCommand();
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
  if (process.exitCode && process.exitCode !== 0) process.exit(process.exitCode);
}

function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(resolve(entry)) === realpathSync(modulePath);
  } catch {
    return resolve(entry) === modulePath;
  }
}

if (isCliEntry()) {
  void main();
}
