// Smoke + invariant tests for the shipped CLI surface.
//
// Deliberately hermetic: nothing here touches ~/.stoneai, the OS keychain, or
// the network. The command dispatcher and the package manifest are the two
// things that can break a release without any code looking wrong, so those are
// what we assert.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { run, formatCliError, formatUsageSummary, formatProviderDegradation } from '../lib/cli.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** Run a CLI command with stdout captured, so tests stay quiet and assertable. */
async function capture(argv) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try {
    await run(argv);
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

test('--version reports a version', async () => {
  const output = await capture(['--version']);
  assert.match(output, /stoneai\s+\d+\.\d+\.\d+/, 'expected a semver in --version output');
});

// lib/cli.js carries its own `const version` string, independent of
// package.json. Nothing at publish time reconciles the two, so a release can
// ship announcing the previous version. This test is that reconciliation.
test('CLI version string matches package.json version', async () => {
  const output = await capture(['--version']);
  const found = output.match(/(\d+\.\d+\.\d+)/)?.[1];
  assert.equal(
    found,
    pkg.version,
    `lib/cli.js reports ${found} but package.json is ${pkg.version} — update both`,
  );
});

test('help lists every documented command', async () => {
  const output = await capture(['help']);
  for (const command of [
    'login', 'logout', 'whoami', 'decree', 'decrees',
    'covenant', 'audit', 'usage', 'plans', 'upgrade', 'intelligence', 'config',
  ]) {
    assert.ok(output.includes(command), `help output is missing '${command}'`);
  }
});

test('bare invocation shows help instead of throwing', async () => {
  const output = await capture([]);
  assert.match(output, /StoneAI/);
});

test('unknown command degrades to help rather than crashing', async () => {
  const output = await capture(['definitely-not-a-command']);
  assert.match(output, /unknown command/i);
  assert.match(output, /StoneAI/, 'should still print help after the error');
});

test('--help and -h are both honored', async () => {
  for (const flag of ['--help', '-h']) {
    const output = await capture([flag]);
    assert.match(output, /StoneAI/, `${flag} did not print help`);
  }
});

test('structured quota errors render actionable CLI diagnostics', () => {
  const err = new Error('quota_exceeded');
  err.status = 402;
  err.payload = {
    success: false,
    error: 'quota_exceeded',
    code: 'stoneai_account_quota_exhausted',
    category: 'account_quota',
    message: 'Plan limit reached (50/50 decrees on the trial plan). Upgrade to continue.',
    plan: 'trial',
    used: 50,
    included: 50,
    upgrade_url: 'https://writteninstone.io/app#billing',
    request_id: 'req_test',
  };

  const rendered = formatCliError(err);

  assert.match(rendered, /StoneAI account quota exhausted/);
  assert.match(rendered, /trial/);
  assert.match(rendered, /50\/50/);
  assert.match(rendered, /https:\/\/writteninstone\.io\/app#billing/);
  assert.match(rendered, /req_test/);
});

test('usage summary renders backend decree count accurately', () => {
  const rendered = formatUsageSummary({ plan: 'trial', decrees: 50, approvals: 0 });

  assert.match(rendered, /plan trial/);
  assert.match(rendered, /used 50/);
  assert.doesNotMatch(rendered, /used 0/);
});

test('a decree raised on a dead council surfaces the provider failure', () => {
  const rendered = formatProviderDegradation({
    evidence: [
      { action: 'harmless probe' },
      {
        type: 'provider_failures',
        failures: [
          { provider: 'openrouter', model: 'qwen/test', status: 401, category: 'upstream_provider_auth', message: 'User not found.' },
        ],
      },
    ],
  });

  assert.match(rendered, /council degraded/i);
  assert.match(rendered, /openrouter/);
  assert.match(rendered, /upstream_provider_auth/);
  assert.match(rendered, /401/);
});

test('a healthy council adds no degradation notice', () => {
  assert.equal(formatProviderDegradation({ evidence: [{ action: 'probe' }] }), '');
});
