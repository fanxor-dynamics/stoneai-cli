/*
 * Copyright (c) 2026 Joshua Stone. All Rights Reserved.
 *
 * StoneAI is proprietary and confidential technology owned by Joshua Stone
 * and exclusively licensed to FanXora Innovation & Technology Group LLC.
 * FanXor Dynamics LLC is an authorized technology operator.
 *
 * Unauthorized access, copying, disclosure, modification, reverse engineering,
 * redistribution, sublicensing, or use is prohibited except as expressly
 * authorized in writing.
 *
 * FANXORA RESTRICTED: CROWN-JEWEL TECHNOLOGY
 */
// Client-side covenant signing. A device Ed25519 keypair is generated locally; the
// PRIVATE key never leaves this machine (encrypted at rest). Covenant approvals are
// signed here — the human's consent is cryptographic and device-held, per the
// Covenant Model. The public key is registered with StoneAI so signatures verify.
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import {
  generateKeyPairSync, sign as edSign, createPrivateKey, createPublicKey,
  createCipheriv, createDecipheriv, randomBytes, scryptSync,
} from 'node:crypto';

const DIR = join(homedir(), '.stoneai');
const KEYF = join(DIR, 'device.key.enc');
const SALTF = join(DIR, '.mkey');

function ensureDir() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 }); }
function keyMaterial() {
  ensureDir();
  let salt;
  if (existsSync(SALTF)) salt = readFileSync(SALTF);
  else { salt = randomBytes(32); writeFileSync(SALTF, salt, { mode: 0o600 }); chmodSync(SALTF, 0o600); }
  return scryptSync(hostname() + ':stoneai-device', salt, 32);
}
function encWrite(pem) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const ct = Buffer.concat([c.update(pem, 'utf8'), c.final()]);
  writeFileSync(KEYF, Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64'), { mode: 0o600 });
  chmodSync(KEYF, 0o600);
}
function encRead() {
  if (!existsSync(KEYF)) return null;
  const raw = Buffer.from(readFileSync(KEYF, 'utf8'), 'base64');
  const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
  const d = createDecipheriv('aes-256-gcm', keyMaterial(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

/** Ensure a device keypair exists. Returns the public key (base64 SPKI DER). */
export function ensureDeviceKey() {
  let privPem = encRead();
  if (!privPem) {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    encWrite(privPem);
  }
  const pub = createPublicKey(createPrivateKey(privPem));
  return pub.export({ type: 'spki', format: 'der' }).toString('base64');
}

/** Sign an arbitrary string with the device key. Returns base64 signature. */
export function signPayload(data) {
  const privPem = encRead();
  if (!privPem) throw new Error('no device key — run `stoneai login` first');
  const sig = edSign(null, Buffer.from(data, 'utf8'), createPrivateKey(privPem));
  return sig.toString('base64');
}
