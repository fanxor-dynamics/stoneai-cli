# @stoneai/cli

> ## Proprietary and Confidential — Restricted Technology
>
> StoneAI™ is proprietary technology of FanXora Innovation & Technology Group L.L.C. FanXor Dynamics LLC operates StoneAI™ on behalf of FanXora Innovation & Technology Group L.L.C. under that company’s authorization and applicable policies and controls. FanXus Omnivations L.L.C. may act as an authorized commercial reseller or distributor where expressly authorized.
>
> Access and use are limited to authorized users, approved business purposes, and applicable agreements. No source-code rights, ownership rights, redistribution rights, sublicensing rights, or reverse-engineering rights are granted except through an executed written agreement or where applicable law expressly provides otherwise.
>
> **FANXORA RESTRICTED · PROPRIETARY TECHNOLOGY**

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
| `stoneai esther "<prompt>"` | ask Esther through the StoneAI-governed intelligence boundary |
| `stoneai intelligence capabilities` | authenticated Intelligence Fabric capability manifest |
| `stoneai intelligence status\|scan\|assets\|routes\|tools\|state` | governed AI/Hugging Face registry administration |

## Security
Thin client · zero dependencies · zero telemetry · OS-keychain credential storage · client-held Ed25519 covenant signing · OIDC-published with Sigstore provenance (releases after 0.1.1). See [`SECURITY.md`](./SECURITY.md).

## License
Proprietary — © 2026 FanXora Innovation & Technology Group L.L.C. All rights reserved. Operated by FanXor Dynamics LLC under authorization. See [`LICENSE`](./LICENSE).
Home: **writteninstone.io**


## Esther

Esther is StoneAI's first-party sovereign intelligence identity. The CLI sends Esther requests through StoneAI rather than granting the model direct production authority.

```bash
stoneai esther
stoneai esther "Review this architecture for failure modes"
```

Esther can reason, analyze, code, and propose. Her output remains advisory; consequential execution still requires the applicable Stone policy and human/institutional authorization. **INTELLIGENCE DOES NOT CREATE AUTHORITY.**


## OmniIntelligence

OmniIntelligence is the capability namespace spanning StoneAI's governed intelligence architecture. The CLI is the **OmniCLI** surface.

- OmniControl / OmniGov — authority and policy
- OmniJudicial — Esther review and intelligence
- OmniModel / OmniDiscover — governed model registry and discovery
- OmniProvider / OmniRoute — providers and routing
- OmniContain / OmniSight — containment and observability
- OmniTrust / OmniEvidence — provenance and evidence
- OmniCouncil — deliberation
- OmniCompute / OmniCost — capacity and economics

These names map onto canonical StoneAI services; they do not create parallel control planes.
