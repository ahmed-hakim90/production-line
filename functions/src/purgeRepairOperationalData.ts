import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = getFirestore();

const USERS = 'users';
const ROLES = 'roles';
const AUDIT_LOGS = 'audit_logs';

/** Operational repair docs wiped for test-data reset. Masters (branches/parts/customers/stock_items) stay. */
const TENANT_SCOPED_COLLECTIONS = [
  'repair_jobs',
  'repair_job_financials',
  'repair_payment_authorizations',
  'repair_payments',
  'repair_financial_approvals',
  'repair_part_reservations',
  'repair_spare_issues',
  'repair_custody_records',
  'repair_replacement_requests',
  'customer_service_requests',
  'customer_service_events',
  'repair_sales_invoices',
  'repair_followups',
  'repair_complaints',
  'repair_parts_transactions',
  'repair_treasury_entries',
  'repair_treasury_expense_requests',
  'repair_treasury_sessions',
  'repair_treasury_month_closes',
  'repair_treasury_settlements',
  'repair_financial_migration_reviews',
  'product_barcode_claims',
] as const;

/** Delete ledger rows for repair movements without touching stock_items balances. */
const REPAIR_STOCK_SOURCE_MODULES = [
  'repair_spare_issue',
  'repair_spare_return',
  'repair_customer_custody',
  'repair_unrepairable',
] as const;

const CONFIRM_PREFIX = 'PURGE_REPAIR_OPS_';

type UserDoc = {
  tenantId?: string;
  roleId?: string;
  isSuperAdmin?: boolean;
  email?: string;
  displayName?: string;
};

async function actorMayPurge(uid: string): Promise<{ tenantId: string; isSuperAdmin: boolean; email: string }> {
  const userSnap = await db.collection(USERS).doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  }
  const user = userSnap.data() as UserDoc;
  const tenantId = String(user.tenantId || '').trim();
  const isSuperAdmin = user.isSuperAdmin === true;
  if (!tenantId && !isSuperAdmin) {
    throw new HttpsError('failed-precondition', 'لا يوجد مستأجر مرتبط بالحساب.');
  }
  if (isSuperAdmin) {
    return { tenantId, isSuperAdmin: true, email: String(user.email || uid) };
  }
  const roleId = String(user.roleId || '').trim();
  if (!roleId) {
    throw new HttpsError('permission-denied', 'لا تملك صلاحية مسح بيانات الصيانة.');
  }
  const roleSnap = await db.collection(ROLES).doc(roleId).get();
  const permissions = (roleSnap.data()?.permissions || {}) as Record<string, boolean>;
  if (permissions['repair.settings.manage'] !== true && permissions['roles.manage'] !== true) {
    throw new HttpsError('permission-denied', 'مسّح بيانات الصيانة يتطلب صلاحية إعدادات الصيانة أو إدارة الأدوار.');
  }
  return { tenantId, isSuperAdmin: false, email: String(user.email || uid) };
}

async function deleteQueryBatch(
  query: Query,
): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await query.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((row) => batch.delete(row.ref));
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}

async function deleteSubcollection(parent: DocumentReference, subcollection: string): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await parent.collection(subcollection).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((row) => batch.delete(row.ref));
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}

async function deleteRepairJobsWithEvents(tenantId: string): Promise<{ jobs: number; events: number }> {
  let jobs = 0;
  let events = 0;
  while (true) {
    const snap = await db.collection('repair_jobs').where('tenantId', '==', tenantId).limit(100).get();
    if (snap.empty) break;
    for (const jobDoc of snap.docs) {
      events += await deleteSubcollection(jobDoc.ref, 'service_events');
      await jobDoc.ref.delete();
      jobs += 1;
    }
  }
  return { jobs, events };
}

async function deleteByTenant(collectionName: string, tenantId: string): Promise<number> {
  return deleteQueryBatch(db.collection(collectionName).where('tenantId', '==', tenantId));
}

async function deleteRepairStockTransactions(tenantId: string): Promise<number> {
  const moduleSet = new Set<string>(REPAIR_STOCK_SOURCE_MODULES);
  let deleted = 0;
  let last: QueryDocumentSnapshot | undefined;
  // Page through all tenant stock txs; delete repair-sourced rows only (balances in stock_items stay).
  while (true) {
    let query: Query = db
      .collection('stock_transactions')
      .where('tenantId', '==', tenantId)
      .orderBy('__name__')
      .limit(400);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) break;
    last = snap.docs[snap.docs.length - 1];
    const matches = snap.docs.filter((row) =>
      moduleSet.has(String(row.data()?.sourceModule || '')),
    );
    if (matches.length > 0) {
      const batch = db.batch();
      matches.forEach((row) => batch.delete(row.ref));
      await batch.commit();
      deleted += matches.length;
    }
    if (snap.size < 400) break;
  }
  return deleted;
}

/**
 * Test-data wipe: purge repair operational documents for one tenant.
 * Keeps branches, spare-part catalog, spare-part stock balances, customers, and stock_items.
 */
export const purgeRepairOperationalData = onCall(
  {
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }

    const data = (request.data || {}) as {
      tenantId?: string;
      confirmPhrase?: string;
    };
    const actor = await actorMayPurge(requesterUid);
    const tenantId = String(data.tenantId || actor.tenantId || '').trim();
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'يجب تمرير tenantId.');
    }
    if (!actor.isSuperAdmin && tenantId !== actor.tenantId) {
      throw new HttpsError('permission-denied', 'لا يمكنك مسح بيانات شركة أخرى.');
    }

    const expected = `${CONFIRM_PREFIX}${tenantId}`;
    const confirmPhrase = String(data.confirmPhrase || '').trim();
    if (confirmPhrase !== expected) {
      throw new HttpsError(
        'invalid-argument',
        `للتأكيد اكتب بالضبط: ${expected}`,
      );
    }

    const deletedCounts: Record<string, number> = {};

    const jobResult = await deleteRepairJobsWithEvents(tenantId);
    deletedCounts.repair_jobs = jobResult.jobs;
    deletedCounts.repair_job_service_events = jobResult.events;

    for (const collectionName of TENANT_SCOPED_COLLECTIONS) {
      if (collectionName === 'repair_jobs') continue;
      deletedCounts[collectionName] = await deleteByTenant(collectionName, tenantId);
    }

    deletedCounts.stock_transactions_repair = await deleteRepairStockTransactions(tenantId);

    // Reset job receipt counters only (keep other counters if present).
    deletedCounts.repair_counters = await deleteQueryBatch(
      db.collection('repair_counters').where('tenantId', '==', tenantId),
    );

    const deletedFirestoreDocs = Object.values(deletedCounts).reduce(
      (sum, value) => sum + Number(value || 0),
      0,
    );

    await db.collection(AUDIT_LOGS).add({
      tenantId,
      actorUid: requesterUid,
      actorEmail: actor.email,
      action: 'repair.ops_purge',
      entityType: 'tenant',
      entityId: tenantId,
      title: 'مسح بيانات تشغيل الصيانة التجريبية',
      description: `تم مسح ${deletedFirestoreDocs} مستند تشغيلي مع الإبقاء على الفروع/القطع/العملاء/أرصدة المخزون.`,
      deletedCounts,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true as const,
      tenantId,
      deletedFirestoreDocs,
      deletedCounts,
      kept: [
        'repair_branches',
        'repair_spare_parts',
        'repair_spare_parts_stock',
        'customers',
        'stock_items',
        'warehouses',
      ],
    };
  },
);

export const PURGE_REPAIR_OPS_CONFIRM_PREFIX = CONFIRM_PREFIX;
