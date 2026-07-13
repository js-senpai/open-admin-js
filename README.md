# OpenAdminJS

OpenAdminJS is an open-source, resource-driven admin platform for the Node.js ecosystem, built with **Nest.js 11**, **Prisma 6**, **PostgreSQL**, **Next.js 15**, **React 19**, TailwindCSS and shadcn/ui.

![OpenAdminJS logo](https://js-senpai.github.io/open-admin-js/assets/brand/openadminjs-logo-new.png)

## Requirements

| Tool | Version |
| --- | --- |
| Node.js | **20 or newer** |
| Package manager | **pnpm 9+** (required) |
| Database | **PostgreSQL 14+**, **MySQL 8+**, or **SQLite 3** (local file) |
| Redis | optional, only for background queues |

The CLI checks for a supported Node.js version and for pnpm before it writes any
files. If pnpm is missing it prints exact installation instructions and exits
without creating a partial project.

Install pnpm with either:

```bash
corepack enable && corepack prepare pnpm@latest --activate
# or
npm install -g pnpm
```

## Supported package managers & databases

The generated project is a pnpm workspace monorepo.

- **Package managers:** only **pnpm** is offered by the CLI, because the scaffold
  (workspace config, root scripts, lockfile) is pnpm-native. npm and yarn are
  intentionally **not** exposed to avoid generating a project that does not build.
- **Databases:** **PostgreSQL**, **MySQL**, and **SQLite** are supported.
  - **PostgreSQL** ships with a baseline migration out of the box.
  - **MySQL:** scalar lists (`String[]`) are stored as `Json` arrays; run `db:migrate`
    once after install to create the MySQL migration.
  - **SQLite:** `Json` columns and scalar lists are stored as `String` (JSON text).
    The API transparently JSON-encodes/decodes them at runtime via a Prisma extension
    (`apps/api/src/common/json-field-codec.ts`), so admin JSON fields and audit logs
    keep working. Run `db:migrate` once after install to create the SQLite database file.

## Quick start (for package users)

Full documentation: [https://js-senpai.github.io/open-admin-js/docs.html](https://js-senpai.github.io/open-admin-js/docs.html)

### 1. Create a new project

```bash
npx openadminjs create my-app
cd my-app
```

`npx` runs the **`openadminjs` CLI scaffold generator** (not a runtime library) and
scaffolds a **pnpm** monorepo backed by **PostgreSQL**, **MySQL**, or **SQLite**. The CLI fills
`DATABASE_URL` for you and generates cryptographically strong JWT secrets
automatically.

> **MySQL / SQLite note:** the shipped PostgreSQL baseline migration is not reused.
> Run `pnpm db:migrate` (or `openadminjs db migrate dev`) once after install to
> create the provider-specific migration, then `pnpm db:seed`.

### 2. Configure environment

The scaffold wizard asks for database access and writes ready-to-use values into
`apps/api/.env` (including `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` for
non-interactive seed). **JWT secrets are generated for you with `crypto.randomBytes`
— they are never predictable placeholders.** `ADMIN_ORIGIN` and `API_PORT` are
prefilled with defaults (`http://localhost:3000` and `4000`).

### Secret management (important)

- **Real secrets live only in `apps/api/.env`.**
- Every new project gets a root **`.gitignore`** (written *before* `git init`) that
  excludes all `.env` files, so a plain `git add .` can never stage secrets.
- A tracked **`.env.example`** with placeholder values documents the required keys.
- The CLI never prints secret values to stdout/stderr.
- Rotate all secrets before deploying to production.

Typical `apps/api/.env` keys (after create, edit as needed):

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/openadminjs?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-a-long-random-string-at-least-32-chars
JWT_REFRESH_SECRET=another-long-random-string
ADMIN_ORIGIN=http://localhost:3000
API_PORT=4000
SUPERADMIN_EMAIL=admin@localhost.dev
SUPERADMIN_PASSWORD=your-secure-password
```

Optional (elsewhere / advanced):

```env
OPENADMIN_PLUGIN_PNPM_INSTALL=0
```

### 3. Migrate, seed and run

```bash
pnpm install
pnpm db:migrate        # prisma migrate dev
pnpm db:seed           # seed roles + superadmin
pnpm dev               # start API + admin
```

You can also drive the database through the CLI (uses the project's package manager):

```bash
openadminjs db migrate dev       # development migration
openadminjs db migrate deploy    # production migration
openadminjs db seed
openadminjs db studio
openadminjs db reset --yes       # DESTRUCTIVE, requires --yes
openadminjs db migrate --dry-run # print the command without running it
```

To start everything after install:

```bash
pnpm dev
```

Typical URLs:

| App         | URL                            |
| ----------- | ------------------------------ |
| Admin       | http://localhost:3000          |
| API         | http://localhost:4000          |
| API Swagger | http://localhost:4000/api/docs |
| Web (demo)  | http://localhost:3001          |

### 4. Sign in

After project creation, migrations and seed are run automatically. Use the superadmin credentials you entered in the scaffold wizard:

- **Email:** your `Superadmin email`
- **Password:** your `Superadmin password`

## Health & security checks

```bash
openadminjs doctor                 # verify the project is ready to run
openadminjs doctor --json          # machine-readable output
openadminjs security check         # audit secrets & config
openadminjs security check --json
```

`doctor` checks Node.js version, pnpm availability, installed dependencies,
Prisma schema + client, migration/provider consistency, required env vars and
scripts, `.gitignore` presence, whether `.env` is tracked by Git, weak secrets,
and (unless `--skip-network`) database/Redis reachability. Any **failed** check
exits non-zero.

`security check` classifies findings as `info` / `warning` / `critical` and exits
non-zero on any **critical** issue (weak/identical JWT secrets, weak admin
password, `.env` not ignored or tracked by Git, unsafe CORS, hardcoded secrets).

## Generators

```bash
openadminjs generate resource BlogPost          # apps/api/src/resources/blog-post.resource.ts
openadminjs generate field blog-post title --type text --required
openadminjs generate plugin com.example.my-plugin
```

Names are validated and normalized (PascalCase for classes, camelCase for
variables, kebab-case for files). Unsafe input (path traversal, shell
metacharacters, reserved names, etc.) is rejected, and existing files are never
overwritten without `--force`.

## Current limitations

- The scaffold supports **pnpm** only (npm/yarn are not offered).
- **PostgreSQL** ships a baseline migration; **MySQL** and **SQLite** create their
  initial migration on first `db:migrate`.
- On **SQLite**, `Json` fields are JSON-encoded in `String` columns at runtime
  (transparent to the admin UI).
- Redis is optional; queue features require a reachable `REDIS_URL`.

## Production deployment (outline)

```bash
pnpm install --frozen-lockfile
pnpm build
openadminjs db migrate deploy      # apply migrations without dev prompts
NODE_ENV=production pnpm start
```

- Rotate `JWT_SECRET`, `JWT_REFRESH_SECRET`, DB and admin credentials.
- Terminate TLS at a reverse proxy; enable secure cookie flags and `trust proxy`.
- Set `NODE_ENV=production` (disables the GraphQL landing page & dev tooling).
- Never commit `apps/api/.env`; provide secrets via your platform's env manager.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `pnpm: command not found` | `corepack enable && corepack prepare pnpm@latest --activate` |
| Prisma "Environment variable not found: DATABASE_URL" | Ensure `apps/api/.env` exists; the CLI writes it on create |
| `prisma migrate deploy` fails on a fresh DB | Run `pnpm db:migrate` (dev) once, or check the DB is reachable |
| `Can't reach database server` | Start PostgreSQL and verify host/port in `DATABASE_URL` |
| Peer dependency warnings on install | Ensure `@apollo/server@^5` + `@nestjs/apollo@^13.4` + `@as-integrations/express5` (already pinned) |
| Secrets accidentally committed | Rotate them immediately; `.gitignore` prevents this by default |

## MVP scope

- Resource-driven admin metadata with safe defaults.
- Auth, RBAC contracts, generic CRUD API, audit log and file/settings modules.
- Next.js admin shell with login, dashboard, resource screens and operational pages.
- Generated app `apps/web` for public frontend pages and SEO.
- CLI: `create`, `dev`, `build`, `db migrate|seed|studio|reset`, `generate resource|field|plugin`, `doctor`, `security check`.

## Plugin Platform

OpenAdminJS now uses a broad extension model (no legacy compatibility layer). Plugins can register multiple surfaces through `@openadminjs/plugin-sdk`:

- `resource` hooks (CRUD lifecycle)
- `api` hooks/routes
- `media` pipeline (upload transforms)
- `seo` metadata/sitemap contributors
- `jobs` handlers
- `adminUi` extensions (menus/pages/widgets/actions)

Plugins are controlled by manifest capabilities and trust mode (`trusted` / `sandboxed`) in `apps/api/plugins.manifest.json`.

### Capability matrix

- `resource.hooks` — CRUD lifecycle hooks per resource.
- `api.hooks` / `api.routes` — request lifecycle hooks and custom API endpoints.
- `media.pipeline` — file/image transform pipeline.
- `seo.extend` — metadata + sitemap contributors.
- `jobs.run` — background job handlers.
- `admin.ui.extend` — admin menu/page/widget/action extensions.

`trusted` mode may run with broad access; `sandboxed` mode should explicitly declare only required capabilities.

Generate a starter plugin:

```bash
pnpm exec openadminjs generate plugin com.example.my-plugin
```

### Queue setup

Set `REDIS_URL` in your environment to run queue processing (example: `redis://localhost:6379`).

## Partners

OpenAdminJS is community-powered and stays free thanks to partner support.

Want to become a partner and place your logo in the project materials?  
Email us at `openadminjs@proton.me`.

## Financial support

If you want to support development, hosting and community tooling:

- Open a sponsorship discussion in GitHub issues/discussions.
- Contribute with code, examples or QA.
- Contact maintainers for direct support options: `openadminjs@proton.me`.
- Crypto wallets:
  - BTC (SegWit): `bc1qpcc4hd7w82jjvsdhvx6hgu2kfuz8jgfuvxurd7`
  - ETH / USDC (ERC-20): `0xe5ac19c6f1f5070a7c713973fd25ee02eaf9eb48`
  - USDT (TRC-20): `TWyzMehesWqJS7qs5LYL4QGmgTpohNy3gf`
