import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const store = read('store/useAppStore.ts');
const bootstrap = store.slice(store.indexOf('_loadAppData: async'), store.indexOf('// ── Role Switching'));
assert(!/\.getAll\s*\(/.test(bootstrap), 'login bootstrap must not scan a collection with getAll');
assert(!/reportService\.getByDateRange/.test(bootstrap), 'login bootstrap must not load report ranges');

const productsPage = read('modules/production/pages/Products.tsx');
assert(!/reportService\s*\.\s*getAll\s*\(/.test(productsPage), 'products KPI must use write-time totals');
assert(!/getMonthForProducts|getByProductAndMonth/.test(productsPage), 'products table must use summaries embedded in visible product docs');

const scan = (directory: string): string[] => readdirSync(join(root, directory)).flatMap((name) => {
  const relative = join(directory, name);
  const stat = statSync(join(root, relative));
  if (stat.isDirectory()) return scan(relative);
  return /\.(ts|tsx)$/.test(name) ? [relative] : [];
});
const sourceFiles = ['components', 'modules', 'src'].flatMap(scan);
for (const file of sourceFiles) {
  assert(!read(file).includes('تحميل المزيد'), `${file} still exposes load-more copy`);
}

for (const service of [
  'modules/hr/employeeService.ts',
  'modules/production/services/reportService.ts',
  'modules/production/services/workOrderService.ts',
  'modules/inventory/services/stockService.ts',
]) {
  assert(/pageSize\s*\+\s*1/.test(read(service)), `${service} must use one-row lookahead`);
}

console.log('firebase-read-budget.test.ts passed');
