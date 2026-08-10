#!/usr/bin/env node
/**
 * Guard shared UI against hardcoded Tailwind hex colors so theme tokens stay authoritative.
 * Scopes: src/shared/** and src/components/erp/**
 * Print / image-export roots are allowlisted (they use PrintTemplateSettings colors).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scopes = [
  path.join(root, 'src', 'shared'),
  path.join(root, 'src', 'components', 'erp'),
];

const ALLOWLIST = new Set([
  // Print / capture chrome — intentional fixed ink for paper & PNG fidelity
  'src/components/erp/PrintReportLayout.tsx',
  'src/components/erp/FactoryPrintShell.tsx',
]);

const HEX_CLASS = /\b(?:bg|text|border|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/g;
const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git']);

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.(tsx|ts|css)$/.test(entry.name)) continue;
    out.push(full);
  }
}

const files = [];
for (const scope of scopes) walk(scope, files);

const violations = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (ALLOWLIST.has(rel)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const matches = text.match(HEX_CLASS);
  if (!matches?.length) continue;
  violations.push({ rel, count: matches.length, sample: matches.slice(0, 5) });
}

if (violations.length) {
  console.error('Theme token guard failed — hardcoded hex utilities in shared UI:\n');
  for (const v of violations) {
    console.error(`  ${v.rel} (${v.count}) e.g. ${v.sample.join(', ')}`);
  }
  console.error('\nUse var(--color-*) / erp-surface / erp-muted instead.');
  process.exit(1);
}

console.log('arch:check:theme-tokens: ok');
