#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cac } from "cac";
import pc from "picocolors";
import ts from "typescript";
import { pluralResourceSlug } from "./resource-slug.js";
import { createProjectInteractive, defaultTemplateDir, type DatabaseDriver, type PackageManager } from "./create-project.js";
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
import { migrateRuntime } from "./runtime-mode.js";
import { upgradeManaged } from "./upgrade.js";
import { runSecurityChecks, type Finding } from "./security.js";

export {
  createProject,
  createProjectInteractive,
  databaseUrl,
  defaultTemplateDir,
  printNextSteps,
  printSecurityNotice,
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

function generateResource(rawName: string, options: { force?: boolean; dryRun?: boolean; icon?: string; slug?: string }): void {
  const validated = validateName(rawName, "resource name");
  const model = toPascalCase(validated);
  const slug = toKebabCase(validated);
  const plural = options.slug ?? pluralResourceSlug(slug);
  if (!/^[a-z][a-z0-9-]*$/.test(plural)) throw new Error("Invalid resource slug");
  const icon = options.icon ?? "Database";
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(icon)) throw new Error("Invalid icon name");
  const projectRoot = process.cwd();
  const targetDir = join(projectRoot, "apps/api/src/resources");
  const target = assertInsideDir(targetDir, `${slug}.resource.ts`);
  if (existsSync(target) && !options.force) {
    console.error(pc.red(`${target} already exists. Use --force to overwrite.`));
    process.exitCode = 1;
    return;
  }
  const registryPath = join(targetDir, "registry.ts");
  const registry = existsSync(registryPath) ? readFileSync(registryPath, "utf8") : undefined;
  const schemaPath = join(projectRoot, "prisma", "schema.prisma");
  const schema = existsSync(schemaPath) ? readFileSync(schemaPath, "utf8") : undefined;
  const modelExists = Boolean(schema && new RegExp(`^\\s*model\\s+${model}\\s*\\{`, "m").test(schema));
  const registered = registry && modelExists ? registerResourceImport(registry, slug, toCamelCase(model)) : undefined;
  if (options.dryRun) {
    console.log(`Would create ${target}${registered ? " and register resource" : ""}`);
    if (!modelExists) console.log(`Add model ${model} to prisma/schema.prisma before registering the resource.`);
    return;
  }
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(
    target,
    `import { defineResource } from '@openadminjs/core';\n\nexport default defineResource({\n  name: '${plural}',\n  label: '${startCase(plural)}',\n  model: '${toCamelCase(model)}',\n  titleField: 'id',\n  icon: '${icon}',\n  permissions: {\n    read: '${plural}.read',\n    create: '${plural}.create',\n    update: '${plural}.update',\n    delete: '${plural}.delete',\n  },\n  fields: {\n    id: { type: 'id', label: 'ID', create: false, edit: false },\n  },\n});\n`
  );
  if (registered !== undefined && registered !== registry) writeFileSync(registryPath, registered);
  if (!modelExists) console.log(pc.yellow(`Add model ${model} { id String @id @default(cuid()) } to Prisma, migrate, then register this resource in registry.ts.`));
  else console.log(pc.dim("Run db:seed after migration to materialize resource permissions."));
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

function normalizeFieldType(raw: string): "text" | "number" | "boolean" | "date" | "json" | "decimal" {
  const t = raw.trim().toLowerCase();
  if (["number", "int", "integer", "float"].includes(t)) return "number";
  if (t === "decimal" || t === "money") return "decimal";
  if (["boolean", "bool"].includes(t)) return "boolean";
  if (["datetime", "date", "timestamp"].includes(t)) return "date";
  if (["json", "object"].includes(t)) return "json";
  if (["text", "string"].includes(t)) return "text";
  throw new Error(`Unsupported field type: ${raw}`);
}

function prismaFieldFragment(fieldName: string, fieldType: string, required: boolean): string {
  switch (fieldType) {
    case "number": case "int": case "integer":
      return `${fieldName} Int${required ? "" : "?"}`;
    case "float":
      return `${fieldName} Float${required ? "" : "?"}`;
    case "decimal": case "money":
      return `${fieldName} Decimal${required ? "" : "?"}`;
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
    dryRun?: boolean;
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
  const snippet = `${fieldName}: { ${attributes.join(", ")} }`;
  const next = insertResourceField(content, fieldName, snippet, Boolean(options.force));
  if (!options.dryRun) writeFileSync(target, next);
  else console.log(pc.dim("Dry run — no files written"));
  console.log(pc.green(`Updated ${target}`));
  console.log(pc.dim("// Prisma model fragment — merge into schema.prisma, then run: openadminjs db migrate dev"));
  console.log(pc.dim(`//   ${prismaFieldFragment(fieldName, ["float", "decimal", "money"].includes(fieldTypeRaw.trim().toLowerCase()) ? fieldTypeRaw.trim().toLowerCase() : fieldType, Boolean(options.required))}`));
}


function readSource(content: string): ts.SourceFile {
  return ts.createSourceFile("resource.ts", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
function propertyName(node: ts.PropertyName | undefined): string | undefined {
  return node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : undefined;
}
export function insertResourceField(content: string, name: string, snippet: string, force = false): string {
  const source = readSource(content);
  const matches: ts.ObjectLiteralExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "defineResource") {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const fields = arg.properties.find(p => propertyName(p.name) === "fields");
        if (fields && ts.isPropertyAssignment(fields) && ts.isObjectLiteralExpression(fields.initializer)) matches.push(fields.initializer);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (matches.length !== 1) throw new Error("Expected exactly one literal defineResource fields object");
  const fields = matches[0]!;
  if (fields.properties.some(p => ts.isSpreadAssignment(p) || p.name && ts.isComputedPropertyName(p.name))) throw new Error("Cannot safely edit dynamic resource fields");
  const existing = fields.properties.find(p => propertyName(p.name) === name);
  if (existing) {
    if (!force) throw new Error("Field already exists. Use --force to replace it.");
    return content.slice(0, existing.getStart(source)) + snippet + content.slice(existing.getEnd());
  }
  const close = fields.getEnd() - 1;
  const last = fields.properties[fields.properties.length - 1];
  if (last && !fields.properties.hasTrailingComma) return content.slice(0, last.getEnd()) + "," + content.slice(last.getEnd(), close) + "\n    " + snippet + ",\n  " + content.slice(close);
  return content.slice(0, close) + "\n    " + snippet + ",\n  " + content.slice(close);
}
function registerResourceImport(content: string, slug: string, name: string): string {
  const source = readSource(content);
  const modulePath = "./" + slug + ".resource";
  if (source.statements.some(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === modulePath)) return content;
  const localName = name + "GeneratedResource";
  if (new RegExp("\\b" + localName + "\\b").test(content)) throw new Error("Resource import name conflict");
  let array: ts.ArrayLiteralExpression | undefined;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== "resources") continue;
      let init = decl.initializer;
      while (init && (ts.isSatisfiesExpression(init) || ts.isAsExpression(init))) init = init.expression;
      if (init && ts.isArrayLiteralExpression(init)) array = init;
    }
  }
  if (!array) throw new Error("Cannot safely locate resource registry array");
  const last = array.elements[array.elements.length - 1];
  const insertion = last ? last.getEnd() : array.getEnd() - 1;
  return 'import ' + localName + ' from "' + modulePath + '";\n' + content.slice(0, insertion) + (last ? ",\n  " : "") + localName + content.slice(insertion);
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

type CreateFlags = {
  runtime?: string;
  packageManager?: string;
  pm?: string;
  database?: string;
  db?: string;
  adminEmail?: string;
  adminPassword?: string;
  adminPasswordEnv?: string;
  dbUrl?: string;
  redisUrl?: string;
  skipRedis?: boolean;
  apiPort?: string;
  adminOrigin?: string;
  install?: boolean;
  git?: boolean;
  yes?: boolean;
  nonInteractive?: boolean;
};

function normalizeDatabase(value: string | undefined): DatabaseDriver | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "postgres" || v === "postgresql" || v === "pg") return "postgresql";
  if (v === "mysql" || v === "mariadb") return "mysql";
  if (v === "sqlite" || v === "sqlite3") return "sqlite";
  throw new Error(`Unknown database "${value}". Use postgresql, mysql, or sqlite.`);
}

function normalizePackageManager(value: string | undefined): PackageManager | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "pnpm" || v === "npm" || v === "yarn") return v;
  throw new Error(`Unknown package manager "${value}". Use pnpm, npm, or yarn.`);
}

/** Resolves the admin password from flags/env WITHOUT exposing it in argv where avoidable. */
function resolveAdminPassword(flags: CreateFlags): string | undefined {
  if (flags.adminPasswordEnv) {
    const value = process.env[flags.adminPasswordEnv];
    if (!value) {
      throw new Error(
        `--admin-password-env ${flags.adminPasswordEnv} is set but the environment variable is empty or unset.`
      );
    }
    return value;
  }
  if (flags.adminPassword) {
    console.error(
      pc.yellow(
        "Warning: --admin-password exposes the password in your shell history. Prefer --admin-password-env <VAR>."
      )
    );
    return flags.adminPassword;
  }
  if (process.env.OPENADMIN_ADMIN_PASSWORD) return process.env.OPENADMIN_ADMIN_PASSWORD;
  return undefined;
}

cli
  .command("create [projectName]", "Create a new OpenAdminJS project")
  .option("--package-manager <pm>", "Package manager: pnpm, npm, or yarn")
  .option("--pm <pm>", "Alias for --package-manager")
  .option("--database <db>", "Database: postgresql, mysql, or sqlite")
  .option("--db <db>", "Alias for --database")
  .option("--admin-email <email>", "Superadmin email")
  .option("--admin-password <password>", "Superadmin password (discouraged — prefer --admin-password-env)")
  .option("--admin-password-env <var>", "Read the superadmin password from this environment variable")
  .option("--db-url <url>", "DATABASE_URL override")
  .option("--redis-url <url>", "REDIS_URL (blank/omit disables background job queues)")
  .option("--skip-redis", "Disable Redis-backed queues")
  .option("--api-port <port>", "API port (default 4000)")
  .option("--admin-origin <origin>", "Admin origin for CORS (default http://localhost:3000)")
  .option("--runtime <mode>", "Runtime mode: source (default) or registry (after packages are published)")
  .option("--no-install", "Skip dependency install and DB setup")
  .option("--no-git", "Skip git initialization")
  .option("--non-interactive", "Do not prompt; use flags and safe defaults")
  .option("-y, --yes", "Accept defaults without prompting (implies --non-interactive)")
  .action(async (projectName: string | undefined, flags: CreateFlags) => {
    try {
      const nonInteractive = Boolean(flags.yes || flags.nonInteractive) || !process.stdin.isTTY;
      await createProjectInteractive({
        projectName,
        runtimeMode: flags.runtime === undefined || flags.runtime === 'source' ? 'source' : flags.runtime === 'registry' ? 'registry' : (()=>{throw Error('Invalid runtime mode')})(),
        packageManager: normalizePackageManager(flags.packageManager ?? flags.pm),
        database: normalizeDatabase(flags.database ?? flags.db),
        superadminEmail: flags.adminEmail,
        superadminPassword: resolveAdminPassword(flags),
        databaseUrl: flags.dbUrl,
        redisUrl: flags.skipRedis ? undefined : flags.redisUrl,
        skipRedis: flags.skipRedis,
        apiPort: flags.apiPort,
        adminOrigin: flags.adminOrigin,
        install: flags.install,
        git: flags.git,
        nonInteractive
      });
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
  .option("--force", "Replace existing resource or field")
  .option("--dry-run", "Print generation plan without writing")
  .option("--slug <slug>", "Resource route slug")
  .option("--icon <icon>", "Resource icon")
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
  .option("--force", "Replace existing resource or field")
  .option("--dry-run", "Print generation plan without writing")
  .option("--slug <slug>", "Resource route slug")
  .option("--icon <icon>", "Resource icon")
  .action(runGenerate);

type GenerateOptions = {
  dryRun?: boolean;
  slug?: string;
  icon?: string;
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
        if (fieldName) return usageError("openadminjs generate resource <Model> [--slug <slug>] [--icon <icon>] [--dry-run]");
        generateResource(name, options);
        return;
      case "plugin":
        if (!name) return usageError("openadminjs generate plugin <plugin.id> [--force]");
        if (options.dryRun) { console.log(`Would generate plugin ${validatePluginId(name)}`); return; }
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
          label: options.label,
          dryRun: options.dryRun
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
  .command("schema <action>", "Compose/adopt schema modules or plan an existing database upgrade")
  .option("--out <directory>", "New migration review directory (upgrade-plan)")
  .option("--write", "Explicitly write the composed schema")
  .option("--replace-generated", "Acknowledge overwriting a known generated schema")
  .action((action:string,flags:{out?:string;write?:boolean;replaceGenerated?:boolean})=>{
    let script:string,args:string[];
    if(action==="upgrade-plan"){
      if(!flags.out)throw Error("Use schema upgrade-plan --out <new-directory>");
      script="migrate-existing.mjs";args=["--out",flags.out];
    }else if(["check","adopt","compose"].includes(action)){
      script="schema.mjs";args=[action,...(flags.write?["--write"]:[]),...(flags.replaceGenerated?["--replace-generated"]:[])];
    }else throw Error("Use schema check, adopt, compose, or upgrade-plan");
    const result=spawnSync(process.execPath,[join(defaultTemplateDir(),"scripts",script),...args],{cwd:process.cwd(),stdio:"inherit"});
    if(result.error||result.status!==0)process.exitCode=result.status??1;
  });

cli
  .command("runtime", "Plan migration from copied runtime sources to versioned packages")
  .option("--apply", "Switch package manifests and preserve old runtime sources in a backup")
  .option("--archives <dir>", "Use verified candidate tarballs instead of registry packages (pnpm only)")
  .option("--accept-local-runtime", "Acknowledge customized or untracked runtime source; preserve it in the backup")
  .action((flags:{apply?:boolean;archives?:string;acceptLocalRuntime?:boolean})=>{
    const result=migrateRuntime(process.cwd(),defaultTemplateDir(),flags);
    console.log(JSON.stringify(result,null,2));
    if(result.conflicts.length && flags.apply && !flags.acceptLocalRuntime)process.exitCode=1;
  });

cli
  .command("upgrade", "Plan a conservative framework source patch (does not migrate the database)")
  .option("--apply", "Apply only unmodified managed files; abort on conflicts")
  .option("--rollback", "Restore the last managed patch if its files are still unchanged")
  .option("--json", "Machine-readable plan")
  .action((flags: {apply?:boolean;rollback?:boolean;json?:boolean})=>{
    const plan=upgradeManaged(process.cwd(),defaultTemplateDir(),flags);
    console.log(flags.json?JSON.stringify(plan,null,2):plan.map(p=>p.status+" "+p.path).join("\n")||"No managed changes");
    if(plan.some(p=>p.status==="conflict"))process.exitCode=1;
  });

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
  // NOTE: cac's parse() already prints help once when --help/-h is present
  // (showHelpOnExit). Do NOT call outputHelp() again here or it prints twice.
  if (parsed.options.help || parsed.options.h) {
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
