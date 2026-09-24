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
// StoneAI CLI — command router. Thin, zero-dep, secure-by-default.
import { createInterface } from 'node:readline';
import { lookup as dnsLookup } from 'node:dns/promises';
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { load, set, configPath } from './config.js';
import { setSecret, getSecret, delSecret, storageInfo } from './keystore.js';
import { ensureDeviceKey, signPayload, hasDeviceKey } from './sign.js';
import { api } from './api.js';
import { openUrl } from './browser.js';

const G = (s) => `\x1b[38;5;179m${s}\x1b[0m`;   // gold
const C = (s) => `\x1b[38;5;80m${s}\x1b[0m`;    // cyan
const D = (s) => `\x1b[2m${s}\x1b[0m`;          // dim
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const GN = (s) => `\x1b[32m${s}\x1b[0m`;        // green
const Y = (s) => `\x1b[33m${s}\x1b[0m`;         // yellow
const out = (s = '') => process.stdout.write(s + '\n');

function prompt(q, { hidden = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) {
    const o = rl.output;
    rl._writeToOutput = (str) => { if (str.includes(q)) o.write(q); else o.write('*'); };
  }
  return new Promise((res) => rl.question(q, (a) => { rl.close(); if (hidden) out(''); res(a.trim()); }));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- cross-device continuity helpers ----
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / 604800)}w ago`;
}
function flagVal(args, flag) {
  const i = args.findIndex((a) => a === flag || a.startsWith(flag + '='));
  if (i === -1) return null;
  return args[i].includes('=') ? args[i].split('=').slice(1).join('=') : (args[i + 1] ?? null);
}
function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ---- spinner ----
const SPINNER_FRAMES = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
export function spinner(label) {
  let i = 0;
  const isTTY = !!process.stdout.isTTY;
  let id;
  if (isTTY) {
    id = setInterval(() => {
      process.stdout.write(`\r  ${G(SPINNER_FRAMES[i++ % SPINNER_FRAMES.length])} ${label}`);
    }, 80);
  }
  return {
    stop(icon = C('✓'), msg = label) {
      if (isTTY) {
        clearInterval(id);
        process.stdout.write(`\r  ${icon} ${msg}\n`);
      }
    },
  };
}

// ---- auth ----
async function login(args) {
  const withKey = args.includes('--with-key') || args.includes('-k');
  // 1) try device-code flow (RFC 8628)
  if (!withKey) {
    try {
      const dev = await api('/v1/auth/device', { method: 'POST', body: { device_key: ensureDeviceKey() } });
      const url = `${dev.verification_uri}?code=${encodeURIComponent(dev.user_code)}`;
      out('');
      out(`  ${G('StoneAI')} — confirm this device in your browser`);
      out(`  code:  ${C(dev.user_code)}`);
      out(`  ${D(url)}`);
      openUrl(url);
      out(D('  waiting for approval…'));
      const deadline = Date.now() + (dev.expires_in ?? 600) * 1000;
      const interval = (dev.interval ?? 5) * 1000;
      while (Date.now() < deadline) {
        await sleep(interval);
        try {
          const t = await api('/v1/auth/device/token', { method: 'POST', body: { device_code: dev.device_code } });
          if (t?.api_key) return finishLogin(t.api_key);
        } catch (e) {
          if (e.status && e.status !== 400 && e.payload?.error !== 'authorization_pending') throw e;
        }
      }
      throw new Error('device authorization timed out');
    } catch (e) {
      if (e.status !== 404) throw e;
      out(D('  (device login unavailable — falling back to API key)'));
    }
  }
  // 2) fallback: paste an API key (works against the existing bearer-key backend)
  const key = await prompt('  Paste your StoneAI API key: ', { hidden: true });
  if (!key) throw new Error('no key provided');
  return finishLogin(key);
}
async function finishLogin(key) {
  // validate the key before storing
  const stats = await api('/v1/stats', { token: key });
  const where = setSecret(key);
  ensureDeviceKey();
  out('');
  out(`  ${C('✓')} logged in ${D(`(key stored in ${where})`)}`);
  if (stats) out(D(`  decrees pending: ${stats.decreesPending ?? 0} · total: ${stats.decreesTotal ?? 0}`));
  out('');
}
function logout() { delSecret(); out(`  ${C('✓')} logged out — credentials cleared`); }

async function whoami() {
  if (!getSecret()) return out(D('  not logged in — run `stoneai login`'));
  const cfg = load();
  // Fetch stats and usage in parallel; usage may not be available on all plans.
  const [s, u] = await Promise.allSettled([api('/v1/stats'), api('/v1/usage')]);
  const stats = s.status === 'fulfilled' ? s.value : null;
  const usageData = u.status === 'fulfilled' ? u.value : null;

  const plan = usageData?.plan ?? usageData?.planId ?? stats?.plan ?? '—';
  const used = usageData?.used ?? usageData?.count ?? usageData?.decrees ?? stats?.decreesTotal ?? 0;
  const included = usageData?.included ?? usageData?.quota ?? '?';
  const overage = usageData?.overage ?? usageData?.overage_cents ?? 0;
  const overageStr = typeof overage === 'number' ? `$${(overage / 100).toFixed(2)} overage` : '';
  const planLine = `${plan} · ${used}/${included} decrees${overageStr ? ` · ${overageStr}` : ''}`;

  const storeInfo = storageInfo();
  const storageLabel = storeInfo.keychainBackend
    ? `OS keychain (${storeInfo.keychainBackend})`
    : 'encrypted file (~/.stoneai/cred.enc)';

  const deviceStatus = hasDeviceKey() ? 'Ed25519 key present' : 'no device key — run `stoneai login`';
  const tenant = stats?.tenantId ?? stats?.tenant ?? stats?.id ?? '—';

  out('');
  out(`  ${G('StoneAI')} · ${cfg.base_url}`);
  out(`  tenant   ${tenant}`);
  out(`  plan     ${planLine}`);
  out(`  device   ${deviceStatus}`);
  out(`  storage  ${storageLabel}`);
  out(`  status   ${C('connected')}`);
  out('');
}


// A decree created while every council seat is dead is still a valid (inert)
// decree, so it is not an error — but silently reporting "raised" hid a
// total provider outage behind 50 identical `hold` decrees. Surface it.
export function formatProviderDegradation(decree) {
  const evidence = Array.isArray(decree?.evidence) ? decree.evidence : [];
  const failures = evidence.find((e) => e?.type === 'provider_failures')?.failures;
  if (!Array.isArray(failures) || !failures.length) return '';
  const lines = failures.map(
    (f) => `    ${f.provider}:${f.model} → ${f.category}${f.status ? ` (HTTP ${f.status})` : ''}`,
  );
  return [`  council degraded — ${failures.length} seat(s) failed:`, ...lines].join('\n');
}
// ---- governance ----
async function decree(args) {
  const action = args.filter((a) => !a.startsWith('-')).join(' ');
  if (!action) throw new Error('usage: stoneai decree "<action>"');
  const spin = spinner('raising decree…');
  let d;
  try {
    d = await api('/v1/decrees', { method: 'POST', body: { domain: 'cli', truth: { action } } });
    spin.stop(C('⛓'), `decree raised ${G(short(d.id))}`);
  } catch (e) {
    spin.stop(R('✖'), e.message);
    throw e;
  }
  out(D(`  inert until a human signs the covenant`));
  const degraded = formatProviderDegradation(d);
  if (degraded) out(R(degraded));
  out(D(`  sign it:  stoneai covenant approve ${short(d.id)}`));
}
const STATUSES = ['pending', 'approved', 'denied'];

/** `--status <x>` or `--status=<x>`; validated here so a typo never silently lists everything. */
function statusFlag(args) {
  const i = args.findIndex((a) => a === '--status' || a.startsWith('--status='));
  if (i === -1) return null;
  const v = args[i].includes('=') ? args[i].split('=')[1] : args[i + 1];
  if (!v || v.startsWith('-')) throw new Error(`--status requires a value (${STATUSES.join(' | ')})`);
  if (!STATUSES.includes(v)) throw new Error(`unknown status "${v}" — expected ${STATUSES.join(', ')}`);
  return v;
}

async function decrees(args = []) {
  if (args[0] === 'archive') return archiveDecree(args.slice(1), args);
  if (args[0] === 'archive-denied') return archiveDenied(args);

  const status = statusFlag(args);
  const archived = args.includes('--archived');
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (archived) qs.set('archived', 'true');
  const list = await api(`/v1/decrees${qs.toString() ? `?${qs}` : ''}`);
  if (args.includes('--json')) return out(JSON.stringify(list ?? [], null, 2));
  if (!list?.length) {
    const what = [archived ? 'archived' : null, status].filter(Boolean).join(' ');
    return out(D(`  no ${what || ''} decrees`.replace('  ', ' ')));
  }
  for (const d of list) out(`  ${G(short(d.id))}  ${(d.status || 'pending').padEnd(8)}  ${d.action || d.domain || ''}`);
  if (!archived) out(D(`  ${list.length} shown ${D('· archived hidden — see `stoneai decrees --archived`')}`));
}

async function archiveDecree(rest, args) {
  const id = rest.find((a) => !a.startsWith('-'));
  if (!id) throw new Error('usage: stoneai decrees archive <decree-id>');
  const decree = await findDecree(id);
  const r = await api(`/v1/decrees/${decree.id}/archive`, { method: 'POST', body: {} });
  if (args.includes('--json')) return out(JSON.stringify(r, null, 2));
  out(`  ${C('✓')} archived ${G(short(decree.id))} ${D('— preserved, not deleted')}`);
}

async function archiveDenied(args) {
  const r = await api('/v1/decrees/archive-denied', { method: 'POST', body: {} });
  if (args.includes('--json')) return out(JSON.stringify(r, null, 2));
  const n = r?.archived ?? 0;
  if (!n) return out(D('  no denied decrees to archive'));
  out(`  ${C('✓')} archived ${G(n)} denied decree${n === 1 ? '' : 's'} ${D('— preserved, not deleted')}`);
}
/** Resolve a full or short/prefix decree id (incl. the displayed `abcd1234…ef01` form) to the decree. */
async function findDecree(id) {
  const raw = String(id).split('…')[0].toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw)) return { id: raw };
  const list = [...((await api('/v1/decrees')) || []), ...((await api('/v1/decrees?archived=true')) || [])];
  const hits = list.filter((d) => String(d.id).toLowerCase().startsWith(raw));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new Error(`ambiguous decree id ${raw} (${hits.length} matches) — use more characters`);
  throw new Error(`no such decree: ${raw}`);
}
async function covenant(args) {
  const [verb, id] = [args[0], args[1]];
  if (!['approve', 'deny', 'sign'].includes(verb) || !id) throw new Error('usage: stoneai covenant approve|deny <decree-id>');
  const decision = verb === 'deny' ? 'deny' : 'approve';
  const decree = await findDecree(id);
  const scope = decree.required_scope
    ?? ((await api('/v1/decrees')) || []).find((d) => d.id === decree.id)?.required_scope
    ?? 'GENERAL';
  const payload = `${decree.id}:${decision}`;
  const signature = signPayload(payload);
  const body = decision === 'approve'
    ? { approverId: 'cli', scope, signature, device_key: ensureDeviceKey() }
    : { approverId: 'cli', scope, reason: 'denied via CLI', signature, device_key: ensureDeviceKey() };
  const spin = spinner(`${decision === 'approve' ? 'signing' : 'denying'} covenant…`);
  try {
    await api(`/v1/decrees/${decree.id}/${decision}`, { method: 'POST', body });
    spin.stop(C('✓'), `covenant ${decision === 'approve' ? 'signed' : 'denied'} for ${G(short(decree.id))} ${D('(Ed25519, device-held)')}`);
  } catch (e) {
    spin.stop(R('✖'), e.message);
    throw e;
  }
}
async function audit() {
  const a = await api('/v1/audit');
  const rows = Array.isArray(a) ? a : (a.entries || []);
  if (!rows.length) return out(D('  ⛓ genesis — ledger empty'));
  for (const [i, e] of rows.entries())
    out(`  ${D(String(i).padStart(3))}  ${(e.event || e.type || 'event').padEnd(14)}  ${D(short(e.hash))}`);
}

export function formatUsageSummary(u) {
  const used = u?.used ?? u?.count ?? u?.decrees ?? 0;
  const plan = u?.plan ?? u?.planId ?? '—';
  const overage = u?.overage ?? u?.overage_cents ?? 0;
  return `  plan ${plan} · used ${used} · overage ${overage}`;
}

export function formatCliError(err) {
  const payload = err?.payload && typeof err.payload === 'object' ? err.payload : {};
  const code = payload.code || payload.error;

  // ---- quota errors ----
  if (code === 'stoneai_account_quota_exhausted' || payload.error === 'quota_exceeded') {
    const message = payload.message || err?.message || 'StoneAI account quota exhausted.';
    const used = payload.used ?? 'unknown';
    const included = payload.included ?? 'unknown';
    const plan = payload.plan ?? 'unknown';
    const request = payload.request_id ? `\n  request: ${payload.request_id}` : '';
    const upgrade = payload.upgrade_url ? `\n  action: upgrade at ${payload.upgrade_url}` : '';
    return `StoneAI account quota exhausted\n  reason: ${message}\n  plan: ${plan}\n  usage: ${used}/${included}${upgrade}${request}`;
  }

  // ---- upstream provider failures ----
  if (String(code || '').startsWith('upstream_provider_')) {
    const provider = payload.provider ? ` provider=${payload.provider}` : '';
    const model = payload.model ? ` model=${payload.model}` : '';
    return `StoneAI provider failure (${code})${provider}${model}\n  reason: ${payload.message || err?.message || 'provider request failed'}`;
  }

  // ---- auth errors ----
  const status = err?.status;
  if (status === 401 || status === 403 || code === 'unauthorized' || code === 'forbidden') {
    const msg = payload.message || err?.message || 'authentication required';
    const reqId = payload.request_id ? `\n  request: ${payload.request_id}` : '';
    return `✖ authentication error\n  reason: ${msg}\n  action: run \`stoneai login\`${reqId}`;
  }

  // ---- network / connectivity errors ----
  if (!status && err?.message && /cannot reach|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(err.message)) {
    return `✖ network error\n  reason: ${err.message}\n  action: run \`stoneai doctor\` to diagnose`;
  }

  // ---- generic structured error with enrichment ----
  const icon = '✖';
  const codeStr = code ? `\n  code:    ${code}` : '';
  const actionStr = payload.action ? `\n  action:  ${payload.action}` : '';
  const reqStr = payload.request_id ? `\n  request: ${payload.request_id}` : '';
  const msg = payload.message || err?.message || String(err);
  if (codeStr || actionStr || reqStr) {
    return `${icon} ${msg}${codeStr}${actionStr}${reqStr}`;
  }

  return err?.message || String(err);
}

// ---- billing ----
async function usage() {
  const u = await api('/v1/usage');
  out(formatUsageSummary(u));
}
async function plans() {
  const p = await api('/v1/plans');
  const list = Array.isArray(p) ? p : (p.plans || []);
  for (const x of list) {
    const base = (x.base_cents ?? x.baseCents ?? 0) / 100;
    const inc = x.included_decrees ?? x.includedDecrees ?? '—';
    const over = x.overage_cents_per_decree ?? x.overageCents ?? 0;
    const name = x.name || x.code || x.id || '?';
    out(`  ${G((x.code || name).padEnd(11))} $${base.toFixed(2)}/mo · ${C(inc)} decrees${over ? D(` · +${over}¢/overage`) : ''}`);
  }
}
async function upgrade(args) {
  const plan = args.find((a) => !a.startsWith('-')) || 'starter';
  const flagIdx = args.findIndex((a) => a === '--method' || a === '-m');
  const requested = flagIdx !== -1 ? args[flagIdx + 1] : undefined;
  const { methods = [] } = await api('/v1/checkout/methods');
  if (!methods.length) return out(R('  no payment methods are currently available'));
  if (requested && !methods.includes(requested)) {
    out(R(`  unsupported method: ${requested}`));
    return out(D(`  available: ${methods.join(', ')}`));
  }
  const method = requested || methods[0];
  const s = await api('/v1/checkout/session', { method: 'POST', body: { method, plan } });
  const url = s.approve_url || s.url || s.checkout_url;
  if (!url) return out(R('  no checkout url returned'));
  out(`  opening ${G(method)} checkout for the ${G(plan)} plan…`);
  if (methods.length > 1 && !requested) out(D(`  other methods: ${methods.filter((m) => m !== method).join(', ')} (--method <name>)`));
  openUrl(url);
  out(D(`  ${url}`));
}

// ---- Esther first-party intelligence ----
async function esther(args = []) {
  const promptText = args.filter((a) => !a.startsWith('-')).join(' ').trim();
  if (!promptText) {
    const info = await api('/v1/esther');
    out(`  ${G('Esther')} · ${info.role || 'first-party sovereign intelligence'}`);
    out(`  model ${C(info.model || 'esther')} · controller ${G(info.controller || 'StoneAI')}`);
    out(D(`  ${info.authorityRule || 'INTELLIGENCE DOES NOT CREATE AUTHORITY'}`));
    out(D('  ask: stoneai esther "your question"'));
    return;
  }
  const spin = spinner('consulting Esther…');
  let r;
  try {
    r = await api('/v1/esther/chat', { method: 'POST', body: { prompt: promptText } });
    spin.stop(G('✓'), `Esther ${D('· ' + (r.model || 'esther') + ' · governed by StoneAI')}`);
  } catch (e) {
    spin.stop(R('✖'), e.message);
    throw e;
  }
  out('');
  // Streaming: if response has a stream field or content is chunked, emit line by line.
  const content = String(r.content || r.text || r.answer || '');
  if (r.stream && Array.isArray(r.stream)) {
    for (const chunk of r.stream) process.stdout.write(String(chunk));
    out('');
  } else {
    out(content);
  }
  out('');
  if (r.advisoryOnly) out(D('  advisory intelligence · consequential action still requires Stone authority'));
}

// ---- Intelligence Fabric / governed model registry ----
function adminToken(args = []) {
  const i = args.findIndex((a) => a === '--admin-token');
  const inline = args.find((a) => a.startsWith('--admin-token='));
  const token = inline ? inline.slice('--admin-token='.length) : (i >= 0 ? args[i + 1] : process.env.STONEAI_ADMIN_TOKEN);
  if (!token) throw new Error('admin token required: set STONEAI_ADMIN_TOKEN or pass --admin-token <token>');
  return token;
}
async function intelligence(args = []) {
  const sub = args.find((a) => !a.startsWith('-')) || 'status';
  // Tenant-facing Intelligence Fabric capabilities use the authenticated
  // control-plane contract. HF census/admin operations remain separately gated.
  if (sub === 'capabilities' || sub === 'fabric') {
    const r = await api('/intelligence-fabric/capabilities');
    return out(JSON.stringify(r, null, 2));
  }
  const token = adminToken(args);
  const headers = { 'x-admin-token': token };
  if (sub === 'scan') {
    const r = await api('/v1/admin/hf-nexus/scan', { method: 'POST', headers });
    return out(JSON.stringify(r, null, 2));
  }
  if (sub === 'assets') {
    const stateArg = args.find((a) => a.startsWith('--state='));
    const kindArg = args.find((a) => a.startsWith('--kind='));
    const qs = new URLSearchParams();
    if (stateArg) qs.set('state', stateArg.split('=')[1]);
    if (kindArg) qs.set('kind', kindArg.split('=')[1]);
    const r = await api('/v1/admin/hf-nexus/assets' + (qs.size ? '?' + qs : ''), { headers });
    return out(JSON.stringify(r, null, 2));
  }
  if (sub === 'routes' || sub === 'tools') {
    const r = await api('/v1/admin/hf-nexus/' + sub, { headers });
    return out(JSON.stringify(r, null, 2));
  }
  if (sub === 'state') {
    const key = args[1], state = args[2];
    if (!key || !state) throw new Error('usage: stoneai intelligence state <asset-key> <EVALUATING|APPROVED|ACTIVE|DEPRECATED|REJECTED>');
    const r = await api('/v1/admin/hf-nexus/assets/state', { method: 'POST', headers, body: { key, state } });
    return out(JSON.stringify(r, null, 2));
  }
  const r = await api('/v1/admin/hf-nexus', { headers });
  out(`  ${G('Stone Intelligence Fabric')} · governed discovery`);
  out(`  total ${C(r.total ?? 0)} · quarantined ${r.byState?.QUARANTINED ?? 0} · evaluating ${r.byState?.EVALUATING ?? 0} · approved ${r.byState?.APPROVED ?? 0} · active ${r.byState?.ACTIVE ?? 0}`);
  out(D('  discovery is never permission; promotion remains explicitly governed'));
}

// ---- capability registry ----
function capStatus(status) {
  switch (String(status || '').toUpperCase()) {
    case 'PRODUCTION': return GN('PRODUCTION');
    case 'BETA':       return C('BETA');
    case 'PREVIEW':    return Y('PREVIEW');
    case 'PLANNED':    return D('PLANNED');
    default:           return String(status || '—');
  }
}

async function capabilities(args = []) {
  const manifestId = flagVal(args, '--manifest');
  if (manifestId) {
    const spin = spinner(`fetching manifest for ${manifestId}…`);
    let m;
    try {
      m = await api(`/v1/capabilities/${encodeURIComponent(manifestId)}/manifest`);
      spin.stop(C('✓'), `manifest ${G(manifestId)}`);
    } catch (e) {
      spin.stop(R('✖'), e.message);
      throw e;
    }
    out('');
    out(`  ${G('Surface distribution manifest')} · ${manifestId}`);
    out('');
    out(JSON.stringify(m, null, 2).replace(/^/gm, '  '));
    out('');
    return;
  }

  // Specific capability ID (non-flag, non-option arg that looks like an id)
  const specificId = args.find((a) => !a.startsWith('-') && a.includes('.'));
  if (specificId) {
    const spin = spinner(`fetching capability ${specificId}…`);
    let cap;
    try {
      cap = await api(`/v1/capabilities/${encodeURIComponent(specificId)}`);
      spin.stop(C('✓'), `capability ${G(specificId)}`);
    } catch (e) {
      spin.stop(R('✖'), e.message);
      throw e;
    }
    out('');
    out(`  ${G(cap.title || cap.id || specificId)} ${D('·')} ${capStatus(cap.status)}`);
    out(D(`  id: ${cap.id || specificId}`));
    if (cap.description) out(`\n  ${cap.description}`);
    const section = (title, items) => {
      if (!items?.length) return;
      out('');
      out(`  ${G(title)}:`);
      for (const item of items) out(`    ${D('·')} ${item}`);
    };
    section('API paths', cap.apiPaths);
    section('CLI commands', cap.cliCommands);
    section('Permissions', cap.permissions);
    section('Governance', cap.governance);
    section('Evidence', cap.evidence);
    if (cap.caveats?.length) {
      out('');
      out(`  ${Y('Caveats')}:`);
      for (const c of cap.caveats) out(`    ${Y('!')} ${c}`);
    }
    out('');
    return;
  }

  if (args.includes('--json')) {
    const data = await api('/v1/capabilities');
    return out(JSON.stringify(data, null, 2));
  }

  const spin = spinner('loading capability registry…');
  let data;
  try {
    data = await api('/v1/capabilities');
    spin.stop(C('✓'), 'capability registry loaded');
  } catch (e) {
    spin.stop(R('✖'), e.message);
    throw e;
  }

  const list = Array.isArray(data) ? data : (data?.capabilities || data?.items || []);
  if (!list.length) return out(D('  no capabilities found'));
  out('');
  out(`  ${'ID'.padEnd(28)} ${'STATUS'.padEnd(12)} TITLE`);
  out(`  ${'─'.repeat(28)} ${'─'.repeat(12)} ${'─'.repeat(30)}`);
  for (const cap of list) {
    const id = (cap.id || '—').padEnd(28);
    const st = (cap.status || '—').padEnd(12);
    const stColored = capStatus(cap.status).padEnd(12 + (capStatus(cap.status).length - (cap.status || '—').length));
    const title = cap.title || cap.name || '—';
    out(`  ${G(id)} ${stColored} ${title}`);
  }
  out('');
  out(D(`  ${list.length} capabilities`));
  out('');
}

// ---- diagnostics ----
function modeOf(path) {
  try { return statSync(path).mode & 0o777; } catch { return null; }
}

async function doctor(args = []) {
  const json = args.includes('--json');
  const cfg = load();
  const checks = [];
  const check = (name, ok, detail) => { checks.push({ name, ok, detail }); return ok; };

  check('cli install', true, `stoneai ${version} (node ${process.version})`);
  const dirMode = modeOf(join(homedir(), '.stoneai'));
  check('local state directory', dirMode !== null, dirMode === null ? '~/.stoneai not created yet (created on first login)' : `~/.stoneai mode ${dirMode.toString(8)}${dirMode === 0o700 ? '' : ' (expected 0700)'}`);
  check('base url configured', !!cfg.base_url, cfg.base_url || '(none — set with `stoneai config set base_url <url>`)');

  let host = null;
  try { host = new URL(cfg.base_url).hostname; } catch { /* invalid URL */ }
  if (host) {
    try {
      const addr = await dnsLookup(host);
      check('DNS resolves', true, `${host} → ${addr.address}`);
    } catch (e) {
      check('DNS resolves', false, `${host}: ${e.message}`);
    }
  } else {
    check('DNS resolves', false, 'no valid host in base_url');
  }

  let reachable = false, healthBody = null;
  try {
    const res = await fetch(cfg.base_url + '/health', { signal: AbortSignal.timeout(8000) });
    reachable = true;
    check('HTTPS/TLS', true, 'certificate chain verified by the platform trust store');
    healthBody = await res.json().catch(() => null);
    check('backend reachable', res.ok, `HTTP ${res.status}`);
  } catch (e) {
    const tlsFailure = /certificate|SSL|TLS/i.test(e.message);
    check('HTTPS/TLS', !tlsFailure, tlsFailure ? e.message : 'not reached (see backend reachable)');
    check('backend reachable', false, e.message);
  }
  check('API compatibility (/health contract)', reachable && healthBody?.status === 'ok' && healthBody?.service === 'stoneai',
    healthBody ? JSON.stringify(healthBody) : 'unavailable — backend unreachable');

  const authed = !!getSecret();
  check('authentication', true, authed ? 'credential present' : 'not logged in — run `stoneai login`');
  if (authed && reachable) {
    try { await api('/v1/stats'); check('credential validity', true, 'accepted by the API'); }
    catch (e) { check('credential validity', false, e.message); }
  }

  const store = storageInfo();
  check('credential storage', true, `${store.activeBackend}${store.keychainBackend ? ` (keychain backend: ${store.keychainBackend})` : ' (no OS keychain on this platform)'}`);
  check('device key (Ed25519 covenant signing)', true, hasDeviceKey() ? 'present, encrypted at rest' : 'not yet generated — created on first `stoneai login`');

  const allOk = checks.every((c) => c.ok);
  if (json) return out(JSON.stringify({ ok: allOk, checks }, null, 2));

  out('');
  out(`  ${G('StoneAI doctor')}`);
  for (const c of checks) out(`  ${c.ok ? C('✓') : R('×')} ${c.name.padEnd(34)} ${D(c.detail)}`);
  out('');
  out(allOk ? `  ${C('all checks passed')}` : `  ${R('some checks failed')} — see × above`);
  if (!allOk) process.exitCode = 1;
}

// ---- cross-device continuity ----
async function sessions(args) {
  const list = await api('/v1/sessions');
  const rows = Array.isArray(list) ? list : (list?.sessions || []);
  if (!rows.length) return out(D('  no active sessions'));
  out('');
  out('  Active Sessions:');
  out('');
  for (const s of rows) {
    const dot = s.current ? C('●') : D('○');
    const idle = (s.status === 'idle' || s.idle) ? D(' (idle)') : '';
    out(`  ${dot} ${G(short(s.id))}  ${(s.surface || '—').padEnd(8)}  ${(s.platform || '—').padEnd(14)}  ${(s.name || '—').padEnd(16)}  ${D(timeAgo(s.last_seen || s.updated_at))}${idle}`);
  }
  out('');
  out(`  ${C('●')} = current session  ${D('○')} = other surface`);
}
async function resume(args) {
  const id = args.find((a) => !a.startsWith('-'));
  if (!id) throw new Error('usage: stoneai resume <session-id>');
  const r = await api(`/v1/sessions/${id}/resume`, { method: 'POST', body: {} });
  out(`  ${C('✓')} resumed session ${G(short(id))}`);
  if (r?.context) {
    out('');
    out(D('  context merged:'));
    out('  ' + JSON.stringify(r.context, null, 2).replace(/\n/g, '\n  '));
  }
  if (r?.mission) out(D(`  active mission: ${short(r.mission.id)} — ${r.mission.title || ''}`));
}
async function handoff(args) {
  if (args[0] === 'accept') {
    const code = args[1];
    if (!code) throw new Error('usage: stoneai handoff accept <code>');
    const r = await api('/v1/handoffs/accept', { method: 'POST', body: { code } });
    out(`  ${C('✓')} handoff accepted — session ${G(short(r.session_id || r.id))} resumed`);
    if (r?.context) out(D(`  context: ${JSON.stringify(r.context)}`));
    return;
  }
  const surface = args.find((a) => !a.startsWith('-'));
  if (!surface) throw new Error('usage: stoneai handoff <surface>  (web | desktop | mobile)');
  const r = await api('/v1/handoffs', { method: 'POST', body: { to: surface, from: 'cli' } });
  const code = r.code || r.pickup_code || '????';
  const from = r.from_label || 'CLI (macos-arm64)';
  const to = surface.charAt(0).toUpperCase() + surface.slice(1);
  const w = 39;
  const row = (t) => `  ║${t.padEnd(w)}║`;
  out('');
  out(`  ╔${'═'.repeat(w)}╗`);
  out(row('  HANDOFF CREATED'));
  out(row(''));
  out(row(`  From: ${from}`));
  out(row(`  To:   ${to}`));
  out(row(`  Code: ${code}`));
  out(row(''));
  out(row('  Open writteninstone.io/handoff'));
  out(row('  Enter code to continue'));
  out(`  ╚${'═'.repeat(w)}╝`);
  out('');
}
async function projects(args) {
  const list = await api('/v1/projects');
  const workspaces = Array.isArray(list) ? list : (list?.workspaces || []);
  if (!workspaces.length) return out(D('  no workspaces found'));
  out('');
  out('  Workspaces:');
  out('');
  for (const ws of workspaces) {
    out(`  📁 ${ws.name || ws.id || 'unnamed'}`);
    for (const p of (ws.projects || [])) out(`     └── 📂 ${p.name || p.id}`);
  }
}
async function missions(args = []) {
  const status = flagVal(args, '--status');
  const workspace = flagVal(args, '--workspace');
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (workspace) qs.set('workspace', workspace);
  const list = await api(`/v1/missions${qs.size ? '?' + qs : ''}`);
  const rows = Array.isArray(list) ? list : (list?.missions || []);
  if (!rows.length) return out(D('  no missions found'));
  out('');
  out('  Missions:');
  out('');
  const statusIcon = (s) => ({ running: '🟢', paused: '🟡', completed: '✅', failed: '❌' }[s] || '⚪');
  for (const m of rows) {
    const name = (m.title || m.name || short(m.id)).padEnd(20);
    const surface = (m.surface || '—').padEnd(6);
    const time = timeAgo(m.updated_at || m.created_at);
    const detail = m.detail || (m.status === 'running' ? `${m.jobs ?? 0} jobs running` : m.status);
    out(`  ${statusIcon(m.status)} ${name}  ${D(surface)}  ${time.padEnd(8)}  ${D(detail || '—')}`);
  }
}
async function mission(args = []) {
  if (args[0] === 'create') {
    const rest = args.slice(1);
    const project = flagVal(rest, '--project');
    const workspace = flagVal(rest, '--workspace');
    const title = rest.filter((a) => !a.startsWith('-')).join(' ');
    if (!title) throw new Error('usage: stoneai mission create <title> [--project <id>] [--workspace <id>]');
    const body = { title };
    if (project) body.project_id = project;
    if (workspace) body.workspace_id = workspace;
    const m = await api('/v1/missions', { method: 'POST', body });
    out(`  ${C('✓')} mission created ${G(short(m.id))} — ${m.title || title}`);
    return;
  }
  if (!args[0]) throw new Error('usage: stoneai mission create <title>  |  stoneai mission <id>');
  const m = await api(`/v1/missions/${args[0]}`);
  out('');
  out(`  ${G(m.title || short(m.id))} ${D('· ' + (m.status || 'unknown'))}`);
  out(D(`  id: ${m.id}`));
  if (m.checkpoints?.length) {
    out('');
    out('  Checkpoints:');
    for (const cp of m.checkpoints) out(`    ${G(short(cp.id))}  ${(cp.label || '—').padEnd(20)}  ${D(timeAgo(cp.created_at))}`);
  }
  if (m.jobs?.length) {
    out('');
    out('  Jobs:');
    for (const j of m.jobs) out(`    ${(j.status || '—').padEnd(10)}  ${j.name || short(j.id)}  ${D(timeAgo(j.updated_at))}`);
  }
  if (m.artifacts?.length) {
    out('');
    out('  Artifacts:');
    for (const a of m.artifacts) out(`    ${(a.name || '—').padEnd(20)}  ${D(a.kind || 'file')}  ${D(timeAgo(a.created_at))}`);
  }
  if (m.turns?.length) out(D(`\n  turns: ${m.turns.length}`));
  out('');
}
async function checkpoint(args = []) {
  if (args[0] === 'restore') {
    const missionId = args[1], checkpointId = args[2];
    if (!missionId || !checkpointId) throw new Error('usage: stoneai checkpoint restore <mission-id> <checkpoint-id>');
    await api(`/v1/missions/${missionId}/checkpoints/${checkpointId}/restore`, { method: 'POST', body: {} });
    out(`  ${C('✓')} mission ${G(short(missionId))} restored from checkpoint ${G(short(checkpointId))}`);
    return;
  }
  const missionId = args.find((a) => !a.startsWith('-'));
  if (!missionId) throw new Error('usage: stoneai checkpoint <mission-id> [--label <label>]');
  const label = flagVal(args, '--label');
  const cp = await api(`/v1/missions/${missionId}/checkpoints`, { method: 'POST', body: label ? { label } : {} });
  out(`  ${C('✓')} checkpoint ${G(short(cp.id || cp.checkpoint_id))}${label ? ` — ${label}` : ''} saved for mission ${G(short(missionId))}`);
}
async function artifacts(args = []) {
  const missionId = flagVal(args, '--mission');
  const projectId = flagVal(args, '--project');
  const kind = flagVal(args, '--kind');
  const qs = new URLSearchParams();
  if (missionId) qs.set('mission_id', missionId);
  if (projectId) qs.set('project_id', projectId);
  if (kind) qs.set('kind', kind);
  const list = await api(`/v1/artifacts${qs.size ? '?' + qs : ''}`);
  const rows = Array.isArray(list) ? list : (list?.artifacts || []);
  if (!rows.length) return out(D('  no artifacts found'));
  out('');
  out('  Artifacts:');
  out('');
  const kindIcon = (k) => ({ report: '📊', image: '🖼️', screenshot: '🖼️' }[k] || '📄');
  for (const a of rows) {
    const name = (a.name || '—').padEnd(20);
    const k = (a.kind || 'file').padEnd(8);
    const mLabel = (a.mission_title || (a.mission_id ? short(a.mission_id) : '—')).padEnd(16);
    out(`  ${kindIcon(a.kind)} ${name}  ${D(k)}  ${formatSize(a.size).padEnd(8)}  ${mLabel}  ${D(timeAgo(a.created_at))}`);
  }
}
async function devices(args) {
  const list = await api('/v1/devices');
  const rows = Array.isArray(list) ? list : (list?.devices || []);
  if (!rows.length) return out(D('  no devices registered'));
  out('');
  out('  Devices:');
  out('');
  for (const d of rows) {
    const isCurrent = d.current || d.is_current;
    const dot = isCurrent ? C('●') : D('○');
    const name = (d.name || '—').padEnd(20);
    const surface = (d.surface || d.type || '—').padEnd(8);
    const platform = (d.platform || '—').padEnd(14);
    const time = timeAgo(d.last_seen || d.updated_at);
    const suffix = isCurrent ? D(' (this device)') : (d.status === 'revoked' ? D(' (revoked)') : '');
    out(`  ${dot} ${name}  ${surface}  ${platform}  ${D(time)}${suffix}`);
  }
}

// ---- surface distribution ----
async function distribution(args = []) {
  const isJson  = args.includes('--json');
  const gapsOnly = args.includes('--gaps');

  const spin = spinner('fetching surface distribution…');
  let data;
  try {
    data = await api('/v1/distribution');
    spin.stop(C('✓'), 'distribution report loaded');
  } catch (e) {
    spin.stop(R('✖'), e.message);
    throw e;
  }

  if (isJson) return out(JSON.stringify(data, null, 2));

  if (gapsOnly) {
    const gaps = data.gaps || [];
    if (!gaps.length) return out(D('  no surface gaps found'));
    out('');
    for (const g of gaps) {
      out(`  ${Y('⚠')} ${G(g.capabilityId)} ${D('(' + g.status + ')')} — missing: ${g.missing.join(', ')}`);
    }
    out('');
    return;
  }

  const total = data.totalCapabilities || 0;
  const bar = (count) => {
    if (!total) return D('░'.repeat(20));
    const filled = Math.round((count / total) * 20);
    return G('█'.repeat(filled)) + D('░'.repeat(20 - filled));
  };
  const pct = (count) => {
    const p = total ? Math.round((count / total) * 100) : 0;
    return `${p}%`.padStart(4);
  };

  const cov = data.coverage || {};
  const bs  = data.byStatus  || {};

  out('');
  out(`  ${G('Surface Distribution Report')}`);
  out(`  ${D('─'.repeat(27))}`);
  out(`  Capabilities:  ${total}`);
  const statuses = ['PRODUCTION', 'BETA', 'PREVIEW', 'PLANNED'];
  const statusLine = statuses
    .filter((s) => bs[s] != null)
    .map((s) => `${capStatus(s)}: ${String(bs[s]).padStart(2)}`)
    .join('   ');
  out(`  ${statusLine}`);
  out('');
  out(`  ${G('Surface Coverage:')}`);
  const covRow = (label, count) =>
    out(`    ${label.padEnd(16)} ${String(count).padStart(2)}/${total}  ${bar(count)} ${pct(count)}`);
  covRow('API paths:', cov.withApiPaths ?? 0);
  covRow('CLI commands:', cov.withCliCommands ?? 0);
  covRow('Web surfaces:', cov.withWebSurfaces ?? 0);
  covRow('Documentation:', cov.withDocs ?? 0);
  covRow('Telemetry:', cov.withTelemetry ?? 0);
  const gaps = data.gaps || [];
  if (gaps.length) {
    out('');
    out(`  ${Y('Gaps')} ${D('(' + gaps.length + ')')}:`);
    for (const g of gaps) {
      out(`  ${Y('⚠')} ${G(g.capabilityId)} ${D('(' + g.status + ')')} — missing: ${g.missing.join(', ')}`);
    }
  }
  out('');
}

// ---- config / help ----
function config(args) {
  const [verb, k, v] = args;
  if (verb === 'set' && k && v) { set(k, v); return out(`  ${C('✓')} ${k} = ${v}`); }
  if (verb === 'path') return out('  ' + configPath);
  const c = load(); delete c.api_key;
  out('  ' + JSON.stringify(c, null, 2).replace(/\n/g, '\n  '));
}
function help() {
  out(`
  ${G('StoneAI')} — the Covenant Engine ${D('· writteninstone.io')}

  ${G('stoneai')} login              browser sign-in (or --with-key to paste)
          logout             clear credentials
          whoami             current tenant, plan, device key, storage backend
          decree "<action>"  raise a decree (inert until signed)
          decrees            list decrees ${D('(--status pending|approved|denied, --archived, --json)')}
          decrees archive <id>        archive one decree ${D('(preserved, never deleted)')}
          decrees archive-denied      archive every denied decree
          covenant approve <id> | deny <id>   sign the covenant (Ed25519, device-held)
          audit              the hash-chained ledger
          usage | plans      metering + subscription tiers
          upgrade [plan] [--method <m>]   open checkout to subscribe
          esther ["prompt"]  Esther first-party intelligence through StoneAI governance
          intelligence [capabilities|status|scan|assets|routes|tools|state]   governed AI registry + fabric
          capabilities [id] [--json] [--manifest <id>]   browse the capability registry
          distribution [--json] [--gaps]   surface distribution report and coverage gaps
          doctor [--json]    diagnose CLI, network, TLS, auth, and local state
          config [set k v]   base_url etc.

  ${G('Cross-device continuity:')}
          sessions           list active sessions across all surfaces
          resume <id>        resume a session from another surface
          handoff <surface>  create a handoff to web|desktop|mobile
          handoff accept <code>   accept an incoming handoff
          devices            list registered devices

  ${G('Projects & missions:')}
          projects           list workspaces and projects
          missions [--status <s>] [--workspace <id>]   list missions
          mission <id>       show mission detail (checkpoints, jobs, artifacts, turns)
          mission create <title> [--project <id>] [--workspace <id>]
          checkpoint <mission-id> [--label <label>]   save a checkpoint
          checkpoint restore <mission-id> <checkpoint-id>
          artifacts [--mission <id>] [--project <id>] [--kind <kind>]

  ${G('Interactive mode:')}
          stoneai            (no args, TTY) — launches interactive REPL
          /decree, /whoami, /capabilities, /help, /exit  — slash commands in REPL
          @<capability-id>   — expands to \`capabilities <id>\` in REPL

          --version | --help
`);
}

// ---- interactive REPL ----
const REPL_COMMANDS = [
  'decree', 'decrees', 'covenant', 'audit', 'usage', 'plans', 'upgrade',
  'esther', 'intelligence', 'capabilities', 'caps', 'distribution', 'dist',
  'doctor', 'config', 'whoami', 'sessions', 'resume', 'handoff', 'devices',
  'projects', 'missions', 'mission', 'checkpoint', 'artifacts', 'help', 'logout', 'exit',
];

function replHelp() {
  out('');
  out(`  ${G('StoneAI')} interactive commands:`);
  out(`  ${D('Type a command (with or without leading /)  ·  @<capability-id> looks up a capability')}`);
  out('');
  for (const cmd of REPL_COMMANDS) out(`    /${cmd}`);
  out('');
  out(`  ${D('/exit  ·  Ctrl+D  ·  Ctrl+C  — exit')}`);
  out('');
}

function fuzzyMatch(input, candidates) {
  const lower = input.toLowerCase();
  // exact prefix match
  const prefix = candidates.filter((c) => c.startsWith(lower));
  if (prefix.length) return prefix[0];
  // longest common characters
  const scored = candidates.map((c) => {
    let score = 0, j = 0;
    for (let i = 0; i < lower.length && j < c.length; i++) {
      if (lower[i] === c[j]) { score++; j++; }
    }
    return { c, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored[0]?.c ?? null;
}

async function interactiveRepl() {
  out('');
  out(`  ${G('StoneAI')} ${C('·')} ${D('writteninstone.io')}  ${D('v' + version)}`);
  out(`  ${D('Type a command, /help for a list, /exit or Ctrl+D to quit.')}`);

  // compact status line — best-effort, don't block startup
  if (getSecret()) {
    api('/v1/stats').then((s) => {
      if (s) out(D(`  decrees pending ${s.decreesPending ?? 0} · approved ${s.decreesApproved ?? 0} · ${load().base_url}`));
    }).catch(() => {});
  } else {
    out(D('  not logged in — run /login'));
  }
  out('');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: G('stoneai') + C('❯') + ' ',
  });
  rl.prompt();

  rl.on('line', async (line) => {
    rl.pause();
    const raw = line.trim();
    if (!raw) { rl.resume(); rl.prompt(); return; }

    // @<capability-id> shorthand
    if (raw.startsWith('@')) {
      const capId = raw.slice(1);
      try { await capabilities([capId]); } catch (e) { out(R(`  ✖ ${formatCliError(e)}`)); }
      rl.resume(); rl.prompt(); return;
    }

    // ? shorthand for help
    if (raw === '?') { replHelp(); rl.resume(); rl.prompt(); return; }

    // strip optional leading slash
    const input = raw.startsWith('/') ? raw.slice(1) : raw;
    const [cmd, ...args] = input.split(/\s+/);

    if (cmd === 'exit' || cmd === 'quit') { out(D('  bye')); rl.close(); process.exit(0); }

    if (REPL_COMMANDS.includes(cmd) || cmd === 'login') {
      try {
        await run([cmd, ...args]);
      } catch (e) {
        out(R(`  ✖ ${formatCliError(e)}`));
      }
    } else {
      const suggestion = fuzzyMatch(cmd, REPL_COMMANDS);
      out(R(`  unknown command: ${cmd}`) + (suggestion ? ` ${D(`— did you mean /${suggestion}?`)}` : ''));
    }

    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => { out(D('\n  bye')); process.exit(0); });
}

const version = '0.2.0';
export async function run(argv) {
  const [cmd, ...args] = argv;
  if (argv.includes('--version') || argv.includes('-v') || cmd === 'version') return out('  stoneai ' + version);
  switch (cmd) {
    case 'login': return login(args);
    case 'logout': return logout();
    case 'whoami': return whoami();
    case 'decree': return decree(args);
    case 'decrees': return decrees(args);
    case 'covenant': return covenant(args);
    case 'audit': return audit();
    case 'usage': return usage();
    case 'plans': return plans();
    case 'upgrade': return upgrade(args);
    case 'esther': return esther(args);
    case 'intelligence':
    case 'models': return intelligence(args);
    case 'capabilities':
    case 'caps': return capabilities(args);
    case 'distribution':
    case 'dist': return distribution(args);
    case 'doctor': return doctor(args);
    case 'config': return config(args);
    case 'sessions': return sessions(args);
    case 'resume': return resume(args);
    case 'handoff': return handoff(args);
    case 'projects': return projects(args);
    case 'missions': return missions(args);
    case 'mission': return mission(args);
    case 'checkpoint': return checkpoint(args);
    case 'artifacts': return artifacts(args);
    case 'devices': return devices(args);
    case undefined:
      // Enter interactive REPL only when stdin is a real TTY.
      if (process.stdin.isTTY) return interactiveRepl();
      return help();
    case 'help':
    case '--help':
    case '-h': return help();
    default: out(R(`  unknown command: ${cmd}`)); return help();
  }
}
function short(h) { h = String(h || ''); return h.length > 14 ? h.slice(0, 8) + '…' + h.slice(-4) : h; }
