import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldPath, getFirestore, type DocumentData, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { buildSearchPrefixes } from '../searchPrefixes.js';

const PROFILES: Record<string, string[]> = {
  products: ['name', 'code', 'barcode', 'barcodeNormalized'],
  materials: ['name', 'code', 'barcode'],
  customers: ['name', 'code', 'phone', 'phoneDigits'],
  employees: ['name', 'code', 'phone', 'email'],
  users: ['displayName', 'email'],
  work_orders: ['workOrderNumber', 'productCode', 'productName', 'lineName', 'supervisorName'],
  repair_jobs: ['jobNo', 'customerName', 'customerPhone', 'productCode', 'serialNumber'],
  stock_transactions: ['referenceNo', 'itemCode', 'itemName', 'note'],
  activity_logs: ['userEmail', 'description', 'action'],
  payroll_records: ['employeeName', 'employeeId', 'departmentId'],
};

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '') : '';
}

async function run(): Promise<void> {
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  const tenantId = arg('--tenant').trim();
  if (!tenantId) throw new Error('استخدم --tenant TENANT_ID لتقييد الترحيل.');
  const apply = process.argv.includes('--apply');
  const selectedCollection = arg('--collection').trim();
  const startAfterId = arg('--start-after').trim();
  const collections = selectedCollection ? [selectedCollection] : Object.keys(PROFILES);
  if (collections.some((name) => !PROFILES[name])) throw new Error('مجموعة غير مدعومة في search profile.');
  if (startAfterId && !selectedCollection) {
    throw new Error('استخدم --collection مع --start-after حتى يكون مؤشر الاستئناف واضحاً.');
  }

  let readCount = 0;
  let writeCount = 0;
  for (const collectionName of collections) {
    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
    for (;;) {
      let query = db.collection(collectionName)
        .where('tenantId', '==', tenantId)
        .orderBy(FieldPath.documentId())
        .limit(400);
      if (cursor) query = query.startAfter(cursor);
      else if (startAfterId) query = query.startAfter(startAfterId);
      const snap = await query.get();
      if (snap.empty) break;
      readCount += snap.size;
      const batch = db.batch();
      let batchWrites = 0;
      for (const row of snap.docs) {
        const data = row.data();
        const next = buildSearchPrefixes(PROFILES[collectionName]!.map((field) => data[field]));
        const current = Array.isArray(data.searchPrefixes) ? data.searchPrefixes : [];
        if (JSON.stringify(current) === JSON.stringify(next)) continue;
        batch.set(row.ref, { searchPrefixes: next }, { merge: true });
        batchWrites += 1;
      }
      if (apply && batchWrites > 0) await batch.commit();
      writeCount += batchWrites;
      cursor = snap.docs[snap.docs.length - 1] ?? null;
      console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', collectionName, readCount, pendingWrites: writeCount, cursor: cursor?.id }));
      if (snap.size < 400) break;
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', tenantId, collections, readCount, writeCount }));
}

run().catch((error) => {
  console.error('[backfillSearchPrefixes] failed', error);
  process.exitCode = 1;
});
