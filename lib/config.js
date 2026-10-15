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
// Local config store: ~/.stoneai/config.json (chmod 600). Stores non-secret configuration only; credentials belong in secure storage.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';

const DIR = join(homedir(), '.stoneai');
const FILE = join(DIR, 'config.json');

// Canonical StoneAI host. Override with STONEAI_BASE_URL or `stoneai config set base_url <url>`.
const DEFAULT_BASE = process.env.STONEAI_BASE_URL || 'https://writteninstone.io';
const SAFE_KEYS = new Set(['base_url', 'tenant', 'device_label']);

function validBaseUrl(value) {
  try {
    const url = new URL(value);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password) return null;
    if (url.protocol !== 'https:' && !localHttp) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function sanitize(cfg = {}) {
  const safe = { base_url: validBaseUrl(cfg.base_url) || validBaseUrl(DEFAULT_BASE) || 'https://writteninstone.io' };
  for (const key of ['tenant', 'device_label']) {
    if (typeof cfg[key] === 'string' && cfg[key]) safe[key] = cfg[key];
  }
  return safe;
}

export function load() {
  if (!existsSync(FILE)) return sanitize();
  try {
    const raw = JSON.parse(readFileSync(FILE, 'utf8'));
    const safe = sanitize(raw);
    // Remove legacy plaintext secrets and unknown keys on the next read.
    if (raw && typeof raw === 'object' && Object.keys(raw).some((key) => !SAFE_KEYS.has(key))) save(safe);
    return safe;
  } catch {
    return sanitize();
  }
}

export function save(cfg) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(FILE, JSON.stringify(sanitize(cfg), null, 2) + '\n', { mode: 0o600 });
  try { chmodSync(FILE, 0o600); } catch { /* best-effort */ }
}

export function set(key, value) {
  if (!SAFE_KEYS.has(key)) throw new Error(`${key} is not a writable config value; credentials belong in secure storage`);
  if (key === 'base_url') {
    const normalized = validBaseUrl(value);
    if (!normalized) throw new Error('base_url must use HTTPS, contain no credentials, and use HTTP only for localhost');
    value = normalized;
  }
  const cfg = load();
  cfg[key] = value;
  save(cfg);
  return cfg;
}

export function clearAuth() {
  const cfg = load();
  delete cfg.api_key;
  delete cfg.tenant;
  save(cfg);
}

export const configPath = FILE;
