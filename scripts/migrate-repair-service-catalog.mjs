#!/usr/bin/env node
import { createRequire } from 'node:module';

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { applicationDefault, getApps, initializeApp } = requireFromFunctions('firebase-admin/app');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const args = new Set(process.argv.slice(2));
const tenantId = process.argv.slice(2).find((arg) => arg.startsWith('--tenant='))?.slice(9) || '';
const apply = args.has('--apply');
const scrub = args.has('--scrub');

if (!tenantId) {
  console.error('Usage: node scripts/migrate-repair-service-catalog.mjs --tenant=TENANT_ID [--apply] [--scrub]');
  process.exit(2);
}

if (!getApps().length) initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const settingsRef = db.collection('system_settings').doc(tenantId);
const catalogRef = db.collection('repair_service_catalog').doc(tenantId);
const [settingsSnap, catalogSnap] = await Promise.all([settingsRef.get(), catalogRef.get()]);
const repairSettings = (settingsSnap.data()?.repairSettings || {});
const legacy = Array.isArray(repairSettings.serviceCatalog) ? repairSettings.serviceCatalog : [];
const services = legacy.map((row, index) => ({
  id: String(row?.id || `svc-${index + 1}`).trim(),
  name: String(row?.name || '').trim(),
  price: Math.max(0, Math.round(Number(row?.price || 0) * 100) / 100),
  enabled: row?.enabled !== false,
})).filter((row) => row.id && row.name);

const report = {
  mode: apply ? 'apply' : 'dry-run',
  tenantId,
  legacyRows: legacy.length,
  validRows: services.length,
  pricedRows: services.filter((row) => row.price > 0).length,
  duplicateIds: services.length - new Set(services.map((row) => row.id)).size,
  protectedCatalogExists: catalogSnap.exists,
  nextRevision: Math.max(0, Number(catalogSnap.data()?.revision || 0)) + 1,
  scrubRequested: scrub,
};
console.log(JSON.stringify(report, null, 2));
if (!apply) process.exit(0);
if (report.duplicateIds > 0) throw new Error('Duplicate service ids; fix the catalog before apply.');

const at = new Date().toISOString();
const batch = db.batch();
batch.set(catalogRef, {
  tenantId,
  revision: report.nextRevision,
  services,
  migrationEvidence: 'system_settings',
  createdAt: String(catalogSnap.data()?.createdAt || at),
  createdBy: String(catalogSnap.data()?.createdBy || 'migration'),
  updatedAt: at,
  updatedBy: 'migration',
}, { merge: true });
if (scrub && settingsSnap.exists) {
  batch.set(settingsRef, {
    repairSettings: {
      ...repairSettings,
      serviceCatalog: services.map(({ id, name, enabled }) => ({ id, name, enabled })),
    },
    updatedAt: at,
  }, { merge: true });
}
await batch.commit();
console.log(`Applied protected service catalog revision ${report.nextRevision}.`);
