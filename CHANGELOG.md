# Changelog

All notable changes to `@stoneai/cli` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Publication status — registry snapshot 2026-09-24

npm has three published versions: **0.1.0**, **0.1.1**, **0.1.6** (`latest`).
Versions **0.1.2**, **0.1.3**, and **0.2.0** have changelog entries and git tags
but were never published to npm. The CI publish pipeline (`publish.yml`) has not
yet produced a successful registry write; all three released versions were
published manually. None of the published versions carry a Sigstore provenance
attestation. The 0.1.2 entry's claim of "carries a provenance attestation" is not
borne out by the registry.

## [Unreleased]

## [0.2.0] — 2026-09-24

### Added
- **Capability discovery**: `stoneai capabilities [id] [--json] [--manifest <id>]` — browse the capability registry with color-coded statuses, detail views, and surface distribution manifests.
- **Surface distribution**: `stoneai distribution [--json] [--gaps]` — view surface coverage report with progress bars and gap analysis across API, CLI, Web, Desktop, Mobile, Docs, and Telemetry surfaces.
- **Interactive REPL mode**: `stoneai` with no arguments (in TTY) enters an interactive mode with slash commands (`/decree`, `/whoami`, `/capabilities`, etc.), `@<capability-id>` references, fuzzy command matching, and command history.
- **Cross-device continuity**: `stoneai sessions`, `stoneai resume <id>`, `stoneai handoff <surface>`, `stoneai handoff accept <code>`, `stoneai devices` — manage sessions and handoffs across surfaces.
- **Project management**: `stoneai projects`, `stoneai missions`, `stoneai mission <id>`, `stoneai mission create <title>`, `stoneai checkpoint`, `stoneai checkpoint restore`, `stoneai artifacts`.
- **Enhanced whoami**: now shows tenant, plan with usage/included/overage, device key status, storage backend, and connection status in a structured card format.
- **Progress spinners**: `decree`, `covenant`, and `esther` commands show animated spinners during API calls.
- **Streaming for Esther**: Esther responses with a `stream` field are emitted incrementally.
- **Structured error display**: all errors show icon, code, message, suggested action, and request ID. Auth errors suggest `stoneai login`, network errors suggest `stoneai doctor`.
- **New colors**: green (`GN`) and yellow (`Y`) added to the terminal color palette.

### Changed
- Version bumped from 0.1.6 to 0.2.0.
- `help()` expanded to document all new command families and interactive mode.
- `run()` switch statement includes 15 new command cases.
- Bare `stoneai` invocation enters REPL when stdin is a TTY (was: show help).

### Fixed
- None.

## [0.1.6] — 2026-09-22

### Added
- `stoneai esther ["prompt"]` exposes Esther first-party governed intelligence through the StoneAI control plane.
- `stoneai intelligence capabilities` exposes the authenticated Stone Intelligence Fabric capability manifest.
- Governed Hugging Face Nexus administration remains available through `stoneai intelligence status|scan|assets|routes|tools|state`.

### Changed
- Release metadata synchronized across `package.json`, `package-lock.json`, and CLI version output at 0.1.6.
- HF discovery and model lifecycle remain subordinate to StoneAI governance; discovery never self-promotes into execution.
- Admin requests use the governed `x-admin-token` header without persisting the token in CLI configuration.

### Security
- Consequential actions remain gated by StoneAI authority; Esther and external model intelligence are advisory.
- npm Trusted Publishing remains OIDC/provenance based with no long-lived npm token in the repository.

## [0.1.3] — 2026-09-16

### Changed
- Canonical service and package homepage moved to `https://writteninstone.io`.
- CLI help output and default backend now use `writteninstone.io`.
- Enterprise proprietary notices now identify FanXora Innovation & Technology Group L.L.C. as the company-level rights holder/licensor and FanXor Dynamics LLC as the authorized operator.
- Removed personal-name ownership attribution from active package metadata and legal/security notices.
- Replaced the previous CLI license with the enterprise StoneAI CLI Proprietary Software License Agreement v1.1, retaining the pending-attorney-review notice.
- Restored public npm publication for the scoped package with `publishConfig.access: public` and `private: false`.
- Package author metadata now identifies FanXora Innovation & Technology Group L.L.C.

### Security
- Removed stale "CROWN-JEWEL TECHNOLOGY" source classifications in favor of `FANXORA RESTRICTED · PROPRIETARY TECHNOLOGY`.
- Qualified reverse-engineering restrictions to account for applicable-law exceptions.
- Preserved OIDC Trusted Publishing and npm provenance; no long-lived npm token is required.

## [0.1.2] — 2026-07-19

First release published from CI. Carries a provenance attestation; 0.1.0 and
0.1.1 do not.

### Fixed
- **Checkout no longer names a payment processor** (ch.184 cardinal rule 7).
  `upgrade` previously sent a hardcoded processor in the checkout call, so
  changing processors would have required shipping a new CLI to every user. It
  now reads `GET /v1/checkout/methods` and uses what the server advertises,
  with an optional `--method <name>` override. The server already had the
  swap-ready interface; only the client was hardcoded.
- A test now fails the build if any payment processor name appears in `lib/`.

### Added
- **npm Trusted Publishing (OIDC).** Releases publish from GitHub Actions via a
  short-lived OIDC credential. No long-lived npm token exists in this repository
  or its secrets. Publishing is triggered by a published GitHub Release and
  gated behind the `npm-publish` environment.
- **Provenance attestations.** Releases from this point forward carry a Sigstore
  attestation binding the tarball to its exact source commit and workflow run
  (the "Built and signed on GitHub Actions" badge on npm).
- Test suite (`npm test`) covering command dispatch and manifest invariants.
- `quality-gate.yml`: multi-version tests, `npm audit`, tarball-contents
  assertion, and a check that `repository` matches the publishing repo.
- `package-lock.json`, so `npm ci` resolves.
- `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/`, `CODEOWNERS`, `dependabot.yml`.

### Changed
- `license` metadata field: `UNLICENSED` → `SEE LICENSE IN LICENSE`.
- `repository.url` normalized to the `git+https://…​.git` form required for provenance.
- Added a `bugs` field so npm renders an issue-reporting link.

### Fixed
- CI was red on `main` from its first run. `npm ci` aborted for want of a lockfile and `npm test` errored with "Missing script: test". Both are resolved.
- README and SECURITY claims about provenance were scoped to the versions they apply to.

## [0.1.1] — 2026-07-13

Published manually. No provenance attestation.

## [0.1.0] — 2026-07-02

Initial release. Published manually. No provenance attestation.

[Unreleased]: https://github.com/fanxor-dynamics/stoneai-cli/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/fanxor-dynamics/stoneai-cli/releases/tag/v0.2.0
[0.1.3]: https://github.com/fanxor-dynamics/stoneai-cli/releases/tag/v0.1.3
[0.1.2]: https://github.com/fanxor-dynamics/stoneai-cli/releases/tag/v0.1.2
[0.1.1]: https://github.com/fanxor-dynamics/stoneai-cli/releases/tag/v0.1.1
[0.1.0]: https://github.com/fanxor-dynamics/stoneai-cli/releases/tag/v0.1.0


[0.1.6]: https://github.com/fanxor-dynamics/stoneai-cli/releases/tag/v0.1.6
