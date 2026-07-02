# @stoneai/cli

> **StoneAI — the Covenant Engine.** Govern autonomous systems from your terminal.
> *The AI decides. The human consents. The customer acts.*

```bash
npm install -g @stoneai/cli
stoneai login
stoneai decree "deploy recsys-v1"
stoneai covenant approve <id>
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
| `stoneai usage` / `plans` | metering + subscription tiers |
| `stoneai upgrade [plan]` | open checkout to subscribe |

## Security
Thin client · zero dependencies · zero telemetry · OS-keychain credential storage · client-held Ed25519 covenant signing · npm-provenance-signed releases. See [`SECURITY.md`](./SECURITY.md).

## License
Proprietary — © 2026 FanXor Dynamics LLC. All rights reserved. See [`LICENSE`](./LICENSE).
Home: **wroteinstone.com**
