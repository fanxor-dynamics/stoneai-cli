#!/usr/bin/env node
/*
 * Copyright (c) 2026 Joshua Stone. All Rights Reserved.
 *
 * StoneAI is proprietary and confidential technology owned by Joshua Stone
 * and exclusively licensed to FanXora Innovation & Technology Group LLC.
 * FanXor Dynamics LLC is an authorized technology operator.
 *
 * Unauthorized access, copying, disclosure, modification, reverse engineering,
 * redistribution, sublicensing, or use is prohibited except as expressly
 * authorized in writing.
 *
 * FANXORA RESTRICTED: CROWN-JEWEL TECHNOLOGY
 */
// @stoneai/cli entry point. Thin client — holds no secrets, calls the StoneAI API.
import { run, formatCliError } from '../lib/cli.js';

run(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`\n  \x1b[31m✖\x1b[0m ${formatCliError(err)}\n\n`);
  process.exit(1);
});
