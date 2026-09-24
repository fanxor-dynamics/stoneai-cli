# Security — @stoneai/cli

**© 2026 FanXora Innovation & Technology Group L.L.C. All rights reserved.** StoneAI™ is operated by FanXor Dynamics LLC under authorization. Report vulnerabilities privately to **josh@fanzunlimited.com** — never through a public issue.

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
- **All three published versions (0.1.0, 0.1.1, 0.1.6) were published manually** and carry the npm registry signature only — **none carry a Sigstore provenance attestation**. The OIDC Trusted Publishing pipeline (`publish.yml`, with `id-token: write`) is configured and will emit provenance on its first successful run; that run has not yet occurred.
- No long-lived npm token is used. CI will authenticate with a short-lived OIDC credential minted per run.
- Publishing is gated on a GitHub Environment requiring human approval, and the workflow reconciles the release tag against `package.json` before the irreversible registry write.
- Strict `files` allowlist — only `bin/`, `lib/`, `README.md`, `SECURITY.md`, and `LICENSE` ship. CI asserts the tarball contents on every PR, so tests and workflows can never reach the registry.

## Verifying a release
```bash
npm view @stoneai/cli dist    # dist.attestations will be present once a CI-published release lands; currently absent
npm audit signatures          # verifies registry signature + provenance
```

## Reporting
Suspected key exposure, MITM, or tampering → email immediately; rotate your StoneAI API key in the console (`stoneai logout` then re-`login`).
