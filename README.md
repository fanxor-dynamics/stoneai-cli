# @stoneai/cli

> ## Proprietary and Confidential — Not Open Source
>
> StoneAI is proprietary technology owned by Joshua Stone and exclusively licensed to
> FanXora Innovation & Technology Group L.L.C.. FanXor Dynamics LLC serves as the authorized
> technology operator, and FanXus Omnivations L.L.C. serves as an authorized
> commercial reseller and distributor.
>
> No source-code rights, ownership rights, redistribution rights, sublicensing
> rights, or reverse-engineering rights are granted except through an executed
> written agreement.
>
> **FANXORA RESTRICTED: CROWN-JEWEL TECHNOLOGY**

> **StoneAI — governed execution control plane.** Covenant remains the guardrail;
> deterministic routing and checkpointed agents provide the engine.

```bash
npm install -g @stoneai/cli
stoneai login
stone providers health
stone model
stone agents status
stone run "inspect the repository and run tests"
```

## Commands
| | |
|---|---|
| `stoneai login` | browser sign-in (`--with-key` to paste an API key) |
| `stoneai whoami` | current tenant + status |
| `stoneai decree "<action>"` | raise a decree — inert until a human signs |
| `stoneai decrees` | list decrees |
| `stoneai covenant approve\|deny <id>` | sign the covenant (Ed25519, **device-held key**) |
| `stoneai audit` | the hash-chained, append-only ledger |
| `stone providers [discover\|health\|credits\|models\|test]` | discover configured capacity without printing secrets |
| `stone model [list\|route\|failover]` | deterministic model routing; no LLM call required |
| `stone agents [status\|spawn\|stop\|resume]` | specialist agent lifecycle |
| `stone run "<action>"` | plan → govern → route → execute → verify → report |
| `stoneai usage` / `plans` | metering + subscription tiers |
| `stoneai upgrade [plan]` | open checkout to subscribe |

## Security
Thin client · zero dependencies · zero telemetry · OS-keychain credential storage · client-held Ed25519 covenant signing · no provider secrets in CLI output · OIDC-published with Sigstore provenance (releases after 0.1.1). Risk classification, routing, execution state, and immutable audit records remain server-side. See [`SECURITY.md`](./SECURITY.md).

## License
Proprietary — (c) 2026 Joshua Stone. All rights reserved. Exclusively licensed to FanXora Innovation & Technology Group L.L.C.. See [`LICENSE`](./LICENSE).
Home: **wroteinstone.com**
