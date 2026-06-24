#!/usr/bin/env node
/**
 * Safe cleanup helper for duplicate tenant roles.
 *
 * Defaults to DRY-RUN. Destructive deletion requires:
 *   --confirm-delete-duplicate-roles
 *   --tenant <tenantId>
 *   --backup <path>
 *
 * Auth:
 *   --credentials /path/to/serviceAccount.json
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   gcloud auth application-default login
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const ROLES_COLLECTION = 'roles';
const USERS_COLLECTION = 'users';
const SYSTEM_SETTINGS_COLLECTION = 'system_settings';
const DELETE_CONFIRM_FLAG = '--confirm-delete-duplicate-roles';
const MERGE_REFERENCES_FLAG = '--merge-references';
const BATCH_SIZE = 450;

const usage = `
Usage:
  npm run cleanup:duplicate-roles -- [options]

Dry-run:
  npm run cleanup:duplicate-roles -- --tenant TENANT_ID --backup tmp/duplicate-roles-dry-run.json

Delete later, only after reviewing dry-run output and backup:
  npm run cleanup:duplicate-roles -- --tenant TENANT_ID --backup tmp/duplicate-roles-delete.json ${MERGE_REFERENCES_FLAG} ${DELETE_CONFIRM_FLAG}

Options:
  --project <id>          Firebase/GCP project id. Defaults to .firebaserc, GCLOUD_PROJECT, or GOOGLE_CLOUD_PROJECT.
  --credentials <path>    Service account JSON. Defaults to GOOGLE_APPLICATION_CREDENTIALS or ADC.
  --tenant <tenantId>     Tenant to scan. Required in both dry-run and delete mode.
  --backup <path>         Export scanned roles, duplicate groups, references, and delete candidates.
                          Required for delete mode; recommended for dry-run.
  --limit <n>             Stop after scanning n role docs for this tenant.
  --sample-size <n>       Number of reference document paths to print per role. Default: 10.
  ${MERGE_REFERENCES_FLAG}
                         Rewrite known references (users.roleId and system_settings planSettings.opsNotifyRoleIds)
                         to the canonical role before deletion. Roles with other references are skipped.
  ${DELETE_CONFIRM_FLAG}
                         Actually merge known references and delete safe duplicate role docs. Without this flag this is a dry-run.
`;

function getFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] || '' : '';
}

function readDefaultProjectFromFirebaserc() {
  const candidates = [
    resolve(process.cwd(), '.firebaserc'),
    resolve(process.cwd(), '..', '.firebaserc'),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
      const projectId = parsed?.projects?.default;
      if (typeof projectId === 'string' && projectId.trim()) return projectId.trim();
    } catch {
      // Missing or invalid .firebaserc is handled by caller.
    }
  }

  return '';
}

function resolveProjectId(argv) {
  return (
    getFlagValue(argv, '--project').trim() ||
    (process.env.GCLOUD_PROJECT || '').trim() ||
    (process.env.GOOGLE_CLOUD_PROJECT || '').trim() ||
    readDefaultProjectFromFirebaserc()
  );
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage.trim());
    process.exit(0);
  }

  return {
    projectId: resolveProjectId(argv),
    credentialsPath: getFlagValue(argv, '--credentials').trim(),
    tenantId: getFlagValue(argv, '--tenant').trim(),
    backupPath: getFlagValue(argv, '--backup').trim(),
    limit: parsePositiveNumber(getFlagValue(argv, '--limit').trim(), 0),
    sampleSize: parsePositiveNumber(getFlagValue(argv, '--sample-size').trim(), 10),
    mergeReferences: argv.includes(MERGE_REFERENCES_FLAG),
    confirmDelete: argv.includes(DELETE_CONFIRM_FLAG),
  };
}

function validateArgs(args) {
  const problems = [];
  if (!args.projectId) {
    problems.push('missing Firebase/GCP project id; use --project, GCLOUD_PROJECT, GOOGLE_CLOUD_PROJECT, or .firebaserc');
  }
  if (!args.tenantId) problems.push('--tenant <tenantId> is required');
  if (args.confirmDelete && !args.backupPath) problems.push('--backup <path> is required in delete mode');

  if (problems.length > 0) {
    throw new Error(`Refusing to run:\n- ${problems.join('\n- ')}`);
  }
}

function initializeFirebase(args) {
  if (getApps().length) return;

  const credentialsRaw = (args.credentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (credentialsRaw) {
    const credentialsPath = isAbsolute(credentialsRaw)
      ? credentialsRaw
      : resolve(process.cwd(), credentialsRaw);
    if (!existsSync(credentialsPath)) {
      throw new Error(`Credentials file not found: ${credentialsPath}`);
    }
    initializeApp({
      projectId: args.projectId,
      credential: cert(credentialsPath),
    });
    return;
  }

  initializeApp({ projectId: args.projectId });
}

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeName(value) {
  return normalizeString(value).replace(/\s+/g, ' ').toLowerCase();
}

function roleGroupKey(role) {
  const roleKey = normalizeString(role.roleKey).toLowerCase();
  if (roleKey) return `roleKey:${roleKey}`;

  const name = normalizeName(role.name);
  return name ? `name:${name}` : '';
}

function defaultRoleDocId(tenantId, roleKey) {
  return `${tenantId.replace(/\//g, '_')}__${roleKey}`;
}

async function loadTenantRoles(db, args) {
  const roles = [];
  let last = null;

  for (;;) {
    let query = db
      .collection(ROLES_COLLECTION)
      .where('tenantId', '==', args.tenantId)
      .orderBy(FieldPath.documentId())
      .limit(500);
    if (last) query = query.startAfter(last);

    const snap = await query.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      roles.push({
        id: docSnap.id,
        path: docSnap.ref.path,
        createTime: docSnap.createTime?.toDate?.().toISOString?.() || null,
        updateTime: docSnap.updateTime?.toDate?.().toISOString?.() || null,
        data: docSnap.data(),
      });

      if (args.limit && roles.length >= args.limit) return roles;
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }

  return roles;
}

function isMergeableReference(docPath, fieldPath, tenantId) {
  if (docPath.startsWith(`${USERS_COLLECTION}/`) && fieldPath === 'roleId') return true;
  if (
    docPath === `${SYSTEM_SETTINGS_COLLECTION}/${tenantId}` &&
    fieldPath.startsWith('planSettings.opsNotifyRoleIds[')
  ) {
    return true;
  }
  return false;
}

function addReference(referencesByRoleId, roleId, docPath, fieldPath, sampleSize, mergeable) {
  const entry = referencesByRoleId.get(roleId) || {
    count: 0,
    mergeableCount: 0,
    unmergeableCount: 0,
    samples: [],
  };
  entry.count += 1;
  if (mergeable) entry.mergeableCount += 1;
  else entry.unmergeableCount += 1;
  if (entry.samples.length < sampleSize) {
    entry.samples.push({ docPath, fieldPath, mergeable });
  }
  referencesByRoleId.set(roleId, entry);
}

function walkForRoleReferences(value, roleIds, referencesByRoleId, docPath, fieldPath, args) {
  if (typeof value === 'string') {
    if (roleIds.has(value)) {
      addReference(
        referencesByRoleId,
        value,
        docPath,
        fieldPath,
        args.sampleSize,
        isMergeableReference(docPath, fieldPath, args.tenantId),
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkForRoleReferences(item, roleIds, referencesByRoleId, docPath, `${fieldPath}[${index}]`, args);
    });
    return;
  }

  if (!value || typeof value !== 'object') return;

  Object.entries(value).forEach(([key, item]) => {
    const nextPath = fieldPath ? `${fieldPath}.${key}` : key;
    walkForRoleReferences(item, roleIds, referencesByRoleId, docPath, nextPath, args);
  });
}

async function scanRootTenantReferences(db, args, roleIds) {
  const referencesByRoleId = new Map();
  const failedCollections = [];
  const collections = await db.listCollections();

  for (const collectionRef of collections) {
    if (collectionRef.id === ROLES_COLLECTION) continue;

    let last = null;
    for (;;) {
      try {
        let query = collectionRef
          .where('tenantId', '==', args.tenantId)
          .orderBy(FieldPath.documentId())
          .limit(500);
        if (last) query = query.startAfter(last);

        const snap = await query.get();
        if (snap.empty) break;

        for (const docSnap of snap.docs) {
          walkForRoleReferences(
            docSnap.data(),
            roleIds,
            referencesByRoleId,
            docSnap.ref.path,
            '',
            args,
          );
        }

        last = snap.docs[snap.docs.length - 1];
        if (snap.size < 500) break;
      } catch (error) {
        failedCollections.push({
          collection: collectionRef.id,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
  }

  return { referencesByRoleId, failedCollections };
}

async function scanSystemSettingsRoleReferences(db, args, roleIds, referencesByRoleId) {
  const docRef = db.collection(SYSTEM_SETTINGS_COLLECTION).doc(args.tenantId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return;

  const roleIdsValue = docSnap.data()?.planSettings?.opsNotifyRoleIds;
  if (!Array.isArray(roleIdsValue)) return;

  roleIdsValue.forEach((roleId, index) => {
    if (typeof roleId !== 'string' || !roleIds.has(roleId)) return;
    const fieldPath = `planSettings.opsNotifyRoleIds[${index}]`;
    addReference(
      referencesByRoleId,
      roleId,
      docRef.path,
      fieldPath,
      args.sampleSize,
      isMergeableReference(docRef.path, fieldPath, args.tenantId),
    );
  });
}

function roleRank(role, referencesByRoleId, tenantId) {
  const roleKey = normalizeString(role.data.roleKey).toLowerCase();
  const stableId = roleKey ? defaultRoleDocId(tenantId, roleKey) : '';
  return {
    referenced: referencesByRoleId.has(role.id) ? 1 : 0,
    stableId: stableId && role.id === stableId ? 1 : 0,
    hasRoleKey: roleKey ? 1 : 0,
    createTime: role.createTime || '',
    id: role.id,
  };
}

function compareKeepPriority(a, b, referencesByRoleId, tenantId) {
  const ar = roleRank(a, referencesByRoleId, tenantId);
  const br = roleRank(b, referencesByRoleId, tenantId);

  if (ar.referenced !== br.referenced) return br.referenced - ar.referenced;
  if (ar.stableId !== br.stableId) return br.stableId - ar.stableId;
  if (ar.hasRoleKey !== br.hasRoleKey) return br.hasRoleKey - ar.hasRoleKey;
  if (ar.createTime !== br.createTime) return ar.createTime.localeCompare(br.createTime);
  return ar.id.localeCompare(br.id);
}

function classifyDuplicates(roles, referencesByRoleId, tenantId, mergeReferences) {
  const groupsByKey = new Map();
  roles.forEach((role) => {
    const key = roleGroupKey(role.data);
    if (!key) return;
    const group = groupsByKey.get(key) || [];
    group.push(role);
    groupsByKey.set(key, group);
  });

  const duplicateGroups = [];
  const deleteCandidates = [];

  for (const [key, group] of groupsByKey.entries()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => compareKeepPriority(a, b, referencesByRoleId, tenantId));
    const referenced = sorted.filter((role) => referencesByRoleId.has(role.id));
    const canonical = sorted[0];
    const keepIds = new Set();
    if (mergeReferences) {
      keepIds.add(canonical.id);
    } else {
      referenced.forEach((role) => keepIds.add(role.id));
      if (keepIds.size === 0) keepIds.add(canonical.id);
    }

    const candidates = sorted
      .filter((role) => {
        if (keepIds.has(role.id)) return false;
        const refs = referencesByRoleId.get(role.id);
        if (!refs) return true;
        return mergeReferences && refs.unmergeableCount === 0;
      })
      .map((role) => ({
        id: role.id,
        path: role.path,
        name: role.data.name || '',
        roleKey: role.data.roleKey || '',
        createTime: role.createTime,
      }));
    const candidateIds = new Set(candidates.map((role) => role.id));
    const skippedReferencedIds = sorted
      .filter((role) => role.id !== canonical.id)
      .filter((role) => !candidateIds.has(role.id))
      .filter((role) => referencesByRoleId.has(role.id))
      .map((role) => role.id);
    const mergePlans = mergeReferences
      ? sorted
          .filter((role) => candidateIds.has(role.id))
          .map((role) => {
            const refs = referencesByRoleId.get(role.id);
            return refs?.mergeableCount
              ? {
                  fromRoleId: role.id,
                  toRoleId: canonical.id,
                  referencesToRewrite: refs.mergeableCount,
                }
              : null;
          })
          .filter(Boolean)
      : [];

    deleteCandidates.push(...candidates);
    duplicateGroups.push({
      key,
      total: group.length,
      canonicalId: canonical.id,
      keepIds: [...keepIds],
      referencedIds: referenced.map((role) => role.id),
      skippedReferencedIds,
      deleteCandidateIds: candidates.map((role) => role.id),
      mergePlans,
      roles: sorted.map((role) => ({
        id: role.id,
        path: role.path,
        name: role.data.name || '',
        roleKey: role.data.roleKey || '',
        referenced: referencesByRoleId.has(role.id),
        mergeableReferences: referencesByRoleId.get(role.id)?.mergeableCount || 0,
        unmergeableReferences: referencesByRoleId.get(role.id)?.unmergeableCount || 0,
        createTime: role.createTime,
      })),
    });
  }

  return { duplicateGroups, deleteCandidates };
}

function buildRoleMergeMap(duplicateGroups) {
  const mergeMap = new Map();
  duplicateGroups.forEach((group) => {
    (group.mergePlans || []).forEach((plan) => {
      mergeMap.set(plan.fromRoleId, plan.toRoleId);
    });
  });
  return mergeMap;
}

async function rewriteKnownReferences(db, args, mergeMap) {
  if (mergeMap.size === 0) {
    return { userRoleUpdates: 0, systemSettingsRoleIdsUpdated: 0 };
  }

  let userRoleUpdates = 0;
  let batch = db.batch();
  let ops = 0;
  const usersSnap = await db.collection(USERS_COLLECTION).where('tenantId', '==', args.tenantId).get();
  for (const docSnap of usersSnap.docs) {
    const currentRoleId = String(docSnap.data()?.roleId || '');
    const nextRoleId = mergeMap.get(currentRoleId);
    if (!nextRoleId) continue;

    batch.update(docSnap.ref, { roleId: nextRoleId });
    userRoleUpdates += 1;
    ops += 1;
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  let systemSettingsRoleIdsUpdated = 0;
  const settingsRef = db.collection(SYSTEM_SETTINGS_COLLECTION).doc(args.tenantId);
  const settingsSnap = await settingsRef.get();
  const currentRoleIds = settingsSnap.data()?.planSettings?.opsNotifyRoleIds;
  if (settingsSnap.exists && Array.isArray(currentRoleIds)) {
    const nextRoleIds = [];
    currentRoleIds.forEach((roleId) => {
      const nextRoleId = typeof roleId === 'string' ? mergeMap.get(roleId) || roleId : roleId;
      if (nextRoleId !== roleId) systemSettingsRoleIdsUpdated += 1;
      if (!nextRoleIds.includes(nextRoleId)) nextRoleIds.push(nextRoleId);
    });

    if (systemSettingsRoleIdsUpdated > 0 || nextRoleIds.length !== currentRoleIds.length) {
      await settingsRef.update({ 'planSettings.opsNotifyRoleIds': nextRoleIds });
    }
  }

  return { userRoleUpdates, systemSettingsRoleIdsUpdated };
}

function writeBackup(args, payload) {
  if (!args.backupPath) return;

  const backupPath = isAbsolute(args.backupPath)
    ? args.backupPath
    : resolve(process.cwd(), args.backupPath);

  if (existsSync(backupPath)) {
    throw new Error(`Backup file already exists, refusing to overwrite: ${backupPath}`);
  }

  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(backupPath, JSON.stringify(payload, null, 2));
  console.log(`[backup] wrote duplicate-role report to ${backupPath}`);
}

async function deleteCandidates(db, candidates) {
  let batch = db.batch();
  let ops = 0;
  let deleted = 0;

  for (const candidate of candidates) {
    batch.delete(db.doc(candidate.path));
    ops += 1;
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      deleted += ops;
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
    deleted += ops;
  }

  return deleted;
}

function printSummary(args, summary) {
  const modeLabel = args.confirmDelete ? 'DELETE MODE' : 'DRY-RUN ONLY';
  console.log('\n============================================================');
  console.log(`[${modeLabel}] duplicate roles cleanup`);
  console.log(
    args.mergeReferences
      ? 'تحذير: السكريبت يدمج المراجع المعروفة فقط، ويتخطى أي دور له مراجع غير معروفة.'
      : 'تحذير: السكريبت لا يحذف أي دور مستخدم كمرجع داخل مستندات نفس الشركة.',
  );
  console.log('============================================================');
  console.log(JSON.stringify(summary, null, 2));

  if (!args.confirmDelete) {
    console.log(`\nNo documents were deleted. To delete later, rerun with ${DELETE_CONFIRM_FLAG} after reviewing the backup.`);
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);
  initializeFirebase(args);

  const db = getFirestore();
  console.log(`[init] project=${args.projectId} tenant=${args.tenantId} mode=${args.confirmDelete ? 'delete' : 'dry-run'}`);

  const roles = await loadTenantRoles(db, args);
  const roleIds = new Set(roles.map((role) => role.id));
  const { referencesByRoleId, failedCollections } = await scanRootTenantReferences(db, args, roleIds);
  await scanSystemSettingsRoleReferences(db, args, roleIds, referencesByRoleId);
  const { duplicateGroups, deleteCandidates: candidates } = classifyDuplicates(
    roles,
    referencesByRoleId,
    args.tenantId,
    args.mergeReferences,
  );
  const mergeMap = buildRoleMergeMap(duplicateGroups);

  const references = Object.fromEntries(referencesByRoleId.entries());
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: args.confirmDelete ? 'delete' : 'dry-run',
    mergeReferences: args.mergeReferences,
    projectId: args.projectId,
    tenantId: args.tenantId,
    counts: {
      rolesScanned: roles.length,
      duplicateGroups: duplicateGroups.length,
      referencedRoleIds: referencesByRoleId.size,
      mergePlans: mergeMap.size,
      deleteCandidates: candidates.length,
      skippedReferencedRoles: duplicateGroups.reduce(
        (total, group) => total + (group.skippedReferencedIds?.length || 0),
        0,
      ),
      failedReferenceCollections: failedCollections.length,
      mergedUserRoleReferences: 0,
      mergedSystemSettingsRoleIds: 0,
      deleted: 0,
    },
    duplicateGroups,
    references,
    failedCollections,
  };

  writeBackup(args, summary);
  printSummary(args, {
    projectId: summary.projectId,
    tenantId: summary.tenantId,
    counts: summary.counts,
    duplicateGroups: duplicateGroups.map((group) => ({
      key: group.key,
      total: group.total,
      canonicalId: group.canonicalId,
      keepIds: group.keepIds,
      referencedIds: group.referencedIds,
      skippedReferencedIds: group.skippedReferencedIds,
      deleteCandidateIds: group.deleteCandidateIds,
      mergePlans: group.mergePlans,
    })),
    failedCollections,
  });

  if (!args.confirmDelete) return;

  if (failedCollections.length > 0) {
    throw new Error('Refusing delete mode because one or more tenant-scoped collections could not be scanned for references.');
  }

  if (args.mergeReferences) {
    const mergeResult = await rewriteKnownReferences(db, args, mergeMap);
    summary.counts.mergedUserRoleReferences = mergeResult.userRoleUpdates;
    summary.counts.mergedSystemSettingsRoleIds = mergeResult.systemSettingsRoleIdsUpdated;
    console.log(
      `\n[merge] users.roleId=${mergeResult.userRoleUpdates} system_settings.planSettings.opsNotifyRoleIds=${mergeResult.systemSettingsRoleIdsUpdated}`,
    );
  }

  if (candidates.length === 0) {
    console.log('\n[delete] no unreferenced duplicate roles found.');
    return;
  }

  console.log(`\n[delete] deleting ${candidates.length} unreferenced duplicate roles...`);
  summary.counts.deleted = await deleteCandidates(db, candidates);
  console.log(`[delete] deleted=${summary.counts.deleted}`);
}

run().catch((error) => {
  console.error('\n[cleanup-duplicate-roles] failed');
  console.error(error instanceof Error ? error.message : error);
  console.error('\n' + usage.trim());
  process.exit(1);
});
