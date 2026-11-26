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

OIDC cannot create the first package name without an existing trust configuration. For a name that does not exist, use an interactive npm login (with 2FA), not a stored CI secret. Download the `openadminjs-runtime-packages` artifact from a successful, reviewed main CI run, check the manifest and SHA-256 hashes, and stage the actual tested archive locally with npm 11:

```sh
npm login
npm stage publish ./openadminjs-resource-0.2.0-rc.1.tgz --access public --tag next --ignore-scripts
```

Staging a new name creates a public placeholder (`0.0.0-stage`). Review it in npm, approve the staged release with 2FA, and repeat for other new names in dependency order (resource, core, auth, permissions, plugin-sdk, storage, queue, notifications, mail, payments, nest, admin-client, prisma; check the manifest). Do not stage an existing version again. The real first release is then manually approved; advance versions for the next OIDC release. Alternatively, create the first version interactively via npm publish with 2FA. Do not publish untested placeholders from local workspace source. Configure trust after the package exists. Do not create trust until the next new version is ready to publish within 48 hours.

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
