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
import { getAuth, setAuth } from './keystore.js';

function apiError(status, payload, fallback = `HTTP ${status}`) {
  const message = payload && typeof payload === 'object'
    ? (payload.error || payload.message || fallback)
    : fallback;
  const err = new Error(message);
  err.status = status;
  err.payload = payload;
  return err;
}

async function decodeResponse(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return res.json();
  return res.text();
}

async function request(baseUrl, path, { method, body, token, headers: extraHeaders = {} }) {
  const headers = { 'content-type': 'application/json', ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new Error(`cannot reach StoneAI at ${baseUrl} (${e.message})`);
  }
  const payload = await decodeResponse(res);
  if (!res.ok) throw apiError(res.status, payload);
  return payload;
}

function unwrap(payload, status = 200) {
  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (payload.success === false) throw apiError(status, payload);
    return payload.data;
  }
  return payload;
}

export async function api(path, { method = 'GET', body, token, headers, auth: authenticated = true } = {}) {
  const cfg = load();
  const explicitToken = token !== undefined || !authenticated;
  const authRecord = getAuth();
  const accessToken = authenticated ? (token ?? authRecord?.accessToken) : token;

  try {
    const payload = await request(cfg.base_url, path, { method, body, token: accessToken, headers });
    return unwrap(payload);
  } catch (err) {
    // Session tokens are rotated exactly once after expiry. API keys and
    // explicitly supplied validation tokens never trigger refresh.
    if (
      err.status !== 401
      || explicitToken
      || !authRecord?.refreshToken
      || path === '/v1/sessions/refresh'
    ) throw err;

    let refreshed;
    try {
      refreshed = unwrap(await request(cfg.base_url, '/v1/sessions/refresh', {
        method: 'POST',
        body: { refreshToken: authRecord.refreshToken },
      }));
    } catch {
      throw err;
    }
    const nextAccess = refreshed?.token ?? refreshed?.access_token;
    const nextRefresh = refreshed?.refreshToken ?? refreshed?.refresh_token ?? authRecord.refreshToken;
    if (typeof nextAccess !== 'string' || !nextAccess) throw err;
    setAuth({ accessToken: nextAccess, refreshToken: nextRefresh });
    const retryPayload = await request(cfg.base_url, path, {
      method, body, token: nextAccess, headers,
    });
    return unwrap(retryPayload);
  }
}
