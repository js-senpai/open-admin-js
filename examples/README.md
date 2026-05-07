# Examples

Each folder is a **small reference package**: Prisma fragments you can merge into your app, `defineResource` modules for the API admin layer, and a typed export you can mirror in `registry.ts`. They are **not** full standalone servers — create an app with the CLI, then copy or adapt the snippets.

From the repo root, typecheck or test all example packages:

```bash
pnpm install
pnpm --filter "./examples/*" typecheck
pnpm --filter "./examples/*" test
```

| Example | Focus |
| -------- | ------ |
| [basic-admin](./basic-admin/) | Minimal stack: users, roles, posts, files, audit, settings |
| [blog-admin](./blog-admin/) | Editorial: posts, categories, authors, publish workflow |
| [crm-admin](./crm-admin/) | Sales: contacts, companies, deals, activities |
| [ecommerce-admin](./ecommerce-admin/) | Catalog: products, variants, orders, inventory |
| [marketplace-admin](./marketplace-admin/) | Two-sided: listings, sellers, payouts, disputes |
| [support-admin](./support-admin/) | Ops: tickets, SLAs, canned replies, assignments |

## Publishing packages to npm (maintainers)

These steps apply when you publish the single public package from this repo (`openadminjs`), not the whole monorepo root (the root is `private` and is not meant to be published as one package).

### 1. Prerequisites

- [npm](https://docs.npmjs.com/) account with publish rights.
- One-time login: `npm login`
- Built artifacts: from the repo root, run `pnpm --filter openadminjs build` (or `pnpm build`).

### 2. Package manifest

In the package you publish (e.g. `packages/cli/package.json`):

- Ensure **`"private": true` is not set** on that package (templates may be private; the CLI package should be publishable).
- Prefer a **`"files"`** field so only `dist/` (and README) are packed, for example: `"files": ["dist", "README.md"]`.
- For scoped public packages, add:

```json
"publishConfig": {
  "access": "public"
}
```

For `openadminjs` (unscoped), public publish is the default; keeping `publishConfig.access=public` is still explicit and recommended.

### 3. Dry run

From the package directory:

```bash
cd packages/cli
npm pack
```

Inspect the generated `.tgz` (or use `npm publish --dry-run`) to confirm contents.

### 4. Publish

```bash
cd packages/cli
npm publish
```

First publish of a scoped package usually needs public access (see `publishConfig` above), or once: `npm publish --access public`.

**Version bumps:** edit `version` in that package’s `package.json`, commit, then publish again. Follow [semver](https://semver.org/).

**pnpm:** you can use `pnpm publish` from the package folder instead of `npm publish`; behavior is similar for registry upload.

### 5. CI (optional)

Use an automation token (`NPM_TOKEN`) in GitHub Actions with `npm publish` in a release workflow, only on tagged releases, with provenance if you use npm’s OIDC integration.

---

If you only want to **start a new project** from npm (not publish), use:

`npx openadminjs create my-app`.
