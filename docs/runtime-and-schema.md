# Versioned runtime and modular Prisma (V2 candidate)

## Runtime packages

The CLI is a scaffolder; the runtime archives are independently installable packages. `scripts/pack-runtime.mjs` compiles each library to ESM plus declarations, rewrites internal workspace references to exact package versions, copies the Prisma module assets, and produces one archive per package and a SHA-256 manifest. Versions live in each package's package.json. The initial runtime candidate is 0.2.0-rc.1 (CLI 0.3.0-rc.1); subsequent packages may advance independently, with dependent versions explicitly updated and tested. These archives must be installed together with compatible versions, not assumed interoperable across arbitrary releases.

Packages: resource, core, auth, permissions, plugin-sdk, storage, queue, notifications, mail, payments, nest, admin-client, prisma (all under @openadminjs). NestJS policies and query helpers and the admin client contracts/preferences are consumed by the real applications. The standalone application entry points, custom resource registry, controllers, Next.js page routes and project configuration remain application code. This is not a complete drop-in NestJS module or a packaged React admin application.

```sh
pnpm install --frozen-lockfile
pnpm runtime:pack
node scripts/test-runtime.mjs
```

The CI artifact is openadminjs-runtime-packages. It contains the exact npm archives plus runtime-manifest.json. CI installs them into an unrelated temporary npm project, checks imports and contracts, validates schema profiles, and builds/tests a standalone scaffold with local archives. No registry publication is implied.

### Existing source-based projects

Work on a new Git branch and backup your database, uploads and project. Use the CLI built from this branch (do not use the old published CLI). Upgrade application entry points and resource contracts to the matching V2 code first. Review application changes separately; the runtime converter only changes dependency manifests and TypeScript path mappings.

```sh
openadminjs runtime
openadminjs runtime --archives /path/to/runtime-artifacts
openadminjs runtime --archives /path/to/runtime-artifacts --apply
pnpm install
pnpm build
```

Archive mode requires pnpm and copies checksum-verified tarballs into .openadminjs-runtime, with pnpm overrides to keep all internal package resolutions local. The conversion moves prior local runtime packages and saves prior manifests under .openadminjs-runtime-backup. Modified local packages are reported as conflicts; only pass --accept-local-runtime after reviewing customizations and porting them to supported extension points. Do not treat backups as a merge mechanism. Review and commit the new lockfile. To revert, restore the pre-conversion Git tree and lockfile (and the preserved source if it was untracked), remove local archive overrides, and reinstall dependencies. The converter does not touch the database.

After actual publication to the npm registry, use `openadminjs runtime --apply` without archives or create a new project with `openadminjs create my-app --runtime registry`. Until publication, the default remains source mode for backward compatibility. Independent package updates use the ordinary package manager with exact versions, review of changelogs, and integration tests; do not use the old source patch updater for removed package directories.

## Prisma schema modules

Canonical fragments live in packages/prisma/schema:
- core: users, roles, permissions, sessions and account verification
- audit, settings, media, content, tokens, notifications, jobs, commerce, ai

The composer resolves module dependencies, removes known optional inverse relations, checks duplicate declarations and adapts scalar lists for MySQL/SQLite while preserving native Json. The generated single schema remains at prisma/schema.prisma to preserve migration paths and compatibility with existing CLI commands. Existing PostgreSQL migration files and IDs are unchanged. The full standalone server references all built-in models and therefore uses the full schema; reduced profiles are for custom/embedded runtimes, not an automatic module-uninstallation mechanism.

```sh
pnpm schema:check
pnpm schema:compose
node scripts/schema.mjs profile postgresql core content > /tmp/schema.prisma
```

For a new generated project, add custom model fragments in prisma/modules/*.prisma, preview composition, then explicitly write a reviewed generated schema using `pnpm schema:compose --write --replace-generated`. The CRM installer uses this module path. For an existing customized schema, use `openadminjs schema adopt` (works with the new CLI even before copying V2 scripts into a legacy project): this splits the existing schema losslessly and keeps a local ordered manifest. Edit those local fragments; use `pnpm schema:compose` to preview and `pnpm schema:compose --write` to update. No DDL is run by the composer. Backups must be retained or moved before the next compose. Adopted schemas are owned by the project, not silently overwritten by new package releases.

## Existing database migration

Use a disposable copy of your database. Set DATABASE_URL explicitly to the copy, never production. The operator tool requires the existing schema and staging database to agree before generating the target and SQL. It preserves extra models and fields, rejects incompatible customized field types, adds missing built-in models/fields, handles legacy SQLite JSON text and revokes obsolete credentials. It creates an upgrade SQL script, a target schema, checksums, review flags and a baseline SQL file only when there is no local migration history.

```sh
openadminjs schema upgrade-plan --out ./migration-review
```

Do not execute baseline SQL against an existing database. Verify the actual deployed migration history (including _prisma_migrations), restore backups into staging and review all SQL. For PostgreSQL installations with the original migration history use the unchanged shipped migrations; do not run a parallel generated migration for those same changes. For legacy MySQL/SQLite installations initialized with db push, baseline their actual existing schema only after checking for applied migration records, mark that baseline applied, and then apply a reviewed provider-specific upgrade migration. The generated README contains commands. For customized PostgreSQL history, review and merge the migration carefully rather than replacing historical SQL.

Valid JSON text stays JSON. Legacy invalid text is quoted as a JSON string (matching the old codec's read semantics). SQL NULL remains NULL. Old refresh token hashes are cleared and old API keys revoked. Review malformed scopes, duplicate token hashes and any customized schema constraints before deployment. MySQL DDL may auto-commit; SQLite may rebuild tables. Never add --accept-data-loss or reset a production database. Rollback is restoration of a consistent database/application/storage snapshot, not a generated destructive down migration.

CI creates a pre-V2 schema with a custom table and custom User column, inserts records, plans a migration, baselines the database, applies the upgrade using Prisma migrate deploy, generates the updated client and checks preserved JSON, custom data, credential revocation and session models for PostgreSQL/MySQL/SQLite. This is a representative regression test, not validation of every customer's private database. Cross-provider conversion is intentionally not provided.

## Release gate

The manual `Publish independently versioned runtime packages` workflow is main-only, requires explicit approval, successful CI and the `npm-runtime-release` environment. It checks archive checksums, checks published dependency versions, publishes in dependency order, and permits selecting individual packages. Configure npm namespace ownership, environment protection and per-package trusted publishers before using it. See [npm trusted publishing](npm-trusted-publishing.md). Prereleases can only use the `next` dist-tag. No release is triggered by a push or PR.
