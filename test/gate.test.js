// Hermetic tests for gate() — the client is a stub function, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate } from '../lib/gate.js';

// stub client: records calls; scripted list responses per poll
function stubClient({ statuses, id = 'dec_42' }) {
  const calls = [];
  let poll = 0;
  const client = async (path, opts = {}) => {
    calls.push({ path, ...opts });
    if (path === '/v1/decrees' && opts.method === 'POST') return { id };
    if (path === '/v1/decrees') {
      const status = statuses[Math.min(poll++, statuses.length - 1)];
      return [{ id: 'other', status: 'pending' }, { id, status }];
    }
    throw new Error(`unexpected path ${path}`);
  };
  return { client, calls };
}

test('approved → runs fn and returns its result', async () => {
  const { client, calls } = stubClient({ statuses: ['pending', 'pending', 'approved'] });
  let ran = 0;
  const result = await gate(client, async () => { ran++; return 'deployed'; }, {
    domain: 'cli', truth: { action: 'ship it' }, pollMs: 5,
  });
  assert.equal(result, 'deployed');
  assert.equal(ran, 1);
  assert.deepEqual(calls[0], { path: '/v1/decrees', method: 'POST', body: { domain: 'cli', truth: { action: 'ship it' } } });
  assert.equal(calls.filter((c) => !c.method).length, 3); // three polls of the list
});

test('denied → throws "decree denied", fn never runs', async () => {
  const { client } = stubClient({ statuses: ['pending', 'denied'] });
  let ran = 0;
  await assert.rejects(
    gate(client, () => { ran++; }, { domain: 'cli', truth: {}, pollMs: 5 }),
    /decree denied/,
  );
  assert.equal(ran, 0);
});

test('never resolved → throws "approval timeout", fn never runs', async () => {
  const { client } = stubClient({ statuses: ['pending'] });
  let ran = 0;
  await assert.rejects(
    gate(client, () => { ran++; }, { domain: 'cli', truth: {}, pollMs: 10, timeoutMs: 40 }),
    /approval timeout/,
  );
  assert.equal(ran, 0);
});

test('decree creation without an id → error', async () => {
  await assert.rejects(
    gate(async () => ({}), () => {}, { domain: 'cli', truth: {} }),
    /no id/,
  );
});

test('accepts {decrees:[...]} envelope from the list endpoint', async () => {
  const client = async (path, opts = {}) => {
    if (opts.method === 'POST') return { decreeId: 'dec_9' };
    return { decrees: [{ id: 'dec_9', status: 'approved' }] };
  };
  assert.equal(await gate(client, () => 'ok', { domain: 'x', truth: {}, pollMs: 5 }), 'ok');
});

test('argument validation', async () => {
  await assert.rejects(gate(null, () => {}, {}), /client must be a function/);
  await assert.rejects(gate(async () => ({}), null, {}), /fn must be a function/);
});
