#!/usr/bin/env node
/**
 * Cleanup helper for duplicate manufacturing materials (same business code).
 *
 * Defaults to DRY-RUN. Destructive deletion requires:
 *   --confirm-delete-duplicate-materials
 *   --tenant <tenantId>
 *   --backup <path>
 *
 * Auth (first match wins):
 *   --credentials /path/to/serviceAccount.json
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   gcloud auth application-default login
 *   firebase login   (REST fallback, uses the operator's own IAM permissions)
 *
 * Examples:
 *   npm run cleanup:duplicate-materials -- --tenant TENANT_ID --backup tmp/duplicate-materials-dry-run.json
 *   npm run cleanup:duplicate-materials -- --tenant TENANT_ID --backup tmp/duplicate-materials-delete.json --merge-references --confirm-delete-duplicate-materials
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  createRestFirestore,
  DOCUMENT_ID_FIELD,
  hasFirebaseToolsLogin,
} from './lib/firestoreRestAdmin.mjs';

const MATERIALS_COLLECTION = 'materials';
const ENTITY_CODE_CLAIMS_COLLECTION = 'entity_code_claims';
const BOM_ITEMS_COLLECTION = 'bom_items';
const PRODUCT_MATERIALS_COLLECTION = 'product_materials';
const STOCK_ITEMS_COLLECTION = 'stock_items';
const STOCK_TRANSACTIONS_COLLECTION = 'stock_transactions';
const STOCK_LOCATION_BALANCES_COLLECTION = 'stock_location_balances';
const DEFAULT_ITEM_LOCATIONS_COLLECTION = 'default_item_locations';
const PRODUCTION_ISSUE_ORDERS_COLLECTION = 'production_issue_orders';
const DISASSEMBLY_ORDERS_COLLECTION = 'disassembly_orders';
const TRANSFER_REQUESTS_COLLECTION = 'inventory_transfer_requests';
const STOCK_COUNTS_COLLECTION = 'stock_counts';
const PURCHASE_ORDERS_COLLECTION = 'purchase_orders';
const PLAN_REQUIREMENTS_COLLECTION = 'production_plan_material_requirements';
const COMPONENT_COMPENSATIONS_COLLECTION = 'component_compensation_requests';
const COMPONENT_RETURNS_COLLECTION = 'component_return_records';
const COMPONENT_SCRAPS_COLLECTION = 'component_scrap_records';

/** Collections holding a `lines[]` array whose entries point at materials. */
const LINE_COLLECTIONS = [
  PRODUCTION_ISSUE_ORDERS_COLLECTION,
  DISASSEMBLY_ORDERS_COLLECTION,
  TRANSFER_REQUESTS_COLLECTION,
  STOCK_COUNTS_COLLECTION,
  PURCHASE_ORDERS_COLLECTION,
];

const DELETE_CONFIRM_FLAG = '--confirm-delete-duplicate-materials';
const MERGE_REFERENCES_FLAG = '--merge-references';
const BATCH_SIZE = 400;
const PAGE_SIZE = 300;

function buildMaterialClaimId(tenantId, code) {
  const t = String(tenantId || '').trim().replace(/\//g, '_');
  const c = String(code || '').trim().toUpperCase().replace(/\//g, '_');
  return `${t}__material__${c}`;
}

const usage = `
Usage:
  npm run cleanup:duplicate-materials -- [options]

Dry-run:
  npm run cleanup:duplicate-materials -- --tenant TENANT_ID --backup tmp/duplicate-materials-dry-run.json

Delete after review:
  npm run cleanup:duplicate-materials -- --tenant TENANT_ID --backup tmp/duplicate-materials-delete.json ${MERGE_REFERENCES_FLAG} ${DELETE_CONFIRM_FLAG}

Options:
  --project <id>          Firebase/GCP project id. Defaults to .firebaserc / GCLOUD_PROJECT.
  --credentials <path>    Service account JSON. Defaults to GOOGLE_APPLICATION_CREDENTIALS or ADC.
  --tenant <tenantId>     Tenant to scan. Required.
  --backup <path>         Write full plan JSON (required for delete; recommended for dry-run).
  --code <MAT-xxx>        Only scan this material code (optional filter).
  --limit <n>             Stop after scanning n material docs.
  --sample-size <n>       Reference samples per material. Default: 8.
  ${MERGE_REFERENCES_FLAG}
                         Rewrite known itemId/materialId refs to the canonical material before delete.
  ${DELETE_CONFIRM_FLAG}
                         Actually merge refs and delete safe duplicate material docs.
`;

function getFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] || '' : '';
}

function readDefaultProjectFromFirebaserc() {
  for (const candidate of [
    resolve(process.cwd(), '.firebaserc'),
    resolve(process.cwd(), '..', '.firebaserc'),
  ]) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
      const projectId = parsed?.projects?.default;
      if (typeof projectId === 'string' && projectId.trim()) return projectId.trim();
    } catch {
      // ignore
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
    codeFilter: getFlagValue(argv, '--code').trim().toUpperCase(),
    limit: parsePositiveNumber(getFlagValue(argv, '--limit').trim(), 0),
    sampleSize: parsePositiveNumber(getFlagValue(argv, '--sample-size').trim(), 8),
    mergeReferences: argv.includes(MERGE_REFERENCES_FLAG),
    confirmDelete: argv.includes(DELETE_CONFIRM_FLAG),
  };
}

function validateArgs(args) {
  const problems = [];
  if (!args.projectId) {
    problems.push('missing Firebase/GCP project id; use --project or .firebaserc');
  }
  if (!args.tenantId) problems.push('--tenant <tenantId> is required');
  if (args.confirmDelete && !args.backupPath) problems.push('--backup <path> is required in delete mode');
  if (problems.length > 0) {
    throw new Error(`Refusing to run:\n- ${problems.join('\n- ')}`);
  }
}

/** Field path used for keyset pagination; set once the backend is known. */
let documentIdField = DOCUMENT_ID_FIELD;

function hasApplicationDefaultCredentials() {
  const home = process.env.HOME || '';
  return (
    existsSync(join(home, '.config/gcloud/application_default_credentials.json')) ||
    Boolean((process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim())
  );
}

async function createDb(args) {
  const credentialsRaw = (args.credentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  const useAdmin = Boolean(credentialsRaw) || hasApplicationDefaultCredentials();

  if (useAdmin) {
    const { cert, getApps, initializeApp } = await import('firebase-admin/app');
    const { FieldPath, getFirestore } = await import('firebase-admin/firestore');

    if (!getApps().length) {
      if (credentialsRaw) {
        const credentialsPath = isAbsolute(credentialsRaw)
          ? credentialsRaw
          : resolve(process.cwd(), credentialsRaw);
        if (!existsSync(credentialsPath)) {
          throw new Error(`Credentials file not found: ${credentialsPath}`);
        }
        initializeApp({ projectId: args.projectId, credential: cert(credentialsPath) });
      } else {
        initializeApp({ projectId: args.projectId });
      }
    }

    documentIdField = FieldPath.documentId();
    return { db: getFirestore(), backend: 'admin-sdk' };
  }

  if (!hasFirebaseToolsLogin()) {
    throw new Error(
      'No credentials found. Use --credentials <serviceAccount.json>, set GOOGLE_APPLICATION_CREDENTIALS, or run: firebase login',
    );
  }

  documentIdField = DOCUMENT_ID_FIELD;
  return { db: createRestFirestore({ projectId: args.projectId }), backend: 'firebase-cli-rest' };
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

async function loadTenantMaterials(db, args) {
  const materials = [];
  let last = null;

  for (;;) {
    let query = db
      .collection(MATERIALS_COLLECTION)
      .where('tenantId', '==', args.tenantId)
      .orderBy(documentIdField)
      .limit(PAGE_SIZE);
    if (last) query = query.startAfter(last);

    const snap = await query.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {};
      const code = normalizeCode(data.code);
      if (args.codeFilter && code !== args.codeFilter) continue;

      materials.push({
        id: docSnap.id,
        path: docSnap.ref.path,
        createTime: docSnap.createTime?.toDate?.().toISOString?.() || data.createdAt || null,
        updateTime: docSnap.updateTime?.toDate?.().toISOString?.() || null,
        code,
        name: String(data.name || ''),
        type: String(data.type || ''),
        isActive: data.isActive !== false,
        legacyRawMaterialId: String(data.legacyRawMaterialId || ''),
        data,
      });

      if (args.limit && materials.length >= args.limit) return materials;
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  return materials;
}

function emptyRefEntry() {
  return {
    count: 0,
    mergeableCount: 0,
    unmergeableCount: 0,
    byCollection: {},
    samples: [],
  };
}

function addReference(map, materialId, meta, sampleSize) {
  const entry = map.get(materialId) || emptyRefEntry();
  entry.count += 1;
  if (meta.mergeable) entry.mergeableCount += 1;
  else entry.unmergeableCount += 1;
  entry.byCollection[meta.collection] = (entry.byCollection[meta.collection] || 0) + 1;
  if (entry.samples.length < sampleSize) {
    entry.samples.push({
      collection: meta.collection,
      docPath: meta.docPath,
      fieldPath: meta.fieldPath,
      mergeable: meta.mergeable,
    });
  }
  map.set(materialId, entry);
}

async function forEachTenantDocs(db, collectionName, tenantId, onDoc) {
  let last = null;
  for (;;) {
    let query = db
      .collection(collectionName)
      .where('tenantId', '==', tenantId)
      .orderBy(documentIdField)
      .limit(PAGE_SIZE);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) break;
    for (const docSnap of snap.docs) {
      await onDoc(docSnap);
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
}

async function scanMaterialReferences(db, args, materialIds) {
  const referencesByMaterialId = new Map();
  const failedCollections = [];

  const scanSimple = async (collectionName, fieldPath, mergeable = true) => {
    try {
      await forEachTenantDocs(db, collectionName, args.tenantId, (docSnap) => {
        const value = docSnap.data()?.[fieldPath];
        if (typeof value === 'string' && materialIds.has(value)) {
          addReference(
            referencesByMaterialId,
            value,
            {
              collection: collectionName,
              docPath: docSnap.ref.path,
              fieldPath,
              mergeable,
            },
            args.sampleSize,
          );
        }
      });
    } catch (error) {
      failedCollections.push({
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // BOM lines: itemId when itemType is material
  try {
    await forEachTenantDocs(db, BOM_ITEMS_COLLECTION, args.tenantId, (docSnap) => {
      const data = docSnap.data() || {};
      const itemId = String(data.itemId || '');
      if (!materialIds.has(itemId)) return;
      if (String(data.itemType || '') && data.itemType !== 'material') return;
      addReference(
        referencesByMaterialId,
        itemId,
        {
          collection: BOM_ITEMS_COLLECTION,
          docPath: docSnap.ref.path,
          fieldPath: 'itemId',
          mergeable: true,
        },
        args.sampleSize,
      );
    });
  } catch (error) {
    failedCollections.push({
      collection: BOM_ITEMS_COLLECTION,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await scanSimple(PRODUCT_MATERIALS_COLLECTION, 'materialId', true);
  await scanSimple(PLAN_REQUIREMENTS_COLLECTION, 'materialId', true);

  for (const collectionName of [
    STOCK_ITEMS_COLLECTION,
    STOCK_TRANSACTIONS_COLLECTION,
    STOCK_LOCATION_BALANCES_COLLECTION,
    DEFAULT_ITEM_LOCATIONS_COLLECTION,
  ]) {
    await scanSimple(collectionName, 'itemId', true);
  }

  // Documents carrying nested lines[] plus optional top-level material pointers
  for (const collectionName of LINE_COLLECTIONS) {
    try {
      await forEachTenantDocs(db, collectionName, args.tenantId, (docSnap) => {
        const data = docSnap.data() || {};

        for (const fieldPath of ['itemId', 'materialId']) {
          const value = String(data[fieldPath] || '');
          if (!materialIds.has(value)) continue;
          addReference(
            referencesByMaterialId,
            value,
            { collection: collectionName, docPath: docSnap.ref.path, fieldPath, mergeable: true },
            args.sampleSize,
          );
        }

        const lines = data.lines;
        if (!Array.isArray(lines)) return;
        lines.forEach((line, index) => {
          for (const key of ['itemId', 'materialId']) {
            const value = String(line?.[key] || '');
            if (!materialIds.has(value)) continue;
            addReference(
              referencesByMaterialId,
              value,
              {
                collection: collectionName,
                docPath: docSnap.ref.path,
                fieldPath: `lines[${index}].${key}`,
                mergeable: true,
              },
              args.sampleSize,
            );
          }
        });
      });
    } catch (error) {
      failedCollections.push({
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Component records with nested line.itemId
  for (const collectionName of [
    COMPONENT_COMPENSATIONS_COLLECTION,
    COMPONENT_RETURNS_COLLECTION,
    COMPONENT_SCRAPS_COLLECTION,
  ]) {
    try {
      await forEachTenantDocs(db, collectionName, args.tenantId, (docSnap) => {
        const data = docSnap.data() || {};
        const itemId = String(data.line?.itemId || data.line?.materialId || data.materialId || '');
        if (!materialIds.has(itemId)) return;
        addReference(
          referencesByMaterialId,
          itemId,
          {
            collection: collectionName,
            docPath: docSnap.ref.path,
            fieldPath: data.line ? 'line.itemId' : 'materialId',
            mergeable: true,
          },
          args.sampleSize,
        );
      });
    } catch (error) {
      failedCollections.push({
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { referencesByMaterialId, failedCollections };
}

function materialRank(material, referencesByMaterialId) {
  const refs = referencesByMaterialId.get(material.id);
  return {
    referenced: refs ? 1 : 0,
    refCount: refs?.count || 0,
    hasLegacy: material.legacyRawMaterialId ? 1 : 0,
    isActive: material.isActive ? 1 : 0,
    createTime: material.createTime || '',
    id: material.id,
  };
}

function compareKeepPriority(a, b, referencesByMaterialId) {
  const ar = materialRank(a, referencesByMaterialId);
  const br = materialRank(b, referencesByMaterialId);
  if (ar.refCount !== br.refCount) return br.refCount - ar.refCount;
  if (ar.referenced !== br.referenced) return br.referenced - ar.referenced;
  if (ar.hasLegacy !== br.hasLegacy) return br.hasLegacy - ar.hasLegacy;
  if (ar.isActive !== br.isActive) return br.isActive - ar.isActive;
  if (ar.createTime !== br.createTime) return String(ar.createTime).localeCompare(String(br.createTime));
  return ar.id.localeCompare(br.id);
}

function classifyDuplicates(materials, referencesByMaterialId, mergeReferences) {
  const groupsByCode = new Map();
  for (const material of materials) {
    if (!material.code) continue;
    const group = groupsByCode.get(material.code) || [];
    group.push(material);
    groupsByCode.set(material.code, group);
  }

  const duplicateGroups = [];
  const deleteCandidates = [];

  for (const [code, group] of groupsByCode.entries()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => compareKeepPriority(a, b, referencesByMaterialId));
    const canonical = sorted[0];
    const keepIds = new Set([canonical.id]);

    if (!mergeReferences) {
      // Without merge: keep every referenced duplicate too (only delete unreferenced extras).
      for (const material of sorted) {
        if (referencesByMaterialId.has(material.id)) keepIds.add(material.id);
      }
    }

    const candidates = sorted
      .filter((material) => {
        if (keepIds.has(material.id)) return false;
        const refs = referencesByMaterialId.get(material.id);
        if (!refs) return true;
        return mergeReferences && refs.unmergeableCount === 0;
      })
      .map((material) => ({
        id: material.id,
        path: material.path,
        code: material.code,
        name: material.name,
        createTime: material.createTime,
        refCount: referencesByMaterialId.get(material.id)?.count || 0,
      }));

    const candidateIds = new Set(candidates.map((row) => row.id));
    const skippedReferencedIds = sorted
      .filter((material) => material.id !== canonical.id)
      .filter((material) => !candidateIds.has(material.id))
      .filter((material) => referencesByMaterialId.has(material.id))
      .map((material) => material.id);

    const mergePlans = mergeReferences
      ? sorted
          .filter((material) => candidateIds.has(material.id))
          .map((material) => {
            const refs = referencesByMaterialId.get(material.id);
            if (!refs?.mergeableCount) return null;
            return {
              fromMaterialId: material.id,
              toMaterialId: canonical.id,
              referencesToRewrite: refs.mergeableCount,
              byCollection: refs.byCollection,
            };
          })
          .filter(Boolean)
      : [];

    deleteCandidates.push(...candidates);
    duplicateGroups.push({
      code,
      total: group.length,
      canonicalId: canonical.id,
      canonicalName: canonical.name,
      keepIds: [...keepIds],
      referencedIds: sorted.filter((m) => referencesByMaterialId.has(m.id)).map((m) => m.id),
      skippedReferencedIds,
      deleteCandidateIds: candidates.map((row) => row.id),
      mergePlans,
      materials: sorted.map((material) => ({
        id: material.id,
        path: material.path,
        code: material.code,
        name: material.name,
        type: material.type,
        isActive: material.isActive,
        legacyRawMaterialId: material.legacyRawMaterialId || null,
        createTime: material.createTime,
        referenced: referencesByMaterialId.has(material.id),
        refCount: referencesByMaterialId.get(material.id)?.count || 0,
        byCollection: referencesByMaterialId.get(material.id)?.byCollection || {},
      })),
    });
  }

  return { duplicateGroups, deleteCandidates };
}

function buildMergeMap(duplicateGroups) {
  const mergeMap = new Map();
  for (const group of duplicateGroups) {
    for (const plan of group.mergePlans || []) {
      mergeMap.set(plan.fromMaterialId, plan.toMaterialId);
    }
  }
  return mergeMap;
}

async function rewriteFieldIfMapped(db, collectionName, tenantId, fieldPath, mergeMap) {
  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  await forEachTenantDocs(db, collectionName, tenantId, async (docSnap) => {
    const current = docSnap.data()?.[fieldPath];
    if (typeof current !== 'string') return;
    const next = mergeMap.get(current);
    if (!next || next === current) return;
    batch.update(docSnap.ref, { [fieldPath]: next });
    updated += 1;
    ops += 1;
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  });

  if (ops > 0) await batch.commit();
  return updated;
}

async function rewriteLinesCollection(db, collectionName, tenantId, mergeMap) {
  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  await forEachTenantDocs(db, collectionName, tenantId, async (docSnap) => {
    const data = docSnap.data() || {};
    const patch = {};

    for (const fieldPath of ['itemId', 'materialId']) {
      const next = mergeMap.get(String(data[fieldPath] || ''));
      if (next) patch[fieldPath] = next;
    }

    const lines = data.lines;
    if (Array.isArray(lines) && lines.length > 0) {
      let changed = false;
      const nextLines = lines.map((line) => {
        const nextItem = mergeMap.get(String(line?.itemId || ''));
        const nextMaterial = mergeMap.get(String(line?.materialId || ''));
        if (!nextItem && !nextMaterial) return line;
        changed = true;
        return {
          ...line,
          ...(nextItem ? { itemId: nextItem } : {}),
          ...(nextMaterial ? { materialId: nextMaterial } : {}),
        };
      });
      if (changed) patch.lines = nextLines;
    }

    if (Object.keys(patch).length === 0) return;

    batch.update(docSnap.ref, patch);
    updated += 1;
    ops += 1;
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  });

  if (ops > 0) await batch.commit();
  return updated;
}

async function rewriteComponentLine(db, collectionName, tenantId, mergeMap) {
  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  await forEachTenantDocs(db, collectionName, tenantId, async (docSnap) => {
    const data = docSnap.data() || {};
    const patch = {};
    if (data.line && typeof data.line === 'object') {
      const itemId = String(data.line.itemId || '');
      const materialId = String(data.line.materialId || '');
      const nextItem = mergeMap.get(itemId);
      const nextMaterial = mergeMap.get(materialId);
      if (nextItem || nextMaterial) {
        patch.line = {
          ...data.line,
          ...(nextItem ? { itemId: nextItem } : {}),
          ...(nextMaterial ? { materialId: nextMaterial } : {}),
        };
      }
    }
    const topMaterialId = String(data.materialId || '');
    const nextTop = mergeMap.get(topMaterialId);
    if (nextTop) patch.materialId = nextTop;
    if (Object.keys(patch).length === 0) return;

    batch.update(docSnap.ref, patch);
    updated += 1;
    ops += 1;
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  });

  if (ops > 0) await batch.commit();
  return updated;
}

async function rewriteKnownReferences(db, args, mergeMap) {
  if (mergeMap.size === 0) {
    return {
      bomItems: 0,
      productMaterials: 0,
      planRequirements: 0,
      stockItems: 0,
      stockTransactions: 0,
      stockLocationBalances: 0,
      defaultItemLocations: 0,
      lineCollections: {},
      compensations: 0,
      returns: 0,
      scraps: 0,
    };
  }

  const lineCollections = {};
  for (const collectionName of LINE_COLLECTIONS) {
    lineCollections[collectionName] = await rewriteLinesCollection(
      db,
      collectionName,
      args.tenantId,
      mergeMap,
    );
  }

  return {
    bomItems: await rewriteFieldIfMapped(db, BOM_ITEMS_COLLECTION, args.tenantId, 'itemId', mergeMap),
    productMaterials: await rewriteFieldIfMapped(db, PRODUCT_MATERIALS_COLLECTION, args.tenantId, 'materialId', mergeMap),
    planRequirements: await rewriteFieldIfMapped(db, PLAN_REQUIREMENTS_COLLECTION, args.tenantId, 'materialId', mergeMap),
    stockItems: await rewriteFieldIfMapped(db, STOCK_ITEMS_COLLECTION, args.tenantId, 'itemId', mergeMap),
    stockTransactions: await rewriteFieldIfMapped(db, STOCK_TRANSACTIONS_COLLECTION, args.tenantId, 'itemId', mergeMap),
    stockLocationBalances: await rewriteFieldIfMapped(db, STOCK_LOCATION_BALANCES_COLLECTION, args.tenantId, 'itemId', mergeMap),
    defaultItemLocations: await rewriteFieldIfMapped(db, DEFAULT_ITEM_LOCATIONS_COLLECTION, args.tenantId, 'itemId', mergeMap),
    lineCollections,
    compensations: await rewriteComponentLine(db, COMPONENT_COMPENSATIONS_COLLECTION, args.tenantId, mergeMap),
    returns: await rewriteComponentLine(db, COMPONENT_RETURNS_COLLECTION, args.tenantId, mergeMap),
    scraps: await rewriteComponentLine(db, COMPONENT_SCRAPS_COLLECTION, args.tenantId, mergeMap),
  };
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
  console.log(`[backup] wrote duplicate-materials report to ${backupPath}`);
}

async function deleteCandidates(db, candidates, tenantId, canonicalByCode) {
  let batch = db.batch();
  let ops = 0;
  let deleted = 0;
  let claimsRepointed = 0;
  let claimsDeleted = 0;

  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const candidate of candidates) {
    batch.delete(db.doc(candidate.path));
    deleted += 1;
    ops += 1;

    const code = String(candidate.code || '').trim().toUpperCase();
    if (code) {
      const claimRef = db.collection(ENTITY_CODE_CLAIMS_COLLECTION).doc(buildMaterialClaimId(tenantId, code));
      const claimSnap = await claimRef.get();
      const canonicalId = canonicalByCode.get(code) || '';
      if (claimSnap.exists) {
        const ownerId = String(claimSnap.data()?.ownerId || '');
        if (ownerId === candidate.id) {
          if (canonicalId) {
            batch.set(
              claimRef,
              {
                tenantId,
                entityType: 'material',
                code,
                ownerId: canonicalId,
                ownerCollection: MATERIALS_COLLECTION,
                updatedAt: new Date().toISOString(),
              },
              { merge: true },
            );
            claimsRepointed += 1;
          } else {
            batch.delete(claimRef);
            claimsDeleted += 1;
          }
          ops += 1;
        }
      } else if (canonicalId) {
        batch.set(claimRef, {
          tenantId,
          entityType: 'material',
          code,
          ownerId: canonicalId,
          ownerCollection: MATERIALS_COLLECTION,
          createdAt: new Date().toISOString(),
        });
        claimsRepointed += 1;
        ops += 1;
      }
    }

    if (ops >= BATCH_SIZE) await flush();
  }

  await flush();
  return { deleted, claimsRepointed, claimsDeleted };
}

function printSummary(args, summary) {
  const modeLabel = args.confirmDelete ? 'DELETE MODE' : 'DRY-RUN ONLY';
  console.log('\n============================================================');
  console.log(`[${modeLabel}] duplicate materials cleanup`);
  console.log(
    args.mergeReferences
      ? 'مع الدمج: سيعيد كتابة المراجع المعروفة ثم يحذف النسخ الزائدة.'
      : 'بدون دمج: يحذف فقط النسخ غير المرتبطة بأي مرجع.',
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

  const { db, backend } = await createDb(args);
  console.log(
    `[init] project=${args.projectId} tenant=${args.tenantId} auth=${backend} mode=${args.confirmDelete ? 'delete' : 'dry-run'}${args.codeFilter ? ` code=${args.codeFilter}` : ''}`,
  );

  const materials = await loadTenantMaterials(db, args);
  const materialIds = new Set(materials.map((row) => row.id));
  console.log(`[scan] materials=${materials.length}`);

  const { referencesByMaterialId, failedCollections } = await scanMaterialReferences(db, args, materialIds);
  const { duplicateGroups, deleteCandidates: candidates } = classifyDuplicates(
    materials,
    referencesByMaterialId,
    args.mergeReferences,
  );
  const mergeMap = buildMergeMap(duplicateGroups);

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: args.confirmDelete ? 'delete' : 'dry-run',
    mergeReferences: args.mergeReferences,
    projectId: args.projectId,
    tenantId: args.tenantId,
    codeFilter: args.codeFilter || null,
    counts: {
      materialsScanned: materials.length,
      duplicateCodes: duplicateGroups.length,
      duplicateDocs: duplicateGroups.reduce((sum, g) => sum + g.total, 0),
      referencedMaterialIds: referencesByMaterialId.size,
      mergePlans: mergeMap.size,
      deleteCandidates: candidates.length,
      skippedReferencedMaterials: duplicateGroups.reduce(
        (total, group) => total + (group.skippedReferencedIds?.length || 0),
        0,
      ),
      failedReferenceCollections: failedCollections.length,
      deleted: 0,
      mergeResult: null,
    },
    duplicateGroups,
    references: Object.fromEntries(referencesByMaterialId.entries()),
    failedCollections,
  };

  writeBackup(args, summary);
  printSummary(args, {
    projectId: summary.projectId,
    tenantId: summary.tenantId,
    counts: summary.counts,
    sampleDuplicateCodes: duplicateGroups.slice(0, 15).map((group) => ({
      code: group.code,
      total: group.total,
      canonicalId: group.canonicalId,
      canonicalName: group.canonicalName,
      keepIds: group.keepIds,
      deleteCandidateIds: group.deleteCandidateIds,
      skippedReferencedIds: group.skippedReferencedIds,
    })),
    failedCollections,
  });

  if (!args.confirmDelete) return;

  if (failedCollections.length > 0) {
    throw new Error('Refusing delete mode because one or more collections could not be scanned for references.');
  }

  if (args.mergeReferences) {
    const mergeResult = await rewriteKnownReferences(db, args, mergeMap);
    summary.counts.mergeResult = mergeResult;
    console.log('\n[merge]', JSON.stringify(mergeResult));
  }

  if (candidates.length === 0) {
    console.log('\n[delete] no safe duplicate materials found.');
    return;
  }

  console.log(`\n[delete] deleting ${candidates.length} duplicate materials...`);
  const canonicalByCode = new Map(
    duplicateGroups.map((group) => [String(group.code || '').toUpperCase(), group.canonicalId]),
  );
  const deleteResult = await deleteCandidates(db, candidates, args.tenantId, canonicalByCode);
  summary.counts.deleted = deleteResult.deleted;
  summary.counts.claimsRepointed = deleteResult.claimsRepointed;
  summary.counts.claimsDeleted = deleteResult.claimsDeleted;
  console.log(`[delete] deleted=${deleteResult.deleted} claimsRepointed=${deleteResult.claimsRepointed} claimsDeleted=${deleteResult.claimsDeleted}`);
}

run().catch((error) => {
  console.error('\n[cleanup-duplicate-materials] failed');
  console.error(error instanceof Error ? error.message : error);
  console.error('\n' + usage.trim());
  process.exit(1);
});
