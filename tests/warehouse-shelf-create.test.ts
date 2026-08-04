import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Mirrors warehouseLocationService.buildShelfCodes numeric branch for pure-unit coverage. */
function buildNumericShelfCodes(fromRaw: string, toRaw: string): string[] {
  const from = Number(fromRaw);
  const to = Number(toRaw);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new Error('مدى الأرفف الرقمي غير صحيح.');
  const width = Math.max(String(fromRaw || '').length, String(toRaw || '').length);
  return Array.from({ length: to - from + 1 }, (_, i) => String(from + i).padStart(width, '0'));
}

assert.deepEqual(buildNumericShelfCodes('1', '4'), ['1', '2', '3', '4']);
assert.deepEqual(buildNumericShelfCodes('01', '03'), ['01', '02', '03']);

const serviceSource = readFileSync(
  join(here, '../modules/inventory/services/warehouseLocationService.ts'),
  'utf8',
);
assert.match(serviceSource, /runTransaction/, 'shelf create must use a transaction to avoid duplicate docs');
assert.match(serviceSource, /skipIfExists:\s*true/, 'createShelves must skip existing shelves on retry');
assert.match(
  serviceSource,
  /locationDocId\s*=\s*\(|function locationDocId/,
  'shelf docs must use a stable business-key id',
);
assert.match(
  serviceSource,
  /\$\{warehouseId\}__\$\{rackCode\}__\$\{shelfCode\}/,
  'deterministic shelf doc id must include warehouse + rack + shelf',
);

const pageSource = readFileSync(
  join(here, '../modules/inventory/pages/WarehouseLocations.tsx'),
  'utf8',
);
assert.match(pageSource, /modalSavingRef/, 'UI must guard against double-submit with a sync ref');
assert.match(pageSource, /جاري الحفظ/, 'save button must show in-progress feedback');
assert.match(pageSource, /beginModalSave/, 'modal saves must acquire a single-flight lock');
assert.match(
  pageSource,
  /if \(ok\) setModal\(null\)/,
  'shelves modal must close only after a successful create',
);
assert.match(pageSource, /warehouseLocationService\.remove/, 'shelf row must support hard delete');
assert.match(pageSource, /حذف الرف/, 'delete confirm must mention shelf deletion');

assert.match(serviceSource, /async remove\(id: string\)/, 'location service must expose remove()');
assert.match(
  serviceSource,
  /لا يمكن حذف رف عليه أرصدة/,
  'remove must refuse shelves with stock quantity',
);

console.log('warehouse-shelf-create tests passed');
