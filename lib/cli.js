// StoneAI CLI — command router. Thin, zero-dep, secure-by-default.
import { createInterface } from 'node:readline';
import { load, set, configPath } from './config.js';
import { setSecret, getSecret, delSecret } from './keystore.js';
import { ensureDeviceKey, signPayload } from './sign.js';
import { api } from './api.js';
import { openUrl } from './browser.js';

const G = (s) => `\x1b[38;5;179m${s}\x1b[0m`;   // gold
const C = (s) => `\x1b[38;5;80m${s}\x1b[0m`;    // cyan
const D = (s) => `\x1b[2m${s}\x1b[0m`;          // dim
const R = (s) => `\x1b[31m${s}\x1b[0m`;
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
  const s = await api('/v1/stats');
  out(`  ${G('StoneAI')} · ${load().base_url}`);
  out(D(`  decrees pending ${s.decreesPending ?? 0} · approved ${s.decreesApproved ?? 0} · total ${s.decreesTotal ?? 0}`));
}

// ---- governance ----
async function decree(args) {
  const action = args.filter((a) => !a.startsWith('-')).join(' ');
  if (!action) throw new Error('usage: stoneai decree "<action>"');
  const d = await api('/v1/decrees', { method: 'POST', body: { domain: 'cli', truth: { action } } });
  out(`  ${C('⛓')} decree raised ${G(short(d.id))} ${D('— inert until a human signs the covenant')}`);
  out(D(`  sign it:  stoneai covenant approve ${short(d.id)}`));
}
async function decrees(args = []) {
  const list = await api('/v1/decrees');
  if (args.includes('--json')) return out(JSON.stringify(list ?? [], null, 2));
  if (!list?.length) return out(D('  no decrees'));
  for (const d of list) out(`  ${G(short(d.id))}  ${(d.status || 'pending').padEnd(8)}  ${d.action || d.domain || ''}`);
}
/** Resolve a full or short/prefix decree id (incl. the displayed `abcd1234…ef01` form) to the decree. */
async function findDecree(id) {
  const raw = String(id).split('…')[0].toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw)) return { id: raw };
  const list = (await api('/v1/decrees')) || [];
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
  // the server strictly matches the decree's own required_scope — fetch it when we don't have it yet
  const scope = decree.required_scope
    ?? ((await api('/v1/decrees')) || []).find((d) => d.id === decree.id)?.required_scope
    ?? 'GENERAL';
  // sign the decision LOCALLY with the device key (Covenant Model — human consent is device-held)
  const payload = `${decree.id}:${decision}`;
  const signature = signPayload(payload);
  const body = decision === 'approve'
    ? { approverId: 'cli', scope, signature, device_key: ensureDeviceKey() }
    : { approverId: 'cli', scope, reason: 'denied via CLI', signature, device_key: ensureDeviceKey() };
  await api(`/v1/decrees/${decree.id}/${decision}`, { method: 'POST', body });
  out(`  ${C('✓')} covenant ${decision === 'approve' ? 'signed' : 'denied'} for ${G(short(decree.id))} ${D('(Ed25519, device-held)')}`);
}
async function audit() {
  const a = await api('/v1/audit');
  const rows = Array.isArray(a) ? a : (a.entries || []);
  if (!rows.length) return out(D('  ⛓ genesis — ledger empty'));
  for (const [i, e] of rows.entries())
    out(`  ${D(String(i).padStart(3))}  ${(e.event || e.type || 'event').padEnd(14)}  ${D(short(e.hash))}`);
}

// ---- billing ----
async function usage() {
  const u = await api('/v1/usage');
  out(`  plan ${G(u.plan ?? u.planId ?? '—')} · used ${C(u.used ?? u.count ?? 0)} · overage ${u.overage ?? 0}`);
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
// The processor is never named in this client. ch.184 cardinal rule 7 requires
// external payment vendors to sit behind a swap-ready interface — the server
// already does this (billing/processors/*), so the CLI asks which methods are
// live rather than assuming one. Hardcoding a vendor here would mean shipping a
// new CLI to every user just to change processors.
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
  // No preference given: take the server's first advertised method. Ordering is
  // the server's call, so the default can change without a client release.
  const method = requested || methods[0];

  const s = await api('/v1/checkout/session', { method: 'POST', body: { method, plan } });
  const url = s.approve_url || s.url || s.checkout_url;
  if (!url) return out(R('  no checkout url returned'));
  out(`  opening ${G(method)} checkout for the ${G(plan)} plan…`);
  if (methods.length > 1 && !requested) out(D(`  other methods: ${methods.filter((m) => m !== method).join(', ')} (--method <name>)`));
  openUrl(url);
  out(D(`  ${url}`));
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
  ${G('StoneAI')} — the Covenant Engine ${D('· wroteinstone.com')}

  ${G('stoneai')} login              browser sign-in (or --with-key to paste)
          logout             clear credentials
          whoami             current tenant + status
          decree "<action>"  raise a decree (inert until signed)
          decrees            list decrees
          covenant approve <id> | deny <id>   sign the covenant (Ed25519, device-held)
          audit              the hash-chained ledger
          usage | plans      metering + subscription tiers
          upgrade [plan] [--method <m>]   open checkout to subscribe
          config [set k v]   base_url etc.
          --version | --help
`);
}

const version = '0.1.2';
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
    case 'config': return config(args);
    case undefined:
    case 'help':
    case '--help':
    case '-h': return help();
    default: out(R(`  unknown command: ${cmd}`)); return help();
  }
}
function short(h) { h = String(h || ''); return h.length > 14 ? h.slice(0, 8) + '…' + h.slice(-4) : h; }
