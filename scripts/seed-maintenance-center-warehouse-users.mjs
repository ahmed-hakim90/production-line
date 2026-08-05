#!/usr/bin/env node
/**
 * Seed maintenance-center warehouse operator role + Auth users for Sokany (or --tenant).
 *
 * For each warehouses.warehouseRole === 'maintenance_center':
 *   1) Ensure a linked repair_branches doc exists
 *   2) Ensure role maintenance_center_warehouse exists
 *   3) Create Auth + users/{uid} (or reuse existing email)
 *   4) Bind inventoryWarehouseId + repairBranchIds
 *
 * Dry-run by default. Apply with --apply.
 *
 * Examples:
 *   node scripts/seed-maintenance-center-warehouse-users.mjs
 *   node scripts/seed-maintenance-center-warehouse-users.mjs --tenant MNa4ceoo4E4tdxm8p3xY --apply
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createRestFirestore,
  hasFirebaseToolsLogin,
  loadFirebaseToolsAccessToken,
} from './lib/firestoreRestAdmin.mjs';

const TENANTS = 'tenants';
const ROLES = 'roles';
const USERS = 'users';
const WAREHOUSES = 'warehouses';
const BRANCHES = 'repair_branches';

const ROLE_KEY = 'maintenance_center_warehouse';
const ROLE_NAME = 'مسؤول مخزن مركز صيانة';
const ROLE_COLOR = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';

const ROLE_PERMISSIONS = [
  'dashboard.view',
  'inventory.view',
  'inventory.transactions.create',
  'inventory.transactions.print',
  'inventory.counts.manage',
  'inventory.locations.manage',
  'sparePartsReplenishment.view',
  'sparePartsReplenishment.create',
  'sparePartsReplenishment.receive',
  'sparePartsRecall.view',
  'sparePartsRecall.confirm',
  'repair.view',
  'repair.parts.view',
  'repairSpareIssues.view',
  'repairSpareIssues.create',
  'repairSpareIssues.approve',
  'repairSpareIssues.issue',
  'materials.view',
  'print',
  'export',
];

/** Warehouse code → login email local-part + Arabic display city. */
const CENTER_EMAIL_BY_CODE = {
  'SP-1': { local: 'sp.mansoura', city: 'المنصورة' },
  'SP-2': { local: 'sp.alex', city: 'الإسكندرية' },
  'SP-3': { local: 'sp.fayoum', city: 'الفيوم' },
  'SP-4': { local: 'sp.tanta', city: 'طنطا' },
  'SP-5': { local: 'sp.zagazig', city: 'الزقازيق' },
  'SP-6': { local: 'sp.ismailia', city: 'الإسماعيلية' },
  'SP-7': { local: 'sp.10th', city: 'العاشر' },
  'SP-8': { local: 'sp.gomhoria', city: 'الجمهورية' },
};

const EMAIL_DOMAIN = 'sokany.com';

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

function defaultRoleDocId(tenantId, roleKey) {
  return `${String(tenantId).replace(/\//g, '_')}__${roleKey}`;
}

function data(snap) {
  return { id: snap.id, ...(snap.data() || {}) };
}

function branchNameFromWarehouse(warehouse) {
  const name = String(warehouse.name || '').trim();
  const city = name.replace(/^مخزن\s*فرع\s*/u, '').trim();
  return city ? `مركز ${city}` : `مركز ${warehouse.code || warehouse.id}`;
}

function emailForWarehouse(warehouse) {
  const code = String(warehouse.code || '').trim().toUpperCase();
  const mapped = CENTER_EMAIL_BY_CODE[code];
  if (mapped) return `${mapped.local}@${EMAIL_DOMAIN}`;
  const slug = code.toLowerCase().replace(/[^a-z0-9]+/g, '') || String(warehouse.id).slice(0, 8);
  return `sp.${slug}@${EMAIL_DOMAIN}`;
}

function displayNameForWarehouse(warehouse) {
  const code = String(warehouse.code || '').trim().toUpperCase();
  const mapped = CENTER_EMAIL_BY_CODE[code];
  const city = mapped?.city || String(warehouse.name || '').replace(/^مخزن\s*فرع\s*/u, '').trim() || code;
  return `مسؤول مخزن ${city}`;
}

function tempPassword() {
  // Avoid ambiguous chars; print once to operator — not written to repo.
  const raw = randomBytes(9).toString('base64url');
  return `Sp#${raw.slice(0, 10)}!`;
}

async function authLookupByEmail(projectId, email) {
  const token = loadFirebaseToolsAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [email] }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth lookup failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return Array.isArray(json.users) && json.users[0] ? json.users[0] : null;
}

async function authCreateUser(projectId, { email, password, displayName }) {
  const token = loadFirebaseToolsAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        displayName,
        emailVerified: false,
        disabled: false,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth create failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function authUpdatePassword(projectId, localId, password) {
  const token = loadFirebaseToolsAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId, password }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth password update failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function ensureRole(db, tenantId, apply) {
  const docId = defaultRoleDocId(tenantId, ROLE_KEY);
  const ref = db.collection(ROLES).doc(docId);
  const snap = await ref.get();
  const permissions = Object.fromEntries(ROLE_PERMISSIONS.map((p) => [p, true]));
  const payload = {
    name: ROLE_NAME,
    color: ROLE_COLOR,
    roleKey: ROLE_KEY,
    tenantId,
    permissions,
  };
  if (!snap.exists) {
    if (apply) {
      const batch = db.batch();
      batch.set(ref, payload, { merge: true });
      await batch.commit();
    }
    return { docId, action: 'create' };
  }
  const current = snap.data() || {};
  const currentPerms = current.permissions || {};
  const missing = ROLE_PERMISSIONS.filter((p) => currentPerms[p] !== true);
  const needsUpdate =
    String(current.name || '') !== ROLE_NAME
    || String(current.roleKey || '') !== ROLE_KEY
    || missing.length > 0;
  if (needsUpdate && apply) {
    const batch = db.batch();
    batch.set(ref, {
      name: ROLE_NAME,
      color: ROLE_COLOR,
      roleKey: ROLE_KEY,
      tenantId,
      permissions: { ...currentPerms, ...permissions },
    }, { merge: true });
    await batch.commit();
  }
  return { docId, action: needsUpdate ? 'update' : 'noop', missing };
}

async function ensureBranch(db, tenantId, warehouse, apply) {
  const existing = (
    await db.collection(BRANCHES).where('tenantId', '==', tenantId).limit(100).get()
  ).docs
    .map(data)
    .find((b) => String(b.warehouseId || '') === warehouse.id);
  if (existing) {
    return { id: existing.id, action: 'noop', name: existing.name };
  }
  const name = branchNameFromWarehouse(warehouse);
  const payload = {
    name,
    phone: '',
    address: name.replace(/^مركز\s+/u, ''),
    isMain: false,
    warehouseId: warehouse.id,
    warehouseCode: String(warehouse.code || '').trim(),
    technicianIds: [],
    tenantId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!apply) return { id: '(pending)', action: 'create', name };
  const batch = db.batch();
  // Auto id via random-ish doc path
  const id = `mc_${String(warehouse.code || warehouse.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const ref = db.collection(BRANCHES).doc(id);
  batch.set(ref, payload, { merge: true });
  await batch.commit();
  return { id, action: 'create', name };
}

async function ensureUser(db, projectId, {
  tenantId,
  roleId,
  warehouse,
  branchId,
  apply,
  resetPassword,
}) {
  const email = emailForWarehouse(warehouse).toLowerCase();
  const displayName = displayNameForWarehouse(warehouse);
  const existingAuth = await authLookupByEmail(projectId, email);
  let uid = existingAuth?.localId || '';
  let password = '';
  let authAction = 'noop';

  if (!uid) {
    password = tempPassword();
    authAction = 'create';
    if (apply) {
      const created = await authCreateUser(projectId, { email, password, displayName });
      uid = String(created.localId || '').trim();
      if (!uid) throw new Error(`Auth create returned no localId for ${email}`);
    } else {
      uid = '(pending)';
    }
  } else if (resetPassword) {
    password = tempPassword();
    authAction = 'reset_password';
    if (apply) await authUpdatePassword(projectId, uid, password);
  }

  let userAction = 'noop';
  if (apply && uid && uid !== '(pending)') {
    const ref = db.collection(USERS).doc(uid);
    const snap = await ref.get();
    const payload = {
      email,
      displayName,
      roleId,
      tenantId,
      isActive: true,
      isSuperAdmin: false,
      inventoryWarehouseId: warehouse.id,
      repairBranchId: branchId,
      repairBranchIds: [branchId],
      updatedAt: new Date().toISOString(),
    };
    if (!snap.exists) {
      payload.createdAt = new Date().toISOString();
      payload.createdBy = 'seed-maintenance-center-warehouse-users';
      userAction = 'create';
    } else {
      userAction = 'update';
    }
    const batch = db.batch();
    batch.set(ref, payload, { merge: true });
    await batch.commit();
  } else if (!apply) {
    userAction = existingAuth ? 'update' : 'create';
  }

  return {
    email,
    displayName,
    uid,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    warehouseCode: warehouse.code,
    branchId,
    authAction,
    userAction,
    password: password || null,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: node scripts/seed-maintenance-center-warehouse-users.mjs [--tenant ID] [--project ID] [--apply] [--reset-password]`);
    process.exit(0);
  }
  const apply = argv.includes('--apply');
  const resetPassword = argv.includes('--reset-password');
  const tenantId = getFlagValue(argv, '--tenant').trim() || 'MNa4ceoo4E4tdxm8p3xY';
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
  const tenantSnap = await db.collection(TENANTS).doc(tenantId).get();
  if (!tenantSnap.exists) throw new Error(`Tenant not found: ${tenantId}`);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    tenantId,
    tenantName: tenantSnap.data()?.name,
    resetPassword,
  }, null, 2));

  const roleResult = await ensureRole(db, tenantId, apply);
  console.log('\nrole:', roleResult);

  const warehouses = (
    await db.collection(WAREHOUSES).where('tenantId', '==', tenantId).limit(200).get()
  ).docs
    .map(data)
    .filter((w) => w.warehouseRole === 'maintenance_center' && w.isActive !== false)
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));

  if (warehouses.length === 0) {
    throw new Error('No active maintenance_center warehouses found.');
  }

  const usersOut = [];
  for (const warehouse of warehouses) {
    const branch = await ensureBranch(db, tenantId, warehouse, apply);
    const user = await ensureUser(db, projectId, {
      tenantId,
      roleId: roleResult.docId,
      warehouse,
      branchId: branch.id,
      apply,
      resetPassword,
    });
    usersOut.push({ ...user, branchAction: branch.action, branchName: branch.name });
  }

  console.log('\nusers:');
  console.log(JSON.stringify(usersOut.map(({ password, ...rest }) => rest), null, 2));

  const withPasswords = usersOut.filter((u) => u.password);
  if (apply && withPasswords.length > 0) {
    console.log('\n=== ONE-TIME CREDENTIALS (save now — not stored in repo) ===');
    for (const row of withPasswords) {
      console.log(`${row.email}\t${row.password}\t${row.warehouseName}`);
    }
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write Auth/Firestore.');
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
