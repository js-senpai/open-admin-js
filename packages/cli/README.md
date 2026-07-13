# OpenAdminJS CLI

**`openadminjs` is a CLI scaffold generator**, not a runtime library you import into React/Next/Nest apps. It creates a full monorepo (NestJS API, Next.js admin/web, shared packages).

Full documentation: [https://js-senpai.github.io/open-admin-js/docs.html](https://js-senpai.github.io/open-admin-js/docs.html)

## Requirements

- **Node.js 20+**
- **One of:** pnpm 9+ (recommended), npm 9+, or yarn 1.x / Berry
- **Database:** PostgreSQL 14+, MySQL 8+, or **SQLite 3** (local file, zero external DB)
- **Redis:** optional — background job queues are disabled when `REDIS_URL` is blank
- **Network:** Prisma downloads engine binaries on first install/generate (corporate proxies may need configuration)

The CLI verifies Node.js before writing files and detects which package managers are installed.

## Quick start (interactive)

```bash
npx openadminjs create my-app
cd my-app
pnpm dev    # or: npm run dev / yarn dev
```

If you skipped install during create:

```bash
pnpm install && pnpm db:migrate && pnpm db:seed
```

During create, choosing **install** runs dependency install, schema apply, and seed automatically.

### What `dev` starts

The root **`dev` script starts the admin UI and the API only** (not the public web app):

| Service     | URL                            |
| ----------- | ------------------------------ |
| Admin       | http://localhost:3000          |
| API         | http://localhost:4000          |
| API Swagger | http://localhost:4000/api/docs |

Optional public web app (port 3001):

```bash
pnpm --filter @openadminjs/web dev    # npm: npm run dev --workspace=@openadminjs/web
```

## Non-interactive / CI

When stdin is not a TTY (or you pass `--yes` / `--non-interactive`), the CLI uses flags and safe defaults — no prompts.

```bash
export OPENADMIN_ADMIN_PASSWORD="$(openssl rand -base64 24)"

npx openadminjs create my-app \
  --yes \
  --package-manager npm \
  --database sqlite \
  --admin-email admin@example.com \
  --admin-password-env OPENADMIN_ADMIN_PASSWORD \
  --skip-redis

cd my-app && npm run dev
```

Prefer **`--admin-password-env`** over `--admin-password` so secrets are not stored in shell history.

| Flag | Description |
| --- | --- |
| `--package-manager`, `--pm` | `pnpm`, `npm`, or `yarn` |
| `--database`, `--db` | `postgresql`, `mysql`, or `sqlite` |
| `--admin-email` | Superadmin email |
| `--admin-password-env <VAR>` | Read password from environment (recommended) |
| `--admin-password <value>` | Password on CLI (discouraged) |
| `--db-url <url>` | Override `DATABASE_URL` |
| `--redis-url <url>` | Redis URL (blank disables queues) |
| `--skip-redis` | Disable background job queues |
| `--no-install` | Skip install / DB setup |
| `--no-git` | Skip `git init` |
| `-y`, `--yes` | Non-interactive with defaults |

## Package managers

| Manager | Notes |
| --- | --- |
| **pnpm** | Default; ships `pnpm-workspace.yaml` and `workspace:*` deps |
| **npm** | Adds npm `workspaces`; rewrites `workspace:*` → `*` for local linking |
| **yarn** | Adds `workspaces`; rewrites `workspace:*` → `*` |

If your preferred manager is missing, the interactive wizard offers installed alternatives or Corepack hints for pnpm.

## SQLite zero-setup

SQLite uses a local `file:./dev.db` — no PostgreSQL/MySQL server required. **Redis is optional** for SQLite: leave the Redis prompt blank or pass `--skip-redis`. The API starts without Redis; queue endpoints return a clear `503` until `REDIS_URL` is set.

Prisma Client is generated automatically before `dev`, `build`, and `db:seed` via lifecycle scripts.

## Environment

Secrets are written to **`apps/api/.env`** (git-ignored). JWT keys are generated with `crypto.randomBytes`. A tracked **`.env.example`** contains placeholders only — the CLI never prints secret values.

```env
DATABASE_URL=file:./dev.db          # or postgres/mysql URL
REDIS_URL=                          # blank = queues disabled
JWT_SECRET=<generated>
JWT_REFRESH_SECRET=<generated>
ADMIN_ORIGIN=http://localhost:3000
API_PORT=4000
SUPERADMIN_EMAIL=admin@localhost.dev
SUPERADMIN_PASSWORD=<your password>
```

## Sign in

After create (with install), use the superadmin email and password from the wizard or `apps/api/.env`.

## Health & troubleshooting

```bash
openadminjs doctor                 # verify install, env, Prisma client, scripts
openadminjs doctor --skip-network  # offline-friendly
openadminjs security check
```

**Prisma Client not initialized:** run `pnpm db:migrate` (or `npm run db:migrate`) from the project root, or `prisma generate` from `apps/api`.

**Prisma engine download failed:** check network/proxy; retry install from the project root.

**Setup failed mid-create:** the project directory is preserved with a resume command in the error message.

**npm `EUNSUPPORTEDPROTOCOL workspace:*`:** upgrade to the latest `openadminjs` CLI — npm projects must use `*` not `workspace:*`.

## Commands

```bash
openadminjs create [name] [options]
openadminjs db migrate [dev|deploy] | seed | studio | reset
openadminjs generate resource <Model> | field <resource> <field> | plugin <id>
openadminjs doctor [--json] [--skip-network]
openadminjs security check [--json]
```

## Programmatic API

```ts
import { createProject, databaseUrl, generateSecret } from "openadminjs";

createProject({
  projectName: "my-app",
  packageManager: "npm",
  database: "sqlite",
  databaseUrl: "file:./dev.db",
  redisUrl: "", // optional — blank disables queues
  superadminEmail: "admin@localhost.dev",
  superadminPassword: process.env.ADMIN_PASSWORD!,
  jwtSecret: generateSecret(),
  jwtRefreshSecret: generateSecret(),
  adminOrigin: "http://localhost:3000",
  apiPort: "4000",
  install: true
});
```
