// ch.184 cardinal rule 7 — vendor-agnostic interfaces.
//
// "No service hardcodes a vendor name; all external classifier/AV/hash calls go
// through a normalized swap-ready interface."
//
// The server already honours this: billing/processors/{paypal,stripe,coinbase}
// sit behind a gateway, and /v1/checkout/methods advertises what is live. This
// client shipped 0.1.0 and 0.1.1 with `method: 'paypal'` written into the
// checkout call anyway, which meant changing processors would have required
// shipping a new CLI to every user.
//
// This test is the enforcement layer for that rule. A payment vendor name
// appearing anywhere in lib/ is a rule-7 violation, not a style preference.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const libDir = join(root, 'lib');

// Payment processors, not general vendors — this is scoped to rule 7's target.
const PROCESSOR_NAMES = [
  'paypal', 'stripe', 'coinbase', 'square', 'braintree', 'adyen',
  'ccbill', 'segpay', 'epoch', 'vendo', 'verotel',
];

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('no payment processor is named in client source (ch.184 rule 7)', () => {
  const violations = [];

  for (const file of sourceFiles(libDir)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      // Comments may discuss the rule and name processors while explaining it.
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      for (const vendor of PROCESSOR_NAMES) {
        if (new RegExp(`\\b${vendor}\\b`, 'i').test(code)) {
          violations.push(`${file.replace(root + '/', '')}:${i + 1} → "${vendor}"`);
        }
      }
    });
  }

  assert.deepEqual(
    violations,
    [],
    'Payment processor names must not appear in client code. The server\n' +
      'advertises live methods via /v1/checkout/methods — read them at runtime\n' +
      'instead of naming a vendor here. Violations:\n  ' + violations.join('\n  '),
  );
});

test('checkout reads available methods from the server', () => {
  const cli = readFileSync(join(libDir, 'cli.js'), 'utf8');
  assert.match(
    cli,
    /\/v1\/checkout\/methods/,
    'upgrade() must query /v1/checkout/methods rather than assuming a processor',
  );
});
