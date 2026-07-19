# Contributing to `@stoneai/cli`

Copyright © 2026 FanXor Dynamics LLC. This is proprietary software — see
[`LICENSE`](./LICENSE).

The source is readable for auditability: this package asks you to trust it with
consent signing, and that trust should be verifiable rather than asserted.
Readable source is not an open-source grant. External contributions are accepted
only under a signed contributor agreement — open an issue before starting work.

## Local setup

```bash
git clone https://github.com/fanxor-dynamics/stoneai-cli.git
cd stoneai-cli
npm ci
npm test
npm link          # makes `stoneai` available on your PATH
```

Requires Node >= 18. There are no runtime dependencies, and there should never
be any — see the constraints below.

## Constraints that are not style preferences

Each of these is asserted by `test/package.test.js` and will fail CI if broken.

| Constraint | Why |
|---|---|
| **Zero runtime dependencies** | `SECURITY.md` advertises no supply-chain surface. One dependency ends that guarantee permanently. |
| **Only `bin/`, `lib/`, and the three docs ship** | The `files` allowlist and `.npmignore` must stay in agreement. Tests and workflows must never reach the registry. |
| **`repository.url` matches the publishing repo exactly** | npm rejects provenance on any mismatch, case included. |
| **No secrets, ever** | Credentials live in the OS keychain or encrypted at rest. Nothing is read into a log line, an error message, or a test fixture. |
| **`lib/cli.js` version matches `package.json`** | The CLI carries its own version string. A test reconciles them because nothing else does. |

## Releasing

Publishing is automated and human-gated. **Do not run `npm publish` by hand** — a
manual publish produces an unsigned artifact with no provenance, which is
precisely what the pipeline exists to prevent.

1. Bump the version in **both** `package.json` and the `version` constant in
   `lib/cli.js`. (`npm test` fails if they disagree.)
2. Move the `[Unreleased]` section of `CHANGELOG.md` under the new version.
3. Merge to `main` with the quality gate green.
4. Tag and cut a GitHub Release: `v<version>`, matching `package.json` exactly.
5. The release triggers `publish.yml`, which pauses for approval on the
   `npm-publish` environment.
6. Approve. The workflow re-runs tests, prints the exact tarball payload, then
   publishes via OIDC with provenance.

The tag-versus-manifest check in `publish.yml` fails the run rather than publish
a mismatched version. npm version numbers can never be reused, so that check is
the last reversible moment in the process.

## Reporting security issues

Never in a public issue. See [`SECURITY.md`](./SECURITY.md) — report privately
to **josh@fanzunlimited.com**.
