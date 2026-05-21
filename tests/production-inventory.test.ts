import assert from 'node:assert/strict';
import {
  aggregatePackagingQuantities,
  shouldPostAggregateWaste,
} from '../modules/inventory/lib/productionInventoryLib';
import {
  isTransferLikeType,
  normalizeTransferRequestType,
} from '../modules/inventory/lib/transferRequestTypes';

function run() {
  assert.equal(normalizeTransferRequestType(undefined), 'manual_transfer');
  assert.equal(normalizeTransferRequestType('transfer'), 'manual_transfer');
  assert.equal(normalizeTransferRequestType('packaging_transfer'), 'packaging_transfer');
  assert.equal(isTransferLikeType('manual_transfer'), true);
  assert.equal(isTransferLikeType('production_entry'), false);

  const map = aggregatePackagingQuantities({
    productId: 'p1',
    quantityProduced: 100,
    packagingLines: [
      { productId: 'p1', quantityPieces: 40 },
      { productId: 'p2', quantityPieces: 10 },
    ],
  });
  assert.equal(map.get('p1'), 40);
  assert.equal(map.get('p2'), 10);

  const fallback = aggregatePackagingQuantities({
    productId: 'p9',
    quantityProduced: 55,
  });
  assert.equal(fallback.get('p9'), 55);

  assert.equal(
    shouldPostAggregateWaste({
      wasteQty: 5,
      wasteWarehouseId: 'w1',
      hasProducedLine: true,
      hasExplicitScrapList: false,
    }),
    true,
  );
  assert.equal(
    shouldPostAggregateWaste({
      wasteQty: 5,
      wasteWarehouseId: 'w1',
      hasProducedLine: true,
      hasExplicitScrapList: true,
    }),
    false,
  );

  console.log('production-inventory.test.ts: OK');
}

run();
