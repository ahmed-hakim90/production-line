/**
 * Backfill tenant-scoped singleton docs:
 * - hr_settings/{tenantId} from legacy `global`
 * - labor_settings/{tenantId} from legacy `default`
 * - hr_config_modules/{tenantId}__{module} from legacy `{module}`
 * - approval_settings/{tenantId} from legacy `global`
 *
 * Usage:
 *   npx tsx scripts/backfill-tenant-singleton-settings.ts --dry-run
 *   npx tsx scripts/backfill-tenant-singleton-settings.ts --apply --tenant <tenantId>
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or default ADC with Admin access.
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = !apply || args.includes('--dry-run');
const tenantIdx = args.indexOf('--tenant');
const onlyTenant = tenantIdx >= 0 ? String(args[tenantIdx + 1] || '').trim() : '';

const HR_MODULES = [
  'general',
  'attendance',
  'leave',
  'payroll',
  'loans',
  'approvals',
  'notifications',
] as const;

if (!getApps().length) {
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();

async function listTenantIds(): Promise<string[]> {
  if (onlyTenant) return [onlyTenant];
  const snap = await db.collection('tenants').get();
  return snap.docs.map((d) => d.id).filter(Boolean);
}

async function copyIfMissing(
  collectionName: string,
  fromId: string,
  toId: string,
  tenantId: string,
): Promise<'copied' | 'exists' | 'missing-source'> {
  const toRef = db.collection(collectionName).doc(toId);
  const toSnap = await toRef.get();
  if (toSnap.exists) return 'exists';
  const fromSnap = await db.collection(collectionName).doc(fromId).get();
  if (!fromSnap.exists) return 'missing-source';
  const data = { ...(fromSnap.data() || {}), tenantId };
  if (dryRun) {
    console.log(`[dry-run] would copy ${collectionName}/${fromId} -> ${toId}`);
    return 'copied';
  }
  await toRef.set(data, { merge: true });
  console.log(`[apply] copied ${collectionName}/${fromId} -> ${toId}`);
  return 'copied';
}

async function main() {
  const tenants = await listTenantIds();
  console.log(`Tenants: ${tenants.length}; mode=${dryRun ? 'dry-run' : 'apply'}`);
  for (const tenantId of tenants) {
    await copyIfMissing('hr_settings', 'global', tenantId, tenantId);
    await copyIfMissing('labor_settings', 'default', tenantId, tenantId);
    await copyIfMissing('approval_settings', 'global', tenantId, tenantId);
    for (const moduleName of HR_MODULES) {
      await copyIfMissing(
        'hr_config_modules',
        moduleName,
        `${tenantId}__${moduleName}`,
        tenantId,
      );
    }
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
