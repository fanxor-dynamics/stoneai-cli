#!/usr/bin/env node
// @stoneai/cli entry point. Thin client — holds no secrets, calls the StoneAI API.
import { run } from '../lib/cli.js';

run(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`\n  \x1b[31m✖\x1b[0m ${err?.message || err}\n\n`);
  process.exit(1);
});
