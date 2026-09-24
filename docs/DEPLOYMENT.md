# Deployment — publishing `@stoneai/cli`

Copyright © 2026 FanXor Dynamics LLC.

Publishing is fully automated and human-gated. **Never run `npm publish` by
hand** — a manual publish produces an unsigned artifact with no provenance,
which is what this pipeline exists to prevent. Versions 0.1.0 and 0.1.1 were
published that way, before this pipeline existed.

## How it works

`.github/workflows/publish.yml` runs on a published GitHub Release.

```
GitHub Release published
  └─ test job — Node 18 / 20 / 22 must pass
      └─ publish job — waits on `npm-publish` environment approval
          ├─ upgrade npm (trusted publishing needs >= 11.5.1)
          ├─ verify release tag == package.json version
          ├─ npm publish --dry-run   (prints the exact payload)
          └─ npm publish             (OIDC; provenance automatic)
```

There is **no `NPM_TOKEN`** in this repository or its secrets. GitHub mints a
short-lived OIDC identity token (`id-token: write`); npm validates its claims
against the Trusted Publisher rule on the package and exchanges it for a
credential that lives for one publish. Nothing long-lived exists to leak.

## One-time setup

These four must all agree, or publishing fails.

**1. npm Trusted Publisher** — npmjs.com → the package → Settings:

| Field | Value |
|---|---|
| Publisher | GitHub Actions |
| Organization or user | `fanxor-dynamics` |
| Repository | `stoneai-cli` |
| Workflow filename | `publish.yml` |
| Environment name | `npm-publish` |

**2. GitHub Environment** — repo Settings → Environments → New → `npm-publish`.
Add required reviewers so a release cannot publish without a human approving the
run.

**3. Repository must be public.** npm provenance writes to a public Sigstore
transparency log and requires a public repository.

**4. `repository.url` in `package.json`** must exactly match the publishing
repo, case included. `quality-gate.yml` asserts this on every PR.

> Renaming `publish.yml` breaks publishing until the npm rule is updated to
> match. The filename is part of the identity npm checks.

## Cutting a release

1. Bump the version in **both** `package.json` and the `version` constant in
   `lib/cli.js`. `npm test` fails if they disagree.
2. Move `[Unreleased]` in `CHANGELOG.md` under the new version.
3. Merge to `main`, quality gate green.
4. Cut a GitHub Release tagged `v<version>`, matching `package.json` exactly.
5. Approve the `npm-publish` environment when the run pauses.
6. Verify: the npm page should show **"Built and signed on GitHub Actions."**

## If a bad version ships

npm version numbers can never be reused, and unpublish is heavily restricted.
The recovery path is forward: publish a fixed patch version, then
`npm deprecate @stoneai/cli@<bad> "<reason — use <good>>"`.

Never `npm unpublish` to "fix" a release. Under ch.154 preservation rules,
deprecation is the lawful path; unpublish also breaks every lockfile pinning it.

## Verifying a published release

```bash
npm view @stoneai/cli dist          # dist.attestations absent on manually-published versions; present once CI publishes
npm audit signatures                # verifies registry signature + provenance
```
