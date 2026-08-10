#!/usr/bin/env node
/**
 * Guard product UI against hardcoded Tailwind colors that bypass theme tokens.
 *
 * Blocks:
 * - Hex utilities: bg-[#…], text-[#…], …
 * - Neutral palettes: slate / gray / zinc / neutral / stone
 * - Semantic palettes remapped to tokens: emerald/rose/amber/indigo/…
 *
 * Print / WhatsApp capture roots are allowlisted.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scopes = [
  path.join(root, 'src', 'shared'),
  path.join(root, 'src', 'components', 'erp'),
  path.join(root, 'modules'),
  path.join(root, 'components'),
];

const ALLOWLIST = new Set([
  'src/components/erp/PrintReportLayout.tsx',
  'src/components/erp/FactoryPrintShell.tsx',
  'modules/production/components/ProductionReportShareCard.tsx',
  'modules/production/components/ProductionReportPrint.tsx',
  'modules/production/components/ProductionWorkerReportPrint.tsx',
  'modules/production/components/MissingComponentsReportPrint.tsx',
  'modules/production/components/SupervisorPerformancePrint.tsx',
  'modules/production/components/ProductBomCountCardPrint.tsx',
  'modules/inventory/components/StockTransferPrint.tsx',
  'modules/inventory/components/ItemCardPrint.tsx',
  'modules/inventory/components/SuppliesReceiptPrint.tsx',
  'modules/repair/components/RepairJobPrint.tsx',
  'modules/repair/components/RepairJobProductCardPrint.tsx',
  'modules/repair/components/RepairSalesInvoicePrint.tsx',
  'modules/repair/components/RepairPaymentPrint.tsx',
  'modules/repair/components/RepairSpareIssuePrint.tsx',
  'modules/repair/components/RepairTreasuryMonthlyPrint.tsx',
  'modules/repair/components/DeliveryReceiptPDF.tsx',
  'modules/quality/components/QualityReportPrint.tsx',
  'modules/production/routing/components/RoutingExecutionPrint.tsx',
]);

const HEX_CLASS = /\b(?:bg|text|border|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/g;
const PALETTE_CLASS =
  /\b(?:dark:)?(?:hover:|focus:|disabled:|placeholder:)?(?:bg|text|border|from|to|via|ring|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|emerald|green|lime|teal|rose|red|pink|amber|yellow|orange|indigo|blue|sky|cyan|violet|purple|fuchsia)-[0-9]+\b/g;
const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', 'lib']);

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.(tsx|ts)$/.test(entry.name)) continue;
    out.push(full);
  }
}

const files = [];
for (const scope of scopes) walk(scope, files);

const violations = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (ALLOWLIST.has(rel)) continue;
  if (/(?:Print|ShareCard|PDF)\.tsx$/.test(rel)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const hex = text.match(HEX_CLASS) || [];
  const palette = text.match(PALETTE_CLASS) || [];
  if (!hex.length && !palette.length) continue;
  violations.push({
    rel,
    count: hex.length + palette.length,
    sample: [...new Set([...hex, ...palette])].slice(0, 6),
  });
}

if (violations.length) {
  console.error('Theme token guard failed — hardcoded Tailwind colors in themed UI scopes:\n');
  for (const v of violations) {
    console.error(`  ${v.rel} (${v.count}) e.g. ${v.sample.join(', ')}`);
  }
  console.error('\nUse var(--color-*) / erp-surface / chart tokens instead.');
  process.exit(1);
}

console.log('arch:check:theme-tokens: ok');
