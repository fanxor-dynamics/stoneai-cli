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
// Open a URL in the default browser (cross-platform, no deps).
import { spawn } from 'node:child_process';

export function openUrl(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}
