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

import { run } from '../lib/cli.js';

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
    'covenant', 'audit', 'providers', 'model', 'agents', 'run',
    'usage', 'plans', 'upgrade', 'config',
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
