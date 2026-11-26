# CRM Admin

CRM-focused example for contacts, companies, deals and activity logs. Suitable for B2B sales and account management.

**Suggested resources:** `Contact`, `Company`, `Deal`, `Activity`, `Pipeline`, `Owner` (user relation).

## Code in this folder

| Path | Purpose |
|------|---------|
| `prisma/models.fragment.prisma` | `Contact`, `Company`, `Deal`, `Activity` models. |
| `src/resources/*.resource.ts` | Four resource modules. |
| `src/index.ts` | `crmExampleResources` — merge into `registry.ts`. |

### Merge into your app

See [basic-admin](../basic-admin/README.md#merge-into-your-app). Add permissions such as `contacts.read`, `companies.read`, `deals.read`, `activities.read` (and create/update/delete) to your permission seed.

## Run in a generated project

From a **new, disposable** OpenAdminJS project root:

```sh
node scripts/install-crm.mjs --dry-run
node scripts/install-crm.mjs --apply
pnpm db:migrate
pnpm db:seed
pnpm dev
````

Review the migration before applying it. For SQLite/MySQL fresh projects follow the provider-specific instructions, rather than copying PostgreSQL migrations. The installer does not connect to the database or overwrite existing resource files. The admin role's wildcard includes the registered CRM permissions; grant explicit permissions to other roles. Open Companies, Contacts, Deals and Activities in the resource navigation.
