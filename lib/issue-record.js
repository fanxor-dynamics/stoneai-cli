import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(root, 'templates', 'issue-resolution-record.md');
const schemaPath = join(root, 'templates', 'issue-resolution-record.schema.json');

export const fields = [
  ['symptoms', 'Symptoms'],
  ['root_cause', 'Root cause'],
  ['fix', 'Fix'],
  ['results', 'Results'],
  ['preventative_measures', 'Preventative measures'],
  ['future_outlook', 'Future outlook'],
];

const fieldKeys = new Set(fields.map(([key]) => key));
const placeholders = /^(?:tbd|todo|n\/?a|none|unknown|placeholder|fixme|-)$/i;

export function template() {
  return readFileSync(templatePath, 'utf8');
}

export function recordFromArgs(args) {
  const record = Object.fromEntries(fields.map(([key]) => [key, '']));
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg?.startsWith('--')) continue;
    const key = flagToKey(arg);
    if (!fieldKeys.has(key)) continue;
    record[key] = args[i + 1] ?? '';
    i += 1;
  }
  return record;
}

export function renderMarkdown(record) {
  const lines = ['# Issue Resolution Record', ''];
  for (const [key, heading] of fields) {
    lines.push(`## ${heading}`, String(record[key] ?? '').trim(), '');
  }
  return lines.join('\n');
}

export function renderJson(record) {
  return Object.fromEntries(fields.map(([key]) => [key, String(record[key] ?? '').trim()]));
}

export function parseRecordFile(file) {
  const content = readFileSync(file, 'utf8');
  if (file.endsWith('.json')) return parseJson(content);
  return parseMarkdown(content);
}

export function validateRecord(record) {
  const missing = [];
  const invalid = [];
  for (const [key] of fields) {
    const value = String(record[key] ?? '').trim();
    if (!value) {
      missing.push(key);
      continue;
    }
    if (isPlaceholder(value)) invalid.push(key);
  }

  const rootCause = String(record.root_cause ?? '').trim().toLowerCase();
  const results = String(record.results ?? '').trim();
  if (rootCause === 'unproven' && /(?:passed|fixed|complete|resolved|done|verified)/i.test(results)) {
    invalid.push('root_cause');
  }

  return { success: missing.length === 0 && invalid.length === 0, missing, invalid: [...new Set(invalid)] };
}

export function doctorStatus() {
  return {
    success: existsSync(templatePath) && existsSync(schemaPath),
    offline_mode: true,
    template: templatePath,
    schema: schemaPath,
  };
}

function parseJson(content) {
  const parsed = JSON.parse(content);
  return Object.fromEntries(fields.map(([key]) => [key, parsed[key] ?? '']));
}

function parseMarkdown(content) {
  const record = Object.fromEntries(fields.map(([key]) => [key, '']));
  const headingByName = new Map(fields.map(([key, heading]) => [heading.toLowerCase(), key]));
  const pattern = /^##\s+(.+)\s*$/gm;
  const matches = [...content.matchAll(pattern)];
  for (let i = 0; i < matches.length; i += 1) {
    const heading = matches[i][1].trim().toLowerCase();
    const key = headingByName.get(heading);
    if (!key) continue;
    const start = matches[i].index + matches[i][0].length;
    const end = matches[i + 1]?.index ?? content.length;
    record[key] = content.slice(start, end).trim();
  }
  return record;
}

function flagToKey(flag) {
  return flag.replace(/^--/, '').replace(/-/g, '_');
}

function isPlaceholder(value) {
  const normalized = value.trim();
  if (placeholders.test(normalized)) return true;
  return /^(?:tbd|todo|fixme)\b/i.test(normalized);
}
