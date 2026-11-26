import assert from 'node:assert/strict';
import test from 'node:test';
import { getMissingIndexes } from '../scripts/deploy-firestore.mjs';

test('additive index diff includes only absent definitions and deduplicates config entries', () => {
  const existing = {
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'tenantId', order: 'ASCENDING' },
      { fieldPath: 'date', order: 'DESCENDING' },
      { fieldPath: '__name__', order: 'DESCENDING' },
    ],
  };
  const configured = [
    { ...existing, collectionGroup: 'reports' },
    { ...existing, collectionGroup: 'reports' },
    {
      collectionGroup: 'reports',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'status', arrayConfig: 'CONTAINS' },
      ],
    },
  ];

  const missing = getMissingIndexes(configured, [existing]);

  assert.equal(missing.length, 1);
  assert.equal(missing[0].fields[1].arrayConfig, 'CONTAINS');
});
