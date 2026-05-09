# Plugin + AI Admin Example

Reference snippets for:

- a custom OpenAdminJS plugin (`welcomeAiPlugin`)
- plugin manifest entry with minimal capabilities
- AI assistant env keys for `apps/api/.env`

## Code in this folder

| Path | Purpose |
|------|---------|
| `src/plugins/welcome-ai.plugin.ts` | Example custom plugin (SEO + admin UI extension). |
| `src/index.ts` | Exports manifest/env snippets you can copy into your app. |

## Merge into your app

1. Create a project with `npx openadminjs create my-app` (or use existing app).
2. Copy `src/plugins/welcome-ai.plugin.ts` to `apps/api/src/plugins/custom/`.
3. Add a matching entry in `apps/api/plugins.manifest.json` (see `pluginManifestEntryExample`).
4. Add AI keys from `aiEnvExample` into `apps/api/.env`.
5. Restart API + admin and verify `/plugins` plus admin pages load.

Use this package as a template; replace IDs, model name, and provider keys with your own values.
