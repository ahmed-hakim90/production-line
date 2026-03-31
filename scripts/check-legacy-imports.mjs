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

const files = [];
walk(root, files);

const importRe = /from\s+['"]([^'"]+)['"]/g;
const offenders = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const imp = m[1];
    const resolved = resolveToProjectPath(file, imp);
    if (forbidden.some((rx) => rx.test(resolved))) {
      offenders.push({
        file: path.relative(root, file).replace(/\\/g, '/'),
        importPath: imp,
        resolved,
      });
    }
  }
}

if (offenders.length === 0) {
  console.log('No forbidden legacy imports found.');
  process.exit(0);
}

console.error('Forbidden legacy imports found:\n');
for (const o of offenders) {
  console.error(`- ${o.file}\n  import: ${o.importPath}\n  resolved: ${o.resolved}`);
}
process.exit(1);
