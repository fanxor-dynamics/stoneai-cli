# Troubleshooting

Copyright © 2026 FanXor Dynamics LLC.

## Publishing

### `npm error 404 Not Found` / `you must be logged in` during the publish job

The Trusted Publisher rule does not match this workflow run. All five fields
must agree exactly — organization, repository, **workflow filename**, and
environment name. Renaming `publish.yml` is the usual cause: npm keeps checking
the old filename.

### `Unable to authenticate, need: Bearer` or an OIDC exchange failure

Three common causes, in order of likelihood:

1. The `publish` job is missing `permissions: id-token: write`. Without it
   GitHub never mints the token, and no npm-side configuration can compensate.
2. npm is older than 11.5.1. Runner images ship older npm — the workflow pins
   forward with `npm install -g npm@latest` for exactly this reason.
3. The run was triggered from a fork. Forks cannot mint OIDC tokens for the
   upstream repository.

### `npm error Cannot publish over previously published version`

The release tag and `package.json` disagreed, or that version already shipped.
The tag-versus-manifest check should have caught this before the publish step —
read that step's log. Bump the version; a published version can never be reused.

### Provenance is rejected / no attestation appears

- The repository must be **public**. Provenance writes to a public transparency
  log.
- `package.json` `repository.url` must match the publishing repo exactly, case
  included.

### The workflow never ran after publishing a Release

`publish.yml` triggers on `release: [published]`. Saving a **draft** release
does not fire it — the release must be published. If the repo is archived,
Actions do not run at all.

## CI

### `npm ci` fails with `Missing: … from lock file`

`package-lock.json` is out of sync with `package.json`. Run `npm install`
locally and commit the updated lockfile. Do not switch the workflow to
`npm install` — `npm ci` is what makes builds reproducible.

### `Missing script: "test"`

`package.json` has no `scripts.test`. This was the state of `main` before the
pipeline landed, and it failed every CI run.

### Test fails: "lib/cli.js reports X but package.json is Y"

Deliberate. `lib/cli.js` carries its own `version` constant that nothing else
reconciles. Update both, or a release ships announcing the wrong version.

### Test fails: "runtime dependencies added"

Also deliberate. `SECURITY.md` advertises zero supply-chain surface. If a
dependency is genuinely required, that is a security-posture decision — update
`SECURITY.md` in the same change, or find a stdlib path.

## Client runtime

### `stoneai login` opens no browser

Headless or SSH sessions have no browser to open. Use `stoneai login --with-key`
and paste an API key instead.

### Credentials do not persist between runs

The OS keychain was unavailable, so the CLI fell back to an encrypted file at
`~/.stoneai/`. Check that the directory exists and is `0700`. On Linux the
keychain path needs `secret-tool` (`libsecret-tools`).

### `EACCES` writing `~/.stoneai/`

The directory is owned by another user — usually from a run under `sudo`. Never
run the CLI with `sudo`; fix ownership with
`chown -R "$USER" ~/.stoneai`.

### Pointing the CLI at a non-default host

`stoneai config set base_url <url>`, or export `STONEAI_BASE_URL`. Confirm with
`stoneai config`, which prints the resolved config with the API key omitted.

## Issue Resolution Records

### `missing required fields` during `stoneai issue validate`

The record is not closeable yet. Fill every required section:
Symptoms, Root cause, Fix, Results, Preventative measures, and Future outlook.
If the root cause is not proven, leave the issue open with `Root cause: unproven`
and name the next probe in Future outlook.

### `invalid fields: symptoms`

The validator rejects placeholder values such as `TODO`, `TBD`, `n/a`,
`unknown`, `none`, `placeholder`, and `fixme`. Replace placeholders with the
observed signal, or keep the issue open until the signal is known.

### Repeatable issue with docs-only prevention

The ch.203 standard expects repeatable issue classes to receive at least one
enforcement-layer preventative measure: CI, Cedar, runtime probe, synthetic
monitor, lint, schema guard, or invariant test. Use docs/runbooks as secondary
controls, not the only guardrail.

### Need machine-readable output

Use `--json` on `render`, `validate`, and `doctor`. JSON mode is stable and
does not require auth, network, keychain access, or customer data ingestion.
