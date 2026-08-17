import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  allocateFloorIssuePieceBalances,
  filterProductCards,
  flattenProductCardsForExport,
  floorIssuePieceBalance,
  floorIssuePieceBalanceFromProduced,
  floorIssueSummaryAr,
  groupIssuedOrdersByProduct,
  issuedQtyForLine,
  reportsAffectedByFloorIssue,
  sumFloorIssuePieceBalances,
} from '../modules/inventory/lib/productionFloorProductCards';
import type { ProductionIssueOrder, ProductionIssueOrderLine, StockItemBalance } from '../modules/inventory/types';
import type { ProductionReport } from '../types';

function line(partial: Partial<ProductionIssueOrderLine> & Pick<ProductionIssueOrderLine, 'itemId' | 'itemName'>): ProductionIssueOrderLine {
  return {
    materialId: partial.materialId || partial.itemId,
    itemType: partial.itemType || 'material',
    itemId: partial.itemId,
    itemName: partial.itemName,
    itemCode: partial.itemCode || partial.itemId,
    unit: partial.unit || 'pcs',
    qtyPerUnit: partial.qtyPerUnit ?? 1,
    baseRequiredQty: partial.baseRequiredQty ?? Number(partial.issuedQty || partial.requiredQty || 0),
    wastePercent: partial.wastePercent ?? 0,
    plannedWasteQty: partial.plannedWasteQty ?? 0,
    requiredQty: partial.requiredQty ?? Number(partial.issuedQty || 0),
    issuedQty: partial.issuedQty,
    returnedQty: partial.returnedQty,
    compensatedQty: partial.compensatedQty,
    availableQty: partial.availableQty ?? 0,
    shortageQty: partial.shortageQty ?? 0,
    allocations: partial.allocations || [],
  };
}

function order(partial: Partial<ProductionIssueOrder> & Pick<ProductionIssueOrder, 'id' | 'productId' | 'quantity'>): ProductionIssueOrder {
  return {
    id: partial.id,
    referenceNo: partial.referenceNo || `PI-${partial.id}`,
    sourceType: partial.sourceType || 'production_plan',
    productionPlanId: partial.productionPlanId || 'plan-1',
    productId: partial.productId,
    productName: partial.productName || partial.productId,
    productCode: partial.productCode || partial.productId,
    quantity: partial.quantity,
    sourceWarehouseId: partial.sourceWarehouseId || 'decomposed',
    targetWarehouseId: partial.targetWarehouseId ?? 'floor',
    status: partial.status || 'issued',
    lines: partial.lines || [],
    createdBy: partial.createdBy || 'tester',
    createdAt: partial.createdAt || '2026-08-17T10:00:00.000Z',
    issuedAt: partial.issuedAt,
  };
}

assert.equal(issuedQtyForLine({ issuedQty: 2340, requiredQty: 2340 }), 2340);
assert.equal(issuedQtyForLine({ requiredQty: 100 }), 100);
assert.equal(issuedQtyForLine({ issuedQty: 0, requiredQty: 80 }), 80);

const body = line({ itemId: 'mat-body', itemName: 'وش بودي', itemCode: 'MAT-001', issuedQty: 1000, qtyPerUnit: 1 });
const valve = line({ itemId: 'mat-valve', itemName: 'صمام هواء', itemCode: 'MAT-010', issuedQty: 1000, qtyPerUnit: 1 });
const bodyLater = line({ itemId: 'mat-body', itemName: 'وش بودي', itemCode: 'MAT-001', issuedQty: 1340, qtyPerUnit: 1 });
const valveLater = line({ itemId: 'mat-valve', itemName: 'صمام هواء', itemCode: 'MAT-010', issuedQty: 1340, qtyPerUnit: 1 });

const otherProductLine = line({ itemId: 'mat-other', itemName: 'غطاء آخر', issuedQty: 50 });

const firstIssue = order({
  id: 'iss-1',
  productId: 'sku-999n',
  productName: 'SK-999N',
  productCode: 'SK-999N',
  quantity: 1000,
  issuedAt: '2026-08-10T08:00:00.000Z',
  lines: [body, valve],
});
const secondIssue = order({
  id: 'iss-2',
  productId: 'sku-999n',
  productName: 'SK-999N',
  productCode: 'SK-999N',
  quantity: 1340,
  issuedAt: '2026-08-16T08:00:00.000Z',
  lines: [bodyLater, valveLater],
});
const otherProduct = order({
  id: 'iss-3',
  productId: 'sku-other',
  productName: 'منتج آخر',
  productCode: 'OTHER',
  quantity: 50,
  issuedAt: '2026-08-16T09:00:00.000Z',
  lines: [otherProductLine],
});
const draft = order({
  id: 'iss-draft',
  productId: 'sku-999n',
  quantity: 999,
  status: 'draft',
  lines: [body],
});
const otherFloor = order({
  id: 'iss-else',
  productId: 'sku-999n',
  quantity: 10,
  targetWarehouseId: 'other-floor',
  lines: [body],
});

const balances: StockItemBalance[] = [
  {
    warehouseId: 'floor',
    itemType: 'material',
    itemId: 'mat-body',
    itemName: 'وش بودي',
    itemCode: 'MAT-001',
    quantity: 2340,
    minStock: 0,
    updatedAt: '2026-08-16T08:00:00.000Z',
  },
];

const cards = groupIssuedOrdersByProduct({
  orders: [firstIssue, secondIssue, otherProduct, draft, otherFloor],
  floorWarehouseId: 'floor',
  balances,
});

assert.equal(cards.length, 2, 'one card per product');
assert.equal(cards[0].productId, 'sku-other', 'newest product first');
assert.equal(cards[1].productId, 'sku-999n');
assert.equal(cards[1].issues.length, 2, 'issues stay unmerged');
assert.deepEqual(
  cards[1].issues.map((issue) => issue.order.quantity),
  [1340, 1000],
  'must not sum 1000+1340 into 2340',
);
assert.equal(cards[1].issues[0].summaryAr, 'مصروف لخطة إنتاج 1,340 قطعة');
assert.equal(cards[1].issues[1].summaryAr, 'مصروف لخطة إنتاج 1,000 قطعة');
assert.equal(cards[1].issues[0].lines[0].issuedQty, 1340);
assert.equal(cards[1].issues[1].lines[0].issuedQty, 1000);
assert.equal(cards[1].issues[0].lines[0].floorQty, 2340);

const inRange = groupIssuedOrdersByProduct({
  orders: [firstIssue, secondIssue],
  floorWarehouseId: 'floor',
  range: { startDate: '2026-08-15T00:00:00.000Z', endDate: '2026-08-17T00:00:00.000Z' },
});
assert.equal(inRange.length, 1);
assert.equal(inRange[0].issues.length, 1);
assert.equal(inRange[0].issues[0].order.quantity, 1340);

const searched = filterProductCards(cards, 'MAT-001');
assert.equal(searched.length, 1);
assert.equal(searched[0].productId, 'sku-999n');

const exported = flattenProductCardsForExport(cards.filter((card) => card.productId === 'sku-999n'));
assert.equal(exported.length, 4);
assert.deepEqual(
  exported.map((row) => row.كمية_هذا_الصرف),
  [1340, 1340, 1000, 1000],
);
assert.ok(!exported.some((row) => row.كمية_المنتج_لهذا_الصرف === 2340));
assert.ok(!exported.some((row) => row.كمية_هذا_الصرف === 2340));

assert.equal(
  floorIssueSummaryAr({ quantity: 2340, sourceType: 'production_plan' }),
  'مصروف لخطة إنتاج 2,340 قطعة',
);

const reportForPlan = {
  id: 'rep-1',
  productId: 'sku-999n',
  productionPlanId: 'plan-1',
  date: '2026-08-16',
  quantityProduced: 400,
} as ProductionReport;
const reportOtherProduct = {
  id: 'rep-2',
  productId: 'other',
  productionPlanId: 'plan-1',
  date: '2026-08-16',
  quantityProduced: 10,
} as ProductionReport;
const reportUnrelated = {
  id: 'rep-3',
  productId: 'sku-999n',
  productionPlanId: 'plan-other',
  date: '2026-08-16',
  quantityProduced: 5,
} as ProductionReport;
const affected = reportsAffectedByFloorIssue({
  issue: firstIssue,
  reports: [reportForPlan, reportOtherProduct, reportUnrelated],
});
assert.deepEqual(affected.map((row) => row.id), ['rep-1']);
assert.equal(affected[0].quantityProduced, 400);

{
  const singleIssue = order({
    id: 'iss-balance',
    productId: 'sku-999n',
    quantity: 2340,
    productionPlanId: 'plan-1',
    issuedAt: '2026-08-10T08:00:00.000Z',
  });
  const reportsForBalance = [
    { id: 'r1', productId: 'sku-999n', productionPlanId: 'plan-1', date: '2026-08-16', quantityProduced: 400, processingState: 'completed' },
    { id: 'r2', productId: 'sku-999n', productionPlanId: 'plan-1', date: '2026-08-15', quantityProduced: 400 },
    { id: 'r3', productId: 'sku-999n', productionPlanId: 'plan-1', date: '2026-08-13', quantityProduced: 480, processingState: 'completed' },
    { id: 'r4', productId: 'sku-999n', productionPlanId: 'plan-1', date: '2026-08-12', quantityProduced: 500 },
    { id: 'r5', productId: 'sku-999n', productionPlanId: 'plan-1', date: '2026-08-11', quantityProduced: 460 },
  ] as ProductionReport[];
  const balance = floorIssuePieceBalance({
    issue: singleIssue,
    reports: reportsForBalance,
  });
  assert.deepEqual(balance, { issuedQty: 2340, producedQty: 2240, remainingQty: 100 });
  assert.deepEqual(
    floorIssuePieceBalanceFromProduced(2340, 2240),
    { issuedQty: 2340, producedQty: 2240, remainingQty: 100 },
  );
}

{
  const issue = order({
    id: 'iss-pending',
    productId: 'sku-999n',
    quantity: 1000,
    productionPlanId: 'plan-1',
  });
  const pendingOnly = floorIssuePieceBalance({
    issue,
    reports: [
      {
        id: 'pending-1',
        productId: 'sku-999n',
        productionPlanId: 'plan-1',
        date: '2026-08-16',
        quantityProduced: 500,
        processingState: 'pending',
      },
      {
        id: 'failed-1',
        productId: 'sku-999n',
        productionPlanId: 'plan-1',
        date: '2026-08-16',
        quantityProduced: 200,
        processingState: 'failed',
      },
    ] as ProductionReport[],
  });
  assert.deepEqual(pendingOnly, { issuedQty: 1000, producedQty: 0, remainingQty: 1000 });
}

{
  const issue = order({
    id: 'iss-pack',
    productId: 'sku-999n',
    quantity: 1000,
    productionPlanId: 'plan-1',
  });
  const packagingIgnored = floorIssuePieceBalance({
    issue,
    reports: [
      {
        id: 'pack-1',
        productId: 'sku-999n',
        productionPlanId: 'plan-1',
        date: '2026-08-16',
        quantityProduced: 300,
        reportType: 'packaging',
        processingState: 'completed',
      },
      {
        id: 'fg-1',
        productId: 'sku-999n',
        productionPlanId: 'plan-1',
        date: '2026-08-16',
        quantityProduced: 200,
        reportType: 'finished_product',
        processingState: 'completed',
      },
    ] as ProductionReport[],
  });
  assert.deepEqual(packagingIgnored, { issuedQty: 1000, producedQty: 200, remainingQty: 800 });
}

{
  const older = order({
    id: 'iss-old',
    productId: 'sku-999n',
    quantity: 1000,
    productionPlanId: 'plan-1',
    issuedAt: '2026-08-10T08:00:00.000Z',
  });
  const newer = order({
    id: 'iss-new',
    productId: 'sku-999n',
    quantity: 1340,
    productionPlanId: 'plan-1',
    issuedAt: '2026-08-16T08:00:00.000Z',
  });
  const sharedReports = [
    { id: 's1', productId: 'sku-999n', productionPlanId: 'plan-1', date: '2026-08-11', quantityProduced: 400 },
    { id: 's2', productId: 'sku-999n', productionPlanId: 'plan-1', date: '2026-08-12', quantityProduced: 500 },
    { id: 's3', productId: 'sku-999n', productionPlanId: 'plan-1', date: '2026-08-13', quantityProduced: 480 },
    { id: 's4', productId: 'sku-999n', productionPlanId: 'plan-1', date: '2026-08-15', quantityProduced: 400 },
    { id: 's5', productId: 'sku-999n', productionPlanId: 'plan-1', date: '2026-08-16', quantityProduced: 460 },
  ] as ProductionReport[];
  const allocated = allocateFloorIssuePieceBalances({
    issues: [newer, older],
    reports: sharedReports,
  });
  assert.deepEqual(allocated.get('iss-old'), { issuedQty: 1000, producedQty: 1000, remainingQty: 0 });
  assert.deepEqual(allocated.get('iss-new'), { issuedQty: 1340, producedQty: 1240, remainingQty: 100 });
  assert.deepEqual(
    sumFloorIssuePieceBalances(allocated.values()),
    { issuedQty: 2340, producedQty: 2240, remainingQty: 100 },
  );
}

const pageSrc = readFileSync(
  new URL('../modules/inventory/pages/ProductionFloorStock.tsx', import.meta.url),
  'utf8',
);
assert.match(pageSrc, /groupIssuedOrdersByProduct/);
assert.match(pageSrc, /فتح التفاصيل/);
assert.match(pageSrc, /\/production\/floor\/\$\{encodeURIComponent\(card\.productId\)\}/);
assert.match(pageSrc, /floorIssuePieceBalancesForProductCard/);
assert.match(pageSrc, /منصرف/);
assert.match(pageSrc, /باقي/);
assert.doesNotMatch(pageSrc, /أول المدة/);
assert.doesNotMatch(pageSrc, /expand_more/);
assert.doesNotMatch(pageSrc, /buildWarehousePeriodReport/);
assert.match(pageSrc, /listIssuedForTargetWarehouse/);
assert.match(pageSrc, /useFloorIssuePrint/);

const detailSrc = readFileSync(
  new URL('../modules/inventory/pages/ProductionFloorProductDetail.tsx', import.meta.url),
  'utf8',
);
assert.match(detailSrc, /منصرف/);
assert.match(detailSrc, /إنتاج/);
assert.match(detailSrc, /باقي/);
assert.match(detailSrc, /تفاصيل الخطة \/ أمر الشغل/);
assert.match(detailSrc, /التقارير التي تأثرت بهذا الصرف/);
assert.match(detailSrc, /إجمالي رصيد هذا الصرف/);
assert.match(detailSrc, /floorIssuePieceBalancesForProductCard/);
assert.match(detailSrc, /reportsAffectedByFloorIssue/);
assert.match(detailSrc, /Promise\.allSettled/);

const inventoryRoutesSrc = readFileSync(
  new URL('../modules/inventory/routes/index.ts', import.meta.url),
  'utf8',
);
assert.match(inventoryRoutesSrc, /path: '\/inventory\/production-floor\/:productId'/);
assert.match(inventoryRoutesSrc, /redirectTo: '\/production\/floor\/:productId'/);

const productionRoutesSrc = readFileSync(
  new URL('../modules/production/routes/index.ts', import.meta.url),
  'utf8',
);
assert.match(productionRoutesSrc, /path: '\/production\/floor\/:productId'/);

console.log('production-floor-product-cards.test.ts: ok');
