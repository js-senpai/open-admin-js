# OpenAdminJS

OpenAdminJS is an open-source, resource-driven admin platform for the Node.js ecosystem, built with Nest.js, Prisma, PostgreSQL, Next.js, TailwindCSS and shadcn/ui.

![OpenAdminJS logo](https://js-senpai.github.io/open-admin-js/assets/brand/openadminjs-logo-new.png)

## Quick start (for package users)

Full documentation: [https://js-senpai.github.io/open-admin-js/docs.html](https://js-senpai.github.io/open-admin-js/docs.html)

### 1. Create a new project

```bash
npx openadminjs create my-app
cd my-app
```

`npx` runs the single `openadminjs` package and scaffolds the project with dependencies installed automatically.
During scaffolding, you can choose the database driver from a list (PostgreSQL, MySQL, or SQLite), and the CLI fills `DATABASE_URL` for you.

### 2. Configure environment

The scaffold wizard asks for database access and key env values (`DATABASE_URL`, `REDIS_URL`, JWT secrets) and writes ready-to-use values into `apps/api/.env`.
`ADMIN_ORIGIN` and `API_PORT` are prefilled with defaults (`http://localhost:3000` and `4000`) and can be changed manually if needed.
`.env.example` is left as a reference template.

Minimal `.env` example:

```env
NODE_ENV=development
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/openadminjs?schema=public
API_PORT=4000
JWT_SECRET=replace-with-a-long-random-string-at-least-32-chars
JWT_REFRESH_SECRET=another-long-random-string
ADMIN_ORIGIN=http://localhost:3000
```

Optional:

```env
REDIS_URL=redis://localhost:6379
OPENADMIN_PLUGIN_PNPM_INSTALL=0
```

### 3. Run project

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

### Optional queue setup

Set `REDIS_URL` in your environment to enable queue processing (example: `redis://localhost:6379`).

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
