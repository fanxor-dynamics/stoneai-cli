#!/usr/bin/env node
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
// @stoneai/cli entry point. Thin client — holds no secrets, calls the StoneAI API.
import { run, formatCliError } from '../lib/cli.js';

run(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`\n  \x1b[31m✖\x1b[0m ${formatCliError(err)}\n\n`);
  process.exit(1);
});
