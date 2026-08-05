#!/usr/bin/env node
/**
 * Merge users onto canonical role docs and delete duplicate role documents.
 * Uses the same grouping rules as modules/system/lib/visibleRoles.ts
 *
 * Dry-run by default. Apply with --apply.
 *
 *   node scripts/merge-duplicate-roles-rest.mjs --tenant MNa4ceoo4E4tdxm8p3xY
 *   node scripts/merge-duplicate-roles-rest.mjs --tenant MNa4ceoo4E4tdxm8p3xY --apply
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRestFirestore, hasFirebaseToolsLogin } from './lib/firestoreRestAdmin.mjs';

const DEFAULT_ROLE_KEY_BY_NAME = {
  [norm('مدير النظام')]: 'admin',
  [norm('مدير المصنع')]: 'factory_manager',
  [norm('مشرف الصالة')]: 'hall_supervisor',
  [norm('مشرف')]: 'supervisor',
  [norm('مدير الموارد البشرية')]: 'hr_manager',
  [norm('محاسب')]: 'accountant',
  [norm('مسؤول مخزن المستلزمات')]: 'materials_warehouse',
  [norm('مسؤول مخزن قطع الغيار المركزي')]: 'spare_parts_central_warehouse',
  [norm('مسؤول مخزن مركز صيانة')]: 'maintenance_center_warehouse',
  [norm('عرض مخزون فقط')]: 'inventory_viewer',
  [norm('استقبال صيانة')]: 'repair_reception',
  [norm('فني صيانة')]: 'repair_technician',
};

function norm(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

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

function data(snap) {
  return { id: snap.id, ...(snap.data() || {}) };
}

function builtInKey(role) {
  if (role.roleKey) return String(role.roleKey);
  return DEFAULT_ROLE_KEY_BY_NAME[norm(role.name)] || '';
}

function groupKey(role) {
  const key = builtInKey(role);
  if (key) return `default:${key}`;
  const name = norm(role.name);
  return name ? `custom:${name}` : `role:${role.id}`;
}

function score(role) {
  const key = builtInKey(role);
  if (!key) return role.id ? 1 : 0;
  const stable = role.id?.endsWith(`__${key}`) ? 4 : 0;
  const explicit = role.roleKey === key ? 2 : 0;
  const perms = Object.values(role.permissions || {}).filter(Boolean).length;
  return stable + explicit + (role.id ? 1 : 0) + perms / 1000;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const tenantId = getFlagValue(argv, '--tenant').trim() || 'MNa4ceoo4E4tdxm8p3xY';
  const projectId =
    getFlagValue(argv, '--project').trim()
    || process.env.GCLOUD_PROJECT
    || readDefaultProjectFromFirebaserc()
    || 'sokany-production';

  if (!hasFirebaseToolsLogin()) throw new Error('Run: firebase login');

  const db = createRestFirestore({ projectId });
  const roles = (await db.collection('roles').where('tenantId', '==', tenantId).limit(300).get()).docs.map(data);
  const users = (await db.collection('users').where('tenantId', '==', tenantId).limit(500).get()).docs.map(data);

  const groups = new Map();
  for (const role of roles) {
    const key = groupKey(role);
    const existing = groups.get(key) || { canonical: role, ids: [], userCountById: {} };
    if (role.id) existing.ids.push(role.id);
    groups.set(key, existing);
  }

  // Prefer the role doc that already has users (avoids swapping supervisors onto a different permission set).
  for (const user of users) {
    const rid = String(user.roleId || '').trim();
    if (!rid) continue;
    for (const group of groups.values()) {
      if (!group.ids.includes(rid)) continue;
      group.userCountById[rid] = (group.userCountById[rid] || 0) + 1;
      break;
    }
  }

  for (const group of groups.values()) {
    let best = group.canonical;
    let bestUsers = group.userCountById[best.id] || 0;
    for (const id of group.ids) {
      const role = roles.find((r) => r.id === id);
      if (!role) continue;
      const usersOnRole = group.userCountById[id] || 0;
      if (usersOnRole > bestUsers) {
        best = role;
        bestUsers = usersOnRole;
        continue;
      }
      if (usersOnRole === bestUsers && score(role) > score(best)) {
        best = role;
      }
    }
    group.canonical = best;
  }

  const remaps = [];
  for (const user of users) {
    const rid = String(user.roleId || '').trim();
    if (!rid) continue;
    for (const group of groups.values()) {
      if (!group.ids.includes(rid)) continue;
      const canonicalId = group.canonical.id;
      if (canonicalId && canonicalId !== rid) {
        remaps.push({
          userId: user.id,
          email: user.email,
          from: rid,
          to: canonicalId,
          roleName: group.canonical.name,
        });
      }
      break;
    }
  }

  // Ensure canonical built-in docs carry roleKey when missing.
  const roleKeyPatches = [];
  for (const group of groups.values()) {
    const key = builtInKey(group.canonical);
    if (!key) continue;
    if (group.canonical.roleKey === key) continue;
    roleKeyPatches.push({ id: group.canonical.id, roleKey: key, name: group.canonical.name });
  }

  const deleteIds = [];
  for (const group of groups.values()) {
    if (group.ids.length < 2) continue;
    for (const id of group.ids) {
      if (id === group.canonical.id) continue;
      deleteIds.push({
        id,
        name: group.canonical.name,
        canonicalId: group.canonical.id,
        usersOnDeleted: group.userCountById[id] || 0,
      });
    }
  }

  const report = {
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    tenantId,
    roleCountBefore: roles.length,
    visibleGroups: groups.size,
    userRemaps: remaps,
    roleKeyPatches,
    deleteRoles: deleteIds,
  };

  const backupPath = resolve(process.cwd(), 'tmp', `duplicate-roles-${tenantId}-${Date.now()}.json`);
  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(backupPath, JSON.stringify({ ...report, roles }, null, 2));
  console.log(JSON.stringify({ ...report, backupPath }, null, 2));

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to merge users and delete duplicates.');
    return;
  }

  // Remap users first
  for (let i = 0; i < remaps.length; i += 400) {
    const chunk = remaps.slice(i, i + 400);
    const batch = db.batch();
    for (const row of chunk) {
      batch.update(db.collection('users').doc(row.userId), { roleId: row.to });
    }
    await batch.commit();
  }

  for (let i = 0; i < roleKeyPatches.length; i += 400) {
    const chunk = roleKeyPatches.slice(i, i + 400);
    const batch = db.batch();
    for (const row of chunk) {
      batch.update(db.collection('roles').doc(row.id), { roleKey: row.roleKey });
    }
    await batch.commit();
  }

  // Delete duplicate role docs
  for (let i = 0; i < deleteIds.length; i += 400) {
    const chunk = deleteIds.slice(i, i + 400);
    const batch = db.batch();
    for (const row of chunk) {
      batch.delete(db.collection('roles').doc(row.id));
    }
    await batch.commit();
  }

  console.log(
    `\nApplied: remapped ${remaps.length} users, patched roleKey on ${roleKeyPatches.length}, deleted ${deleteIds.length} duplicate roles.`,
  );
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
