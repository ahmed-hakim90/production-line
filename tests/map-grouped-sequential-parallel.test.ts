import assert from 'node:assert/strict';
import { mapGroupedSequentialParallel } from '../modules/shared/lib/mapGroupedSequentialParallel.ts';

async function run() {
  const order: string[] = [];
  await mapGroupedSequentialParallel(
    [
      { key: 'a', id: 'a1' },
      { key: 'b', id: 'b1' },
      { key: 'a', id: 'a2' },
    ],
    (row) => row.key,
    async (row) => {
      order.push(row.id);
      await new Promise((r) => setTimeout(r, row.key === 'a' && row.id === 'a1' ? 20 : 1));
    },
  );
  // Same key stays sequential: a1 before a2. Different keys may interleave.
  const a1 = order.indexOf('a1');
  const a2 = order.indexOf('a2');
  assert.ok(a1 >= 0 && a2 > a1);
  assert.ok(order.includes('b1'));
  console.log('map-grouped-sequential-parallel.test.ts: ok');
}

void run();
