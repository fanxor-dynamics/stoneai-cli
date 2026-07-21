# Security — @stoneai/cli

**(c) 2026 Joshua Stone.** Exclusively licensed to FanXora Innovation & Technology Group L.L.C.; operated by FanXor Dynamics LLC. Report vulnerabilities privately to **josh@fanzunlimited.com** — never a public issue.

## Design posture
- **Thin client.** The CLI holds no proprietary logic and no service secrets. All governance runs server-side; the CLI only calls the StoneAI API. Reading this package reveals the API shape, nothing more.
- **Zero runtime dependencies.** No third-party packages → no supply-chain attack surface. Uses only Node's standard library.
- **Zero telemetry.** The CLI never phones home, collects analytics, or transmits anything except your explicit API calls to your configured StoneAI host.

## Credential handling
- API keys are stored in the **OS keychain** (macOS Keychain via `security`, Linux Secret Service via `secret-tool`). Where no keychain exists, they are stored **AES-256-GCM encrypted at rest** (`~/.stoneai/cred.enc`, key material `chmod 600`). Plaintext is never written.
- The key is **validated before storage** and sent only as a `Bearer` header over HTTPS to your configured host.
- `stoneai logout` clears the keychain entry and the encrypted file.

## Covenant signing (device-held consent)
- On login the CLI generates an **Ed25519 device keypair**. The **private key never leaves the machine** (encrypted at rest); only the public key is registered with StoneAI.
- `stoneai covenant approve|deny` signs the decision locally with the device key. Human consent is therefore cryptographic and device-bound — the server can verify a signature it can never forge.

## Distribution integrity
- **Releases after 0.1.1** are published from CI via **npm Trusted Publishing (OIDC)** and carry an **npm provenance** attestation (Sigstore), cryptographically tying each release to its exact source commit and build. No long-lived npm token exists — CI authenticates with a short-lived credential minted per run.
- **Versions 0.1.0 and 0.1.1 predate that pipeline.** They were published manually and carry the npm registry signature but **no provenance attestation**. Verify with `npm view @stoneai/cli dist`.
- Publishing is gated on a GitHub Environment requiring human approval, and the workflow reconciles the release tag against `package.json` before the irreversible registry write.
- Strict `files` allowlist — only `bin/`, `lib/`, `README.md`, `SECURITY.md`, and `LICENSE` ship. CI asserts the tarball contents on every PR, so tests and workflows can never reach the registry.

## Verifying a release
```bash
npm view @stoneai/cli dist    # attestations present on releases after 0.1.1
npm audit signatures          # verifies registry signature + provenance
```

## Reporting
Suspected key exposure, MITM, or tampering → email immediately; rotate your StoneAI API key in the console (`stoneai logout` then re-`login`).
