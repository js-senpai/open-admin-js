# OpenAdminJS CLI

**`openadminjs` is a CLI scaffold generator**, not a runtime library you import into React/Next/Nest apps. It creates a full pnpm monorepo (NestJS API, Next.js admin/web, shared packages).

Full documentation: [https://js-senpai.github.io/open-admin-js/docs.html](https://js-senpai.github.io/open-admin-js/docs.html)

## Quick start

Requires **pnpm**, **npm**, or **yarn**. **pnpm is recommended**; npm/yarn projects are adapted at scaffold time (workspaces config, root scripts, dependency links).

```bash
npx openadminjs create my-app
cd my-app
pnpm install      # skipped if you chose install during create
pnpm db:migrate   # skipped if install ran during create
pnpm db:seed      # skipped if install ran during create
pnpm dev
```

During scaffolding you can choose **PostgreSQL** or **MySQL**; the CLI fills `DATABASE_URL` for you.

### Configure environment

The scaffold wizard asks for database access and key env values (`DATABASE_URL`, `REDIS_URL`, JWT secrets) and writes ready-to-use values into `apps/api/.env` (including `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` for non-interactive seed).
`ADMIN_ORIGIN` and `API_PORT` are prefilled with defaults (`http://localhost:3000` and `4000`) and can be changed manually if needed.
New projects do **not** include a root `.env.example` or root `.env`—use `apps/api/.env` as the source of truth (you can add your own `.env.example` for your team if you want).

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

### Run project

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

### Sign in

After project creation, migrations and seed are run automatically. Use the superadmin credentials you entered in the scaffold wizard:

- **Email:** your `Superadmin email`
- **Password:** your `Superadmin password`

## Programmatic API

```ts
import { createProject } from "openadminjs";

createProject({
  projectName: "my-app",
  database: "postgresql",
  superadminEmail: "admin@localhost.dev",
  superadminPassword: "password1234",
  databaseUrl: "postgresql://localhost:5432/my-app?schema=public",
  redisUrl: "redis://localhost:6379",
  jwtSecret: "change-me",
  jwtRefreshSecret: "change-me-too",
  adminOrigin: "http://localhost:3000",
  apiPort: "4000"
});
```

`templateDir` defaults to the bundled template. **pnpm** is recommended; **npm** and **yarn** are supported and the scaffold is adapted automatically.

## MVP scope

- Resource-driven admin metadata with safe defaults.
- Auth, RBAC contracts, generic CRUD API, audit log and file/settings modules.
- Next.js admin shell with login, dashboard, resource screens and operational pages.
- Generated app `apps/web` for public frontend pages and SEO.
- CLI: `dev`, `build`, `db migrate`, `db seed`, `generate resource`, `doctor`, `security check`.

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
