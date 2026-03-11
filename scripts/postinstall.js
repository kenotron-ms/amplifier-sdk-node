#!/usr/bin/env node
/**
 * postinstall.js — auto-bootstrap the Amplifier CLI after npm install.
 *
 * Priority:
 *   1. Already on PATH or AMPLIFIER_BINARY env → nothing to do
 *   2. uv available → uv tool install amplifier  (recommended, manages Python too)
 *   3. pip3 / pip available → pip install amplifier-core
 *   4. Nothing found → print friendly instructions
 *
 * This script NEVER exits non-zero. A failed bootstrap is not a failed install.
 * Set AMPLIFIER_SKIP_POSTINSTALL=1 to suppress it entirely (useful in CI).
 */

'use strict';

const { execFileSync, spawnSync } = require('child_process');

const BOLD  = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const PREFIX = `${BOLD}amplifier-sdk${RESET}`;

function log(msg)  { console.log(`${PREFIX}: ${msg}`); }
function ok(msg)   { console.log(`${PREFIX}: ${GREEN}✓${RESET} ${msg}`); }
function warn(msg) { console.log(`${PREFIX}: ${YELLOW}!${RESET} ${msg}`); }

/** Check if a command is available, return true/false. */
function available(cmd) {
  try {
    spawnSync(cmd, ['--version'], { stdio: 'pipe', timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

/** Find a command on PATH, return its path or null. */
function findOnPath(name) {
  try {
    const cmd   = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(cmd, [name], { stdio: 'pipe', timeout: 8000 })
      .toString()
      .trim()
      .split('\n')[0] // `where` may return multiple lines on Windows
      .trim();
    return result || null;
  } catch {
    return null;
  }
}

/** Run a command, streaming output to the terminal. Returns true on success. */
function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    timeout: 180_000, // 3 minutes — uv may need to download Python
  });
  return result.status === 0;
}

// ─── Main ────────────────────────────────────────────────────────────────────

try {
  // Escape hatch for CI / advanced users
  if (process.env.AMPLIFIER_SKIP_POSTINSTALL) {
    process.exit(0);
  }

  // 1. Already installed?
  const existing = process.env.AMPLIFIER_BINARY || findOnPath('amplifier');
  if (existing) {
    ok(`Amplifier CLI found at ${existing}`);
    process.exit(0);
  }

  log('Amplifier CLI not found — attempting auto-install...');

  // 2. Try uv (recommended — manages Python itself, no Python prereq)
  if (available('uv')) {
    log('  uv found → running: uv tool install amplifier');
    if (run('uv', ['tool', 'install', 'amplifier'])) {
      ok('Amplifier installed via uv');
      warn('If `amplifier` is not found in a new shell, run: uv tool update-shell');
      process.exit(0);
    }
    warn('uv install failed — trying pip...');
  }

  // 3. Try pip3 / pip
  const pip = available('pip3') ? 'pip3' : available('pip') ? 'pip' : null;
  if (pip) {
    log(`  ${pip} found → running: ${pip} install amplifier-core`);
    if (run(pip, ['install', 'amplifier-core'])) {
      ok('amplifier-core installed via pip');
      process.exit(0);
    }
    warn('pip install failed.');
  }

  // 4. Nothing worked — print friendly instructions
  console.log('');
  console.log(`${PREFIX}: ${YELLOW}Could not auto-install the Amplifier CLI.${RESET}`);
  console.log('  Install it manually, then re-run your script:');
  console.log('');
  console.log('    # Recommended (installs Python + amplifier automatically):');
  console.log('    curl -LsSf https://astral.sh/uv/install.sh | sh');
  console.log('    uv tool install amplifier');
  console.log('');
  console.log('    # Or with pip:');
  console.log('    pip install amplifier-core');
  console.log('');
  console.log('  Full docs: https://github.com/microsoft/amplifier');
  console.log('');

} catch (err) {
  // Never block npm install
  warn(`postinstall skipped: ${err.message}`);
}
