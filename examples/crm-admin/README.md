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
