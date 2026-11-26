# Default RBAC matrix

The source of truth is apps/api/src/access/catalog.ts and public-catalog.ts. The seed materializes inheritance using @openadminjs/permissions and keeps realms separate. This is the default blueprint, not a description of every customized database.

| Capability | viewer (admin) | editor (admin) | admin (admin) | guest (public) | member (public) |
|---|---|---|---|---|---|
| Read posts/categories | yes | yes | yes | no | no |
| Create/update/delete/publish posts and categories | no | yes | yes | no | no |
| Read/upload/delete files | no | yes | yes | no | no |
| Read users, audit logs | no | yes | yes | no | no |
| Settings read/update (non-reserved) | no | yes | yes | no | no |
| Personal API keys read/create/revoke/delete | no | own | own | no | no |
| Notifications read | own | own | all | no | no |
| Notifications create/update/delete | no | scoped | yes | no | no |
| Jobs read | yes | yes | yes | no | no |
| Jobs dispatch | no | yes | yes | no | no |
| AI chat (if enabled) | no | yes | yes | no | no |
| AI config read | no | no | yes | no | no |
| AI config write / plugin installation via HTTP | no | no | no | no | no |
| Refund orders (Stripe test mode only) | no | no | yes | no | no |
| Roles/system logs read | no | no | yes | no | no |
| Public session/account read/update | no | no | no | no | own |
| Checkout/read own orders | no | no | no | no | own |

Admin wildcard applies to its realm only. An account may separately hold a public role, but must authenticate in that realm. A token issued for another realm is rejected with AUTH_REALM_MISMATCH. Resource record scopes and field policies remain enforced even when a role has resource-level permission. Deployment-operator-only actions are not unlocked by wildcard. CI uses real seeded roles and checks both directions of realm isolation. Do not assign admin permissions to public roles.
