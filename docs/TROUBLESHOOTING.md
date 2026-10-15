# Troubleshooting

Copyright © 2026 FanXora Innovation & Technology Group L.L.C.

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

### Creating an account

Use `stoneai signup --email --company`, then enter the password when prompted. For non-interactive use, provide the password on standard input with `--password-stdin`:

```bash
printf '%s\n' "$PASSWORD" | stoneai signup --email you@example.com --company "Example Co" --password-stdin
```

### Logging in with a session

Use `stoneai login --session --email` for email/password authentication. Add `--password-stdin` when the password is supplied through standard input. Session login stores both the access token and refresh token in secure credential storage; the access token can therefore be refreshed without placing credentials in the config file.

```bash
printf '%s\n' "$PASSWORD" | stoneai login --session --email you@example.com --password-stdin
```

### Machine-readable API-key login

For scripts, use `stoneai login --with-key --key-stdin` and pipe the API key on standard input. Add `--json` for JSON output. `--json` may appear before or after the command:

```bash
printf '%s\n' "$STONEAI_API_KEY" | stoneai --json login --with-key --key-stdin
```

### Credentials found in `config.json`

Credentials must not be placed in `~/.stoneai/config.json`. The file is for non-secret configuration such as `base_url`, `tenant`, and `device_label`; API keys and session tokens are kept in the OS keychain or encrypted-file fallback. If a legacy config contains credential fields, the CLI removes unknown keys when it reads and rewrites the sanitized config.


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
