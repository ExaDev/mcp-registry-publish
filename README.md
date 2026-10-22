# mcp-registry-publish

[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/ExaDev/mcp-registry-publish) [![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/mcp-registry-publish) [![Release](https://img.shields.io/github/v/release/ExaDev/mcp-registry-publish)](https://github.com/ExaDev/mcp-registry-publish/releases/latest) [![CI](https://img.shields.io/github/actions/workflow/status/ExaDev/mcp-registry-publish/ci.yml?branch=main)](https://github.com/ExaDev/mcp-registry-publish/actions)

> Publish a `server.json` to the MCP registry from CI. It skips a version the registry already lists and retries the registry's transient failures. A GitHub Action and an npm package.

## Why

`mcp-publisher publish` works until the registry or npm has a bad minute, and the registry reports several of those as an HTTP 400 with no hint that a retry would help. A release job that publishes in the same step as everything else then fails, and a version ends up on npm and tagged but missing from the registry. This runs the publish as its own step with the failure handling a release job needs:

- A version the registry already lists is skipped, so re-running a job after an outage is safe and backfilling a listed version is a no-op.
- Failures that clear by themselves are retried for a quarter of an hour with a growing delay, logging in again before each retry. These are npm propagation lag, a 5xx, a connection failure, an expired login token, the registry's database running out of connection slots, and the registry's own call to npm timing out.
- Anything else, a duplicate version or an invalid `server.json` for instance, fails at once with the registry's own output.
- The `mcp-publisher` binary is pinned to a release and its SHA-256 is checked before it runs, so a changed asset is never executed and "latest" cannot change behaviour under you.

## Use as an action

Give the job `id-token: write`, which the registry's GitHub OIDC login needs, and run it after the step that publishes the package to npm. The registry checks npm for the version, so publish there first.

```yaml
registry:
  needs: release
  runs-on: ubuntu-latest
  permissions:
    contents: read
    id-token: write
  steps:
    - uses: actions/checkout@v7
    - uses: ExaDev/mcp-registry-publish@v1
      with:
        server-json: server.json
```

| Input          | Default       | Meaning                                                                         |
| -------------- | ------------- | ------------------------------------------------------------------------------- |
| `server-json`  | `server.json` | The file to publish, relative to the working directory.                         |
| `node-version` | `24`          | Node used to run the publisher. It runs TypeScript directly, so 22.18 or later. |

Keep this in a job of its own rather than a step of the release job. An outage of the registry then fails only this job, which can be re-run, and the release is not affected.

## Versions and the Marketplace listing

This follows GitHub's own guidance for action versions ([action versioning](https://github.com/actions/toolkit/blob/main/docs/action-versioning.md), [tags for release management](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions)). Every release creates a GitHub release and tag for its specific version, such as `v1.0.1`, which a caller can pin when the latest has a problem. The major tag, `v1`, is a plain tag that the release job force-pushes to the newest release of that major version, so `@v1` follows every compatible release. A breaking change starts a new major version.

The Marketplace listing is switched on per release, in the web UI, by ticking "Publish this Action to the GitHub Marketplace" on a specific release; there is no API for it. Callers resolve `@v1` through the git tag, so the listing does not affect which code runs. The major tag has no GitHub release of its own, which also keeps it movable if immutable releases are ever enabled, since a release locks its tag.

## Use from the command line

```bash
npx mcp-registry-publish --server-json server.json
```

It needs to run where the registry's GitHub OIDC login works, which means a GitHub Actions job with `id-token: write`.

## Use as a library

```ts
import { publishToRegistry, parseServerIdentity } from "mcp-registry-publish";
```

`publishToRegistry(server, serverJsonPath, deps)` takes its network, clock and `mcp-publisher` process as `deps`, so a caller can wire its own or assert the sequence without any of them. `isRetryablePublishFailure(output)` is exported for a release tool that runs `mcp-publisher` itself.

## Publishing a version an outage missed

Check out the tag that carries the missed version and run the action or the CLI there. The version check makes it safe to run for a version that did publish.

```yaml
- uses: actions/checkout@v7
  with:
    ref: v1.2.3
- uses: ExaDev/mcp-registry-publish@v1
```

When a workflow already holds a newer copy of this action's version and only needs an older `server.json`, take that one file from the tag and leave the rest of the checkout alone: `git fetch --depth=1 origin refs/tags/v1.2.3` then `git show FETCH_HEAD:server.json > server.json`.

## Updating mcp-publisher

The pinned version and the checksum of each supported release asset live in `src/publisher-binary.ts`. To adopt a new `mcp-publisher`, change both together in one commit.

## Development

```bash
pnpm install
pnpm test
pnpm run lint && pnpm run typecheck
pnpm run build
```

Releases are made by semantic-release from conventional commits on `main`, and publish to npm with provenance over OIDC.
