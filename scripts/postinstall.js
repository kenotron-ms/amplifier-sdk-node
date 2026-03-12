#!/usr/bin/env node
/**
 * postinstall.js — check prerequisites for the amplifier-sdk Python bridge.
 *
 * Checks:
 *   1. Python >= 3.11 is available
 *   2. amplifier-foundation is importable
 *   3. amplifier-core is importable
 *   4. git is available (needed for module source resolution)
 *
 * This script NEVER exits non-zero. A missing prereq is a warning, not a failure.
 * Set AMPLIFIER_SKIP_POSTINSTALL=1 to suppress it entirely (useful in CI).
 */

'use strict';

const { spawnSync } = require('child_process');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const PREFIX = `${BOLD}amplifier-sdk${RESET}`;

function ok(msg) { console.log(`${PREFIX}: ${GREEN}\u2713${RESET} ${msg}`); }
function warn(msg) { console.log(`${PREFIX}: ${YELLOW}!${RESET} ${msg}`); }
function fail(msg) { console.log(`${PREFIX}: ${RED}\u2717${RESET} ${msg}`); }

function checkCommand(cmd, args, label) {
  try {
    const result = spawnSync(cmd, args, { stdio: 'pipe', timeout: 8000 });
    if (result.status === 0) {
      const output = (result.stdout || '').toString().trim();
      ok(`${label}: ${output || 'found'}`);
      return { success: true, output };
    }
    return { success: false, output: '' };
  } catch {
    return { success: false, output: '' };
  }
}

function checkPythonImport(pythonCmd, moduleName) {
  try {
    const result = spawnSync(
      pythonCmd,
      ['-c', `import ${moduleName}; print('ok')`],
      { stdio: 'pipe', timeout: 15000 },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

try {
  if (process.env.AMPLIFIER_SKIP_POSTINSTALL) {
    process.exit(0);
  }

  let issues = 0;

  // 1. Python >= 3.11
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const pyResult = checkCommand(pythonCmd, ['--version'], 'Python');
  if (!pyResult.success) {
    fail(`Python 3.11+ not found. Install from https://python.org or: curl -LsSf https://astral.sh/uv/install.sh | sh`);
    issues++;
  } else {
    // Check version >= 3.11
    const match = /(\d+)\.(\d+)/.exec(pyResult.output);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major < 3 || (major === 3 && minor < 11)) {
        warn(`Python ${pyResult.output} found but 3.11+ is required`);
        issues++;
      }
    }
  }

  // 2. amplifier-foundation
  if (pyResult.success) {
    if (checkPythonImport(pythonCmd, 'amplifier_foundation')) {
      ok('amplifier-foundation: installed');
    } else {
      warn('amplifier-foundation not found. Install: uv tool install amplifier');
      issues++;
    }

    // 3. amplifier-core
    if (checkPythonImport(pythonCmd, 'amplifier_core')) {
      ok('amplifier-core: installed');
    } else {
      warn('amplifier-core not found. Install: uv tool install amplifier');
      issues++;
    }
  }

  // 4. git
  const gitResult = checkCommand('git', ['--version'], 'git');
  if (!gitResult.success) {
    warn('git not found. Required for bundle module resolution.');
    issues++;
  }

  if (issues > 0) {
    console.log('');
    console.log(`${PREFIX}: ${YELLOW}${issues} prerequisite(s) missing.${RESET}`);
    console.log('  Recommended install:');
    console.log('    curl -LsSf https://astral.sh/uv/install.sh | sh');
    console.log('    uv tool install amplifier');
    console.log('');
  }
} catch (err) {
  // Never block npm install
  warn(`postinstall skipped: ${err.message}`);
}
