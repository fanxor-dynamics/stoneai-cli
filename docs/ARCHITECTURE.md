# Architecture — `@stoneai/cli`

Copyright © 2026 FanXor Dynamics LLC.

## Shape

A thin client with zero runtime dependencies and zero telemetry. All governance,
provider discovery, routing, execution state, checkpointing, and ledger hashing
runs server-side. The CLI authenticates, presents, and signs high-risk Covenant
decisions with the device-held key.

```
bin/stoneai.js        entry point; catches, formats, exits non-zero
└── lib/cli.js        command dispatch + rendering
    ├── lib/api.js        fetch wrapper → StoneAI API, Bearer auth
    ├── lib/config.js     ~/.stoneai/config.json (0600) — base_url + prefs
    ├── lib/keystore.js   credentials: OS keychain, else AES-256-GCM at rest
    ├── lib/sign.js       Ed25519 device keypair; signs covenant decisions
    └── lib/browser.js    opens the system browser for sign-in / checkout
```

## The load-bearing property

The device private key never leaves the machine. Only its public half is
registered with StoneAI. When a human approves or denies a covenant, the
decision is signed locally — so the server can *verify* consent it can never
*forge*. That asymmetry is the entire product; everything else is presentation.

It follows that anything weakening client-side key custody, or widening what the
CLI transmits, is a change to the security model rather than a feature.

## Trust boundaries

| Boundary | Crossing | Protection |
|---|---|---|
| CLI ↔ StoneAI API | HTTPS, `Bearer` | Key from OS keychain; never logged, never in argv |
| CLI ↔ disk | `~/.stoneai/` | Dir `0700`, files `0600`; plaintext credentials never written |
| CLI ↔ OS keychain | `security` (macOS), `secret-tool` (Linux) | Native store preferred; encrypted file only as fallback |
| Device key ↔ anywhere | never crosses | Private half is non-exportable by design |

## Distribution is part of the trust boundary

A tampered tarball defeats every protection above. Releases therefore publish
only from CI via OIDC trusted publishing, with a Sigstore attestation binding
each tarball to its source commit. No long-lived npm token exists to steal.
See [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Deliberate constraints

- **Zero dependencies.** Node stdlib only. A single transitive dependency would
  end the "no supply-chain surface" guarantee permanently.
- **Zero telemetry.** No analytics, no phone-home. The only egress is the API
  call the user asked for, to the host the user configured.
- **Thin by contract.** No proprietary logic ships. Reading this package reveals
  the API shape and nothing more — which is what makes the source safe to read.
- **Routing survives inference failure.** `providers`, `model`, and agent-state
  commands call deterministic control-plane endpoints; no model must answer for
  StoneAI to assess capacity, classify risk, or preserve a run checkpoint.
