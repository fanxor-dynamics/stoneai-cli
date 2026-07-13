// gate() — SDK helper implementing the Covenant Model in one call:
// raise a decree, wait for a HUMAN to sign the covenant, then (and only then) act.
//   await gate(api, () => deploy(), { domain: 'deploy', truth: { action: 'recsys-v1' } })
// `client` is the repo's api() function (path, { method, body }) — or any drop-in stub.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {(path: string, opts?: object) => Promise<*>} client  StoneAI API client (lib/api.js `api`)
 * @param {() => *} fn  the gated action — runs ONLY on approval
 * @param {{domain: string, truth: object, approverId?: string, scope?: string,
 *          pollMs?: number, timeoutMs?: number}} opts
 *   approverId/scope are advisory metadata (approval itself is signed human-side).
 * @returns {Promise<*>} fn()'s result on approval
 * @throws Error('decree denied') | Error('approval timeout')
 */
export async function gate(client, fn, {
  domain, truth, approverId, scope, pollMs = 2000, timeoutMs = 300_000,
} = {}) {
  if (typeof client !== 'function') throw new Error('gate: client must be a function');
  if (typeof fn !== 'function') throw new Error('gate: fn must be a function');

  const d = await client('/v1/decrees', { method: 'POST', body: { domain, truth } });
  const id = d?.id ?? d?.decreeId;
  if (!id) throw new Error('gate: decree creation returned no id');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // the client is a bare function (no per-decree getter) — poll the list endpoint
    const list = await client('/v1/decrees');
    const rows = Array.isArray(list) ? list : (list?.decrees ?? list?.rows ?? []);
    const status = rows.find((r) => r.id === id)?.status;
    if (status === 'approved') return await fn();
    if (status === 'denied') throw new Error('decree denied');
    await sleep(pollMs);
  }
  throw new Error('approval timeout');
}
