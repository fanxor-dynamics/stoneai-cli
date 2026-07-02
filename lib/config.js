// Local config store: ~/.stoneai/config.json (chmod 600). Holds base_url + api_key.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';

const DIR = join(homedir(), '.stoneai');
const FILE = join(DIR, 'config.json');

// Canonical StoneAI host. Override with STONEAI_BASE_URL or `stoneai config set base_url <url>`.
const DEFAULT_BASE = process.env.STONEAI_BASE_URL || 'https://stoneai.fanz.website';

export function load() {
  if (!existsSync(FILE)) return { base_url: DEFAULT_BASE };
  try {
    const cfg = JSON.parse(readFileSync(FILE, 'utf8'));
    return { base_url: DEFAULT_BASE, ...cfg };
  } catch {
    return { base_url: DEFAULT_BASE };
  }
}

export function save(cfg) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  try { chmodSync(FILE, 0o600); } catch { /* best-effort */ }
}

export function set(key, value) {
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
