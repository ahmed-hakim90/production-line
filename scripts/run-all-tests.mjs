#!/usr/bin/env node
/**
 * Discover and run all unit/contract tests under tests/.
 *
 * - Runs `tests/*.test.ts` via `npx tsx`
 * - Runs `tests/*.test.mjs` via `node`, except emulator-only suites
 * - Skips `firestore.rules.test.mjs` (requires FIRESTORE_EMULATOR_HOST;
 *   run via `npm run test:rules`)
 * - Skips assertHarness (helper, not a suite)
 *
 * Usage:
 *   node scripts/run-all-tests.mjs
 *   node scripts/run-all-tests.mjs --list
 */
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = path.join(root, 'tests');

/** Emulator-only suites — not run by test:all; covered by npm run test:rules. */
const EMULATOR_ONLY = new Set(['firestore.rules.test.mjs']);

function isAssertHarness(name) {
  return name.toLowerCase().includes('assertharness');
}

function isTestFile(name) {
  if (isAssertHarness(name)) return false;
  return name.endsWith('.test.ts') || name.endsWith('.test.mjs');
}

async function discoverTests() {
  const entries = await readdir(testsDir);
  const runnable = [];
  const skipped = [];

  for (const name of entries.sort()) {
    if (!isTestFile(name)) continue;
    if (EMULATOR_ONLY.has(name)) {
      skipped.push({
        file: name,
        reason: 'requires FIRESTORE_EMULATOR_HOST — run via npm run test:rules',
      });
      continue;
    }
    runnable.push(name);
  }

  return { runnable, skipped };
}

function runOne(file) {
  return new Promise((resolve) => {
    const abs = path.join(testsDir, file);
    const isTs = file.endsWith('.test.ts');
    const command = isTs ? 'npx' : process.execPath;
    const args = isTs ? ['--yes', 'tsx', abs] : [abs];

    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });

    child.on('error', (err) => {
      console.error(`Failed to start ${file}:`, err.message);
      resolve({ file, ok: false, code: 1 });
    });

    child.on('close', (code, signal) => {
      if (signal) {
        resolve({ file, ok: false, code: 1 });
        return;
      }
      resolve({ file, ok: code === 0, code: code ?? 1 });
    });
  });
}

async function main() {
  const listOnly = process.argv.includes('--list');
  const { runnable, skipped } = await discoverTests();

  if (listOnly) {
    console.log(`Runnable (${runnable.length}):`);
    for (const file of runnable) {
      console.log(`  ${file}`);
    }
    if (skipped.length) {
      console.log(`\nSkipped (${skipped.length}):`);
      for (const { file, reason } of skipped) {
        console.log(`  ${file} — ${reason}`);
      }
    }
    return;
  }

  console.log(
    `Running ${runnable.length} test file(s)` +
      (skipped.length
        ? ` (${skipped.length} skipped — emulator: ${[...EMULATOR_ONLY].join(', ')})`
        : ''),
  );

  const results = [];
  for (const file of runnable) {
    console.log(`\n── ${file} ──`);
    results.push(await runOne(file));
  }

  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log('\n══ Summary ══');
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);
  if (skipped.length) {
    console.log(`Skipped: ${skipped.length}`);
    for (const { file, reason } of skipped) {
      console.log(`  skip  ${file} (${reason})`);
    }
  }
  if (failed.length) {
    for (const r of failed) {
      console.log(`  FAIL  ${r.file} (exit ${r.code})`);
    }
    process.exit(1);
  }

  console.log('All discovered tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
