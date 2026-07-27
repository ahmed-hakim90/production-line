#!/usr/bin/env node
/**
 * One-off: merge product «جريل ٣٠٣» (code ٣٠٣-١) into «KJ-303 ساندوتش» (code 050275).
 *
 * Dry-run by default. Apply with: --apply
 *
 * Auth: firebase login (REST) or GOOGLE_APPLICATION_CREDENTIALS / --credentials
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import {
  createRestFirestore,
  DOCUMENT_ID_FIELD,
  hasFirebaseToolsLogin,
} from './lib/firestoreRestAdmin.mjs';

const TENANT_ID = 'MNa4ceoo4E4tdxm8p3xY';
const KEEP_ID = 'oWlopK7LxEAtF4WQkSth'; // 050275
const FROM_ID = 'qwvByDNLD6sEDbU2yvyB'; // جريل ٣٠٣ / ٣٠٣-١
const PROJECT_ID = 'sokany-production';
const BATCH_SIZE = 400;

function getFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] || '' : '';
}

const apply = process.argv.includes('--apply');
const backupArg = getFlagValue(process.argv, '--backup').trim();
const backupPath = resolve(
  process.cwd(),
  backupArg || `tmp/merge-grill-into-050275-${apply ? 'apply' : 'dry-run'}-${Date.now()}.json`,
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

function rewriteUniqueDocId(docId) {
  return String(docId).replace(FROM_ID.toLowerCase(), KEEP_ID.toLowerCase());
}

async function main() {
  const db = await createDb();

  const keepProduct = await loadDoc(db, 'products', KEEP_ID);
  const fromProduct = await loadDoc(db, 'products', FROM_ID);
  if (!keepProduct) throw new Error(`Keep product missing: ${KEEP_ID}`);
  if (!fromProduct) throw new Error(`From product missing: ${FROM_ID}`);

  const reports = await queryEq(db, 'production_reports', 'productId', FROM_ID);
  const uniques = await queryEq(db, 'production_report_uniques', 'productId', FROM_ID);
  const productMaterials = await queryEq(db, 'product_materials', 'productId', FROM_ID);
  const boms = await queryEq(db, 'boms', 'ownerId', FROM_ID);
  const monthlyFrom = await queryEq(db, 'monthly_production_costs', 'productId', FROM_ID);
  const julyKeep = await loadDoc(db, 'monthly_production_costs', `${KEEP_ID}_2026-07`);
  const julyFrom = await loadDoc(db, 'monthly_production_costs', `${FROM_ID}_2026-07`);

  const uniquePlans = uniques.map((d) => {
    const data = d.data() || {};
    const nextId = rewriteUniqueDocId(d.id);
    return {
      oldId: d.id,
      nextId,
      reportId: data.reportId,
      data: { ...data, productId: KEEP_ID },
    };
  });

  const collisions = uniquePlans.filter((p) => p.nextId === p.oldId || !p.nextId.includes(KEEP_ID.toLowerCase()));
  if (collisions.length) {
    throw new Error(`Unique key rewrite failed for: ${collisions.map((c) => c.oldId).join(', ')}`);
  }

  let mergedJuly = null;
  if (julyFrom) {
    if (julyKeep) {
      const keepQty = Number(julyKeep.data.totalProducedQty || 0);
      const fromQty = Number(julyFrom.data.totalProducedQty || 0);
      const keepDirect = Number(julyKeep.data.directCost || 0);
      const fromDirect = Number(julyFrom.data.directCost || 0);
      const keepIndirect = Number(julyKeep.data.indirectCost || 0);
      const fromIndirect = Number(julyFrom.data.indirectCost || 0);
      const totalProducedQty = keepQty + fromQty;
      const directCost = keepDirect + fromDirect;
      const indirectCost = keepIndirect + fromIndirect;
      const totalProductionCost = directCost + indirectCost;
      mergedJuly = {
        id: julyKeep.id,
        data: {
          ...julyKeep.data,
          productId: KEEP_ID,
          totalProducedQty,
          directCost,
          indirectCost,
          totalProductionCost,
          averageUnitCost: totalProducedQty > 0 ? totalProductionCost / totalProducedQty : 0,
          calculatedAt: new Date().toISOString(),
          mergedFromProductId: FROM_ID,
          mergedFromMonthDocId: julyFrom.id,
        },
      };
    } else {
      mergedJuly = {
        id: `${KEEP_ID}_2026-07`,
        data: {
          ...julyFrom.data,
          productId: KEEP_ID,
          calculatedAt: new Date().toISOString(),
          mergedFromProductId: FROM_ID,
          mergedFromMonthDocId: julyFrom.id,
        },
      };
    }
  }

  const plan = {
    mode: apply ? 'apply' : 'dry-run',
    tenantId: TENANT_ID,
    keep: { id: KEEP_ID, code: keepProduct.data.code, name: keepProduct.data.name },
    from: { id: FROM_ID, code: fromProduct.data.code, name: fromProduct.data.name, snapshot: fromProduct.data },
    updates: {
      production_reports: reports.map((d) => ({ id: d.id, data: d.data() })),
      production_report_uniques: uniquePlans,
      product_materials: productMaterials.map((d) => ({ id: d.id, data: d.data() })),
      boms: boms.map((d) => ({ id: d.id, data: d.data() })),
      monthly_production_costs_from: monthlyFrom.map((d) => ({ id: d.id, data: d.data() })),
      monthly_july_merged: mergedJuly,
    },
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
        keep: plan.keep,
        from: { id: plan.from.id, code: plan.from.code, name: plan.from.name },
        counts: {
          reports: reports.length,
          uniques: uniquePlans.length,
          productMaterials: productMaterials.length,
          boms: boms.length,
          monthlyFrom: monthlyFrom.length,
          mergeJuly: Boolean(mergedJuly),
        },
      },
      null,
      2,
    ),
  );

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

  for (const d of reports) {
    batch.update(d.ref, { productId: KEEP_ID });
    await touch();
  }

  for (const u of uniquePlans) {
    const oldRef = db.collection('production_report_uniques').doc(u.oldId);
    const nextRef = db.collection('production_report_uniques').doc(u.nextId);
    batch.set(nextRef, u.data);
    await touch();
    batch.delete(oldRef);
    await touch();
  }

  for (const d of productMaterials) {
    batch.update(d.ref, { productId: KEEP_ID });
    await touch();
  }

  for (const d of boms) {
    batch.update(d.ref, { ownerId: KEEP_ID });
    await touch();
  }

  if (mergedJuly) {
    batch.set(db.collection('monthly_production_costs').doc(mergedJuly.id), mergedJuly.data);
    await touch();
  }
  for (const d of monthlyFrom) {
    batch.delete(d.ref);
    await touch();
  }

  batch.delete(db.collection('products').doc(FROM_ID));
  await touch();
  await flush();

  // Verify no remaining FROM refs in known collections
  const leftover = {};
  for (const [col, field] of [
    ['production_reports', 'productId'],
    ['production_report_uniques', 'productId'],
    ['product_materials', 'productId'],
    ['boms', 'ownerId'],
    ['monthly_production_costs', 'productId'],
    ['products', 'code'],
  ]) {
    if (col === 'products') {
      const still = await loadDoc(db, 'products', FROM_ID);
      leftover.products = still ? 1 : 0;
      continue;
    }
    const rows = await queryEq(db, col, field, FROM_ID);
    leftover[col] = rows.length;
  }

  const keepAfter = await loadDoc(db, 'products', KEEP_ID);
  const resultPath = backupPath.replace(/\.json$/, '.result.json');
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        appliedAt: new Date().toISOString(),
        leftover,
        keepStillExists: Boolean(keepAfter),
        julyMergedQty: mergedJuly?.data?.totalProducedQty ?? null,
      },
      null,
      2,
    ),
  );
  console.log('[result]', resultPath);
  console.log('[leftover]', leftover);
  console.log('Merge complete: جريل ٣٠٣ → 050275');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
