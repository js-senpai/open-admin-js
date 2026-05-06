# OpenAdminJS

OpenAdminJS is an open-source, resource-driven admin platform for the Node.js ecosystem, built with Nest.js, Prisma, PostgreSQL, Next.js, TailwindCSS and shadcn/ui.

![OpenAdminJS logo](./site/assets/brand/openadminjs-logo-new.png)

## Quick start (this repository)

Follow these steps in order the first time you clone the repo.

### 1. Prerequisites

- **Node.js** 22+ (CI uses 22; newer LTS usually works).
- **pnpm** 9 (`packageManager` in root `package.json`).
- **PostgreSQL** reachable from your machine (local or Docker).
- **Redis** (optional): queues and some health checks use `REDIS_URL`; the API can start without it for basic admin usage.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure the API environment

Create **`apps/api/.env`** (this file is gitignored). The API loads, in order, **`<repo>/.env`** and **`apps/api/.env`** so you can keep secrets next to the API or at the repo root.

Minimal example:

```env
NODE_ENV=development
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/openadminjs?schema=public
API_PORT=4000
JWT_SECRET=replace-with-a-long-random-string-at-least-32-chars
JWT_REFRESH_SECRET=another-long-random-string
ADMIN_ORIGIN=http://localhost:3000
```

- **`JWT_SECRET`** is required for login. If it is missing, sign-in fails (previously surfaced as a generic “Internal server error”).
- **`DATABASE_URL`** must point at an existing database the user can create schemas in.

Optional:

```env
REDIS_URL=redis://localhost:6379
OPENADMIN_PLUGIN_PNPM_INSTALL=0
```

### 4. Apply database schema and seed demo data

From the repository root:

```bash
pnpm db:migrate
pnpm db:seed
```

`db:migrate` runs Prisma migrations against `DATABASE_URL`.  
`db:seed` creates permissions, roles, and demo users (including the admin below).

### 5. Configure the admin UI (optional)

The admin defaults to **`http://localhost:4000`** for the API. If your API runs elsewhere, create **`apps/admin/.env.local`**:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 6. Run everything in development

```bash
pnpm dev
```

This starts the API and the admin app in parallel (see root `package.json` `dev` script). To run the public `apps/web` app as well, use `pnpm --filter @openadminjs/web dev` in another terminal.

Typical URLs:

| App         | URL                            |
| ----------- | ------------------------------ |
| Admin       | http://localhost:3000          |
| API         | http://localhost:4000          |
| API Swagger | http://localhost:4000/api/docs |
| Web (demo)  | http://localhost:3001          |

### 7. Sign in

After a successful seed:

- **Email:** `openadminjs@proton.me`
- **Password:** `password`

### 8. Resources and data

- **Built-in resources** live as Nest modules under `apps/api/src/resources` (e.g. `*.resource.ts`). They define list/create/edit metadata and permissions for Prisma models.
- **Add a resource for a Prisma model** from the repo root (requires the CLI package in the workspace):

  ```bash
  pnpm exec openadminjs generate resource YourModelName
  ```

  This writes a starter file under `apps/api/src/resources`. Adjust fields, labels, and permissions, then restart or rely on hot reload depending on your setup.

- **Fill tables with data** either through the admin UI (Resources menu) or with Prisma scripts, SQL, or your own seed files.

### 9. Static marketing site

The hand-written site lives under **`site/`**. Sanity check:

```bash
pnpm site:check
```

### 10. Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm security:check
pnpm e2e
```

`pnpm e2e` runs an auth regression scenario for admin session handling (invalid token + refresh fallback) and then the repository smoke checks.

## Scaffold a new project from npm

```bash
npm create openadminjs@latest my-app
cd my-app
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Use the same demo credentials unless you change the seed.

## MVP scope

- Resource-driven admin metadata with safe defaults.
- Auth, RBAC contracts, generic CRUD API, audit log and file/settings modules.
- Next.js admin shell with login, dashboard, resource screens and operational pages.
- Generated app `apps/web` for public frontend pages and SEO.
- CLI: `dev`, `build`, `db migrate`, `db seed`, `generate resource`, `doctor`, `security check`.

### Optional queue setup

Set `REDIS_URL` in your environment to enable queue processing (example: `redis://localhost:6379`).

## Partners

OpenAdminJS is community-powered and stays free thanks to partner support.

<!-- - Nebula Systems (example)
- Arcbyte (example)
- Vertex Labs (example)
- Gridstack (example)
- Orbitlab (example)
- Pulseforge (example) -->

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
