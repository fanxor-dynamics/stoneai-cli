// Hermetic tests for the offline Receipt v1 verifier. No network: the fixture is
// SIGNED locally with a freshly generated Ed25519 keypair (@noble/ed25519, same lib
// the server uses) and the chain hash is computed with node:crypto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ed from '@noble/ed25519';
import { verifyReceipt } from '../lib/verify.js';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest();
const sha256hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'stoneai.js');

/** Build a mathematically valid Receipt v1 with a locally generated keypair. */
async function makeReceipt() {
  const priv = ed.utils.randomPrivateKey();
  const pub = ed.etc.bytesToHex(await ed.getPublicKeyAsync(priv));
  const contentHash = sha256hex('the governed content');
  const approval = {
    tenantId: 'ten_1', decreeId: 'dec_1', approverId: 'human_1', scope: 'PRODUCTION',
    contentHash, nonce: 'nonce_1', expiry: 1783000000000,
  };
  const msg = sha256(JSON.stringify([
    approval.tenantId, approval.decreeId, approval.approverId, approval.scope,
    approval.contentHash, approval.nonce, approval.expiry,
  ]));
  approval.signature = ed.etc.bytesToHex(await ed.signAsync(msg, priv));
  const chain = { eventType: 'covenant.approved', payload: { decreeId: 'dec_1' }, prevHash: '0'.repeat(64) };
  chain.entryHash = sha256hex(JSON.stringify({
    tenantId: 'ten_1', eventType: chain.eventType, payload: chain.payload, prev: chain.prevHash,
  }));
  return {
    receipt: {
      v: 1, tenantId: 'ten_1', decreeId: 'dec_1', contentHash, decision: 'approved',
      approval, pubKey: pub, chain, anchor: null,
    },
    pub,
  };
}

test('valid receipt → all three flags true', async () => {
  const { receipt } = await makeReceipt();
  const r = await verifyReceipt(receipt);
  assert.equal(r.sigValid, true);
  assert.equal(r.boundToDecree, true);
  assert.equal(r.chainValid, true);
  assert.equal(r.valid, true);
  assert.equal(r.decision, 'approved');
  assert.equal(r.decreeId, 'dec_1');
  assert.equal(r.expiry, 1783000000000);
});

test('tampered receipt.contentHash → boundToDecree flips, signature still valid', async () => {
  const { receipt } = await makeReceipt();
  receipt.contentHash = sha256hex('swapped content');
  const r = await verifyReceipt(receipt);
  assert.equal(r.boundToDecree, false);
  assert.equal(r.sigValid, true);
  assert.equal(r.chainValid, true);
  assert.equal(r.valid, false);
});

test('tampered approval field (scope) → sigValid flips', async () => {
  const { receipt } = await makeReceipt();
  receipt.approval.scope = 'GOD_MODE';
  const r = await verifyReceipt(receipt);
  assert.equal(r.sigValid, false);
  assert.equal(r.boundToDecree, true);
  assert.equal(r.chainValid, true);
  assert.equal(r.valid, false);
});

test('tampered chain.payload → chainValid flips', async () => {
  const { receipt } = await makeReceipt();
  receipt.chain.payload = { decreeId: 'dec_1', injected: true };
  const r = await verifyReceipt(receipt);
  assert.equal(r.chainValid, false);
  assert.equal(r.sigValid, true);
  assert.equal(r.boundToDecree, true);
  assert.equal(r.valid, false);
});

test('pubkeyOverride wins over embedded pubKey', async () => {
  const { receipt, pub } = await makeReceipt();
  const other = ed.etc.bytesToHex(await ed.getPublicKeyAsync(ed.utils.randomPrivateKey()));
  const wrong = await verifyReceipt(receipt, { pubkeyOverride: other });
  assert.equal(wrong.sigValid, false);
  assert.equal(wrong.valid, false);
  // and even with a forged embedded key, the true published key verifies
  receipt.pubKey = other;
  const pinned = await verifyReceipt(receipt, { pubkeyOverride: pub });
  assert.equal(pinned.sigValid, true);
  assert.equal(pinned.valid, true);
});

test('garbage signature hex → sigValid false, no throw', async () => {
  const { receipt } = await makeReceipt();
  receipt.approval.signature = 'zz-not-hex';
  const r = await verifyReceipt(receipt);
  assert.equal(r.sigValid, false);
  assert.equal(r.valid, false);
});

test('malformed input → {valid:false, error}', async () => {
  for (const bad of [null, 42, 'x', [], {}, { approval: {} }]) {
    const r = await verifyReceipt(bad);
    assert.equal(r.valid, false);
    assert.equal(typeof r.error, 'string');
  }
});

// ---- CLI exit codes (spawns the bin; still offline) ----
const runCli = (args, input) => new Promise((res) => {
  const p = execFile(process.execPath, [BIN, ...args], (err, stdout, stderr) =>
    res({ code: err?.code ?? 0, stdout, stderr }));
  if (input != null) { p.stdin.end(input); }
});

test('cli: exit 0 on valid, 1 on invalid, 2 on malformed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stoneai-verify-'));
  const { receipt } = await makeReceipt();

  const good = join(dir, 'good.json');
  writeFileSync(good, JSON.stringify(receipt));
  assert.equal((await runCli(['verify', good])).code, 0);

  const tampered = { ...receipt, contentHash: sha256hex('evil') };
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify(tampered));
  assert.equal((await runCli(['verify', bad])).code, 1);

  const junk = join(dir, 'junk.json');
  writeFileSync(junk, 'not json {');
  assert.equal((await runCli(['verify', junk])).code, 2);

  assert.equal((await runCli(['verify', join(dir, 'missing.json')])).code, 2);
});

test('cli: reads stdin with "-" and honors --pubkey', async () => {
  const { receipt, pub } = await makeReceipt();
  const ok = await runCli(['verify', '-', '--pubkey', pub], JSON.stringify(receipt));
  assert.equal(ok.code, 0);
  const other = ed.etc.bytesToHex(await ed.getPublicKeyAsync(ed.utils.randomPrivateKey()));
  const bad = await runCli(['verify', '-', '--pubkey', other], JSON.stringify(receipt));
  assert.equal(bad.code, 1);
});

test('cli: warns about embedded-key trust only when no --pubkey given', async () => {
  const { receipt, pub } = await makeReceipt();
  const dir = mkdtempSync(join(tmpdir(), 'stoneai-verify-'));
  const f = join(dir, 'r.json');
  writeFileSync(f, JSON.stringify(receipt));
  const noPin = await runCli(['verify', f]);
  assert.match(noPin.stdout, /embedded pubKey/);
  const pinned = await runCli(['verify', f, '--pubkey', pub]);
  assert.doesNotMatch(pinned.stdout, /embedded pubKey/);
});
