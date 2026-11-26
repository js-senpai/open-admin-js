# V2 Open Core — migration and release notes (development candidate)

This branch is **not a stable release**. The published npm package and main branch are not changed by this work.

## Upgrade and security

1. Back up the database and upload storage. Restore into an isolated staging database first.
2. PostgreSQL: review the new session migration and run Prisma migrate deploy in staging. Existing access/refresh tokens cannot be reused; users must sign in again.
3. Existing MySQL/SQLite projects: do not copy the PostgreSQL migration or blindly push the new schema. Review provider-specific changes and migrate legacy JSON text explicitly, preserving nulls, strings, arrays and objects. Test restore before production.
4. Replace unchanged legacy demo credentials and review disabled accounts. Seed no longer resets existing admin passwords. Use a unique administrator email and a strong password.
5. Serve the admin over HTTPS. Set ADMIN_ORIGIN to the exact public admin origin and API_INTERNAL_URL to the private API origin. Set real JWT secrets and database credentials. Keep the API off the public network unless it is intentionally exposed.
6. Browser authentication uses same-origin BFF and HttpOnly cookies; do not reintroduce localStorage tokens. Refresh-token replay revokes its session family. Concurrent refresh across tabs requires validation.
7. Plugin installation is a trusted build/deploy operation only. Explicit capabilities are required. Sandboxed mode is rejected rather than claiming in-process isolation.
8. API keys are newly issued with explicit read-only scopes; legacy tokens are revoked by migration. AI is an opt-in read-only OpenAI assistant, with OPENADMIN_AI_ENABLED=1 and OPENAI_API_KEY in deployment secrets. Commerce is opt-in Stripe test mode only (OPENADMIN_COMMERCE_ENABLED=1, test key, signing secret and configured HTTPS redirect URLs). OIDC remains disabled. None of these changes establishes production certification.

## Status against the combined audit

| ID | Implemented in this branch | Outstanding acceptance |
| --- | --- | --- |
| S01 | Removed runtime package installation and manifest writes; explicit capabilities; rejected fake sandbox | Review plugin contracts and integration tests |
| S02 | Private LocalStorage, generated keys, size/MIME checks, authorized download, delete cleanup and failed-create compensation | CI runtime acceptance, old path migration and durable orphan reconciliation |
| S03 | No default demo users, disable unchanged legacy accounts, no seed password overwrite | Seed upgrade and restore test |
| S04 | Opt-in read-only assistant, environment secret, explicit permissions, fixed provider HTTPS and pinned public IPv4 | Real provider integration and egress acceptance; no autonomous actions |
| S05 | Hashed, indexed session tokens, rotation, replay and revocation; HttpOnly BFF; browser-wide refresh lock | Real database concurrency and multi-tab checks |
| S06 | Reset token not disclosed, atomic consumption, email verification restricted to pending accounts, session revocation; OIDC disabled | Supported OIDC client, verified callback and full identity/verification tests |
| S07 | Extracted policy/query modules, allowlists, scoped writes, bulk and reorder validation | Complete action/hook concurrency tests |
| S08 | Audit snapshot redaction; hashed owner-bound read-only API keys, live scope checks and revocation | CI runtime acceptance, full audit coverage, migration of historical logs |
| S09 | Stripe test-only checkout, server pricing, cart idempotency, signed deduplicated webhook | Real Stripe test account, reconciliation and financial acceptance |
| S10 | Refund permission, atomic claim, provider idempotency, signed confirmation, pending state on ambiguity | Real Stripe test account, reconciliation and financial audit |
| R01 | Rebuilt release pipeline | Installed tarball and versioned release acceptance |
| R02 | AST insertion and replacement, camelCase model delegates, plural slugs, decimal, dry run | Full Prisma model introspection and generated CRUD test |
| R03 | Native JSON for new SQLite, scoped schema transformations, legacy string codec | Provider matrix and legacy JSON conversion |
| R04 | Removed automatic accept-data-loss | Reviewed MySQL/SQLite migration history and rollback |
| R05 | Unit regressions and installed-tarball HTTP/Playwright test | Actual green results, negative-role and concurrency matrix |
| R06 | Tarball content checks, checksum, manual release gate | Actual CI acceptance and release approval |
| A01 | Resource policy/query extraction, stable HTTP error contract and request ID | Complete service decomposition, durable hooks/outbox and shared client contracts |
| A02 | Standalone scaffold retained | Separate versioned runtime packages and upgrade/rollback CLI |
| A03 | Unsafe optional modules disabled | Separate profiles, schema fragments, validated indexes |
| A04 | Docker/Compose candidate, health/readiness, private storage and deployment/backup guide | Actual container/staging deployment, restore drill and observability |
| U01 | Open Core login, dashboard, shared shell, dynamic navigation, command search, mobile drawer and resource components | Browser visual acceptance, full i18n and accessibility |
| U02 | CRM installer included in scaffold (dry run + explicit apply), migration instructions | Full CRM CRUD acceptance and complete snippet/doc verification |
| U03 | Deferred by original specification | Embedded adapter, MFA, storage/queue adapters |
| D01 | Self-contained vector generator for SVG, PNG, favicon, OG, monochrome | Generated artifact visual review and trademark/contrast review |
| D02 | Landing/docs restyled, retained sections | Real screenshots, browser/Lighthouse and accessibility acceptance |

## Release gate

GitHub Actions installs the exact candidate tarball in an isolated workspace and exercises PostgreSQL, MySQL and SQLite profiles. The runtime test checks CRUD, login, refresh replay, HttpOnly cookies, cross-origin write rejection and logout. It is not a complete penetration test or proof of production readiness.

Keep the pull request in draft until CI and the outstanding P0 criteria pass. Do not publish automatically. The publish workflow is manual and main-only, requires explicit approval, and consumes the same archive after CI. Do not trigger it for this candidate.

## Admin redesign

The admin follows the landing page's Open Core visual tokens: ink #101820, lime #B9F56D, paper #F5F7F2, neutral borders, dark top bar, typography and code-inspired identity. The login layout includes a geometric brand panel; the workspace has permission-derived navigation, mobile drawer, breadcrumbs and keyboard search. Playwright captures screenshots from the installed archive; these are not visual approval until inspected. See [deployment guide](deployment.md) and [CRM example](../examples/crm-admin/README.md).
