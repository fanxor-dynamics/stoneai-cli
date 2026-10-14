// Behavior test: JSON signup is reachable end-to-end through bin/stoneai.js.
//
// Hermetic by construction: the child gets a temporary HOME, keychain writes
// are disabled (STONEAI_DISABLE_KEYCHAIN=1), and STONEAI_BASE_URL points at a
// loopback node:http mock server owned by this test — no real network, no
// keychain, no secrets.

import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const cliPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'stoneai.js');

let tempHome;
let server;
let serverPort;
let requests = [];

before(async () => {
  tempHome = await mkdtemp(join(tmpdir(), 'stoneai-signup-'));

  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body ? JSON.parse(body) : null,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          apiKey: 'test-api-key-signup',
          tenantId: 'tenant-signup',
          verifyEmailSent: false,
        },
      }));
    });
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => { serverPort = server.address().port; resolve(); });
  });
});

after(async () => {
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
});

/** Run the real CLI (bin/stoneai.js) in a child process against the mock server. */
function runCli(args, { stdin = '' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        HOME: tempHome,
        STONEAI_BASE_URL: `http://127.0.0.1:${serverPort}`,
        STONEAI_DISABLE_KEYCHAIN: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('CLI child timed out after 20s'));
    }, 20_000);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.stdin.on('error', () => {}); // tolerate EPIPE if the child exits early
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

test("signup is reachable via run(['--json','signup',--email,--company,--password-stdin]) with no Authorization header", async () => {
  requests = [];

  const result = await runCli([
    '--json',
    'signup',
    '--email', 'user@example.com',
    '--company', 'Example Corp',
    '--password-stdin',
  ], { stdin: 'signup-test-password\n' });

  assert.strictEqual(result.code, 0, `exit ${result.code}; stderr: ${result.stderr}`);

  // stdout must be exactly one parseable JSON document.
  const output = JSON.parse(result.stdout);
  assert.strictEqual(output.authenticated, true);
  assert.strictEqual(output.tenant, 'tenant-signup');
  assert.strictEqual(output.verifyEmailSent, false);
  assert.strictEqual(output.storage, 'encrypted-file');

  assert.strictEqual(requests.length, 1, 'expected exactly one API request');
  const req = requests[0];
  assert.strictEqual(req.method, 'POST');
  assert.strictEqual(req.url, '/v1/signup');
  assert.strictEqual(req.headers.authorization, undefined,
    'signup is auth:false and must never send an Authorization header');
  assert.strictEqual(req.body.email, 'user@example.com');
  assert.strictEqual(req.body.company, 'Example Corp');
  assert.strictEqual(req.body.password, 'signup-test-password');
});
