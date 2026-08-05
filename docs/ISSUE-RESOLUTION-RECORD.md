# Issue Resolution Records

Issue Resolution Records are StoneAI's cradle-to-grave evidence packet for every bug, CI failure, deploy blocker, audit finding, security finding, support escalation, customer-delivery issue, and AI-agent failure.

They are intentionally portable: Markdown for humans, JSON for systems, validated offline by the CLI without network access, credentials, keychain reads, or customer data ingestion.

## Required fields

| Field | What it proves |
|---|---|
| Symptoms | What was observed, who or what detected it, exact error/status, affected user/system, and reproducible signal. |
| Root cause | The proven cause. If unproven, the issue stays open and Future outlook names the next probe. |
| Fix | The exact remediation: path, PR, commit, deploy, config, schema, runbook, customer-approved action, or no-code decision. |
| Results | External verification: test output, curl/browser probe, CI run, deployed SHA equality, query result, screenshot, customer confirmation, or monitoring result. |
| Preventative measures | Recurrence controls. Repeatable issue classes need at least one enforcement-layer guard: CI, Cedar, runtime probe, synthetic monitor, lint, schema guard, or invariant test. |
| Future outlook | Residual risk, monitoring window, recurrence risk, owner, follow-up trigger, and what would reopen the issue. |

## Quickstart

```bash
stoneai issue template > issue-record.md
stoneai issue validate issue-record.md
stoneai issue render \
  --symptoms "CLI help did not list the issue command." \
  --root-cause "The command router had no issue branch." \
  --fix "Added issue command routing and offline record helpers." \
  --results "node --test test/issue-record.test.js passed." \
  --preventative-measures "Added help-output and package-file invariant tests." \
  --future-outlook "Reopen if package smoke output omits issue commands."
```

## JSON mode

```bash
stoneai issue render --json \
  --symptoms "CI failed." \
  --root-cause "Package file list omitted templates." \
  --fix "Added templates to package files." \
  --results "npm pack dry run listed templates." \
  --preventative-measures "Added package-list invariant test." \
  --future-outlook "Check package contents on every release."

stoneai issue validate issue-record.md --json
```

Stable keys:

```json
{
  "symptoms": "...",
  "root_cause": "...",
  "fix": "...",
  "results": "...",
  "preventative_measures": "...",
  "future_outlook": "..."
}
```

## Complete example

```markdown
# Issue Resolution Record

## Symptoms
`stoneai --help` omitted the issue command family, so operators could not discover the record generator.

## Root cause
The CLI command router and help banner had no issue branch.

## Fix
Added `lib/issue-record.js`, routed `stoneai issue`, and included templates/docs in the package file list.

## Results
`node --test test/issue-record.test.js` passed with 10/10 tests.

## Preventative measures
Added help-output and package-file invariant tests that fail if the issue command or templates disappear.

## Future outlook
Reopen if `stoneai issue template` fails from outside the repo or package smoke output omits templates.
```

## Incomplete example

```markdown
# Issue Resolution Record

## Symptoms
TODO

## Root cause

## Fix
Added a note.
```

Validator outcome:

```json
{
  "success": false,
  "missing": ["root_cause", "results", "preventative_measures", "future_outlook"],
  "invalid": ["symptoms"]
}
```

## Customer-safe redaction

For StoneAI customer deliveries, records are confidential by default. Public or cross-customer versions must redact customer names, tenant identifiers, secrets, PII, private URLs, internal tickets, and any data the recipient does not need under ch.185. Keep the six-field structure; redact field values, not the evidence requirement.

## Enterprise seam

The schema is stable so future StoneAI/XCommand surfaces can ingest records into a private Issue Intelligence Graph: coverage dashboards, recurring root-cause clustering, preventative-control libraries, and customer-safe trend reporting without sharing confidential issue content across tenants.
