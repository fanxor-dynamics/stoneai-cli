/*
 * © 2026 FanXora Innovation & Technology Group L.L.C. All rights reserved.
 *
 * StoneAI™ is proprietary technology of FanXora Innovation & Technology Group L.L.C.
 * FanXor Dynamics LLC operates StoneAI™ under authorization.
 *
 * Access and use are restricted to authorized users, approved business purposes,
 * and applicable agreements. Unauthorized copying, disclosure, modification,
 * redistribution, sublicensing, or circumvention of security controls is prohibited.
 * Reverse engineering is prohibited except where such restriction is expressly
 * prohibited by applicable law.
 *
 * FANXORA RESTRICTED · PROPRIETARY TECHNOLOGY
 */
// Minimal API client. Sends Bearer key from the SECURE keystore; unwraps the
// StoneAI {success,data} envelope. Keys are never read from plaintext config.
import { load } from './config.js';
import { getSecret } from './keystore.js';

export async function api(path, { method = 'GET', body, token } = {}) {
  const cfg = load();
  const key = token ?? getSecret();
  const headers = { 'content-type': 'application/json' };
  if (key) headers.authorization = `Bearer ${key}`;

  let res;
  try {
    res = await fetch(cfg.base_url + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new Error(`cannot reach StoneAI at ${cfg.base_url} (${e.message})`);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) {
    const j = await res.json();
    if (j && typeof j === 'object' && 'success' in j) {
      if (!res.ok || j.success === false) {
        const msg = j.error || j.message || `HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.payload = j;
        throw err;
      }
      return j.data;
    }
    if (!res.ok) {
      const err = new Error(j.error || j.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.payload = j;
      throw err;
    }
    return j;
  }

  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${text.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  return text;
}
