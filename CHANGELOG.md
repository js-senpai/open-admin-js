# Changelog

## 0.2.0

- CLI: hardened scaffold (git-safe `.gitignore`/`.env.example`, crypto JWT secrets, atomic generation).
- CLI: `doctor` and `security check` with structured pass/warn/fail output and `--json`.
- CLI: real `db migrate|seed|studio|reset` execution, fixed `--version`/unknown-command routing.
- CLI: PostgreSQL, MySQL, and SQLite support in `openadminjs create` (pnpm-only).
- API: SQLite runtime JSON codec (`json-field-codec.ts`) for transparent Json field support.
- API: Apollo Server 5 landing page (fixes peer dependency conflict with `@nestjs/apollo`).
- CI: database matrix (PostgreSQL, MySQL, SQLite), expanded CLI tests, npm pack inspection.

## 0.1.0

- Initial MVP scaffold: CLI, resource system, API/admin/web apps and brand system.
