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
8. AI, OIDC, checkout, webhook, refunds and new API token issuance are disabled until their own security and integration tests pass. Do not market these as active production functionality.

## Status against the combined audit

| ID | Implemented in this branch | Outstanding acceptance |
| --- | --- | --- |
| S01 | Removed runtime package installation and manifest writes; explicit capabilities; rejected fake sandbox | Review plugin contracts and integration tests |
| S02 | Server-generated paths, size and MIME checks, exclusive writes, blocked generic file creation | Storage driver and download/cleanup/rollback tests |
| S03 | No default demo users, disable unchanged legacy accounts, no seed password overwrite | Seed upgrade and restore test |
| S04 | AI routes disabled; reserved AI settings excluded | Secret encryption, outbound policy and scoped AI permissions |
| S05 | Hashed, indexed session tokens, rotation, replay and revocation; HttpOnly BFF | Real database concurrency and multi-tab checks |
| S06 | Reset token not disclosed, atomic consumption, session revocation; OIDC disabled | Verified OIDC callback and full identity/verification tests |
| S07 | Field allowlists and permissions, scoped write checks, query validation | Complete mutation/action/bulk policy and concurrency tests |
| S08 | Audit snapshot redaction; API token issuance disabled | Full audit coverage, migration of historical logs, real token auth |
| S09 | Unsafe financial write endpoints disabled | Server pricing, signed webhook, transactional idempotency |
| S10 | Refund authorization and disabled refund execution | Provider reconciliation, refund idempotency and financial audit |
| R01 | Rebuilt release pipeline | Installed tarball and versioned release acceptance |
| R02 | AST insertion and replacement, camelCase model delegates, plural slugs, decimal, dry run | Full Prisma model introspection and generated CRUD test |
| R03 | Native JSON for new SQLite, scoped schema transformations, legacy string codec | Provider matrix and legacy JSON conversion |
| R04 | Removed automatic accept-data-loss | Reviewed MySQL/SQLite migration history and rollback |
| R05 | Unit regressions and installed-tarball HTTP/Playwright test | Actual green results, negative-role and concurrency matrix |
| R06 | Tarball content checks, checksum, manual release gate | Actual CI acceptance and release approval |
| A01 | Incremental resource policy and validation hardening | Full service decomposition and exception/request-ID contract |
| A02 | Standalone scaffold retained | Separate versioned runtime packages and upgrade/rollback CLI |
| A03 | Unsafe optional modules disabled | Separate profiles, schema fragments, validated indexes |
| A04 | Production Swagger/introspection defaults; existing shutdown and health hooks | Tested container deployment, backup/restore and observability |
| U01 | Removed fake analytics, new read-only plugin UI, settings, Open Core mark | Complete responsive/keyboard/i18n/forms/table coverage |
| U02 | Migration notes and README reference updated | Runnable CRM example and complete snippet/doc verification |
| U03 | Deferred by original specification | Embedded adapter, MFA, storage/queue adapters |
| D01 | Open Core vector mark and UI wordmark/favicon | Complete SVG/PNG/OG/monochrome kit, trademark/contrast review |
| D02 | Landing/docs restyled, retained sections | Real screenshots, browser/Lighthouse and accessibility acceptance |

## Release gate

GitHub Actions installs the exact candidate tarball in an isolated workspace and exercises PostgreSQL, MySQL and SQLite profiles. The runtime test checks CRUD, login, refresh replay, HttpOnly cookies, cross-origin write rejection and logout. It is not a complete penetration test or proof of production readiness.

Keep the pull request in draft until CI and the outstanding P0 criteria pass. Do not publish automatically. The publish workflow is manual and main-only, requires explicit approval, and consumes the same archive after CI. Do not trigger it for this candidate.
