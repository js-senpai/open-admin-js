# Basic Admin

Minimal generated OpenAdminJS project with users, roles, posts, files, audit logs and settings. Use as the default starting point before specializing the schema.

**Suggested resources:** `User`, `Role`, `Post`, `File`, `AuditLog`, `Setting`.

## Code in this folder

| Path | Purpose |
|------|---------|
| `prisma/models.fragment.prisma` | `Lead` model — append to your app `schema.prisma`, then migrate. |
| `src/resources/lead.resource.ts` | Resource definition — copy into `apps/api/src/resources/`. |
| `src/index.ts` | `basicExampleResources` — merge into `apps/api/src/resources/registry.ts`. |

### Merge into your app

1. Run `npm create openadminjs@latest my-app` (or use your existing app).
2. Append `prisma/models.fragment.prisma` to `prisma/schema.prisma`.
3. Copy `src/resources/*.ts` into `apps/api/src/resources/`.
4. Import resources in `registry.ts` and add them to the `resources` array (see `basicExampleResources` in `src/index.ts`).
5. Register matching permissions in your seed / RBAC layer (`leads.read`, …).
6. `pnpm db:migrate` (or your migrate command).

This package is part of the monorepo so `pnpm exec tsc` can typecheck snippets against `@openadminjs/core`; it is not a standalone runnable server.
