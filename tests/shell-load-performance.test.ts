import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shouldDeferProductionRealtime } from '../lib/productionRealtimeRoutes.ts';

const root = join(process.cwd());
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const host = read('components/modal-manager/ModalHost.tsx');
assert.match(host, /registerManagedModal/);
assert.match(host, /openedModalKeys/);
assert.match(host, /mountedKeys/);
assert.match(host, /GlobalProductBomModal/);
assert.doesNotMatch(
  host,
  /LAZY_GLOBAL_MODALS\.map/,
  'modal host must not mount every global modal on shell load',
);

const manufacturingRoutes = read('modules/manufacturing/routes/index.ts');
assert.match(manufacturingRoutes, /lazyNamed\(\(\) => import\('\.\.\/pages\/Materials'\)/);
assert.doesNotMatch(
  manufacturingRoutes,
  /from '\.\.\/pages\/Materials'/,
  'materials pages must stay out of the authenticated shell chunk',
);

assert.equal(shouldDeferProductionRealtime(null), true);
assert.equal(shouldDeferProductionRealtime(''), false, 'tenant home keeps production live data');
assert.equal(shouldDeferProductionRealtime('production'), false);
assert.equal(shouldDeferProductionRealtime('reports'), false);
assert.equal(shouldDeferProductionRealtime('quick-action'), false);
assert.equal(shouldDeferProductionRealtime('work-orders/abc/scanner'), false);
assert.equal(shouldDeferProductionRealtime('hr/employees'), true);
assert.equal(shouldDeferProductionRealtime('repair/jobs'), true);
assert.equal(shouldDeferProductionRealtime('inventory/warehouses'), true);
assert.equal(shouldDeferProductionRealtime('inventory/production-issues'), false);
assert.equal(shouldDeferProductionRealtime('manufacturing/materials'), true);
assert.equal(shouldDeferProductionRealtime('products/item-1'), true);
assert.equal(shouldDeferProductionRealtime('quality/ipqc'), true);
assert.equal(shouldDeferProductionRealtime('customers'), true);
assert.equal(shouldDeferProductionRealtime('accounting/journals'), true);
assert.equal(shouldDeferProductionRealtime('costs/assets'), true);

console.log('shell-load-performance.test.ts: ok');
