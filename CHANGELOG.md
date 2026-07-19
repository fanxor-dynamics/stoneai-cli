# Changelog

All notable changes to `@stoneai/cli` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **npm Trusted Publishing (OIDC).** Releases publish from GitHub Actions via a
  short-lived OIDC credential. No long-lived npm token exists in this repository
  or its secrets. Publishing is triggered by a published GitHub Release and
  gated behind the `npm-publish` environment.
- **Provenance attestations.** Releases from this point forward carry a Sigstore
  attestation binding the tarball to its exact source commit and workflow run
  (the "Built and signed on GitHub Actions" badge on npm).
- Test suite (`npm test`, 13 tests) covering command dispatch and the manifest
  invariants that README and SECURITY promise — notably zero runtime
  dependencies and the tests-never-ship allowlist.
- `quality-gate.yml`: multi-version tests, `npm audit`, tarball-contents
  assertion, and a check that `repository` matches the publishing repo.
- `package-lock.json`, so `npm ci` resolves. Its absence was silently failing
  every CI run since the workflow was introduced.
- `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/`, `CODEOWNERS`, `dependabot.yml`.

### Changed
- `license` metadata field: `UNLICENSED` → `SEE LICENSE IN LICENSE`. **No change
  to the legal terms** — the package remains proprietary and the `LICENSE` file
  is untouched. The previous value rendered on npm as a bare "UNLICENSED" badge,
  implying no terms existed; the SPDX form links readers to the actual grant.
- `repository.url` normalized to the `git+https://…​.git` form required for
  provenance to be accepted.
- Added a `bugs` field so npm renders an issue-reporting link.

### Fixed
- CI was red on `main` from its first run. `npm ci` aborted for want of a
  lockfile and `npm test` errored with "Missing script: test". Both are
  resolved; the gate now passes on Node 18, 20, and 22.
- README and SECURITY both claimed releases were provenance-signed while 0.1.0
  and 0.1.1 had in fact been published by hand with no attestation. The claims
  are now scoped to the versions they are true of.

## [0.1.1] — 2026-07-13

Published manually. No provenance attestation.

## [0.1.0] — 2026-07-02

Initial release. Published manually. No provenance attestation.

[Unreleased]: https://github.com/fanxor-dynamics/stoneai-cli/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/fanxor-dynamics/stoneai-cli/releases/tag/v0.1.1
[0.1.0]: https://github.com/fanxor-dynamics/stoneai-cli/releases/tag/v0.1.0
