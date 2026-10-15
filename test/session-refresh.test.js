// Behavior tests for session token refresh semantics in lib/api.js.
//
// In-process with a temporary HOME and a loopback node:http mock server.
// The keychain is disabled so credential storage is deterministic (encrypted
// file under the temp HOME). No real network, no keychain, no secrets.
//
// Ordering matters: the mock server must be listening and STONEAI_BASE_URL
// set BEFORE lib/api.js (→ lib/config.js) is imported, because config.js
// captures the base URL at module load.

import { test, after } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const tempHome = await mkdtemp(join(tmpdir(), 'stoneai-refresh-'));
process.env.HOME = tempHome;
process.env.STONEAI_DISABLE_KEYCHAIN = '1';

let requests = [];
let handler = (res) => {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'no handler configured' }));
};

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body ? JSON.parse(body) : null,
    });
    handler(res);
  });
});
await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve());
});
process.env.STONEAI_BASE_URL = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await rm(tempHome, { recursive: true, force: true });
});

// Import AFTER HOME and STONEAI_BASE_URL are set so paths/env are honored.
const { api } = await import('../lib/api.js');
const { setAuth, getAuth } = await import('../lib/keystore.js');

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

test('401 triggers exactly one refresh, retry uses new token, refresh carries no Authorization header', async () => {
  requests = [];
  let refreshCalls = 0;

  setAuth({ accessToken: 'expired-access', refreshToken: 'valid-refresh' });

  handler = (res) => {
    const last = requests[requests.length - 1];
    if (last.url === '/v1/sessions/refresh') {
      refreshCalls++;
      return json(res, 200, {
        success: true,
        data: { token: 'new-access', refreshToken: 'new-refresh' },
      });
    }
    if (last.headers.authorization === 'Bearer new-access') {
      return json(res, 200, { success: true, data: { ok: true } });
    }
    return json(res, 401, { error: 'token expired' });
  };

  const result = await api('/v1/data');

  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(refreshCalls, 1, 'must refresh exactly once');
  assert.strictEqual(requests.length, 3, 'original + refresh + retry');

  // Refresh request must not carry Authorization.
  const refreshReq = requests.find((r) => r.url === '/v1/sessions/refresh');
  assert.strictEqual(refreshReq.headers.authorization, undefined,
    'refresh must not send Authorization header');
  assert.strictEqual(refreshReq.body.refreshToken, 'valid-refresh');

  // Retry must use the new access token.
  const retryReq = requests[requests.length - 1];
  assert.strictEqual(retryReq.headers.authorization, 'Bearer new-access');

  // Rotated tokens must be persisted.
  const auth = getAuth();
  assert.strictEqual(auth.accessToken, 'new-access');
  assert.strictEqual(auth.refreshToken, 'new-refresh');
});

test('empty or non-string refresh response preserves the existing refresh token', async () => {
  requests = [];
  setAuth({ accessToken: 'expired-access-2', refreshToken: 'preserve-this-refresh' });

  handler = (res) => {
    const last = requests[requests.length - 1];
    if (last.url === '/v1/sessions/refresh') {
      return json(res, 200, {
        success: true,
        data: {
          token: 'new-access-2',
          refreshToken: '',
          refresh_token: 42,
        },
      });
    }
    if (last.headers.authorization === 'Bearer new-access-2') {
      return json(res, 200, { success: true, data: { ok: true } });
    }
    return json(res, 401, { error: 'token expired' });
  };

  assert.deepStrictEqual(await api('/v1/data'), { ok: true });
  assert.strictEqual(getAuth().refreshToken, 'preserve-this-refresh');
});

test('401 without refreshToken does not attempt refresh and surfaces the original error', async () => {
  requests = [];
  setAuth({ accessToken: 'expired-no-refresh' });

  handler = (res) => json(res, 401, { error: 'token expired' });

  await assert.rejects(
    () => api('/v1/data'),
    (err) => err.status === 401,
    'should reject with 401',
  );
  assert.strictEqual(requests.length, 1, 'must not call refresh endpoint');
});

test('401 on the refresh endpoint itself surfaces the original error without retry loop', async () => {
  requests = [];
  setAuth({ accessToken: 'expired-access', refreshToken: 'also-expired' });

  handler = (res) => json(res, 401, { error: 'invalid refresh token' });

  await assert.rejects(
    () => api('/v1/data'),
    (err) => err.status === 401,
    'should reject with 401 from refresh',
  );
  // Original request + refresh attempt, but no third retry.
  assert.strictEqual(requests.length, 2, 'must not retry after failed refresh');
});

test('explicit token parameter bypasses the stored credential and skips refresh on 401', async () => {
  requests = [];
  setAuth({ accessToken: 'stored-access', refreshToken: 'stored-refresh' });

  handler = (res) => json(res, 401, { error: 'explicit token invalid' });

  await assert.rejects(
    () => api('/v1/data', { token: 'one-shot-token' }),
    (err) => err.status === 401,
    'should reject with 401',
  );
  // Only one request: the explicit-token call itself; no refresh, no retry.
  assert.strictEqual(requests.length, 1);
  assert.strictEqual(requests[0].headers.authorization, 'Bearer one-shot-token');
});
