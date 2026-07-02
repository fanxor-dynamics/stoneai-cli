// Secure credential storage. Priority:
//   1. OS keychain  (macOS `security`, Linux `secret-tool`)  — zero-dep, hardware-backed where available
//   2. AES-256-GCM encrypted file  (~/.stoneai/cred.enc, key in ~/.stoneai/.mkey chmod 600)
// Plaintext is never used. Secrets are never logged.
import { execFileSync } from 'node:child_process';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const DIR = join(homedir(), '.stoneai');
const ENC = join(DIR, 'cred.enc');
const MKEY = join(DIR, '.mkey');
const SERVICE = 'stoneai-cli';
const ACCOUNT = 'default';

function ensureDir() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 }); }
function quiet(fn) { try { return fn(); } catch { return null; } }

// ---- OS keychain backends ----
function keychainSet(secret) {
  if (process.platform === 'darwin') {
    return quiet(() => {
      execFileSync('security', ['add-generic-password', '-a', ACCOUNT, '-s', SERVICE, '-w', secret, '-U'],
        { stdio: 'ignore' });
      return true;
    });
  }
  if (process.platform === 'linux') {
    return quiet(() => {
      execFileSync('secret-tool', ['store', '--label=StoneAI CLI', 'service', SERVICE, 'account', ACCOUNT],
        { input: secret, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    });
  }
  return null;
}
function keychainGet() {
  if (process.platform === 'darwin') {
    return quiet(() =>
      execFileSync('security', ['find-generic-password', '-a', ACCOUNT, '-s', SERVICE, '-w'],
        { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null);
  }
  if (process.platform === 'linux') {
    return quiet(() =>
      execFileSync('secret-tool', ['lookup', 'service', SERVICE, 'account', ACCOUNT],
        { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null);
  }
  return null;
}
function keychainDel() {
  if (process.platform === 'darwin')
    quiet(() => execFileSync('security', ['delete-generic-password', '-a', ACCOUNT, '-s', SERVICE], { stdio: 'ignore' }));
  if (process.platform === 'linux')
    quiet(() => execFileSync('secret-tool', ['clear', 'service', SERVICE, 'account', ACCOUNT], { stdio: 'ignore' }));
}

// ---- encrypted-file fallback ----
function machineKey() {
  ensureDir();
  let salt;
  if (existsSync(MKEY)) salt = readFileSync(MKEY);
  else { salt = randomBytes(32); writeFileSync(MKEY, salt, { mode: 0o600 }); chmodSync(MKEY, 0o600); }
  return scryptSync(hostname() + ':stoneai', salt, 32);
}
function encSet(secret) {
  ensureDir();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', machineKey(), iv);
  const ct = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  const blob = Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
  writeFileSync(ENC, blob, { mode: 0o600 }); chmodSync(ENC, 0o600);
  return true;
}
function encGet() {
  if (!existsSync(ENC)) return null;
  return quiet(() => {
    const raw = Buffer.from(readFileSync(ENC, 'utf8'), 'base64');
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
    const d = createDecipheriv('aes-256-gcm', machineKey(), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  });
}

// ---- public API ----
export function setSecret(secret) {
  if (keychainSet(secret)) return 'keychain';
  encSet(secret); return 'encrypted-file';
}
export function getSecret() {
  return keychainGet() ?? encGet();
}
export function delSecret() {
  keychainDel();
  quiet(() => { if (existsSync(ENC)) writeFileSync(ENC, '', { mode: 0o600 }); });
}
