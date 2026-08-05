import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { run } from '../lib/cli.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const requiredHeadings = [
  'Symptoms',
  'Root cause',
  'Fix',
  'Results',
  'Preventative measures',
  'Future outlook',
];

async function capture(argv) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try {
    await run(argv);
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

async function captureFailure(argv) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try {
    await run(argv);
  } catch (error) {
    return { error, output: chunks.join('') };
  } finally {
    process.stdout.write = original;
  }
  throw new Error('expected command to fail');
}


function sandboxFile(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'stoneai-issue-record-'));
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
}

function completeMarkdown() {
  return `# Issue Resolution Record

## Symptoms
CLI validation failed with missing issue command.

## Root cause
The issue command was not wired into the command router.

## Fix
Added the issue command family and offline validator.

## Results
node --test test/issue-record.test.js passed locally.

## Preventative measures
Added an invariant test that fails when issue disappears from help output.

## Future outlook
Monitor package smoke output during release; reopen if issue validation exits zero on missing fields.
`;
}

test('help output advertises the issue command family', async () => {
  const output = await capture(['--help']);
  assert.match(output, /stoneai\s+issue\s+template/);
});

test('issue template prints all six required record sections', async () => {
  const output = await capture(['issue', 'template']);
  for (const heading of requiredHeadings) {
    assert.match(output, new RegExp(`## ${heading}`), `template missing ${heading}`);
  }
});

test('issue render prints supplied Markdown field values', async () => {
  const output = await capture([
    'issue', 'render',
    '--symptoms', 'Users saw HTTP 500 on checkout.',
    '--root-cause', 'Checkout route called an unavailable processor adapter.',
    '--fix', 'Routed checkout through the configured adapter registry.',
    '--results', 'curl returned HTTP 200 with a checkout URL.',
    '--preventative-measures', 'Added a route-level adapter availability probe.',
    '--future-outlook', 'Monitor checkout error rate for 24 hours.',
  ]);

  assert.match(output, /Users saw HTTP 500 on checkout\./);
  assert.match(output, /Checkout route called an unavailable processor adapter\./);
  assert.match(output, /Monitor checkout error rate for 24 hours\./);
});

test('issue render --json emits stable issue record keys', async () => {
  const output = await capture([
    'issue', 'render', '--json',
    '--symptoms', 'CI failed.',
    '--root-cause', 'The package file list omitted templates.',
    '--fix', 'Added templates to package files.',
    '--results', 'npm pack dry run listed templates.',
    '--preventative-measures', 'Added package file-list invariant test.',
    '--future-outlook', 'Check package contents on every release.',
  ]);
  const parsed = JSON.parse(output);
  assert.deepEqual(Object.keys(parsed), [
    'symptoms',
    'root_cause',
    'fix',
    'results',
    'preventative_measures',
    'future_outlook',
  ]);
});

test('issue render rejects missing required values', async () => {
  await assert.rejects(
    () => run(['issue', 'render', '--symptoms', 'Only symptoms provided.']),
    /missing required fields/i,
  );
});


test('issue validate accepts a complete Markdown record', async () => {
  const file = sandboxFile('complete.md', completeMarkdown());
  const output = await capture(['issue', 'validate', file]);
  assert.match(output, /Issue Resolution Record valid/);
});

test('issue validate --json reports success for a complete Markdown record', async () => {
  const file = sandboxFile('complete.md', completeMarkdown());
  const output = await capture(['issue', 'validate', file, '--json']);
  assert.deepEqual(JSON.parse(output), { success: true, missing: [], invalid: [] });
});

test('issue validate rejects missing and placeholder fields', async () => {
  const file = sandboxFile('incomplete.md', `# Issue Resolution Record

## Symptoms
TODO

## Root cause

## Fix
Added a note.
`);
  await assert.rejects(
    () => run(['issue', 'validate', file]),
    /missing required fields|invalid fields/i,
  );
});

test('issue validate --json reports missing and invalid fields and still fails', async () => {
  const file = sandboxFile('incomplete.md', `# Issue Resolution Record

## Symptoms
TODO

## Root cause

## Fix
Added a note.
`);
  const { error, output } = await captureFailure(['issue', 'validate', file, '--json']);
  const parsed = JSON.parse(output);
  assert.equal(parsed.success, false);
  assert.ok(parsed.missing.includes('results'));
  assert.ok(parsed.invalid.includes('symptoms'));
  assert.match(error.message, /missing required fields|invalid fields/i);
});

test('issue doctor verifies local templates and schema without auth', async () => {
  const output = await capture(['issue', 'doctor']);
  assert.match(output, /offline mode/i);
  assert.match(output, /template/i);
  assert.match(output, /schema/i);
});

test('npm package file list includes issue templates and docs without dependencies', () => {
  assert.equal(pkg.dependencies, undefined, 'CLI must keep zero runtime dependencies');
  assert.ok(pkg.files.includes('templates'), 'package files must include templates');
  assert.ok(pkg.files.includes('docs'), 'package files must include docs');
});
