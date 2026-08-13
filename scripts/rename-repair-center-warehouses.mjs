#!/usr/bin/env node
/**
 * Unify linked repair-center warehouse names to:
 *   مخزن صيانة - {اسم الفرع}
 *
 * Only rewrites legacy «مخزن فرع …» names (October-style names stay as-is).
 * Dry-run by default. Apply with --apply.
 *
 *   node scripts/rename-repair-center-warehouses.mjs
 *   node scripts/rename-repair-center-warehouses.mjs --apply
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRestFirestore, hasFirebaseToolsLogin } from './lib/firestoreRestAdmin.mjs';

const TENANT_ID = 'MNa4ceoo4E4tdxm8p3xY';
const PROJECT_ID = 'sokany-production';
const BRANCHES = 'repair_branches';
const WAREHOUSES = 'warehouses';

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

function repairMaintenanceWarehouseName(branchName) {
  return `مخزن صيانة - ${String(branchName || '').trim() || 'فرع'}`;
}

function isLegacyRepairWarehouseName(name) {
  return /^مخزن\s*فرع(?:\s|$)/u.test(String(name || '').trim());
}

function plannedRepairCenterWarehouseRename({ warehouseName, branchName }) {
  const trimmedBranch = String(branchName || '').trim();
  if (!trimmedBranch) return null;
  const target = repairMaintenanceWarehouseName(trimmedBranch);
  const current = String(warehouseName || '').trim();
  if (current === target) return null;
  if (!current || isLegacyRepairWarehouseName(current)) return target;
  return null;
}

async function listTenant(db, collectionName) {
  const snap = await db.collection(collectionName).where('tenantId', '==', TENANT_ID).limit(500).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const projectId = getFlagValue(process.argv, '--project') || readDefaultProjectFromFirebaserc() || PROJECT_ID;
  if (!hasFirebaseToolsLogin()) {
    throw new Error('Run: firebase login');
  }
  const db = createRestFirestore({ projectId });
  const [branches, warehouses] = await Promise.all([
    listTenant(db, BRANCHES),
    listTenant(db, WAREHOUSES),
  ]);
  const warehouseById = new Map(warehouses.map((row) => [row.id, row]));
  const linkedIds = new Set(branches.map((b) => String(b.warehouseId || '').trim()).filter(Boolean));

  const planned = [];
  for (const branch of branches) {
    const warehouseId = String(branch.warehouseId || '').trim();
    if (!warehouseId) continue;
    const warehouse = warehouseById.get(warehouseId);
    const currentName = String(warehouse?.name || '').trim();
    const nextName = plannedRepairCenterWarehouseRename({
      warehouseName: currentName,
      branchName: String(branch.name || ''),
    });
    planned.push({
      branchId: branch.id,
      branchName: String(branch.name || ''),
      warehouseId,
      warehouseCode: String(warehouse?.code || ''),
      currentName: currentName || '(missing)',
      nextName,
      missingWarehouse: !warehouse,
    });
  }

  const unlinkedLegacy = warehouses.filter((row) => {
    const id = String(row.id || '').trim();
    return isLegacyRepairWarehouseName(row.name) && !linkedIds.has(id);
  });

  console.log(apply ? 'APPLY' : 'DRY-RUN');
  console.log(`tenant=${TENANT_ID} project=${projectId}`);
  console.log(`branches=${branches.length} warehouses=${warehouses.length}`);
  console.log('--- linked warehouses ---');
  for (const row of planned.sort((a, b) => a.branchName.localeCompare(b.branchName, 'ar'))) {
    const action = row.missingWarehouse
      ? 'MISSING'
      : row.nextName
        ? `${row.currentName}  →  ${row.nextName}`
        : `keep ${row.currentName}`;
    console.log(`${row.branchName} [${row.warehouseCode || row.warehouseId}] ${action}`);
  }
  if (unlinkedLegacy.length > 0) {
    console.log('--- unlinked «مخزن فرع» (not renamed) ---');
    for (const row of unlinkedLegacy) {
      console.log(`${row.name} [${row.code || row.id}] role=${row.warehouseRole || 'general'}`);
    }
  }

  const writes = planned.filter((row) => row.nextName && !row.missingWarehouse);
  if (!apply) {
    console.log(`would rename ${writes.length} warehouse(s)`);
    return;
  }
  if (writes.length === 0) {
    console.log('nothing to rename');
    return;
  }
  const batch = db.batch();
  for (const row of writes) {
    batch.update(db.collection(WAREHOUSES).doc(row.warehouseId), { name: row.nextName });
  }
  await batch.commit();
  console.log(`renamed ${writes.length} warehouse(s)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
