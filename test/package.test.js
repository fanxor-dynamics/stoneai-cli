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

// SECURITY.md: "Zero runtime dependencies. No third-party packages → no
// supply-chain attack surface."
test('zero runtime dependencies', () => {
  const deps = Object.keys(pkg.dependencies ?? {});
  assert.deepEqual(deps, [], `runtime dependencies added: ${deps.join(', ')}`);
});

// npm provenance is rejected when package.json `repository` does not match the
// repository publishing the package, case-sensitively.
test('repository points at the canonical publishing repo', () => {
  assert.equal(pkg.repository.url, 'git+https://github.com/fanxor-dynamics/stoneai-cli.git');
});

// The package is proprietary. "UNLICENSED" renders as a bare badge on npm and
// implies no terms exist; "SEE LICENSE IN LICENSE" is the SPDX form that points
// readers at the actual grant.
test('license field points at the proprietary LICENSE file', () => {
  assert.equal(pkg.license, 'SEE LICENSE IN LICENSE');
  assert.ok(existsSync(join(root, 'LICENSE')), 'LICENSE file must exist');
  const license = readFileSync(join(root, 'LICENSE'), 'utf8');
  assert.match(license, /FanXor Dynamics LLC/, 'LICENSE must name the owning entity');
});

// The package is NOT published to the public registry. c643ab4 deliberately
// swapped `publishConfig.access: public` for `private: true` in the same pass
// that declared the code proprietary crown-jewel technology — npm refuses to
// publish a private package, which is the point. This test pins that posture so
// a future red-CI cleanup can't quietly restore public publishing; flipping it
// back is a distribution decision, not a test fix.
test('proprietary package is withheld from the public registry', () => {
  assert.equal(pkg.private, true, 'private:true is what blocks `npm publish`');
  assert.equal(pkg.publishConfig?.access, undefined, 'must not re-declare public access');
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
