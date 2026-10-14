// Behavior test: --json login with --with-key --key-stdin produces a single parseable JSON document.
//
// Hermetic: child process with temporary HOME, keychain disabled, loopback
// node:http mock server. No real network, no keychain, no secrets.

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
  tempHome = await mkdtemp(join(tmpdir(), 'stoneai-login-'));

  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers });
      // Mock /v1/stats validation endpoint used by finishLogin.
      if (req.url === '/v1/stats' && req.headers.authorization === 'Bearer test-api-key-login') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: { tenantId: 'tenant-login', decreesPending: 2, decreesTotal: 5 },
        }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid key' }));
      }
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
    child.stdin.on('error', () => {});
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

test('--json login with --with-key --key-stdin emits exactly one parseable JSON document', async () => {
  requests = [];

  const result = await runCli([
    '--json',
    'login',
    '--with-key',
    '--key-stdin',
  ], { stdin: 'test-api-key-login\n' });

  assert.strictEqual(result.code, 0, `exit ${result.code}; stderr: ${result.stderr}`);

  // stdout must be a single JSON document (no interleaved progress lines).
  const output = JSON.parse(result.stdout);
  assert.strictEqual(output.authenticated, true);
  assert.strictEqual(output.tenant, 'tenant-login');
  assert.strictEqual(output.storage, 'encrypted-file');
});
