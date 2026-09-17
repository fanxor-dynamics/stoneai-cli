// Manifest invariants that protect the published artifact.
//
// These encode promises made publicly in README.md and SECURITY.md. A promise
// asserted in prose but unenforced in CI is a promise that quietly stops being
// true — this file is where those claims get teeth.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('zero runtime dependencies', () => {
  const deps = Object.keys(pkg.dependencies ?? {});
  assert.deepEqual(deps, [], `runtime dependencies added: ${deps.join(', ')}`);
});

test('repository points at the canonical publishing repo', () => {
  assert.equal(pkg.repository.url, 'git+https://github.com/fanxor-dynamics/stoneai-cli.git');
});

test('license field points at the proprietary LICENSE file', () => {
  assert.equal(pkg.license, 'SEE LICENSE IN LICENSE');
  assert.ok(existsSync(join(root, 'LICENSE')), 'LICENSE file must exist');
  const license = readFileSync(join(root, 'LICENSE'), 'utf8');
  assert.match(license, /FanXora Innovation & Technology Group L\.L\.C\./, 'LICENSE must name FanXora as licensor/rights holder');
  assert.match(license, /FanXor Dynamics LLC/, 'LICENSE must name the authorized operator');
});

test('package is configured for public npm distribution', () => {
  assert.equal(pkg.private, false, 'private must be false for npm publishing');
  assert.equal(pkg.publishConfig?.access, 'public', 'scoped package must publish with public access');
});

test('canonical homepage is writteninstone.io', () => {
  assert.equal(pkg.homepage, 'https://writteninstone.io');
});

test('files allowlist ships the client and nothing else', () => {
  assert.deepEqual(
    [...pkg.files].sort(),
    ['LICENSE', 'README.md', 'SECURITY.md', 'bin', 'lib'],
  );
  assert.ok(!pkg.files.includes('test'), 'tests must never ship');
  assert.ok(!pkg.files.includes('.github'), 'workflows must never ship');
});

test('bin entry exists and is executable by node', () => {
  const binPath = join(root, pkg.bin.stoneai);
  assert.ok(existsSync(binPath), `bin target missing: ${pkg.bin.stoneai}`);
  assert.match(readFileSync(binPath, 'utf8'), /^#!\/usr\/bin\/env node/, 'bin needs a shebang');
});

test('engines floor is declared', () => {
  assert.ok(pkg.engines?.node, 'engines.node must be declared');
});
