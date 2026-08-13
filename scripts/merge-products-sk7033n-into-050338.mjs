#!/usr/bin/env node
/**
 * One-off: merge duplicate SK-7033N catalog rows.
 *
 * Keep 56OaOgiULsbW0dbmogH7 (has production reports, repair jobs, BOM, stock)
 * Adopt code 050338 + barcode from empty R4sB4o5hDYj7m7RvySzB, then delete it.
 *
 * Dry-run by default. Apply with: --apply
 *
 * Auth: firebase login (REST) or GOOGLE_APPLICATION_CREDENTIALS / --credentials
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import {
  createRestFirestore,
  hasFirebaseToolsLogin,
} from './lib/firestoreRestAdmin.mjs';
import { buildSearchPrefixes } from '../lib/firestoreSearch.ts';

const TENANT_ID = 'MNa4ceoo4E4tdxm8p3xY';
const KEEP_ID = '56OaOgiULsbW0dbmogH7'; // operational SK-7033N (was code 007033)
const FROM_ID = 'R4sB4o5hDYj7m7RvySzB'; // empty catalog duplicate (code 050338)
const KEEP_CODE = '050338';
const KEEP_BARCODE = '6974824280921';
const PROJECT_ID = 'sokany-production';

function getFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] || '' : '';
}

const apply = process.argv.includes('--apply');
const backupArg = getFlagValue(process.argv, '--backup').trim();
const backupPath = resolve(
  process.cwd(),
  backupArg || `tmp/merge-sk7033n-into-050338-${apply ? 'apply' : 'dry-run'}-${Date.now()}.json`,
);

async function createDb() {
  const credentialsRaw = (getFlagValue(process.argv, '--credentials') || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (credentialsRaw) {
    const { cert, getApps, initializeApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (!getApps().length) {
      const credentialsPath = isAbsolute(credentialsRaw) ? credentialsRaw : resolve(process.cwd(), credentialsRaw);
      initializeApp({ projectId: PROJECT_ID, credential: cert(credentialsPath) });
    }
    return getFirestore();
  }
  if (!hasFirebaseToolsLogin()) {
    throw new Error('Run: firebase login  (or pass --credentials)');
  }
  return createRestFirestore({ projectId: PROJECT_ID });
}

async function queryEq(db, collectionName, field, value) {
  const snap = await db
    .collection(collectionName)
    .where('tenantId', '==', TENANT_ID)
    .where(field, '==', value)
    .limit(500)
    .get();
  return snap.docs;
}

async function loadDoc(db, collectionName, id) {
  const snap = await db.collection(collectionName).doc(id).get();
  return snap.exists ? { id: snap.id, path: `${collectionName}/${snap.id}`, data: snap.data() || {} } : null;
}

function barcodeClaimId(barcode) {
  return `${TENANT_ID}__${encodeURIComponent(barcode)}`;
}

async function main() {
  const db = await createDb();

  const keepProduct = await loadDoc(db, 'products', KEEP_ID);
  const fromProduct = await loadDoc(db, 'products', FROM_ID);
  if (!keepProduct) throw new Error(`Keep product missing: ${KEEP_ID}`);
  if (!fromProduct) throw new Error(`From product missing: ${FROM_ID}`);

  if (String(keepProduct.data.tenantId) !== TENANT_ID || String(fromProduct.data.tenantId) !== TENANT_ID) {
    throw new Error('Tenant mismatch — aborting merge.');
  }

  const fromRefs = {
    production_reports: (await queryEq(db, 'production_reports', 'productId', FROM_ID)).length,
    repair_jobs: (await queryEq(db, 'repair_jobs', 'productId', FROM_ID)).length,
    stock_items: (await queryEq(db, 'stock_items', 'itemId', FROM_ID)).length,
    stock_transactions: (await queryEq(db, 'stock_transactions', 'itemId', FROM_ID)).length,
    repair_custody_records: (await queryEq(db, 'repair_custody_records', 'productId', FROM_ID)).length,
    production_plans: (await queryEq(db, 'production_plans', 'productId', FROM_ID)).length,
  };
  const unexpectedFromRefs = Object.entries(fromRefs).filter(([, count]) => count > 0);
  if (unexpectedFromRefs.length) {
    throw new Error(`Empty duplicate is not empty: ${JSON.stringify(Object.fromEntries(unexpectedFromRefs))}`);
  }

  const keepRefs = {
    production_reports: (await queryEq(db, 'production_reports', 'productId', KEEP_ID)).length,
    production_report_uniques: (await queryEq(db, 'production_report_uniques', 'productId', KEEP_ID)).length,
    repair_jobs: (await queryEq(db, 'repair_jobs', 'productId', KEEP_ID)).length,
    repair_custody_records: (await queryEq(db, 'repair_custody_records', 'productId', KEEP_ID)).length,
    boms: (await queryEq(db, 'boms', 'ownerId', KEEP_ID)).length,
    monthly_production_costs: (await queryEq(db, 'monthly_production_costs', 'productId', KEEP_ID)).length,
    production_routing_plans: (await queryEq(db, 'production_routing_plans', 'productId', KEEP_ID)).length,
    stock_items: (await queryEq(db, 'stock_items', 'itemId', KEEP_ID)).length,
    stock_transactions: (await queryEq(db, 'stock_transactions', 'itemId', KEEP_ID)).length,
  };

  const claim = await loadDoc(db, 'product_barcode_claims', barcodeClaimId(KEEP_BARCODE));
  const searchPrefixes = buildSearchPrefixes([KEEP_CODE, KEEP_BARCODE, keepProduct.data.name]);
  const productPatch = {
    code: KEEP_CODE,
    barcode: KEEP_BARCODE,
    barcodeNormalized: KEEP_BARCODE,
    searchPrefixes,
    mergedFromProductId: FROM_ID,
    mergedAt: new Date().toISOString(),
  };
  const claimPatch = {
    tenantId: TENANT_ID,
    barcode: KEEP_BARCODE,
    productId: KEEP_ID,
    updatedAt: new Date().toISOString(),
  };

  const plan = {
    mode: apply ? 'apply' : 'dry-run',
    tenantId: TENANT_ID,
    strategy: 'keep-operational-id-adopt-catalog-code',
    keep: { id: KEEP_ID, codeBefore: keepProduct.data.code, name: keepProduct.data.name, refs: keepRefs },
    from: { id: FROM_ID, code: fromProduct.data.code, name: fromProduct.data.name, snapshot: fromProduct.data },
    productPatch,
    claimPatch,
    deleteProductId: FROM_ID,
  };

  mkdirSync(dirname(backupPath), { recursive: true });
  if (existsSync(backupPath)) throw new Error(`Backup exists: ${backupPath}`);
  writeFileSync(backupPath, JSON.stringify(plan, null, 2));
  console.log(`[backup] ${backupPath}`);
  console.log(
    JSON.stringify(
      {
        mode: plan.mode,
        keep: { id: KEEP_ID, codeBefore: keepProduct.data.code, codeAfter: KEEP_CODE, name: keepProduct.data.name },
        from: { id: FROM_ID, code: fromProduct.data.code, name: fromProduct.data.name },
        keepRefs,
        fromRefs,
        barcodeClaimBefore: claim?.data || null,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to commit.');
    return;
  }

  const batch = db.batch();
  batch.update(db.collection('products').doc(KEEP_ID), productPatch);
  batch.set(db.collection('product_barcode_claims').doc(barcodeClaimId(KEEP_BARCODE)), claimPatch, { merge: true });
  batch.delete(db.collection('products').doc(FROM_ID));
  await batch.commit();

  const keepAfter = await loadDoc(db, 'products', KEEP_ID);
  const fromAfter = await loadDoc(db, 'products', FROM_ID);
  const claimAfter = await loadDoc(db, 'product_barcode_claims', barcodeClaimId(KEEP_BARCODE));
  const leftoverKeepCode = await queryEq(db, 'products', 'code', '007033');
  const leftoverNewCode = await queryEq(db, 'products', 'code', KEEP_CODE);
  const leftoverFromJobs = await queryEq(db, 'repair_jobs', 'productId', FROM_ID);
  const leftoverKeepJobs = await queryEq(db, 'repair_jobs', 'productId', KEEP_ID);

  const result = {
    appliedAt: new Date().toISOString(),
    keepStillExists: Boolean(keepAfter),
    keepCode: keepAfter?.data?.code || null,
    keepBarcode: keepAfter?.data?.barcode || null,
    fromDeleted: !fromAfter,
    barcodeClaimProductId: claimAfter?.data?.productId || null,
    productsWithOldCode: leftoverKeepCode.length,
    productsWithNewCode: leftoverNewCode.map((d) => d.id),
    repairJobsOnDeletedId: leftoverFromJobs.length,
    repairJobsOnKeepId: leftoverKeepJobs.length,
  };
  const resultPath = backupPath.replace(/\.json$/, '.result.json');
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log('[result]', resultPath);
  console.log(JSON.stringify(result, null, 2));
  if (!result.fromDeleted || result.keepCode !== KEEP_CODE || result.barcodeClaimProductId !== KEEP_ID || result.productsWithNewCode.length !== 1) {
    throw new Error('Merge applied but verification failed.');
  }
  console.log('Merge complete: SK-7033N duplicate → 050338 on operational product');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
