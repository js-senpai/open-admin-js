# npm releases via Trusted Publishing (OIDC)

Both manual release workflows publish checksummed CI artifacts from main only, after explicit approval and successful validation. The publishing jobs use Node 24, npm 11 (OIDC requires npm >=11.5.1), GitHub-hosted runners and job-level `id-token: write`. No long-lived npm publishing secret is used. Do not restore NPM_TOKEN or use npm whoami to test OIDC.

## Set up npm

Ensure you control the `@openadminjs` npm scope and can create and manage its packages. A trusted publisher is configured per existing package, not per GitHub repository or npm scope.

| npm package | GitHub owner | Repository | Workflow filename | Environment |
| --- | --- | --- | --- | --- |
| openadminjs | js-senpai | open-admin-js | publish-cli.yml | leave empty |
| each @openadminjs/* runtime package | js-senpai | open-admin-js | publish-runtime.yml | npm-runtime-release |

In each package's npm Settings > Trusted Publisher, select GitHub Actions and allow **npm publish**. Stage permission alone will not work with these direct-publish workflows. Delete expired configurations before recreating them. Complete a successful OIDC release within 48 hours of creation to validate the trust. Keep release workflows manual and restrict the runtime environment to main.

### One-time bootstrap for new npm package names

OIDC cannot create the first package name without an existing trust configuration. Use the one-time `bootstrap-runtime.yml` workflow instead of building locally.

1. Ensure you own the npm organization/scope `@openadminjs`.
2. Create a short-lived Granular Access Token limited to that scope with **Read and write (stage only)**, without bypass 2FA. Store it in the GitHub environment `npm-runtime-bootstrap` as `NPM_BOOTSTRAP_TOKEN`. Restrict that environment to main; configure reviewers if appropriate.
3. Run **Bootstrap new npm runtime packages (stage only)** on main with approve=true. It reuses CI, verifies all archive checksums, skips already registered names (including placeholders), and stages only missing names. It cannot directly publish with a stage-only token. The staged first version uses the next tag.
4. In npm's Staged Packages tab, review and approve with 2FA in dependency order: resource, core, auth, permissions, plugin-sdk, storage, queue, notifications, mail, payments, nest, admin-client, prisma. Existing placeholders from earlier runs must be reviewed separately; the workflow deliberately does not overwrite them.
5. Revoke the bootstrap token and delete its GitHub secret. Prepare new versions for the next OIDC release (including affected dependent package versions), then configure trusted publishers and run the regular OIDC release within 48 hours.

No local archives are required. The one-time stage-only token is not used in normal OIDC releases. See https://github.blog/changelog/2026-10-02-npm-staged-publishing-now-supports-creating-new-packages/ and https://docs.npmjs.com/staged-publishing/.

For bulk configuration of existing runtime packages, using an interactive npm session:

```sh
for name in resource core auth permissions plugin-sdk storage queue notifications mail payments nest admin-client prisma; do
  npm trust github "@openadminjs/$name" --repo js-senpai/open-admin-js --file publish-runtime.yml --environment npm-runtime-release --allow-publish || break
  sleep 2
done
```

For the existing CLI package (remove an expired configuration first):

```sh
npm trust github openadminjs --repo js-senpai/open-admin-js --file publish-cli.yml --allow-publish
```

See https://docs.npmjs.com/trusted-publishers/ and https://docs.npmjs.com/cli/v11/commands/npm-trust/. Interactive authentication and package ownership are required.

## Release

Check existing versions with `npm view openadminjs versions --json` and equivalent commands for runtime packages. Use new versions for changed content and dependent packages whose packed dependency versions change. Merge the reviewed changes into main. Start publish-runtime.yml with publish=true, packages=all (or a compatible selection), dist_tag=next for prereleases; then publish-cli.yml with publish=true. The CLI selects next for prereleases and latest for stable versions. Runtime release rejects prereleases tagged latest.

If a dependency is missing, register and release it first. If npm returns E404 or ENEEDAUTH, verify package ownership, exact workflow filename, environment and trust status, allowed npm publish action and npm version. Check published versions and provenance before revoking unused legacy npm tokens and deleting NPM_TOKEN from GitHub repository/environment secrets. GitHub reruns of old commits do not pick up new workflow definitions.
