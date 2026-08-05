#!/usr/bin/env node
/**
 * Upsert built-in repair roles (استقبال صيانة / فني صيانة) into Firestore.
 *
 * Dry-run by default. Apply with --apply.
 *
 * Auth: firebase login (REST admin) — same as other ops scripts.
 *
 * Examples:
 *   node scripts/seed-repair-builtin-roles.mjs
 *   node scripts/seed-repair-builtin-roles.mjs --apply
 *   node scripts/seed-repair-builtin-roles.mjs --tenant MNa4ceoo4E4tdxm8p3xY --apply
 */
import { createRestFirestore, hasFirebaseToolsLogin } from './lib/firestoreRestAdmin.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROLES = 'roles';
const TENANTS = 'tenants';

const REPAIR_RECEPTION_PERMISSIONS = [
  'dashboard.view',
  'repair.view',
  'repair.dashboard.view',
  'repair.jobs.create',
  'repair.jobs.edit',
  'repair.jobs.reception',
  'repair.finance.view',
  'repair.payments.view',
  'repair.payments.collect',
  'repair.discounts.request',
  'repair.credit.request',
  'repair.parts.view',
  'repairSpareIssues.view',
  'repairSpareIssues.create',
  'repairSpareIssues.approve',
  'repairSpareIssues.issue',
  'sparePartsReplenishment.view',
  'sparePartsReplenishment.create',
  'sparePartsReplenishment.receive',
  'sparePartsRecall.view',
  'sparePartsRecall.confirm',
  'inventory.view',
  'customers.view',
  'customers.create',
  'print',
];

const REPAIR_TECHNICIAN_PERMISSIONS = [
  'dashboard.view',
  'repair.jobs.technician',
  'repair.parts.request',
];

const FORBIDDEN = [
  'repair.branches.manage',
  'repair.callCenter.viewAll',
  'repair.adminDashboard.view',
  'repair.settings.manage',
  'repair.treasury.manage',
  'repair.pricing.manage',
  'roles.manage',
  'users.manage',
];

const ROLE_DEFS = {
  repair_reception: {
    name: 'استقبال صيانة',
    color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
    permissions: REPAIR_RECEPTION_PERMISSIONS,
  },
  repair_technician: {
    name: 'فني صيانة',
    color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
    permissions: REPAIR_TECHNICIAN_PERMISSIONS,
  },
};

function getFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] || '' : '';
}

function readDefaultProjectFromFirebaserc() {
  try {
    const parsed = JSON.parse(readFileSync(resolve(process.cwd(), '.firebaserc'), 'utf8'));
    return String(parsed?.projects?.default || '').trim();
  } catch {
    return '';
  }
}

function buildPermissionMap(enabled) {
  const set = new Set(enabled);
  const out = {};
  for (const key of enabled) out[key] = true;
  for (const key of FORBIDDEN) out[key] = false;
  // Keep enabled list authoritative for positives.
  for (const key of set) out[key] = true;
  return out;
}

function defaultRoleDocId(tenantId, roleKey) {
  return `${String(tenantId).replace(/\//g, '_')}__${roleKey}`;
}

async function listActiveTenantIds(db, onlyTenantId) {
  if (onlyTenantId) return [onlyTenantId];
  const snap = await db.collection(TENANTS).limit(100).get();
  return snap.docs
    .filter((d) => String(d.data()?.status || '') === 'active')
    .map((d) => d.id);
}

async function upsertRole(db, tenantId, roleKey, apply) {
  const def = ROLE_DEFS[roleKey];
  const docId = defaultRoleDocId(tenantId, roleKey);
  const ref = db.collection(ROLES).doc(docId);
  const snap = await ref.get();
  const permissions = buildPermissionMap(def.permissions);
  const payload = {
    name: def.name,
    color: def.color,
    permissions,
    roleKey,
    tenantId,
  };

  const exists = snap.exists;
  const current = exists ? snap.data() || {} : {};
  const sameName = String(current.name || '') === def.name;
  const sameKey = String(current.roleKey || '') === roleKey;
  const currentPerms = current.permissions || {};
  const enabledOk = def.permissions.every((p) => currentPerms[p] === true);
  const forbiddenOk = FORBIDDEN.every((p) => currentPerms[p] !== true);
  const extraKeys = Object.keys(currentPerms).filter(
    (key) => currentPerms[key] === true && !def.permissions.includes(key),
  );
  const samePerms = enabledOk && forbiddenOk && extraKeys.length === 0;

  const action = !exists ? 'create' : (sameName && sameKey && samePerms ? 'noop' : 'update');
  if (apply && action !== 'noop') {
    // Full replace of permission map for these built-ins (isolation lock).
    const batch = db.batch();
    batch.set(ref, {
      name: def.name,
      color: def.color,
      roleKey,
      tenantId,
      permissions: Object.fromEntries(def.permissions.map((p) => [p, true])),
    }, { merge: true });
    await batch.commit();
  }
  return { tenantId, roleKey, docId, action, exists, extraKeys };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: node scripts/seed-repair-builtin-roles.mjs [--tenant ID] [--apply] [--project ID]`);
    process.exit(0);
  }
  const apply = argv.includes('--apply');
  const tenantId = getFlagValue(argv, '--tenant').trim();
  const projectId =
    getFlagValue(argv, '--project').trim()
    || process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || readDefaultProjectFromFirebaserc()
    || 'sokany-production';

  if (!hasFirebaseToolsLogin()) {
    throw new Error('Firebase CLI login required. Run: firebase login');
  }

  const db = createRestFirestore({ projectId });
  const tenants = await listActiveTenantIds(db, tenantId || '');
  if (tenants.length === 0) {
    throw new Error('No active tenants found.');
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', projectId, tenants }, null, 2));

  const results = [];
  for (const tid of tenants) {
    for (const roleKey of Object.keys(ROLE_DEFS)) {
      results.push(await upsertRole(db, tid, roleKey, apply));
    }
  }

  console.log(JSON.stringify({ results }, null, 2));
  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write roles.');
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
