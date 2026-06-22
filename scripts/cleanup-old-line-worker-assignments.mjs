#!/usr/bin/env node
/**
 * Safe cleanup helper for legacy daily worker-line link rows.
 *
 * Defaults to DRY-RUN. Destructive deletion requires:
 *   --confirm-delete-old-line-worker-assignments
 *   --tenant <tenantId>
 *   --to-date <YYYY-MM-DD>
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

const DEFAULT_LEGACY_COLLECTION = 'line_worker_assignments';
const PERMANENT_COLLECTION = 'production_line_worker_assignments';
const WORKERS_COLLECTION = 'production_workers';
const DEFAULT_LABOR_ROLE = 'production';
const DELETE_CONFIRM_FLAG = '--confirm-delete-old-line-worker-assignments';
const BATCH_SIZE = 450;

const usage = `
Usage:
  npm run cleanup:old-line-worker-assignments -- [options]

Dry-run examples:
  npm run cleanup:old-line-worker-assignments -- --tenant TENANT_ID --to-date 2026-06-01
  npm run cleanup:old-line-worker-assignments -- --tenant TENANT_ID --from-date 2026-01-01 --to-date 2026-06-01 --backup tmp/line-worker-cleanup.json

Delete later, only after reviewing dry-run output and backup:
  npm run cleanup:old-line-worker-assignments -- --tenant TENANT_ID --to-date 2026-06-01 --backup tmp/line-worker-cleanup.json ${DELETE_CONFIRM_FLAG}

Options:
  --project <id>          Firebase/GCP project id. Defaults to .firebaserc, GCLOUD_PROJECT, or GOOGLE_CLOUD_PROJECT.
  --credentials <path>    Service account JSON. Defaults to GOOGLE_APPLICATION_CREDENTIALS or ADC.
  --collection <name>     Legacy collection to scan. Default: ${DEFAULT_LEGACY_COLLECTION}
  --tenant <tenantId>     Tenant filter. Required for delete mode.
  --from-date <date>      Inclusive lower date filter, YYYY-MM-DD.
  --to-date <date>        Inclusive upper date filter, YYYY-MM-DD. Required for delete mode.
  --backup <path>         Export scanned records and classifications before deleting. Required for delete mode.
  --limit <n>             Stop after scanning n matching legacy rows.
  --sample-size <n>       Number of sample document ids to print per bucket. Default: 10.
  ${DELETE_CONFIRM_FLAG}
                         Actually delete candidate rows. Without this flag this is a dry-run.
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

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage.trim());
    process.exit(0);
  }

  const limitRaw = getFlagValue(argv, '--limit').trim();
  const sampleSizeRaw = getFlagValue(argv, '--sample-size').trim();
  const limit = limitRaw ? Number(limitRaw) : 0;
  const sampleSize = sampleSizeRaw ? Number(sampleSizeRaw) : 10;

  return {
    projectId: resolveProjectId(argv),
    credentialsPath: getFlagValue(argv, '--credentials').trim(),
    collectionName: getFlagValue(argv, '--collection').trim() || DEFAULT_LEGACY_COLLECTION,
    tenantId: getFlagValue(argv, '--tenant').trim(),
    fromDate: getFlagValue(argv, '--from-date').trim(),
    toDate: getFlagValue(argv, '--to-date').trim(),
    backupPath: getFlagValue(argv, '--backup').trim(),
    limit: Number.isFinite(limit) && limit > 0 ? limit : 0,
    sampleSize: Number.isFinite(sampleSize) && sampleSize >= 0 ? sampleSize : 10,
    confirmDelete: argv.includes(DELETE_CONFIRM_FLAG),
  };
}

function validateIsoDate(value, flag) {
  if (!value) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} must use YYYY-MM-DD format.`);
  }
}

function validateArgs(args) {
  if (!args.projectId) {
    throw new Error('Missing Firebase/GCP project id. Use --project <id>, GCLOUD_PROJECT, GOOGLE_CLOUD_PROJECT, or .firebaserc.');
  }

  validateIsoDate(args.fromDate, '--from-date');
  validateIsoDate(args.toDate, '--to-date');

  if (args.fromDate && args.toDate && args.fromDate > args.toDate) {
    throw new Error('--from-date must be before or equal to --to-date.');
  }

  if (args.confirmDelete) {
    const problems = [];
    if (args.collectionName !== DEFAULT_LEGACY_COLLECTION) {
      problems.push(`delete mode is limited to ${DEFAULT_LEGACY_COLLECTION}; remove --collection or run a reviewed custom script`);
    }
    if (!args.tenantId) problems.push('--tenant <tenantId> is required');
    if (!args.toDate) problems.push('--to-date <YYYY-MM-DD> is required');
    if (!args.backupPath) problems.push('--backup <path> is required');

    if (problems.length > 0) {
      throw new Error(`Refusing delete mode:\n- ${problems.join('\n- ')}`);
    }
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

function isActivePermanentOnDate(row, date) {
  if (!row?.isActive) return false;
  if (normalizeString(row.startDate) > date) return false;
  const endDate = normalizeString(row.endDate);
  if (endDate && endDate < date) return false;
  return true;
}

function hasMeaningfulDailyStatus(row) {
  if (row.isPresent === false) return true;
  const laborRole = normalizeString(row.laborRole);
  return Boolean(laborRole && laborRole !== DEFAULT_LABOR_ROLE);
}

function addSample(samples, key, id, sampleSize) {
  if (sampleSize === 0) return;
  const bucket = samples[key] || [];
  if (bucket.length < sampleSize) bucket.push(id);
  samples[key] = bucket;
}

async function loadProductionWorkers(db, tenantId) {
  const byEmployeeId = new Map();
  let query = db.collection(WORKERS_COLLECTION).orderBy(FieldPath.documentId()).limit(500);
  let last = null;

  for (;;) {
    let pageQuery = query;
    if (last) pageQuery = pageQuery.startAfter(last);
    const snap = await pageQuery.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (tenantId && data.tenantId && data.tenantId !== tenantId) continue;
      const employeeId = normalizeString(data.employeeId);
      if (!employeeId) continue;
      byEmployeeId.set(employeeId, { id: docSnap.id, ...data });
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }

  return byEmployeeId;
}

async function loadPermanentAssignments(db, tenantId) {
  const byWorkerId = new Map();
  let query = db.collection(PERMANENT_COLLECTION).orderBy(FieldPath.documentId()).limit(500);
  let last = null;

  for (;;) {
    let pageQuery = query;
    if (last) pageQuery = pageQuery.startAfter(last);
    const snap = await pageQuery.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (tenantId && data.tenantId && data.tenantId !== tenantId) continue;
      const workerId = normalizeString(data.workerId);
      if (!workerId) continue;
      const list = byWorkerId.get(workerId) || [];
      list.push({ id: docSnap.id, ...data });
      byWorkerId.set(workerId, list);
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }

  return byWorkerId;
}

function classifyLegacyRow(row, workersByEmployeeId, permanentByWorkerId) {
  const lineId = normalizeString(row.lineId);
  const employeeId = normalizeString(row.employeeId);
  const date = normalizeString(row.date);

  if (!lineId || !employeeId || !date) {
    return {
      action: 'preserve',
      reason: 'needs_review_missing_line_employee_or_date',
    };
  }

  if (hasMeaningfulDailyStatus(row)) {
    return {
      action: 'preserve',
      reason: 'preserve_daily_attendance_or_role_override',
    };
  }

  const worker = workersByEmployeeId.get(employeeId);
  if (!worker?.id) {
    return {
      action: 'preserve',
      reason: 'preserve_no_production_worker_match',
    };
  }

  const permanentMatches = (permanentByWorkerId.get(worker.id) || []).filter(
    (assignment) => normalizeString(assignment.lineId) === lineId && isActivePermanentOnDate(assignment, date),
  );

  if (permanentMatches.length === 0) {
    return {
      action: 'preserve',
      reason: 'preserve_no_active_permanent_replacement',
      workerId: worker.id,
    };
  }

  return {
    action: 'delete_candidate',
    reason: 'covered_by_active_permanent_assignment_without_daily_override',
    workerId: worker.id,
    permanentAssignmentIds: permanentMatches.map((assignment) => assignment.id),
  };
}

function inScope(data, args) {
  if (args.tenantId && normalizeString(data.tenantId) !== args.tenantId) return false;
  const date = normalizeString(data.date);
  if (args.fromDate && (!date || date < args.fromDate)) return false;
  if (args.toDate && (!date || date > args.toDate)) return false;
  return true;
}

async function scanLegacyRows(db, args, workersByEmployeeId, permanentByWorkerId) {
  const rows = [];
  const counts = {
    scanned: 0,
    inScope: 0,
    deleteCandidates: 0,
    preserved: 0,
    deleted: 0,
  };
  const reasonCounts = {};
  const samples = {};
  let last = null;

  for (;;) {
    let q = db.collection(args.collectionName).orderBy(FieldPath.documentId()).limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      counts.scanned += 1;
      const data = docSnap.data();
      if (!inScope(data, args)) continue;
      counts.inScope += 1;

      const classification = classifyLegacyRow(data, workersByEmployeeId, permanentByWorkerId);
      const bucketKey = `${classification.action}:${classification.reason}`;
      reasonCounts[bucketKey] = (reasonCounts[bucketKey] || 0) + 1;
      addSample(samples, bucketKey, docSnap.id, args.sampleSize);

      if (classification.action === 'delete_candidate') counts.deleteCandidates += 1;
      else counts.preserved += 1;

      rows.push({
        id: docSnap.id,
        path: docSnap.ref.path,
        classification,
        data,
      });

      if (args.limit && counts.inScope >= args.limit) {
        return { rows, counts, reasonCounts, samples };
      }
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }

  return { rows, counts, reasonCounts, samples };
}

function writeBackup(args, summary, rows) {
  if (!args.backupPath) return;

  const backupPath = isAbsolute(args.backupPath)
    ? args.backupPath
    : resolve(process.cwd(), args.backupPath);

  if (existsSync(backupPath)) {
    throw new Error(`Backup file already exists, refusing to overwrite: ${backupPath}`);
  }

  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(
    backupPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      mode: args.confirmDelete ? 'delete' : 'dry-run',
      projectId: args.projectId,
      collectionName: args.collectionName,
      tenantId: args.tenantId || null,
      fromDate: args.fromDate || null,
      toDate: args.toDate || null,
      summary,
      rows,
    }, null, 2),
  );
  console.log(`[backup] wrote ${rows.length} scoped rows to ${backupPath}`);
}

async function deleteCandidates(db, rows) {
  const candidates = rows.filter((row) => row.classification.action === 'delete_candidate');
  let batch = db.batch();
  let ops = 0;
  let deleted = 0;

  for (const row of candidates) {
    batch.delete(db.doc(row.path));
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
  console.log(`[${modeLabel}] legacy worker-line assignment cleanup`);
  console.log('تحذير: لا تحذف سجلات الحضور/الدور اليومي. راجع النتائج قبل أي حذف.');
  console.log('============================================================');
  console.log(JSON.stringify({
    projectId: args.projectId,
    collectionName: args.collectionName,
    tenantId: args.tenantId || '(all tenants - dry-run only recommended)',
    fromDate: args.fromDate || '(none)',
    toDate: args.toDate || '(none)',
    counts: summary.counts,
    reasonCounts: summary.reasonCounts,
    sampleIds: summary.samples,
  }, null, 2));

  if (!args.confirmDelete) {
    console.log(`\nNo documents were deleted. To delete later, rerun with ${DELETE_CONFIRM_FLAG} after reviewing tenant/date scope and backup.`);
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);
  initializeFirebase(args);

  const db = getFirestore();
  console.log(`[init] project=${args.projectId} collection=${args.collectionName} mode=${args.confirmDelete ? 'delete' : 'dry-run'}`);
  console.log('[init] loading production workers and permanent line assignments...');

  const [workersByEmployeeId, permanentByWorkerId] = await Promise.all([
    loadProductionWorkers(db, args.tenantId),
    loadPermanentAssignments(db, args.tenantId),
  ]);

  console.log(`[init] loaded workers=${workersByEmployeeId.size} permanent-worker-buckets=${permanentByWorkerId.size}`);
  const summary = await scanLegacyRows(db, args, workersByEmployeeId, permanentByWorkerId);

  writeBackup(args, summary, summary.rows);
  printSummary(args, summary);

  if (!args.confirmDelete) return;

  if (summary.counts.deleteCandidates === 0) {
    console.log('\n[delete] no delete candidates found.');
    return;
  }

  console.log(`\n[delete] deleting ${summary.counts.deleteCandidates} candidate rows...`);
  summary.counts.deleted = await deleteCandidates(db, summary.rows);
  console.log(`[delete] deleted=${summary.counts.deleted}`);
}

run().catch((error) => {
  console.error('\n[cleanup-old-line-worker-assignments] failed');
  console.error(error instanceof Error ? error.message : error);
  console.error('\n' + usage.trim());
  process.exit(1);
});
