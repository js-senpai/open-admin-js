# Local development and audit regression

The canonical repository uses PostgreSQL; do not rewrite its schema or migration lock for SQLite. Follow the root README's local-only Compose recipe. The PostgreSQL service binds to 127.0.0.1 and keeps its data in a named volume. Stop it with docker compose -f compose.dev.yaml down (without -v to retain data). Use a separate disposable database for tests.

For a SQLite development instance, build the CLI and scaffold outside the monorepo with the SQLite provider. The generated project's schema uses native JSON and its own database. Use pnpm db:init for non-interactive setup, then seed and start. PostgreSQL uses migrate deploy; SQLite/MySQL without reviewed history use db push without accept-data-loss. Production requires reviewed migrations.

The installed-package CI suite runs production server builds on disposable databases. It exercises low-privilege roles, cross-realm isolation, forbidden plugin changes, upload paths, client-controlled prices, invalid webhooks, reset response secrecy, introspection/Swagger defaults and concurrent browser-tab refresh. It does not submit actual payments or contact an external IdP. Web Locks coordinate cross-tab refresh where supported; browsers without them have per-tab single-flight only and strict replay revocation remains enabled.

Set OPENADMIN_GRAPHQL_INTROSPECTION=0 to disable introspection and the Apollo landing page in development as well. Production always disables both.
