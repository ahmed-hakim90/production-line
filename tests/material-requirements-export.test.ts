import assert from 'node:assert/strict';
import {
  aggregateByMaterialKey,
  aggregateByProductCategoryKey,
  materialAggregateKey,
  productCategoryAggregateKey,
  type MaterialRequirementDetailExportRow,
} from '../modules/manufacturing/lib/materialRequirementsExportLib.ts';

function detailRow(
  overrides: Partial<MaterialRequirementDetailExportRow> = {},
): MaterialRequirementDetailExportRow {
  return {
    productId: 'p1',
    productCode: 'P1',
    productName: 'منتج 1',
    productCategoryLabel: 'أثاث',
    productQuantity: 10,
    materialId: 'm1',
    materialCode: 'M1',
    materialName: 'مادة 1',
    materialCategoryName: 'خام',
    materialType: 'raw_material',
    materialTypeLabel: 'مادة خام',
    requiredQty: 5,
    unit: 'kg',
    availableQty: 100,
    reservedQty: 0,
    shortageQty: 0,
    estimatedCost: 50,
    ...overrides,
  };
}

// Same material + category + unit merges quantities
{
  const rows = [
    detailRow({ requiredQty: 3, estimatedCost: 30 }),
    detailRow({ requiredQty: 7, estimatedCost: 70, productId: 'p2', productCategoryLabel: 'إكسسوار' }),
  ];
  assert.equal(materialAggregateKey(rows[0]), materialAggregateKey(rows[1]));
  const summary = aggregateByMaterialKey(rows);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].requiredQty, 10);
  assert.equal(summary[0].estimatedCost, 100);
  assert.equal(summary[0].itemCount, 2);
  assert.equal(summary[0].availableQty, 100);
}

// Different unit does not merge
{
  const a = detailRow({ unit: 'kg' });
  const b = detailRow({ unit: 'piece' });
  assert.notEqual(materialAggregateKey(a), materialAggregateKey(b));
  assert.equal(aggregateByMaterialKey([a, b]).length, 2);
}

// Different material type does not merge
{
  const a = detailRow({ materialType: 'raw_material' });
  const b = detailRow({ materialType: 'consumable' });
  assert.notEqual(materialAggregateKey(a), materialAggregateKey(b));
}

// Product category aggregation sums required qty per category
{
  const rows = [
    detailRow({ productCategoryLabel: 'أثاث', requiredQty: 4, estimatedCost: 40 }),
    detailRow({ productCategoryLabel: 'أثاث', requiredQty: 6, estimatedCost: 60, materialId: 'm2', materialCode: 'M2' }),
    detailRow({ productCategoryLabel: 'إكسسوار', requiredQty: 2, estimatedCost: 20 }),
  ];
  assert.equal(productCategoryAggregateKey(rows[0]), 'أثاث');
  const summary = aggregateByProductCategoryKey(rows);
  assert.equal(summary.length, 2);
  const furniture = summary.find((s) => s.categoryLabel === 'أثاث');
  assert.ok(furniture);
  assert.equal(furniture!.requiredQty, 10);
  assert.equal(furniture!.estimatedCost, 100);
  assert.equal(furniture!.materialName, 'متعدد');
}

// Shortage recalculated from summed required vs stock (material summary)
{
  const rows = [
    detailRow({ requiredQty: 60, availableQty: 100, reservedQty: 0 }),
    detailRow({ requiredQty: 50, availableQty: 100, reservedQty: 0 }),
  ];
  const summary = aggregateByMaterialKey(rows);
  assert.equal(summary[0].requiredQty, 110);
  assert.equal(summary[0].shortageQty, 10);
}

console.log('material-requirements-export.test.ts: ok');
