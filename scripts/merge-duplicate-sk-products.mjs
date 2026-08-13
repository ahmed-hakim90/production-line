#!/usr/bin/env node
/**
 * Merge remaining same-name SK catalog duplicates into the operational product.
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
const PROJECT_ID = 'sokany-production';
const BATCH_SIZE = 400;

const PAIRS = [
  {
    sk: 'SK-14013',
    keepId: 'a08OSyHtm5fhX48S3eNQ',
    fromId: 'bqhy49rbCRPKhZ8pBOKW',
    adoptCode: '030566',
    adoptBarcode: '6942242503830',
  },
  {
    sk: 'SK-16011',
    keepId: 'GjVbeBx4oAjuUk3lw9FD',
    fromId: 'hfeqEbIX0C1bfgIrxvJw',
    adoptCode: '010559',
    adoptBarcode: '6942242500273',
  },
  {
    sk: 'SK-19107',
    keepId: 'K1Jj8v6mlJj0JBs1v4wd',
    fromId: 'Pqpr2AcdisuANGCtPdi0',
    adoptCode: '051024',
    adoptBarcode: '6942242520486',
  },
  {
    sk: 'SK-444',
    keepId: 'm4uuxhYKfS0lBYKslTWq',
    fromId: 'ujTQ9qDv8z8j5aX9NtFj',
    adoptCode: '050072',
    adoptBarcode: '6904440202007',
  },
  {
    sk: 'SK-2403',
    keepId: 'u5kW2aikqVi5ddc3DHVq',
    fromId: 'XWoTfZ1jI5rA6fsLa9nt',
    rewriteBom: true,
    deleteFromMonthlyCosts: true,
  },
];

const BLOCKING_FROM_FIELDS = [
  ['production_reports', 'productId'],
  ['repair_jobs', 'productId'],
  ['stock_items', 'itemId'],
  ['stock_transactions', 'itemId'],
  ['repair_custody_records', 'productId'],
  ['production_plans', 'productId'],
  ['work_orders', 'productId'],
];

function getFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] || '' : '';
}

const apply = process.argv.includes('--apply');
const backupArg = getFlagValue(process.argv, '--backup').trim();
const backupPath = resolve(
  process.cwd(),
  backupArg || `tmp/merge-duplicate-sk-products-${apply ? 'apply' : 'dry-run'}-${Date.now()}.json`,
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

function barcodeClaimDocId(barcode) {
  return `${TENANT_ID}__${encodeURIComponent(barcode)}`;
}

async function main() {
  const db = await createDb();
  const planned = [];

  for (const pair of PAIRS) {
    const keepProduct = await loadDoc(db, 'products', pair.keepId);
    const fromProduct = await loadDoc(db, 'products', pair.fromId);
    if (!keepProduct) throw new Error(`${pair.sk}: keep product missing ${pair.keepId}`);
    if (!fromProduct) throw new Error(`${pair.sk}: from product missing ${pair.fromId}`);
    if (String(keepProduct.data.tenantId) !== TENANT_ID || String(fromProduct.data.tenantId) !== TENANT_ID) {
      throw new Error(`${pair.sk}: tenant mismatch`);
    }

    const blocking = {};
    for (const [col, field] of BLOCKING_FROM_FIELDS) {
      const rows = await queryEq(db, col, field, pair.fromId);
      if (rows.length) blocking[col] = rows.length;
    }
    if (Object.keys(blocking).length) {
      throw new Error(`${pair.sk}: from product still has operational refs ${JSON.stringify(blocking)}`);
    }

    const boms = pair.rewriteBom ? await queryEq(db, 'boms', 'ownerId', pair.fromId) : [];
    const monthlyFrom = pair.deleteFromMonthlyCosts
      ? await queryEq(db, 'monthly_production_costs', 'productId', pair.fromId)
      : [];
    if (!pair.rewriteBom && boms.length) {
      throw new Error(`${pair.sk}: from product has BOM but rewriteBom is not set`);
    }

    const adoptCode = pair.adoptCode || String(keepProduct.data.code || '').trim();
    const adoptBarcode = pair.adoptBarcode || String(keepProduct.data.barcodeNormalized || keepProduct.data.barcode || '').trim();
    const productPatch = {
      mergedFromProductId: pair.fromId,
      mergedAt: new Date().toISOString(),
    };
    if (pair.adoptCode) productPatch.code = pair.adoptCode;
    if (pair.adoptBarcode) {
      productPatch.barcode = pair.adoptBarcode;
      productPatch.barcodeNormalized = pair.adoptBarcode;
    }
    productPatch.searchPrefixes = buildSearchPrefixes([
      adoptCode,
      adoptBarcode,
      keepProduct.data.name,
    ]);

    planned.push({
      sk: pair.sk,
      keep: { id: pair.keepId, codeBefore: keepProduct.data.code, name: keepProduct.data.name },
      from: { id: pair.fromId, code: fromProduct.data.code, name: fromProduct.data.name, snapshot: fromProduct.data },
      productPatch,
      adoptBarcode: pair.adoptBarcode || '',
      bomIds: boms.map((d) => d.id),
      monthlyCostIds: monthlyFrom.map((d) => d.id),
    });
  }

  const plan = { mode: apply ? 'apply' : 'dry-run', tenantId: TENANT_ID, planned };
  mkdirSync(dirname(backupPath), { recursive: true });
  if (existsSync(backupPath)) throw new Error(`Backup exists: ${backupPath}`);
  writeFileSync(backupPath, JSON.stringify(plan, null, 2));
  console.log(`[backup] ${backupPath}`);
  console.log(JSON.stringify({
    mode: plan.mode,
    pairs: planned.map((row) => ({
      sk: row.sk,
      keepId: row.keep.id,
      keepCodeBefore: row.keep.codeBefore,
      keepCodeAfter: row.productPatch.code || row.keep.codeBefore,
      fromId: row.from.id,
      fromCode: row.from.code,
      adoptBarcode: row.adoptBarcode || null,
      boms: row.bomIds.length,
      monthlyCostsDeleted: row.monthlyCostIds.length,
    })),
  }, null, 2));

  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to commit.');
    return;
  }

  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };
  const touch = async () => {
    ops += 1;
    if (ops >= BATCH_SIZE) await flush();
  };

  for (const row of planned) {
    batch.update(db.collection('products').doc(row.keep.id), row.productPatch);
    await touch();
    if (row.adoptBarcode) {
      batch.set(
        db.collection('product_barcode_claims').doc(barcodeClaimDocId(row.adoptBarcode)),
        {
          tenantId: TENANT_ID,
          barcode: row.adoptBarcode,
          productId: row.keep.id,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      await touch();
    }
    for (const bomId of row.bomIds) {
      batch.update(db.collection('boms').doc(bomId), { ownerId: row.keep.id });
      await touch();
    }
    for (const costId of row.monthlyCostIds) {
      batch.delete(db.collection('monthly_production_costs').doc(costId));
      await touch();
    }
    batch.delete(db.collection('products').doc(row.from.id));
    await touch();
  }
  await flush();

  const results = [];
  for (const row of planned) {
    const keepAfter = await loadDoc(db, 'products', row.keep.id);
    const fromAfter = await loadDoc(db, 'products', row.from.id);
    const leftoverFromJobs = await queryEq(db, 'repair_jobs', 'productId', row.from.id);
    const leftoverFromReports = await queryEq(db, 'production_reports', 'productId', row.from.id);
    results.push({
      sk: row.sk,
      keepCode: keepAfter?.data?.code || null,
      keepBarcode: keepAfter?.data?.barcode || null,
      fromDeleted: !fromAfter,
      leftoverFromJobs: leftoverFromJobs.length,
      leftoverFromReports: leftoverFromReports.length,
    });
  }
  const resultPath = backupPath.replace(/\.json$/, '.result.json');
  writeFileSync(resultPath, JSON.stringify({ appliedAt: new Date().toISOString(), results }, null, 2));
  console.log('[result]', resultPath);
  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((row) => !row.fromDeleted || row.leftoverFromJobs || row.leftoverFromReports);
  if (failed.length) throw new Error(`Verification failed: ${JSON.stringify(failed)}`);
  console.log('Merge complete for remaining same-name SK duplicates');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
