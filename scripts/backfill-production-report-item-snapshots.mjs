#!/usr/bin/env node
/**
 * Backfill immutable product/material labels on production reports.
 *
 * Dry-run:
 *   node scripts/backfill-production-report-item-snapshots.mjs --tenant <tenantId>
 *
 * Apply:
 *   node scripts/backfill-production-report-item-snapshots.mjs --tenant <tenantId> --apply
 */
import { createRestFirestore, hasFirebaseToolsLogin } from './lib/firestoreRestAdmin.mjs';

const getFlagValue = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const tenantId = getFlagValue('--tenant');
const projectId = getFlagValue('--project') || 'sokany-production';
const apply = process.argv.includes('--apply');
const pageLimit = 5000;

if (!tenantId) throw new Error('Missing required --tenant value.');
if (!hasFirebaseToolsLogin()) throw new Error('Run firebase login before this script.');

const db = createRestFirestore({ projectId });

async function loadTenantCollection(collectionName) {
  const snapshot = await db
    .collection(collectionName)
    .where('tenantId', '==', tenantId)
    .limit(pageLimit)
    .get();
  if (snapshot.size === pageLimit) {
    throw new Error(`${collectionName} reached the safety limit (${pageLimit}); add pagination before applying.`);
  }
  return snapshot.docs;
}

const [productDocs, materialDocs, legacyRawMaterialDocs, reportDocs] = await Promise.all([
  loadTenantCollection('products'),
  loadTenantCollection('materials'),
  loadTenantCollection('raw_materials'),
  loadTenantCollection('production_reports'),
]);

const products = new Map(productDocs.map((document) => [document.id, document.data()]));
const components = new Map(
  [...legacyRawMaterialDocs, ...materialDocs].map((document) => [document.id, document.data()]),
);

const updates = [];
const unresolvedCounts = new Map();

for (const document of reportDocs) {
  const report = document.data();
  const productId = String(report.productId || '').trim();
  const reportType = report.reportType === 'component_injection'
    ? 'component_injection'
    : 'finished_product';
  const item = (reportType === 'component_injection' ? components : products).get(productId);

  if (!item) {
    unresolvedCounts.set(productId, (unresolvedCounts.get(productId) || 0) + 1);
    continue;
  }

  const productNameSnapshot = String(item.name || '').trim();
  const productCodeSnapshot = String(item.code || '').trim();
  if (!productNameSnapshot) {
    unresolvedCounts.set(productId, (unresolvedCounts.get(productId) || 0) + 1);
    continue;
  }

  if (
    report.productNameSnapshot === productNameSnapshot
    && String(report.productCodeSnapshot || '') === productCodeSnapshot
  ) {
    continue;
  }

  updates.push({
    ref: document.ref,
    data: {
      productNameSnapshot,
      productCodeSnapshot,
    },
  });
}

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  reportsScanned: reportDocs.length,
  reportsToUpdate: updates.length,
  unresolvedReports: Array.from(unresolvedCounts.values()).reduce((sum, count) => sum + count, 0),
  unresolvedProductIds: Array.from(unresolvedCounts.entries())
    .map(([productId, count]) => ({ productId, count }))
    .sort((a, b) => b.count - a.count),
}, null, 2));

if (!apply) {
  console.log('Dry-run only. Re-run with --apply to save snapshots.');
  process.exit(0);
}

for (let offset = 0; offset < updates.length; offset += 400) {
  const batch = db.batch();
  for (const update of updates.slice(offset, offset + 400)) {
    batch.update(update.ref, update.data);
  }
  await batch.commit();
}

console.log(`Updated ${updates.length} production reports.`);
