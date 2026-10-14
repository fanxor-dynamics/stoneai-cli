// Behavior test: legacy plaintext secrets in ~/.stoneai/config.json are
// migrated out on load (config.js strips unknown keys and rewrites the file).
//
// In-process with a temporary HOME. No keychain, no network, no real secrets.

import { test, after } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempHome = await mkdtemp(join(tmpdir(), 'stoneai-config-'));
process.env.HOME = tempHome;
delete process.env.STONEAI_BASE_URL;

const dir = join(tempHome, '.stoneai');
await mkdir(dir, { recursive: true, mode: 0o700 });

const LEGACY_SECRET = 'legacy-plaintext-key-do-not-keep';
const configFile = join(dir, 'config.json');
await writeFile(configFile, JSON.stringify({
  base_url: 'https://writteninstone.io',
  tenant: 'acme',
  device_label: 'laptop',
  api_key: LEGACY_SECRET,   // legacy plaintext credential
  token: LEGACY_SECRET,     // legacy plaintext credential
}, null, 2), { mode: 0o600 });

// Import AFTER HOME is set so config.js resolves paths under the temp HOME.
const config = await import('../lib/config.js');

after(async () => {
  const { rm } = await import('node:fs/promises');
  await rm(tempHome, { recursive: true, force: true });
});

test('load() strips legacy plaintext secrets from the in-memory config', () => {
  const cfg = config.load();
  assert.strictEqual(cfg.api_key, undefined, 'api_key must not survive load()');
  assert.strictEqual(cfg.token, undefined, 'token must not survive load()');
  assert.strictEqual(cfg.base_url, 'https://writteninstone.io');
  assert.strictEqual(cfg.tenant, 'acme');
  assert.strictEqual(cfg.device_label, 'laptop');
});

test('load() rewrites config.json on disk without the legacy secrets', async () => {
  config.load(); // trigger the migration rewrite
  const raw = await readFile(configFile, 'utf8');
  assert.ok(!raw.includes('api_key'), 'api_key must be removed from disk');
  assert.ok(!raw.includes(LEGACY_SECRET), 'legacy secret must not remain on disk');
  const parsed = JSON.parse(raw);
  assert.deepStrictEqual(Object.keys(parsed).sort(), ['base_url', 'device_label', 'tenant']);
});

test('rewritten config.json keeps mode 0600', async () => {
  const { mode } = await stat(configFile);
  assert.strictEqual(mode & 0o777, 0o600);
});

test('set() refuses to write credential-like keys back into plaintext config', () => {
  assert.throws(() => config.set('api_key', 'x'), /not a writable config value/);
  assert.throws(() => config.set('token', 'x'), /not a writable config value/);
});
