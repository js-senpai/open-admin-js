# OpenAdminJS

OpenAdminJS is an open-source, resource-driven admin platform for the Node.js ecosystem, built with Nest.js, Prisma, PostgreSQL, Next.js, TailwindCSS and shadcn/ui.

![OpenAdminJS logo](https://js-senpai.github.io/open-admin-js/assets/brand/openadminjs-logo-new.png)

## Quick start (for package users)

Full documentation: [https://js-senpai.github.io/open-admin-js/docs.html](https://js-senpai.github.io/open-admin-js/docs.html)

### 1. Create a new project

```bash
npm create openadminjs@latest my-app
cd my-app
```

Use `npm create ...` for bootstrap. Global installation (`npm i -g openadminjs`) is not the recommended flow.

### 2. Configure environment

Create `apps/api/.env` in the generated project.

Minimal example:

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

### 3. Prepare database and run

```bash
pnpm db:migrate
pnpm db:seed
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

After a successful seed:

- **Email:** `openadminjs@proton.me`
- **Password:** `password`

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
