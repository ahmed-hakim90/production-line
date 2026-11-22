import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexes = JSON.parse(readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8')) as {
  indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order: string }> }>;
};

const required: Array<[string, string, string]> = [
  ['quality_pallets', 'tenantId', 'date'],
  ['quality_pallets', 'tenantId', 'inspectionStatus'],
  ['quality_pallets', 'tenantId', 'workOrderId'],
  ['quality_hourly_samples', 'tenantId', 'date'],
  ['quality_line_sample_pulls', 'tenantId', 'date'],
  ['quality_line_period_statuses', 'tenantId', 'date'],
  ['quality_scrap_reports', 'tenantId', 'reportDate'],
  ['quality_second_sort_reports', 'tenantId', 'reportDate'],
  ['quality_second_sort_returns', 'tenantId', 'reportDate'],
  ['quality_scrap_reasons', 'tenantId', 'nameKey'],
  ['quality_second_sort_reasons', 'tenantId', 'nameKey'],
  ['quality_carton_receipts', 'tenantId', 'receivedDate'],
  ['quality_carton_suppliers', 'tenantId', 'nameKey'],
  ['quality_plastic_receipts', 'tenantId', 'receivedDate'],
  ['quality_plastic_suppliers', 'tenantId', 'nameKey'],
  ['quality_plastic_items', 'tenantId', 'nameKey'],
  ['quality_plastic_rejection_reasons', 'tenantId', 'nameKey'],
  ['production_reports', 'tenantId', 'date'],
];

for (const [collectionGroup, first, second] of required) {
  const match = indexes.indexes.some((index) => (
    index.collectionGroup === collectionGroup
    && index.fields[0]?.fieldPath === first
    && index.fields[1]?.fieldPath === second
    && (index.fields[1]?.order === 'ASCENDING' || index.fields[1]?.order === 'DESCENDING')
  ));
  assert.equal(match, true, `${collectionGroup} needs composite index ${first} + ${second}`);
}

console.log('quality firestore indexes ok');
