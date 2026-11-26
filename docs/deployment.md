# PostgreSQL deployment candidate

The provided Docker Compose stack runs PostgreSQL, a one-shot reviewed migration, private NestJS API and Next.js admin. It is a reference configuration, not a certified production deployment. Do not deploy without CI and staging acceptance.

1. Install Docker Engine and Compose. Use a checkout or generated project with a lockfile.
2. Copy .env.production.example to .env (ignored by git); set unique random database and JWT secrets. URL-encode the DB password in DATABASE_URL. Set ADMIN_ORIGIN to the public HTTPS origin.
3. Review all pending migrations and take backups. Run docker compose build, then docker compose up -d.
4. Seed permissions and bootstrap the administrator explicitly: docker compose run --rm -e SUPERADMIN_EMAIL -e SUPERADMIN_PASSWORD api pnpm db:seed (set both values in your shell via a secure secret manager). Remove the bootstrap credentials afterward.
5. Terminate HTTPS at a reverse proxy forwarding to 127.0.0.1:3000, preserving the external origin. Do not expose the API or database. Use a separate vetted route for provider webhooks if enabled in a future release.
6. Inspect docker compose ps and docker compose logs api admin. The API health endpoints are /health/live and /health/ready.

## Recovery

Use a maintenance window and stop writers before consistent DB + storage backup. Run:

```sh
umask 077
docker compose exec -T db pg_dump -U openadmin -d openadmin -Fc > backup.dump
docker compose exec -T api tar -C /app/storage -cf - . > storage.tar
```

Encrypt and store both backups off-host, record migration versions and checksums. Restore to a **separate staging stack/database**, not production, verify data and uploaded files, then plan a controlled switchover. The compose volume storage is private; do not mount it under a public web root. Test recovery routinely. Legacy arbitrary file paths require manual inventory and migration to opaque storage keys.

Redis, external AI, OIDC and Stripe test mode remain optional and are not enabled in this stack. MySQL and SQLite require separate provider-specific deployment and migration review.
