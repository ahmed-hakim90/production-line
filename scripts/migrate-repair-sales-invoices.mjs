#!/usr/bin/env node
import admin from 'firebase-admin';

const apply = process.argv.includes('--apply');
const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const tenantId = tenantArg ? tenantArg.slice('--tenant='.length).trim() : '';
if (!tenantId) {
  console.error('Usage: node scripts/migrate-repair-sales-invoices.mjs --tenant=TENANT_ID [--apply]');
  process.exit(1);
}
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const snap = await db.collection('repair_sales_invoices').where('tenantId', '==', tenantId).get();
const rows = snap.docs.filter((doc) => {
  const status = String(doc.data().status || 'active');
  return status === 'active' || !doc.data().lifecycleVersion;
});
const report = rows.map((doc) => ({
  id: doc.id,
  invoiceNo: String(doc.data().invoiceNo || ''),
  oldStatus: String(doc.data().status || 'active'),
  total: Number(doc.data().total || 0),
  hasJournal: Boolean(doc.data().journalEntryId),
  hasTreasury: Boolean(doc.data().treasuryEntryId),
}));
console.table(report);
console.log(JSON.stringify({ tenantId, mode: apply ? 'apply' : 'dry-run', candidates: report.length, missingJournal: report.filter((row) => !row.hasJournal).length, missingTreasury: report.filter((row) => !row.hasTreasury).length }, null, 2));
if (!apply || rows.length === 0) process.exit(0);
for (let index = 0; index < rows.length; index += 400) {
  const batch = db.batch();
  for (const doc of rows.slice(index, index + 400)) {
    const data = doc.data();
    batch.set(doc.ref, {
      lifecycleVersion: 2,
      legacyStatus: String(data.status || 'active'),
      status: String(data.status || 'active') === 'cancelled' ? 'cancelled' : 'posted',
      grossAmount: Number(data.grossAmount ?? data.total ?? 0),
      discountType: String(data.discountType || 'none'),
      discountValue: Number(data.discountValue || 0),
      discountAmount: Number(data.discountAmount || 0),
      taxRate: 0,
      taxAmount: 0,
      needsAccountingReconciliation: !data.journalEntryId || !data.treasuryEntryId,
      migratedAt: new Date().toISOString(),
    }, { merge: true });
  }
  await batch.commit();
}
console.log(`Applied ${rows.length} invoice lifecycle migrations. No historical journal or treasury entry was invented.`);
