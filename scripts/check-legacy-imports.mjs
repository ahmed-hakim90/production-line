import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const exts = new Set(['.ts', '.tsx']);
const ignoreDirs = new Set([
  '.git',
  '.firebase',
  'node_modules',
  'dist',
  'functions',
]);

const forbidden = [
  /^services\/reportService$/,
  /^services\/workOrderService$/,
  /^services\/productionPlanService$/,
  /^services\/lineService$/,
  /^services\/lineStatusService$/,
  /^services\/lineProductConfigService$/,
  /^services\/productService$/,
  /^services\/productMaterialService$/,
  /^services\/storageService$/,
  /^services\/scanEventService$/,
  /^services\/monthlyProductionCostService$/,
  /^services\/costCenterService$/,
  /^services\/costCenterValueService$/,
  /^services\/costAllocationService$/,
  /^services\/laborSettingsService$/,
  /^services\/systemSettingsService$/,
  /^services\/roleService$/,
  /^services\/activityLogService$/,
  /^services\/adminService$/,
];

/** Firestore write APIs must not be used from pages — go through usecases/services. */
const PAGE_FIRESTORE_WRITE_APIS = /\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/;

/**
 * Empty allowlist: all module pages must use services/usecases for writes.
 * Re-add a path only as a temporary exception during an active migration PR.
 */
const PAGE_FIRESTORE_WRITE_ALLOWLIST = new Set([]);

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) {
      if (!['.'].includes(e.name)) continue;
    }
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (ignoreDirs.has(e.name)) continue;
      walk(full, out);
      continue;
    }
    const ext = path.extname(e.name).toLowerCase();
    if (exts.has(ext)) out.push(full);
  }
}

function normalizeImportPath(raw) {
  const p = raw.replace(/\\/g, '/').replace(/^\.\/+/, '');
  return p.replace(/\.(ts|tsx|js|jsx)$/, '');
}

function resolveToProjectPath(fromFile, imp) {
  if (!imp.startsWith('.')) return normalizeImportPath(imp);
  const abs = path.resolve(path.dirname(fromFile), imp);
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  return normalizeImportPath(rel);
}

function isModulePageFile(relPath) {
  return /(?:^|\/)modules\/[^/]+\/pages\//.test(relPath);
}

/** Global modals must also go through usecases/services for writes. */
function isModalManagerFile(relPath) {
  return /(?:^|\/)components\/modal-manager\//.test(relPath);
}

function isUiWriteSurface(relPath) {
  return isModulePageFile(relPath) || isModalManagerFile(relPath);
}

const files = [];
walk(root, files);

const importRe = /from\s+['"]([^'"]+)['"]/g;
const offenders = [];
const pageWriteOffenders = [];

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const imp = m[1];
    const resolved = resolveToProjectPath(file, imp);
    if (forbidden.some((rx) => rx.test(resolved))) {
      offenders.push({
        file: rel,
        importPath: imp,
        resolved,
      });
    }
  }

  if (
    isUiWriteSurface(rel)
    && PAGE_FIRESTORE_WRITE_APIS.test(content)
    && !PAGE_FIRESTORE_WRITE_ALLOWLIST.has(rel)
  ) {
    pageWriteOffenders.push(rel);
  }
}

let failed = false;

if (offenders.length > 0) {
  failed = true;
  console.error('Forbidden legacy imports found:\n');
  for (const o of offenders) {
    console.error(`- ${o.file}\n  import: ${o.importPath}\n  resolved: ${o.resolved}`);
  }
}

if (pageWriteOffenders.length > 0) {
  failed = true;
  console.error('\nForbidden Firestore write APIs in UI surfaces (pages/modals — use usecases/services):\n');
  for (const file of pageWriteOffenders) {
    console.error(`- ${file}`);
  }
}

const PRINT_REACT_TO_PRINT_ALLOW = new Set([
  'utils/print/PrintEngineHost.tsx',
]);
const printEngineOffenders = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (PRINT_REACT_TO_PRINT_ALLOW.has(rel)) continue;
  if (rel.startsWith('tests/')) continue;
  const content = fs.readFileSync(file, 'utf8');
  if (/\buseReactToPrint\b/.test(content)) {
    printEngineOffenders.push(rel);
  }
}
if (printEngineOffenders.length > 0) {
  failed = true;
  console.error('\nuseReactToPrint must live only in utils/print/PrintEngineHost.tsx:\n');
  for (const file of printEngineOffenders) {
    console.error(`- ${file}`);
  }
}

const PRINT_OFFSCREEN_HOST_ALLOW = new Set([
  'src/components/erp/PrintOffscreenHost.tsx',
  'src/components/erp/index.ts',
  'utils/print/PrintEngineHost.tsx',
  // PDF/image export still captures a mounted voucher; print itself uses printDocument.
  'modules/inventory/pages/QuickWarehouseTransfer.tsx',
]);
const printHostOffenders = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (PRINT_OFFSCREEN_HOST_ALLOW.has(rel)) continue;
  if (rel.startsWith('tests/')) continue;
  const content = fs.readFileSync(file, 'utf8');
  if (/\bPrintOffscreenHost\b/.test(content)) {
    printHostOffenders.push(rel);
  }
}
if (printHostOffenders.length > 0) {
  failed = true;
  console.error('\nPrintOffscreenHost is only allowed in the print engine and quick-transfer export capture:\n');
  for (const file of printHostOffenders) {
    console.error(`- ${file}`);
  }
}

if (!failed) {
  console.log('No forbidden legacy imports or page Firestore writes found.');
  process.exit(0);
}

process.exit(1);
