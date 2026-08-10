import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createHash } from 'node:crypto';
import { TENANT_SCOPED_COLLECTIONS } from './tenantFootprintCollections.js';
import { buildTenantBackup, assertBackupJsonSize } from './tenantBackupExport.js';
import { deleteTenantCascade } from './tenantDeleteCascade.js';
import {
  runAdminImportBackup,
  saveAdminImportHistory,
  type AdminBackupFileInput,
  type AdminRestoreMode,
} from './tenantImportRestore.js';
import {
  approveDepartmentConsumableIssueHandler,
  cancelDepartmentConsumableIssueHandler,
  createDepartmentConsumableIssueHandler,
  getDepartmentConsumableMonthlyReportHandler,
  issueDepartmentConsumableIssueHandler,
  rejectDepartmentConsumableIssueHandler,
  returnDepartmentConsumableIssueHandler,
  submitDepartmentConsumableIssueHandler,
} from './departmentConsumableIssues.js';
import {
  approveRepairSpareIssueHandler,
  cancelRepairSpareIssueHandler,
  createRepairSpareIssueHandler,
  issueRepairSpareIssueHandler,
  rejectRepairSpareIssueHandler,
  returnRepairSpareIssueHandler,
  submitRepairSpareIssueHandler,
} from './repairSpareIssues.js';
import { buildPublicRepairApprovalView } from './repairApprovalPublic.js';
import {
  approveSparePartsReplenishmentHandler,
  cancelSparePartsReplenishmentHandler,
  createSparePartsReplenishmentHandler,
  prepareSparePartsReplenishmentHandler,
  receiveSparePartsReplenishmentHandler,
  rejectSparePartsReplenishmentHandler,
  responsibleApproveSparePartsReplenishmentHandler,
} from './sparePartsReplenishment.js';
import {
  cancelSparePartsRecallHandler,
  confirmSparePartsRecallHandler,
  createSparePartsRecallHandler,
  listMaintenanceCenterSpareBalancesHandler,
} from './sparePartsRecall.js';
import {
  issuePendingRepairPartUsageHandler,
  requestRepairJobSparePartHandler,
} from './repairJobSparePartRequest.js';
import {
  mutateRepairSalesInvoiceHandler,
} from './repairFinancialOps.js';
import { mutateRepairPaymentHandler } from './repairPaymentOps.js';
import { mutateRepairTreasuryHandler } from './repairTreasuryOps.js';
import { mutateSparePartsPurchaseInvoiceHandler } from './sparePartsPurchaseInvoiceOps.js';
import { repairTechnicianOpsHandler } from './repairTechnicianOps.js';
import { mutateAccountingHandler } from './accountingOps.js';
import { mutateRepairServiceCatalogHandler } from './repairServiceCatalogOps.js';
import { updateRepairPartsPricingHandler } from './repairPartsPricingOps.js';
import { createInventoryCountSessionHandler } from './inventoryStockCountOps.js';
import {
  createCustomerServiceRequestHandler,
  customerPortalLoginHandler,
  getCustomerPortalHomeHandler,
  lookupPortalProductHandler,
  mutateRepairCustomerOpsHandler,
} from './repairCustomerPortalOps.js';
import { getCustomerFinancialAnalyticsHandler } from './customerFinancialAnalytics.js';

initializeApp();

const db = getFirestore();

const TENANT_SLUGS_COLLECTION = 'tenant_slugs';
const TENANTS_COLLECTION = 'tenants';
const PENDING_TENANTS_COLLECTION = 'pending_tenants';

const statsRootForTenant = (tenantId: string) => `dashboardStats/${tenantId || 'global'}`;
const EMPLOYEES_COLLECTION = 'employees';
const USER_DEVICES_COLLECTION = 'user_devices';
const USERS_COLLECTION = 'users';
const ROLES_COLLECTION = 'roles';
const ASSETS_COLLECTION = 'assets';
const ASSET_DEPRECIATIONS_COLLECTION = 'asset_depreciations';
const FCM_TOKEN_SUBCOLLECTION = 'fcmTokens';
const REPAIR_JOBS_COLLECTION = 'repair_jobs';
const REPAIR_BRANCHES_COLLECTION = 'repair_branches';
const REPAIR_SPARE_PARTS_COLLECTION = 'repair_spare_parts';
const REPAIR_SPARE_PARTS_STOCK_COLLECTION = 'repair_spare_parts_stock';
const REPAIR_PARTS_TRANSACTIONS_COLLECTION = 'repair_parts_transactions';
const REPAIR_SALES_INVOICES_COLLECTION = 'repair_sales_invoices';
const REPAIR_TREASURY_SESSIONS_COLLECTION = 'repair_treasury_sessions';
const REPAIR_TREASURY_ENTRIES_COLLECTION = 'repair_treasury_entries';
const REPAIR_PM_PLANS_COLLECTION = 'repair_pm_plans';
const CUSTOMER_SERVICE_REQUESTS_COLLECTION = 'customer_service_requests';
const CUSTOMER_SERVICE_EVENTS_COLLECTION = 'customer_service_events';
const REPAIR_CUSTODY_RECORDS_COLLECTION = 'repair_custody_records';
const REPAIR_REPLACEMENT_REQUESTS_COLLECTION = 'repair_replacement_requests';
const STOCK_TRANSACTIONS_COLLECTION = 'stock_transactions';
const STOCK_ITEMS_COLLECTION = 'stock_items';
const STOCK_COUNTS_COLLECTION = 'stock_counts';
const INVENTORY_TRANSFER_REQUESTS_COLLECTION = 'inventory_transfer_requests';

type Primitive = string | number | boolean | null;
const asComparable = (value: unknown): Primitive | string => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value as Primitive;
  }
  return JSON.stringify(value ?? null);
};

const buildFieldDelta = (
  beforeData: Record<string, unknown>,
  afterData: Record<string, unknown>,
): Array<{ field: string; oldValue: unknown; newValue: unknown }> => {
  const keys = new Set<string>([
    ...Object.keys(beforeData || {}),
    ...Object.keys(afterData || {}),
  ]);
  const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
  keys.forEach((field) => {
    const oldValue = beforeData?.[field];
    const newValue = afterData?.[field];
    if (asComparable(oldValue) === asComparable(newValue)) return;
    changes.push({ field, oldValue: oldValue ?? null, newValue: newValue ?? null });
  });
  return changes;
};

const writeAuditDelta = async (params: {
  collectionName: string;
  docId: string;
  beforeData: Record<string, unknown>;
  afterData: Record<string, unknown>;
}) => {
  const changes = buildFieldDelta(params.beforeData, params.afterData);
  if (changes.length === 0) return;
  const updatedBy = String(params.afterData.updatedBy || params.afterData.updatedById || params.afterData.lastUpdatedBy || 'system');
  const parentRef = db.collection('audit_logs').doc(params.docId);
  await parentRef.set({
    sourceCollection: params.collectionName,
    sourceDocId: params.docId,
    updatedBy,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const batch = db.batch();
  changes.forEach((change) => {
    const ref = parentRef.collection('changes').doc();
    batch.set(ref, {
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      updatedBy,
      timestamp: FieldValue.serverTimestamp(),
      sourceCollection: params.collectionName,
      sourceDocId: params.docId,
    });
  });
  await batch.commit();
};

type ReportLike = {
  date?: string;
  tenantId?: string;
  quantityProduced?: number;
  componentScrapItems?: Array<{ quantity?: number }>;
  totalCost?: number;
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const deriveComponentWaste = (items: ReportLike['componentScrapItems']): number => {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + toNumber(item?.quantity), 0);
};

const normalizeReport = (value: ReportLike | undefined): Required<ReportLike> | null => {
  if (!value || !value.date || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null;
  return {
    date: value.date,
    tenantId: String(value.tenantId || 'global').trim() || 'global',
    quantityProduced: toNumber(value.quantityProduced),
    componentScrapItems: Array.isArray(value.componentScrapItems) ? value.componentScrapItems : [],
    totalCost: toNumber(value.totalCost),
  };
};

const monthKey = (date: string) => date.slice(0, 7);

const normalizePeriod = (value?: string): string => {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const periodToDate = (period: string): Date => {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1);
};

const formatPeriod = (date: Date): string => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
);

const addMonthsToPeriod = (period: string, months: number): string => {
  const base = periodToDate(period);
  return formatPeriod(new Date(base.getFullYear(), base.getMonth() + months, 1));
};

const periodEndDate = (period: string): Date => {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month, 0, 23, 59, 59, 999);
};

const toNumberSafe = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const calculateMonthlyDepreciationSafe = (
  purchaseCost: number,
  salvageValue: number,
  usefulLifeMonths: number,
): number => {
  const safeCost = Math.max(0, toNumberSafe(purchaseCost));
  const safeSalvage = Math.max(0, toNumberSafe(salvageValue));
  const safeLife = Math.max(1, Math.floor(toNumberSafe(usefulLifeMonths, 1)));
  return Math.max(0, safeCost - safeSalvage) / safeLife;
};

type RepairTreasuryEntryLike = {
  entryType?: string;
  amount?: number;
};

const computeRepairSessionBalance = (entries: RepairTreasuryEntryLike[]): number => (
  entries.reduce((sum, entry) => {
    const amount = toNumberSafe(entry.amount, 0);
    const type = String(entry.entryType || '');
    if (type === 'OPENING' || type === 'INCOME' || type === 'TRANSFER_IN') return sum + amount;
    if (type === 'EXPENSE' || type === 'TRANSFER_OUT') return sum - amount;
    return sum;
  }, 0)
);

const runAssetDepreciationForPeriod = async (periodInput?: string) => {
  const period = normalizePeriod(periodInput);
  const periodEnd = periodEndDate(period);

  let processedAssets = 0;
  let createdEntries = 0;
  let skippedEntries = 0;

  const tenantsSnap = await db.collection(TENANTS_COLLECTION).get();
  const activeTenantIds = tenantsSnap.docs
    .filter((d) => String((d.data() as { status?: string }).status || '') === 'active')
    .map((d) => d.id);

  const assetQueries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
  if (activeTenantIds.length === 0) {
    assetQueries.push(
      db.collection(ASSETS_COLLECTION).where('status', '==', 'active').get(),
    );
  } else {
    activeTenantIds.forEach((tid) => {
      assetQueries.push(
        db
          .collection(ASSETS_COLLECTION)
          .where('status', '==', 'active')
          .where('tenantId', '==', tid)
          .get(),
      );
    });
  }

  const assetSnapshots = await Promise.all(assetQueries);
  const assetDocs = assetSnapshots.flatMap((s) => s.docs);

  for (const assetDoc of assetDocs) {
    const asset = assetDoc.data() as {
      tenantId?: string;
      purchaseDate?: string;
      purchaseCost?: number;
      salvageValue?: number;
      usefulLifeMonths?: number;
      monthlyDepreciation?: number;
      accumulatedDepreciation?: number;
      currentValue?: number;
    };
    const assetTenantId = String(asset.tenantId || 'global').trim() || 'global';
    const purchaseDate = new Date(String(asset.purchaseDate || ''));
    if (Number.isNaN(purchaseDate.getTime()) || purchaseDate > periodEnd) {
      skippedEntries += 1;
      continue;
    }
    const purchaseStartPeriod = formatPeriod(
      new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), 1),
    );
    const purchaseCost = Math.max(0, toNumberSafe(asset.purchaseCost));
    const salvageValue = Math.max(0, toNumberSafe(asset.salvageValue));
    const usefulLifeMonths = Math.max(1, Math.floor(toNumberSafe(asset.usefulLifeMonths, 1)));
    const fallbackMonthly = calculateMonthlyDepreciationSafe(purchaseCost, salvageValue, usefulLifeMonths);
    const monthlyDep = Math.max(0, toNumberSafe(asset.monthlyDepreciation || fallbackMonthly, fallbackMonthly));
    const startPeriod = purchaseStartPeriod;
    if (startPeriod > period) {
      skippedEntries += 1;
      continue;
    }
    let runningAccumulated = 0;
    let runningBookValue = purchaseCost;
    let assetHasNewEntries = false;

    for (let cursor = startPeriod; cursor <= period; cursor = addMonthsToPeriod(cursor, 1)) {
      const remaining = Math.max(0, (purchaseCost - salvageValue) - runningAccumulated);
      const depreciationAmount = Math.min(monthlyDep, remaining);
      if (depreciationAmount <= 0) {
        break;
      }

      const nextAccumulated = runningAccumulated + depreciationAmount;
      const nextBookValue = Math.max(salvageValue, purchaseCost - nextAccumulated);
      const depDocId = `${assetDoc.id}_${cursor}`;
      const depRef = db.collection(ASSET_DEPRECIATIONS_COLLECTION).doc(depDocId);

      const batch = db.batch();
      batch.set(depRef, {
        tenantId: assetTenantId,
        assetId: assetDoc.id,
        period: cursor,
        depreciationAmount,
        accumulatedDepreciation: nextAccumulated,
        bookValue: nextBookValue,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await batch.commit();

      runningAccumulated = nextAccumulated;
      runningBookValue = nextBookValue;
      createdEntries += 1;
      assetHasNewEntries = true;
    }

    if (!assetHasNewEntries) {
      skippedEntries += 1;
      continue;
    }

    await assetDoc.ref.set({
      accumulatedDepreciation: runningAccumulated,
      currentValue: runningBookValue,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    processedAssets += 1;
  }

  return {
    period,
    processedAssets,
    createdEntries,
    skippedEntries,
  };
};

const assertSuperAdmin = async (uid: string): Promise<void> => {
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  }
  const user = userSnap.data() as { isSuperAdmin?: boolean };
  if (user.isSuperAdmin !== true) {
    throw new HttpsError('permission-denied', 'هذه العملية متاحة لمشرف المنصة فقط.');
  }
};

const hasManageUsersPermission = async (uid: string): Promise<boolean> => {
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userSnap.exists) return false;
  const user = userSnap.data() as { roleId?: string; isSuperAdmin?: boolean };
  if (user.isSuperAdmin === true) return true;
  const roleId = String(user.roleId || '').trim();
  if (!roleId) return false;
  const roleSnap = await db.collection(ROLES_COLLECTION).doc(roleId).get();
  if (!roleSnap.exists) return false;
  const role = roleSnap.data() as { permissions?: Record<string, boolean> };
  const permissions = role.permissions || {};
  return permissions['users.manage'] === true || permissions['roles.manage'] === true;
};

const userReceivesProductionReportPush = async (roleId: string): Promise<boolean> => {
  const rid = String(roleId || '').trim();
  if (!rid) return false;
  const roleSnap = await db.collection(ROLES_COLLECTION).doc(rid).get();
  if (!roleSnap.exists) return false;
  const role = roleSnap.data() as {
    roleKey?: string;
    permissions?: Record<string, boolean>;
  };
  const key = String(role.roleKey || '').toLowerCase();
  if (key === 'admin' || key === 'factory_manager' || key === 'system_manager') return true;
  const p = role.permissions || {};
  return p['reports.view'] === true && p['factoryDashboard.view'] === true;
};

const hasAnyPermission = async (uid: string, permissionKeys: string[]): Promise<boolean> => {
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userSnap.exists) return false;
  const user = userSnap.data() as { roleId?: string };
  const roleId = String(user.roleId || '').trim();
  if (!roleId) return false;
  const roleSnap = await db.collection(ROLES_COLLECTION).doc(roleId).get();
  if (!roleSnap.exists) return false;
  const role = roleSnap.data() as { permissions?: Record<string, boolean> };
  const permissions = role.permissions || {};
  return permissionKeys.some((key) => permissions[key] === true);
};

const hasRepairBranchManagePermission = async (uid: string): Promise<boolean> => {
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userSnap.exists) return false;
  const user = userSnap.data() as { isSuperAdmin?: boolean };
  if (user?.isSuperAdmin === true) return true;
  return hasAnyPermission(uid, ['repair.branches.manage']);
};

const deleteByBranchId = async (collectionName: string, branchId: string): Promise<number> => {
  let deleted = 0;
  while (true) {
    const snap = await db
      .collection(collectionName)
      .where('branchId', '==', branchId)
      .limit(400)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((row) => batch.delete(row.ref));
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
};

const deleteByField = async (
  collectionName: string,
  fieldName: string,
  fieldValue: string,
): Promise<number> => {
  let deleted = 0;
  while (true) {
    const snap = await db
      .collection(collectionName)
      .where(fieldName, '==', fieldValue)
      .limit(400)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((row) => batch.delete(row.ref));
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
};

const applyDelta = async (report: Required<ReportLike>, factor: 1 | -1) => {
  const tid = String(report.tenantId || 'global').trim() || 'global';
  const root = statsRootForTenant(tid);
  const dailyRef = db.doc(`${root}/daily/${report.date}`);
  const monthlyRef = db.doc(`${root}/monthly/${monthKey(report.date)}`);
  const wasteQuantity = deriveComponentWaste(report.componentScrapItems);
  const payload = {
    totalProduction: FieldValue.increment(report.quantityProduced * factor),
    totalWaste: FieldValue.increment(wasteQuantity * factor),
    totalCost: FieldValue.increment(report.totalCost * factor),
    reportsCount: FieldValue.increment(1 * factor),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  batch.set(dailyRef, { date: report.date, month: monthKey(report.date), ...payload }, { merge: true });
  batch.set(monthlyRef, { month: monthKey(report.date), ...payload }, { merge: true });
  await batch.commit();
};

export const aggregateProductionReports = onDocumentWritten(
  {
    document: 'production_reports/{reportId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const before = normalizeReport(event.data?.before?.data() as ReportLike | undefined);
    const after = normalizeReport(event.data?.after?.data() as ReportLike | undefined);

    if (before) {
      await applyDelta(before, -1);
    }
    if (after) {
      await applyDelta(after, 1);
    }
  },
);

export const auditProductionOrdersUpdates = onDocumentUpdated(
  {
    document: 'production_orders/{docId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const beforeData = (event.data?.before?.data() || {}) as Record<string, unknown>;
    const afterData = (event.data?.after?.data() || {}) as Record<string, unknown>;
    const docId = String(event.params.docId || '').trim();
    if (!docId) return;
    await writeAuditDelta({
      collectionName: 'production_orders',
      docId,
      beforeData,
      afterData,
    });
  },
);

export const auditInventoryTransactionsUpdates = onDocumentUpdated(
  {
    document: 'inventory_transactions/{docId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const beforeData = (event.data?.before?.data() || {}) as Record<string, unknown>;
    const afterData = (event.data?.after?.data() || {}) as Record<string, unknown>;
    const docId = String(event.params.docId || '').trim();
    if (!docId) return;
    await writeAuditDelta({
      collectionName: 'inventory_transactions',
      docId,
      beforeData,
      afterData,
    });
  },
);

export const auditPayrollRunsUpdates = onDocumentUpdated(
  {
    document: 'payroll_runs/{docId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const beforeData = (event.data?.before?.data() || {}) as Record<string, unknown>;
    const afterData = (event.data?.after?.data() || {}) as Record<string, unknown>;
    const docId = String(event.params.docId || '').trim();
    if (!docId) return;
    await writeAuditDelta({
      collectionName: 'payroll_runs',
      docId,
      beforeData,
      afterData,
    });
  },
);

export const sendPushOnNotificationCreate = onDocumentWritten(
  {
    document: 'notifications/{notificationId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    // Guard: only on create.
    if (event.data?.before?.exists) return;

    const payload = after.data() as {
      recipientId?: string;
      title?: string;
      message?: string;
      type?: string;
      referenceId?: string;
    };
    const recipientId = String(payload.recipientId || '').trim();
    if (!recipientId) return;

    const devicesSnap = await db
      .collection(USER_DEVICES_COLLECTION)
      .where('employeeId', '==', recipientId)
      .where('enabled', '==', true)
      .get();

    if (devicesSnap.empty) return;
    const tokens = devicesSnap.docs
      .map((d) => String((d.data() as { token?: string }).token || '').trim())
      .filter(Boolean);
    if (tokens.length === 0) return;

    const notificationId = String(after.id);
    const deepLink = '/activity-log';
    const multicast = {
      tokens,
      notification: {
        title: String(payload.title || 'إشعار جديد'),
        body: String(payload.message || ''),
      },
      data: {
        notificationId,
        type: String(payload.type || ''),
        referenceId: String(payload.referenceId || ''),
        link: deepLink,
      },
      android: {
        notification: {
          sound: 'default',
          channelId: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
      webpush: {
        notification: {
          icon: '/icons/forgeops-app-icon-192.png',
          badge: '/icons/forgeops-app-icon-192.png',
          requireInteraction: false,
          silent: false,
          vibrate: [150, 50, 150],
          tag: notificationId,
        },
        headers: {
          Urgency: 'high',
        },
      },
    };

    const sendResult = await getMessaging().sendEachForMulticast(multicast);
    const invalidTokenIndexes: number[] = [];
    sendResult.responses.forEach((response, index) => {
      const code = response.error?.code || '';
      if (!response.success && (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token'))) {
        invalidTokenIndexes.push(index);
      }
    });
    if (invalidTokenIndexes.length === 0) return;

    const cleanupBatch = db.batch();
    invalidTokenIndexes.forEach((idx) => {
      const token = tokens[idx];
      if (!token) return;
      cleanupBatch.set(db.collection(USER_DEVICES_COLLECTION).doc(token), {
        enabled: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await cleanupBatch.commit();
  },
);

export const onProductionReportCreated = onDocumentCreated(
  {
    document: 'production_reports/{reportId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const reportSnap = event.data;
    if (!reportSnap?.exists) return;
    const reportId = String(event.params.reportId || reportSnap.id || '').trim();
    if (!reportId) return;

    const report = reportSnap.data() as {
      productName?: string;
      lineName?: string;
      quantityProduced?: number;
      producedQty?: number;
      supervisorName?: string;
      date?: string;
      reportCode?: string;
    };

    const producedQty = Number(report.quantityProduced ?? report.producedQty ?? 0);
    const reportTitle = '📋 تقرير إنتاج جديد';
    const reportBody = [
      String(report.productName || report.reportCode || 'منتج'),
      String(report.lineName || 'خط إنتاج'),
      `${Number.isFinite(producedQty) ? producedQty : 0} وحدة`,
    ].join(' — ');

    const reportTenant = String((report as { tenantId?: string }).tenantId || '').trim();
    let usersQuery: FirebaseFirestore.Query = db
      .collection(USERS_COLLECTION)
      .where('isActive', '==', true);
    if (reportTenant) {
      usersQuery = usersQuery.where('tenantId', '==', reportTenant);
    }
    const usersSnap = await usersQuery.get();
    if (usersSnap.empty) return;

    const tokenEntries: Array<{ token: string; ref: FirebaseFirestore.DocumentReference }> = [];
    const seenTokens = new Set<string>();
    const roleNotifyCache = new Map<string, boolean>();

    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data() as {
        roleId?: string;
        role?: string;
        notifications?: { productionReports?: boolean };
      };
      const roleId = String(userData.roleId || userData.role || '').trim();
      let canReceiveByRole = roleNotifyCache.get(roleId);
      if (canReceiveByRole === undefined) {
        canReceiveByRole = await userReceivesProductionReportPush(roleId);
        roleNotifyCache.set(roleId, canReceiveByRole);
      }
      if (!canReceiveByRole) continue;
      if (userData.notifications?.productionReports === false) continue;

      const userTokensSnap = await userDoc.ref.collection(FCM_TOKEN_SUBCOLLECTION).get();
      userTokensSnap.forEach((tokenDoc) => {
        const tokenData = tokenDoc.data() as { token?: string; enabled?: boolean };
        const token = String(tokenData.token || '').trim();
        if (!token || tokenData.enabled === false || seenTokens.has(token)) return;
        seenTokens.add(token);
        tokenEntries.push({ token, ref: tokenDoc.ref });
      });
    }

    if (tokenEntries.length === 0) return;

    const allTokens = tokenEntries.map((entry) => entry.token);
    const BATCH_SIZE = 500;
    const cleanupRefs: FirebaseFirestore.DocumentReference[] = [];

    for (let i = 0; i < allTokens.length; i += BATCH_SIZE) {
      const batchEntries = tokenEntries.slice(i, i + BATCH_SIZE);
      const batchTokens = batchEntries.map((entry) => entry.token);

      const sendResult = await getMessaging().sendEachForMulticast({
        tokens: batchTokens,
        notification: {
          title: reportTitle,
          body: reportBody,
        },
        data: {
          type: 'production_report',
          reportId,
          productName: String(report.productName || ''),
          lineName: String(report.lineName || ''),
          producedQty: String(Number.isFinite(producedQty) ? producedQty : 0),
          supervisorName: String(report.supervisorName || ''),
          date: String(report.date || ''),
          url: '/reports',
          sound: 'notification.mp3',
          clickAction: 'OPEN_REPORT',
        },
        android: {
          notification: {
            channelId: 'production_reports',
            priority: 'high',
            sound: 'default',
          },
        },
        webpush: {
          headers: { Urgency: 'high' },
          notification: {
            title: reportTitle,
            body: reportBody,
            icon: '/icons/forgeops-app-icon-192.png',
            badge: '/icons/forgeops-app-icon-192.png',
            tag: `production-report-${reportId}`,
            renotify: true,
            requireInteraction: false,
            silent: false,
            vibrate: [200, 100, 200],
          },
          fcmOptions: {
            link: '/reports',
          },
        },
      });

      sendResult.responses.forEach((response, idx) => {
        if (response.success) return;
        const code = String(response.error?.code || '');
        if (
          code.includes('messaging/invalid-registration-token')
          || code.includes('messaging/registration-token-not-registered')
          || code.includes('registration-token-not-registered')
          || code.includes('invalid-registration-token')
        ) {
          cleanupRefs.push(batchEntries[idx].ref);
        }
      });
    }

    if (cleanupRefs.length === 0) return;
    const batch = db.batch();
    cleanupRefs.forEach((ref) => {
      batch.set(ref, {
        enabled: false,
        lastSeen: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  },
);

export const adminDeleteUserHard = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    const permitted = await hasManageUsersPermission(requesterUid);
    if (!permitted) {
      throw new HttpsError('permission-denied', 'لا تملك صلاحية إدارة المستخدمين.');
    }

    const targetUid = String((request.data as { targetUid?: string })?.targetUid || '').trim();
    if (!targetUid) {
      throw new HttpsError('invalid-argument', 'يجب تمرير targetUid.');
    }
    if (targetUid === requesterUid) {
      throw new HttpsError('failed-precondition', 'لا يمكن حذف حسابك الحالي.');
    }

    const requesterSnap = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const targetUserSnap = await db.collection(USERS_COLLECTION).doc(targetUid).get();
    if (!targetUserSnap.exists) {
      throw new HttpsError('not-found', 'المستخدم غير موجود.');
    }
    const reqCtx = requesterSnap.data() as { tenantId?: string; isSuperAdmin?: boolean } | undefined;
    const tgtCtx = targetUserSnap.data() as { tenantId?: string } | undefined;
    if (!reqCtx?.isSuperAdmin && reqCtx?.tenantId !== tgtCtx?.tenantId) {
      throw new HttpsError('permission-denied', 'لا يمكنك إدارة مستخدم من شركة أخرى.');
    }

    const linkedEmployees = await db
      .collection(EMPLOYEES_COLLECTION)
      .where('userId', '==', targetUid)
      .get();

    if (!linkedEmployees.empty) {
      const batch = db.batch();
      linkedEmployees.docs.forEach((employeeDoc) => {
        batch.update(employeeDoc.ref, {
          userId: '',
          email: '',
          hasSystemAccess: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }

    await db.collection(USERS_COLLECTION).doc(targetUid).delete();

    try {
      await getAuth().deleteUser(targetUid);
    } catch (error: any) {
      const code = String(error?.code || '');
      if (code !== 'auth/user-not-found') {
        throw new HttpsError('internal', 'تعذر حذف حساب المصادقة.');
      }
    }

    return { ok: true, targetUid };
  },
);

export const adminUpdateUserCredentials = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    const permitted = await hasManageUsersPermission(requesterUid);
    if (!permitted) {
      throw new HttpsError('permission-denied', 'لا تملك صلاحية إدارة المستخدمين.');
    }

    const targetUid = String((request.data as { targetUid?: string })?.targetUid || '').trim();
    const nextEmail = String((request.data as { email?: string })?.email || '').trim().toLowerCase();
    const nextPassword = String((request.data as { password?: string })?.password || '').trim();

    if (!targetUid) {
      throw new HttpsError('invalid-argument', 'يجب تمرير targetUid.');
    }
    if (targetUid === requesterUid) {
      throw new HttpsError('failed-precondition', 'لا يمكن تعديل بيانات حسابك من هذا الإجراء.');
    }
    if (!nextEmail && !nextPassword) {
      throw new HttpsError('invalid-argument', 'يجب تمرير بريد أو كلمة مرور جديدة.');
    }
    if (nextEmail && !nextEmail.includes('@')) {
      throw new HttpsError('invalid-argument', 'صيغة البريد الإلكتروني غير صحيحة.');
    }
    if (nextPassword && nextPassword.length < 6) {
      throw new HttpsError('invalid-argument', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
    }

    const requesterSnapUpd = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const targetUserSnapUpd = await db.collection(USERS_COLLECTION).doc(targetUid).get();
    if (!targetUserSnapUpd.exists) {
      throw new HttpsError('not-found', 'المستخدم غير موجود.');
    }
    const reqUpd = requesterSnapUpd.data() as { tenantId?: string; isSuperAdmin?: boolean } | undefined;
    const tgtUpd = targetUserSnapUpd.data() as { tenantId?: string } | undefined;
    if (!reqUpd?.isSuperAdmin && reqUpd?.tenantId !== tgtUpd?.tenantId) {
      throw new HttpsError('permission-denied', 'لا يمكنك إدارة مستخدم من شركة أخرى.');
    }

    if (nextEmail) {
      const tenantId = String(tgtUpd?.tenantId || '').trim();
      const existing = tenantId
        ? await db
          .collection(USERS_COLLECTION)
          .where('email', '==', nextEmail)
          .where('tenantId', '==', tenantId)
          .get()
        : await db
          .collection(USERS_COLLECTION)
          .where('email', '==', nextEmail)
          .get();
      const usedByOther = existing.docs.some((docSnap) => docSnap.id !== targetUid);
      if (usedByOther) {
        throw new HttpsError('already-exists', 'البريد الإلكتروني مستخدم بالفعل.');
      }
    }

    try {
      await getAuth().updateUser(targetUid, {
        ...(nextEmail ? { email: nextEmail } : {}),
        ...(nextPassword ? { password: nextPassword } : {}),
      });
    } catch (error: any) {
      const code = String(error?.code || '');
      if (code.includes('email-already-exists')) {
        throw new HttpsError('already-exists', 'البريد الإلكتروني مستخدم بالفعل في Firebase Auth.');
      }
      if (code.includes('user-not-found')) {
        throw new HttpsError('not-found', 'المستخدم غير موجود في Firebase Auth.');
      }
      throw new HttpsError('internal', 'تعذر تحديث بيانات الحساب في Firebase Auth.');
    }

    if (nextEmail) {
      await db.collection(USERS_COLLECTION).doc(targetUid).set(
        {
          email: nextEmail,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      const linkedEmployees = await db
        .collection(EMPLOYEES_COLLECTION)
        .where('userId', '==', targetUid)
        .get();
      if (!linkedEmployees.empty) {
        const batch = db.batch();
        linkedEmployees.docs.forEach((employeeDoc) => {
          batch.update(employeeDoc.ref, {
            email: nextEmail,
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }

    return { ok: true, targetUid };
  },
);

export const scheduledAssetDepreciationJob = onSchedule(
  {
    schedule: '0 2 1 * *',
    timeZone: 'Africa/Cairo',
    region: 'us-central1',
    memory: '256MiB',
  },
  async () => {
    await runAssetDepreciationForPeriod();
  },
);

export const scheduledRepairTreasuryAutoCloseJob = onSchedule(
  {
    // Hourly dispatcher: each tenant is closed only at midnight in its configured timezone.
    schedule: '5 * * * *',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '256MiB',
  },
  async () => {
    const settingsByTenant = new Map<string, {
      enabled: boolean;
      timezone: string;
      localDay: string;
      localHour: number;
    }>();
    const localClock = (date: Date, timezone: string) => {
      let safeTimezone = timezone;
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: safeTimezone }).format(date);
      } catch {
        safeTimezone = 'Africa/Cairo';
      }
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: safeTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date);
      const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
      return {
        timezone: safeTimezone,
        day: `${value('year')}-${value('month')}-${value('day')}`,
        hour: Number(value('hour') || 0),
      };
    };
    const now = new Date();
    const sessionsSnap = await db
      .collection(REPAIR_TREASURY_SESSIONS_COLLECTION)
      .where('status', '==', 'open')
      .get();

    for (const sessionDoc of sessionsSnap.docs) {
      const session = sessionDoc.data() as {
        tenantId?: string;
        branchId?: string;
        openedBy?: string;
        openedByName?: string;
        needsManualClose?: boolean;
        expectedClosingBalance?: number;
        actualBalance?: number;
        closingBalance?: number;
      };
      const sessionId = sessionDoc.id;
      const branchId = String(session.branchId || '').trim();
      const tenantId = String(session.tenantId || '').trim();
      if (!branchId || !tenantId) continue;
      if (session.needsManualClose === true) continue;

      let tenantClock = settingsByTenant.get(tenantId);
      if (!tenantClock) {
        const settingsSnap = await db.collection('system_settings').doc(tenantId).get();
        const settings = settingsSnap.data() as {
          branding?: { timezone?: string };
          repairSettings?: {
            treasury?: { autoClose?: { enabled?: boolean; timezone?: string } };
          };
        } | undefined;
        const autoClose = settings?.repairSettings?.treasury?.autoClose;
        const clock = localClock(
          now,
          String(autoClose?.timezone || settings?.branding?.timezone || 'Africa/Cairo'),
        );
        tenantClock = {
          enabled: autoClose?.enabled !== false,
          timezone: clock.timezone,
          localDay: clock.day,
          localHour: clock.hour,
        };
        settingsByTenant.set(tenantId, tenantClock);
      }
      if (!tenantClock.enabled || tenantClock.localHour !== 0) continue;
      const openedAt = String((session as { openedAt?: string }).openedAt || '');
      const openedAtMs = Date.parse(openedAt);
      if (!Number.isFinite(openedAtMs)) continue;
      const openedLocalDay = localClock(new Date(openedAtMs), tenantClock.timezone).day;
      if (openedLocalDay >= tenantClock.localDay) continue;

      const entriesSnap = await db
        .collection(REPAIR_TREASURY_ENTRIES_COLLECTION)
        .where('sessionId', '==', sessionId)
        .get();
      const entries = entriesSnap.docs.map((d) => d.data() as RepairTreasuryEntryLike);
      const computedBalance = computeRepairSessionBalance(entries);

      const expectedCandidates = [
        session.expectedClosingBalance,
        session.actualBalance,
        session.closingBalance,
      ];
      const expectedBalance = expectedCandidates.find((value) => Number.isFinite(Number(value)));
      const hasExpectedBalance = expectedBalance !== undefined;
      const diff = hasExpectedBalance
        ? Math.abs(toNumberSafe(expectedBalance, computedBalance) - computedBalance)
        : 0;

      if (hasExpectedBalance && diff > 0.01) {
        await sessionDoc.ref.set(
          {
            needsManualClose: true,
            closeBlockReason: 'balance_mismatch',
            closeDifference: diff,
            autoCloseCheckedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        continue;
      }

      const closedAt = new Date().toISOString();
      const batch = db.batch();
      batch.set(
        sessionDoc.ref,
        {
          status: 'closed',
          closedAt,
          closedBy: 'system:auto-close',
          closedByName: 'System Auto Close',
          closingBalance: computedBalance,
          needsManualClose: false,
          closeBlockReason: '',
          autoClosedAt: FieldValue.serverTimestamp(),
          autoCloseSource: 'auto-midnight-close',
        },
        { merge: true },
      );

      const closingRef = db.collection(REPAIR_TREASURY_ENTRIES_COLLECTION).doc();
      batch.set(closingRef, {
        tenantId,
        branchId,
        sessionId,
        entryType: 'CLOSING',
        amount: computedBalance,
        note: 'إقفال تلقائي منتصف الليل',
        createdBy: 'system:auto-close',
        createdByName: 'System Auto Close',
        createdAt: closedAt,
      });
      await batch.commit();
    }
  },
);

export const scheduledGeneratePreventiveMaintenanceTickets = onSchedule(
  {
    schedule: '0 5 * * *',
    timeZone: 'Africa/Cairo',
    region: 'us-central1',
    memory: '256MiB',
  },
  async () => {
    const now = Date.now();
    const plansSnap = await db.collection(REPAIR_PM_PLANS_COLLECTION).where('isActive', '==', true).get();
    for (const planDoc of plansSnap.docs) {
      const plan = planDoc.data() as {
        tenantId?: string;
        branchId?: string;
        machineName?: string;
        everyDays?: number;
        nextDueAt?: string;
        defaultSlaHours?: number;
      };
      const tenantId = String(plan.tenantId || '').trim();
      const branchId = String(plan.branchId || '').trim();
      const machineName = String(plan.machineName || 'Machine').trim();
      const nextDueAt = String(plan.nextDueAt || '').trim();
      if (!tenantId || !branchId || !nextDueAt) continue;
      const dueMs = Date.parse(nextDueAt);
      if (!Number.isFinite(dueMs) || dueMs > now) continue;

      const receiptNo = `PM-${Date.now()}`;
      const createdAtIso = new Date().toISOString();
      const slaHours = Number.isFinite(Number(plan.defaultSlaHours)) ? Number(plan.defaultSlaHours) : 24;
      const dueAtIso = new Date(now + slaHours * 60 * 60 * 1000).toISOString();

      await db.collection(REPAIR_JOBS_COLLECTION).add({
        tenantId,
        receiptNo,
        branchId,
        customerName: 'Preventive Maintenance',
        customerPhone: '-',
        deviceType: 'Machine',
        deviceBrand: machineName,
        deviceModel: machineName,
        problemDescription: 'Scheduled preventive maintenance task',
        status: 'received',
        warranty: 'none',
        partsUsed: [],
        createdAt: createdAtIso,
        updatedAt: createdAtIso,
        assignedAt: null,
        resolvedAt: null,
        slaHours,
        dueAt: dueAtIso,
        preventivePlanId: planDoc.id,
        isPreventive: true,
      });

      const everyDays = Math.max(1, Math.floor(Number(plan.everyDays || 0)));
      const nextCycle = new Date(now + everyDays * 24 * 60 * 60 * 1000).toISOString();
      await planDoc.ref.set(
        {
          lastGeneratedAt: createdAtIso,
          nextDueAt: nextCycle,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

export const runAssetDepreciationJob = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }

    const permitted = await hasAnyPermission(requesterUid, [
      'assets.depreciation.run',
      'costs.manage',
    ]);
    if (!permitted) {
      throw new HttpsError('permission-denied', 'ليس لديك صلاحية تشغيل احتساب الإهلاك.');
    }

    const requestedPeriod = String((request.data as { period?: string } | undefined)?.period || '').trim();
    return runAssetDepreciationForPeriod(requestedPeriod || undefined);
  },
);

export const deleteRepairBranchCascade = onCall(
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
    const allowed = await hasRepairBranchManagePermission(requesterUid);
    if (!allowed) {
      throw new HttpsError('permission-denied', 'لا تملك صلاحية حذف الفروع.');
    }

    const branchId = String((request.data as { branchId?: string })?.branchId || '').trim();
    if (!branchId) {
      throw new HttpsError('invalid-argument', 'يجب تمرير branchId.');
    }

    const branchRef = db.collection(REPAIR_BRANCHES_COLLECTION).doc(branchId);
    const branchSnap = await branchRef.get();
    if (!branchSnap.exists) {
      throw new HttpsError('not-found', 'الفرع غير موجود.');
    }
    const branchData = branchSnap.data() as {
      tenantId?: string;
      name?: string;
      warehouseId?: string;
      custodyWarehouseId?: string;
      unrepairableWarehouseId?: string;
    };
    const branchTenantId = String(branchData?.tenantId || '').trim();

    const userSnap = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const userData = userSnap.data() as { tenantId?: string; isSuperAdmin?: boolean } | undefined;
    if (!userData?.isSuperAdmin) {
      const requesterTenantId = String(userData?.tenantId || '').trim();
      if (!requesterTenantId || requesterTenantId !== branchTenantId) {
        throw new HttpsError('permission-denied', 'لا يمكنك حذف فرع خارج شركتك.');
      }
    }

    const deletedCounts: Record<string, number> = {};
    const unlinkedCounts: Record<string, number> = {};
    const branchTechnicianIds = Array.isArray((branchData as { technicianIds?: unknown[] }).technicianIds)
      ? ((branchData as { technicianIds?: unknown[] }).technicianIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
      : [];
    const managerEmployeeId = String((branchData as { managerEmployeeId?: string }).managerEmployeeId || '').trim();
    unlinkedCounts.technicians = branchTechnicianIds.length;
    unlinkedCounts.managers = managerEmployeeId ? 1 : 0;

    deletedCounts[REPAIR_TREASURY_ENTRIES_COLLECTION] = await deleteByBranchId(REPAIR_TREASURY_ENTRIES_COLLECTION, branchId);
    deletedCounts[REPAIR_TREASURY_SESSIONS_COLLECTION] = await deleteByBranchId(REPAIR_TREASURY_SESSIONS_COLLECTION, branchId);
    deletedCounts[REPAIR_PARTS_TRANSACTIONS_COLLECTION] = await deleteByBranchId(REPAIR_PARTS_TRANSACTIONS_COLLECTION, branchId);
    deletedCounts[REPAIR_SPARE_PARTS_STOCK_COLLECTION] = await deleteByBranchId(REPAIR_SPARE_PARTS_STOCK_COLLECTION, branchId);
    deletedCounts[REPAIR_SPARE_PARTS_COLLECTION] = await deleteByBranchId(REPAIR_SPARE_PARTS_COLLECTION, branchId);
    deletedCounts[REPAIR_SALES_INVOICES_COLLECTION] = await deleteByBranchId(REPAIR_SALES_INVOICES_COLLECTION, branchId);
    deletedCounts[REPAIR_PM_PLANS_COLLECTION] = await deleteByBranchId(REPAIR_PM_PLANS_COLLECTION, branchId);
    deletedCounts[CUSTOMER_SERVICE_REQUESTS_COLLECTION] = await deleteByBranchId(CUSTOMER_SERVICE_REQUESTS_COLLECTION, branchId);
    deletedCounts[CUSTOMER_SERVICE_EVENTS_COLLECTION] = await deleteByBranchId(CUSTOMER_SERVICE_EVENTS_COLLECTION, branchId);
    deletedCounts[REPAIR_CUSTODY_RECORDS_COLLECTION] = await deleteByBranchId(REPAIR_CUSTODY_RECORDS_COLLECTION, branchId);
    deletedCounts[REPAIR_REPLACEMENT_REQUESTS_COLLECTION] = await deleteByBranchId(REPAIR_REPLACEMENT_REQUESTS_COLLECTION, branchId);
    deletedCounts[REPAIR_JOBS_COLLECTION] = await deleteByBranchId(REPAIR_JOBS_COLLECTION, branchId);

    const branchWarehouseIds = Array.from(new Set([
      String(branchData?.warehouseId || '').trim(),
      String(branchData?.custodyWarehouseId || '').trim(),
      String(branchData?.unrepairableWarehouseId || '').trim(),
    ].filter(Boolean)));
    for (const warehouseId of branchWarehouseIds) {
      deletedCounts[STOCK_TRANSACTIONS_COLLECTION] =
        await deleteByField(STOCK_TRANSACTIONS_COLLECTION, 'warehouseId', warehouseId);
      deletedCounts[`${STOCK_TRANSACTIONS_COLLECTION}_toWarehouseId`] =
        await deleteByField(STOCK_TRANSACTIONS_COLLECTION, 'toWarehouseId', warehouseId);
      deletedCounts[STOCK_ITEMS_COLLECTION] = await deleteByField(STOCK_ITEMS_COLLECTION, 'warehouseId', warehouseId);
      deletedCounts[STOCK_COUNTS_COLLECTION] = await deleteByField(STOCK_COUNTS_COLLECTION, 'warehouseId', warehouseId);
      deletedCounts[`${INVENTORY_TRANSFER_REQUESTS_COLLECTION}_fromWarehouseId`] =
        await deleteByField(INVENTORY_TRANSFER_REQUESTS_COLLECTION, 'fromWarehouseId', warehouseId);
      deletedCounts[`${INVENTORY_TRANSFER_REQUESTS_COLLECTION}_toWarehouseId`] =
        await deleteByField(INVENTORY_TRANSFER_REQUESTS_COLLECTION, 'toWarehouseId', warehouseId);

      const warehouseRef = db.collection('warehouses').doc(warehouseId);
      const warehouseSnap = await warehouseRef.get();
      if (warehouseSnap.exists) {
        await warehouseRef.delete();
        deletedCounts.warehouses = Number(deletedCounts.warehouses || 0) + 1;
      } else {
        deletedCounts.warehouses = Number(deletedCounts.warehouses || 0);
      }
    }

    await branchRef.delete();
    deletedCounts[REPAIR_BRANCHES_COLLECTION] = 1;

    const deletedFirestoreDocs = Object.values(deletedCounts).reduce((sum, value) => sum + Number(value || 0), 0);
    return {
      ok: true as const,
      branchId,
      branchName: String(branchData?.name || ''),
      deletedFirestoreDocs,
      deletedCounts,
      unlinkedCounts,
    };
  },
);

export const runMonthlyOverheadAllocation = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
  },
  async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    const permitted = await hasAnyPermission(requesterUid, ['costs.manage']);
    if (!permitted) throw new HttpsError('permission-denied', 'ليس لديك صلاحية إدارة التكاليف.');

    const requesterSnap = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const requesterTenantId = String(
      (requesterSnap.data() as { tenantId?: string } | undefined)?.tenantId || '',
    ).trim();
    if (!requesterTenantId) {
      throw new HttpsError('failed-precondition', 'لا يوجد مستأجر مرتبط بالحساب.');
    }

    const month = String((request.data as { month?: string })?.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new HttpsError('invalid-argument', 'صيغة الشهر يجب أن تكون YYYY-MM.');
    }

    const rows = await db.collection('monthly_production_costs')
      .where('tenantId', '==', requesterTenantId)
      .where('month', '==', month)
      .get();
    let totalDirect = 0;
    let totalIndirect = 0;
    let totalOrders = 0;
    rows.forEach((docSnap) => {
      const row = docSnap.data() as { directCost?: number; indirectCost?: number };
      totalDirect += Number(row.directCost || 0);
      totalIndirect += Number(row.indirectCost || 0);
      totalOrders += 1;
    });
    const totalCost = totalDirect + totalIndirect;
    await db.collection('monthly_costs').doc(`${requesterTenantId}_${month}`).set({
      tenantId: requesterTenantId,
      month,
      totalDirect,
      totalIndirect,
      totalCost,
      orderCount: totalOrders,
      updatedBy: requesterUid,
      updatedAt: FieldValue.serverTimestamp(),
      source: 'runMonthlyOverheadAllocation',
    }, { merge: true });
    return {
      ok: true,
      month,
      tenantId: requesterTenantId,
      totalDirect,
      totalIndirect,
      totalCost,
      orderCount: totalOrders,
    };
  },
);

export const calculateMonthlyCostVariance = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
  },
  async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    const permitted = await hasAnyPermission(requesterUid, ['costs.manage']);
    if (!permitted) throw new HttpsError('permission-denied', 'ليس لديك صلاحية إدارة التكاليف.');
    const requesterSnap = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const requesterTenantId = String(
      (requesterSnap.data() as { tenantId?: string } | undefined)?.tenantId || '',
    ).trim();
    if (!requesterTenantId) {
      throw new HttpsError('failed-precondition', 'لا يوجد مستأجر مرتبط بالحساب.');
    }
    const month = String((request.data as { month?: string })?.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new HttpsError('invalid-argument', 'صيغة الشهر يجب أن تكون YYYY-MM.');
    }
    const rows = await db.collection('monthly_production_costs')
      .where('tenantId', '==', requesterTenantId)
      .where('month', '==', month)
      .get();
    let flagged = 0;
    for (const rowDoc of rows.docs) {
      const row = rowDoc.data() as {
        productId?: string;
        totalProductionCost?: number;
        standardCost?: number;
      };
      const actual = Number(row.totalProductionCost || 0);
      const standard = Number(row.standardCost || 0);
      const variance = actual - standard;
      if (Math.abs(variance) <= 0.0001) continue;
      flagged += 1;
      await db.collection('cost_variances').doc(`${requesterTenantId}_${month}_${rowDoc.id}`).set({
        tenantId: requesterTenantId,
        month,
        productId: String(row.productId || ''),
        monthlyCostDocId: rowDoc.id,
        standardCost: standard,
        actualCost: actual,
        variance,
        status: 'open',
        ownerId: '',
        notes: '',
        updatedBy: requesterUid,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return { ok: true, month, tenantId: requesterTenantId, flagged };
  },
);

const TENANT_FOOTPRINT_AVG_DOC_BYTES = 900;

/** Super-admin: aggregate document counts per tenant (for platform insights). */
export const getTenantFirestoreFootprint = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    await assertSuperAdmin(requesterUid);

    const tenantId = String((request.data as { tenantId?: string })?.tenantId || '').trim();
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'يجب تمرير tenantId.');
    }

    const tenantSnap = await db.collection(TENANTS_COLLECTION).doc(tenantId).get();
    if (!tenantSnap.exists) {
      throw new HttpsError('not-found', 'الشركة غير موجودة.');
    }
    const t = tenantSnap.data() as { slug?: string; name?: string; status?: string };

    const perCollection: Record<string, number> = {};
    const failedCollections: string[] = [];

    const chunkSize = 12;
    for (let i = 0; i < TENANT_SCOPED_COLLECTIONS.length; i += chunkSize) {
      const slice = TENANT_SCOPED_COLLECTIONS.slice(i, i + chunkSize);
      await Promise.all(
        slice.map(async (collName) => {
          try {
            const q = db.collection(collName).where('tenantId', '==', tenantId);
            const agg = await q.count().get();
            const c = agg.data().count;
            if (c > 0) {
              perCollection[collName] = c;
            }
          } catch {
            failedCollections.push(collName);
          }
        }),
      );
    }

    try {
      const ss = await db.collection('system_settings').doc(tenantId).get();
      if (ss.exists) {
        perCollection.system_settings_doc = 1;
      }
    } catch {
      failedCollections.push('system_settings_doc');
    }

    try {
      const dailyAgg = await db
        .collection('dashboardStats')
        .doc(tenantId)
        .collection('daily')
        .count()
        .get();
      const d = dailyAgg.data().count;
      if (d > 0) {
        perCollection['dashboardStats/daily'] = d;
      }
    } catch {
      failedCollections.push('dashboardStats/daily');
    }

    try {
      const monthlyAgg = await db
        .collection('dashboardStats')
        .doc(tenantId)
        .collection('monthly')
        .count()
        .get();
      const m = monthlyAgg.data().count;
      if (m > 0) {
        perCollection['dashboardStats/monthly'] = m;
      }
    } catch {
      failedCollections.push('dashboardStats/monthly');
    }

    const totalDocuments = Object.values(perCollection).reduce((sum, n) => sum + n, 0);
    const userCount = perCollection.users ?? 0;
    const collectionsWithData = Object.keys(perCollection).length;
    const estimatedStorageBytes = Math.round(totalDocuments * TENANT_FOOTPRINT_AVG_DOC_BYTES);

    return {
      tenantId,
      slug: String(t.slug || ''),
      name: String(t.name || ''),
      status: String(t.status || ''),
      userCount,
      collectionsWithData,
      totalDocuments,
      perCollection,
      failedCollections,
      estimatedStorageBytes,
      avgDocBytesAssumption: TENANT_FOOTPRINT_AVG_DOC_BYTES,
      usageNoteAr:
        'فوترة Firebase تُحسب على مستوى المشروع بالكامل (قراءات، كتابات، تخزين، شبكة). الأرقام هنا من استعلامات عدّ المستندات ذات tenantId. حجم التخزين تقدير تقريبي ولا يعكس الفوترة الفعلية.',
    };
  },
);

/** Super-admin: export one tenant backup JSON (same shape as client backup file). */
export const exportTenantBackup = onCall(
  {
    region: 'us-central1',
    memory: '2GiB',
    timeoutSeconds: 300,
  },
  async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    await assertSuperAdmin(requesterUid);

    const tenantId = String((request.data as { tenantId?: string })?.tenantId || '').trim();
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'يجب تمرير tenantId.');
    }

    const tenantSnap = await db.collection(TENANTS_COLLECTION).doc(tenantId).get();
    if (!tenantSnap.exists) {
      throw new HttpsError('not-found', 'الشركة غير موجودة.');
    }

    const requesterSnap = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const requesterEmail = String(
      (requesterSnap.data() as { email?: string } | undefined)?.email || '',
    ).trim();
    const createdBy = requesterEmail || requesterUid;

    try {
      const backup = await buildTenantBackup(db, tenantId, createdBy);
      assertBackupJsonSize(backup);
      return { backup };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'فشل بناء النسخة الاحتياطية.';
      if (msg.includes('كبيرة جداً')) {
        throw new HttpsError('resource-exhausted', msg);
      }
      throw new HttpsError('internal', msg);
    }
  },
);

/** Super-admin: delete all tenant data in Firestore + Auth users for that tenant. */
export const adminDeleteTenantCascade = onCall(
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
    await assertSuperAdmin(requesterUid);

    const tenantId = String((request.data as { tenantId?: string })?.tenantId || '').trim();
    const confirmPhrase = String(
      (request.data as { confirmPhrase?: string })?.confirmPhrase || '',
    ).trim();
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'يجب تمرير tenantId.');
    }
    const expected = `DELETE_TENANT_${tenantId}`;
    if (confirmPhrase !== expected) {
      throw new HttpsError(
        'invalid-argument',
        `يجب إدخال نص التأكيد بالضبط: ${expected}`,
      );
    }

    const tenantSnap = await db.collection(TENANTS_COLLECTION).doc(tenantId).get();
    if (!tenantSnap.exists) {
      throw new HttpsError('not-found', 'الشركة غير موجودة.');
    }
    const t = tenantSnap.data() as { slug?: string };
    const slug = String(t.slug || '').trim().toLowerCase();

    try {
      const result = await deleteTenantCascade(db, tenantId, slug);
      return { ok: true as const, ...result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'فشل الحذف.';
      throw new HttpsError('internal', msg);
    }
  },
);

const MAX_IMPORT_BACKUP_JSON_CHARS = 31 * 1024 * 1024;

/** Super-admin: restore Firestore from backup JSON (Admin SDK — bypasses client security rules). */
export const importTenantBackup = onCall(
  {
    region: 'us-central1',
    memory: '2GiB',
    timeoutSeconds: 540,
  },
  async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    await assertSuperAdmin(requesterUid);

    const data = request.data as {
      backup?: AdminBackupFileInput;
      mode?: AdminRestoreMode;
      tenantIdForHistory?: string;
      tenantId?: string;
    };
    const mode = String(data?.mode || 'merge').trim() as AdminRestoreMode;
    if (!['merge', 'replace', 'full_reset'].includes(mode)) {
      throw new HttpsError('invalid-argument', 'وضع الاستعادة غير صالح.');
    }
    const backup = data?.backup;
    if (!backup || typeof backup !== 'object') {
      throw new HttpsError('invalid-argument', 'يجب تمرير backup.');
    }

    const jsonLen = JSON.stringify(backup).length;
    if (jsonLen > MAX_IMPORT_BACKUP_JSON_CHARS) {
      throw new HttpsError(
        'resource-exhausted',
        'حجم النسخة كبير جداً لإرسالها عبر هذه الدالة. جرّب الاستعادة من العميل مع تفعيل «تخطي النسخة التلقائية» أو قسّم البيانات.',
      );
    }

    const requesterSnap = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const createdBy = String(
      (requesterSnap.data() as { email?: string } | undefined)?.email || requesterUid,
    );
    const targetTenantId = String(
      data?.tenantId || data?.tenantIdForHistory || backup.metadata?.tenantId || '',
    ).trim();

    try {
      const { restored, tenantId } = await runAdminImportBackup(
        db,
        backup,
        mode,
        targetTenantId || undefined,
      );
      await saveAdminImportHistory(db, {
        tenantId,
        mode,
        restored,
        collectionNames: Object.keys(backup.collections || {}),
        createdBy,
        fileMetadataType: String(backup.metadata?.type || ''),
      });
      return { success: true as const, restored, tenantId };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'فشلت الاستعادة';
      if (
        msg.includes('معرّف المستأجر')
        || msg.includes('لا يطابق')
        || msg.includes('مستأجراً آخر')
      ) {
        throw new HttpsError('invalid-argument', msg);
      }
      throw new HttpsError('internal', 'فشلت الاستعادة');
    }
  },
);

/** Public: resolve tenant slug before login (client cannot read tenant_slugs without auth). */
export const resolveTenantSlug = onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
    cors: true,
    invoker: 'public',
  },
  async (request) => {
    const slug = String((request.data as { slug?: string })?.slug || '')
      .trim()
      .toLowerCase();
    if (!slug || !/^[a-z0-9]([a-z0-9-]{1,62}[a-z0-9])?$/.test(slug)) {
      throw new HttpsError('invalid-argument', 'معرّف الشركة غير صالح.');
    }

    const slugSnap = await db.collection(TENANT_SLUGS_COLLECTION).doc(slug).get();
    if (slugSnap.exists) {
      const tenantId = String((slugSnap.data() as { tenantId?: string })?.tenantId || '').trim();
      if (!tenantId) {
        return { exists: false as const };
      }
      const tenantSnap = await db.collection(TENANTS_COLLECTION).doc(tenantId).get();
      const status = tenantSnap.exists
        ? String((tenantSnap.data() as { status?: string })?.status || 'active')
        : 'unknown';
      return { exists: true as const, tenantId, status };
    }

    const pendingSnap = await db
      .collection(PENDING_TENANTS_COLLECTION)
      .where('slug', '==', slug)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    if (!pendingSnap.empty) {
      const docSnap = pendingSnap.docs[0];
      const data = docSnap.data() as { status?: string };
      return {
        exists: true as const,
        tenantId: docSnap.id,
        status: String(data?.status || 'pending'),
        pendingRegistration: true as const,
      };
    }

    return { exists: false as const };
  },
);

type PublicTrackRepairJobPayload = {
  tenantSlug?: string;
  receiptNo?: string;
  phone?: string;
};

const sanitizeTrackText = (value: unknown): string => String(value || '').trim();
const sanitizeTrackSlug = (value: unknown): string => sanitizeTrackText(value).toLowerCase();
const normalizeTrackPhoneDigits = (value: unknown): string => sanitizeTrackText(value).replace(/\D/g, '');

const trackPhonesMatchLast10 = (storedPhone: unknown, queryPhone: unknown): boolean => {
  const stored = normalizeTrackPhoneDigits(storedPhone);
  const query = normalizeTrackPhoneDigits(queryPhone);
  if (!stored || !query) return false;
  const storedTail = stored.slice(-10);
  const queryTail = query.slice(-10);
  if (storedTail.length < 10 || queryTail.length < 10) return false;
  return storedTail === queryTail;
};

const REPAIR_TRACK_STATUS_LABELS: Record<string, string> = {
  received: 'وارد',
  diagnosing: 'جاري الفحص',
  diagnosed: 'تم الفحص',
  estimate_ready: 'التقدير جاهز',
  waiting_approval: 'بانتظار موافقة العميل',
  waiting_parts: 'بانتظار قطع الغيار',
  repairing: 'إصلاح',
  testing: 'اختبار',
  ready: 'جاهز للتسليم',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
  unrepairable: 'غير قابل للإصلاح',
  inspection: 'فحص',
  repair: 'إصلاح',
};

const toEpochMs = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'object' && value !== null) {
    const v = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof v.toDate === 'function') {
      const ms = v.toDate().getTime();
      return Number.isFinite(ms) ? ms : 0;
    }
    const sec = typeof v.seconds === 'number' ? v.seconds : (typeof v._seconds === 'number' ? v._seconds : 0);
    return Number.isFinite(sec) ? sec * 1000 : 0;
  }
  return 0;
};

/** Public: track one repair job by slug + receipt + phone with minimal fields only. */
export const trackRepairJobPublic = onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
    cors: true,
    invoker: 'public',
  },
  async (request) => {
    const payload = (request.data || {}) as PublicTrackRepairJobPayload;
    const tenantSlug = sanitizeTrackSlug(payload.tenantSlug);
    const receiptNo = sanitizeTrackText(payload.receiptNo);
    const phone = normalizeTrackPhoneDigits(payload.phone);

    if (!tenantSlug || !/^[a-z0-9]([a-z0-9-]{1,62}[a-z0-9])?$/.test(tenantSlug)) {
      throw new HttpsError('invalid-argument', 'معرّف الشركة غير صالح.');
    }
    if (!receiptNo || receiptNo.length > 64) {
      throw new HttpsError('invalid-argument', 'رقم الإيصال غير صالح.');
    }
    if (!phone || phone.length < 10 || phone.length > 20) {
      throw new HttpsError('invalid-argument', 'رقم الهاتف غير صالح.');
    }

    const slugSnap = await db.collection(TENANT_SLUGS_COLLECTION).doc(tenantSlug).get();
    const tenantId = String((slugSnap.data() as { tenantId?: string } | undefined)?.tenantId || '').trim();
    if (!slugSnap.exists || !tenantId) {
      return { found: false as const, reason: 'tenant_not_found' as const };
    }

    const tenantSnap = await db.collection(TENANTS_COLLECTION).doc(tenantId).get();
    const tenantStatus = String((tenantSnap.data() as { status?: string } | undefined)?.status || '');
    if (!tenantSnap.exists || tenantStatus !== 'active') {
      return { found: false as const, reason: 'tenant_not_active' as const };
    }

    const snap = await db
      .collection(REPAIR_JOBS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('receiptNo', '==', receiptNo)
      .limit(5)
      .get();

    const matchedDoc = snap.docs.find((docRow) => {
      const rowPhone = (docRow.data() as { customerPhone?: string }).customerPhone;
      return trackPhonesMatchLast10(rowPhone, phone);
    });

    if (!matchedDoc) {
      return { found: false as const, reason: 'not_found' as const };
    }

    const row = matchedDoc;
    const data = row.data() as {
      receiptNo?: string;
      customerName?: string;
      deviceBrand?: string;
      deviceModel?: string;
      status?: string;
      updatedAt?: unknown;
      dueAt?: unknown;
      jobProducts?: Array<{ productName?: string; quantity?: number }>;
      statusHistory?: Array<{ status?: string; at?: unknown }>;
    };

    const status = String(data.status || 'received');
    const jobProducts = Array.isArray(data.jobProducts)
      ? data.jobProducts
          .slice(0, 30)
          .map((item) => ({
            name: String(item?.productName || 'منتج').trim().slice(0, 120),
            quantity: Math.max(1, Math.round(Number(item?.quantity || 1))),
          }))
          .filter((item) => item.name.length > 0)
      : [];

    const statusHistory = Array.isArray(data.statusHistory)
      ? data.statusHistory
          .slice(-25)
          .map((entry) => ({
            status: String(entry?.status || ''),
            atMs: toEpochMs(entry?.at),
          }))
          .filter((entry) => entry.status.length > 0 && entry.atMs > 0)
      : [];

    const dueAtMs = toEpochMs(data.dueAt);

    return {
      found: true as const,
      job: {
        receiptNo: String(data.receiptNo || ''),
        customerName: String(data.customerName || ''),
        deviceBrand: String(data.deviceBrand || ''),
        deviceModel: String(data.deviceModel || ''),
        status,
        statusLabel: REPAIR_TRACK_STATUS_LABELS[status] || status,
        updatedAtMs: toEpochMs(data.updatedAt),
        ...(dueAtMs > 0 ? { dueAtMs } : {}),
        ...(jobProducts.length > 0 ? { jobProducts } : {}),
        ...(statusHistory.length > 0 ? { statusHistory } : {}),
      },
    };
  },
);

const resolveApprovalTokenExpiryMs = (expRaw: unknown): number => {
  if (!expRaw) return 0;
  if (typeof expRaw === 'object' && expRaw !== null && typeof (expRaw as { toDate?: () => Date }).toDate === 'function') {
    return (expRaw as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = Date.parse(String(expRaw));
  return Number.isFinite(parsed) ? parsed : 0;
};

type PublicApprovalLinkContext = {
  tenantId: string;
  jobId: string;
  job: Record<string, unknown>;
  jobRef: FirebaseFirestore.DocumentReference;
};

/** Shared: resolve tenant + job and verify public approval token (fail closed). */
async function loadPublicRepairApprovalJob(input: {
  tenantSlug: string;
  jobId: string;
  token: string;
  requirePending: boolean;
}): Promise<PublicApprovalLinkContext> {
  const tenantSlug = sanitizeTrackSlug(input.tenantSlug);
  const jobId = String(input.jobId || '').trim();
  const token = String(input.token || '').trim();
  if (!tenantSlug || !jobId || !token) {
    throw new HttpsError('invalid-argument', 'بيانات غير كافية.');
  }

  const slugSnap = await db.collection(TENANT_SLUGS_COLLECTION).doc(tenantSlug).get();
  const tenantId = String((slugSnap.data() as { tenantId?: string } | undefined)?.tenantId || '').trim();
  if (!slugSnap.exists || !tenantId) {
    throw new HttpsError('not-found', 'الشركة غير موجودة.');
  }
  const tenantSnap = await db.collection(TENANTS_COLLECTION).doc(tenantId).get();
  if (!tenantSnap.exists || String((tenantSnap.data() as { status?: string } | undefined)?.status || '') !== 'active') {
    throw new HttpsError('failed-precondition', 'الشركة غير متاحة.');
  }

  const jobRef = db.collection(REPAIR_JOBS_COLLECTION).doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) {
    throw new HttpsError('not-found', 'الطلب غير موجود.');
  }
  const job = jobSnap.data() as Record<string, unknown>;
  if (String(job.tenantId || '') !== tenantId) {
    throw new HttpsError('permission-denied', 'لا يتطابق الطلب مع الشركة.');
  }
  const hash = createHash('sha256').update(token, 'utf8').digest('hex');
  if (String(job.approvalTokenHash || '') !== hash) {
    throw new HttpsError('permission-denied', 'رابط الموافقة غير صالح.');
  }
  const expMs = resolveApprovalTokenExpiryMs(job.approvalTokenExpiresAt);
  if (expMs && Date.now() > expMs) {
    throw new HttpsError('failed-precondition', 'انتهت صلاحية الرابط.');
  }
  if (input.requirePending && String(job.approvalStatus || '') !== 'pending') {
    throw new HttpsError('failed-precondition', 'لا يوجد طلب موافقة نشط.');
  }
  return { tenantId, jobId, job, jobRef };
}

/** Public: load estimate details (customer + spare parts) for signed approval link. */
export const getRepairApprovalPublic = onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
    cors: true,
    invoker: 'public',
  },
  async (request) => {
    const data = (request.data || {}) as {
      tenantSlug?: string;
      jobId?: string;
      token?: string;
    };
    const ctx = await loadPublicRepairApprovalJob({
      tenantSlug: String(data.tenantSlug || ''),
      jobId: String(data.jobId || ''),
      token: String(data.token || ''),
      requirePending: false,
    });
    const authorizationId = String(ctx.job.approvalAuthorizationId || '');
    const approvalRevision = Math.max(0, Number(ctx.job.approvalRevision || 0));
    if (!authorizationId || approvalRevision <= 0) {
      throw new HttpsError('failed-precondition', 'رابط الموافقة غير مرتبط بإصدار تقدير صالح.');
    }
    const authorizationSnap = authorizationId
      ? await db.collection('repair_payment_authorizations').doc(authorizationId).get()
      : null;
    const authorization = authorizationSnap?.data() as Record<string, unknown> | undefined;
    if (
      !authorizationSnap?.exists
      || String(authorization?.tenantId || '') !== ctx.tenantId
      || String(authorization?.jobId || '') !== ctx.jobId
      || Number(authorization?.revision || 0) !== approvalRevision
      || String(authorization?.status || '') === 'void'
    ) {
      throw new HttpsError('failed-precondition', 'انتهت صلاحية إصدار التقدير أو تم استبداله.');
    }
    const currentAuthorization = authorization as Record<string, unknown>;
    const legacy = buildPublicRepairApprovalView(ctx.job);
    const serviceLines = Array.isArray(currentAuthorization.serviceLines)
      ? currentAuthorization.serviceLines as Array<Record<string, unknown>> : [];
    const partLines = Array.isArray(currentAuthorization.partLines)
      ? currentAuthorization.partLines as Array<Record<string, unknown>> : [];
    const serviceGross = Number(currentAuthorization.serviceGross || 0);
    const partsGross = Number(currentAuthorization.partsGross || 0);
    const netAmount = Number(currentAuthorization.netAmount || 0);
    return {
      ok: true as const,
      estimate: {
        ...legacy,
        revision: approvalRevision,
        authorizationNo: String(currentAuthorization.authorizationNo || authorizationId),
        productsCost: serviceGross,
        partsCost: partsGross,
        laborCost: 0,
        serviceOnlyCost: 0,
        grossAmount: Number(currentAuthorization.grossAmount || 0),
        discountAmount: Number(currentAuthorization.discountAmount || 0),
        estimatedTotal: netAmount,
        products: serviceLines.map((row) => ({
          name: String(row.name || 'خدمة صيانة'),
          quantity: Number(row.quantity || 0),
          lineCost: Number(row.lineTotal || 0),
        })),
        parts: partLines.map((row) => ({
          partName: String(row.name || 'قطعة غيار'),
          quantity: Number(row.quantity || 0),
          unitPrice: Number(row.unitPrice || 0),
          lineTotal: Number(row.lineTotal || 0),
        })),
      },
    };
  },
);

/** Public: customer approval / rejection via signed link (token hashed in Firestore). */
export const submitRepairApprovalPublic = onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
    cors: true,
    invoker: 'public',
  },
  async (request) => {
    const data = (request.data || {}) as {
      tenantSlug?: string;
      jobId?: string;
      token?: string;
      decision?: 'approved' | 'rejected';
      note?: string;
    };
    const decision = data.decision;
    const note = String(data.note || '').trim().slice(0, 2000);
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new HttpsError('invalid-argument', 'بيانات غير كافية.');
    }

    const ctx = await loadPublicRepairApprovalJob({
      tenantSlug: String(data.tenantSlug || ''),
      jobId: String(data.jobId || ''),
      token: String(data.token || ''),
      requirePending: true,
    });
    const { tenantId, jobId, jobRef } = ctx;
    const {
      loadTenantWorkflowStatuses,
      resolveNextStatusForAction,
      isStatusRole,
    } = await import('./repairStatusAdvance.js');
    const workflowStatuses = await loadTenantWorkflowStatuses(db, tenantId);
    const expectedHash = createHash('sha256')
      .update(String(data.token || '').trim(), 'utf8')
      .digest('hex');
    const eventRef = jobRef.collection('service_events').doc();
    const afterStatus = await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(jobRef);
      if (!currentSnap.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
      const job = currentSnap.data() as Record<string, unknown>;
      if (String(job.tenantId || '') !== tenantId || String(job.approvalTokenHash || '') !== expectedHash) {
        throw new HttpsError('permission-denied', 'رابط الموافقة غير صالح.');
      }
      const expMs = resolveApprovalTokenExpiryMs(job.approvalTokenExpiresAt);
      if (expMs && Date.now() > expMs) throw new HttpsError('failed-precondition', 'انتهت صلاحية الرابط.');
      if (String(job.approvalStatus || '') !== 'pending') {
        throw new HttpsError('failed-precondition', 'تم الرد على طلب الموافقة بالفعل.');
      }
      const authorizationId = String(job.approvalAuthorizationId || '');
      const revision = Math.max(0, Number(job.approvalRevision || 0));
      if (!authorizationId || revision <= 0) {
        throw new HttpsError('failed-precondition', 'رابط الموافقة غير مرتبط بإصدار تقدير صالح.');
      }
      const authorizationRef = db.collection('repair_payment_authorizations').doc(authorizationId);
      const authorizationSnap = await tx.get(authorizationRef);
      if (
        !authorizationSnap.exists
        || String(authorizationSnap.data()?.tenantId || '') !== tenantId
        || String(authorizationSnap.data()?.jobId || '') !== jobId
        || Number(authorizationSnap.data()?.revision || 0) !== revision
        || String(authorizationSnap.data()?.status || '') === 'void'
      ) throw new HttpsError('failed-precondition', 'انتهت صلاحية إصدار التقدير أو تم استبداله.');

      const at = new Date().toISOString();
      const prevStatus = String(job.status || '');
      const parts = Array.isArray(job.partsUsed) ? job.partsUsed as Array<Record<string, unknown>> : [];
      const waitsForParts = parts.some((row) => ['pending_supply', 'ready_to_issue']
        .includes(String(row.fulfillmentStatus || '')));
      let nextStatus = prevStatus;
      if (
        decision === 'approved'
        && (isStatusRole(prevStatus, 'awaiting_customer', workflowStatuses) || prevStatus === 'waiting_approval')
      ) {
        nextStatus = resolveNextStatusForAction({
          action: 'customer_approved',
          currentStatus: prevStatus,
          statuses: workflowStatuses,
          waitsForParts,
        }) || (waitsForParts ? 'waiting_parts' : 'repairing');
      }
      tx.update(jobRef, {
        approvalResolvedAt: at,
        approvalNote: note,
        approvalStatus: decision === 'approved' ? 'approved' : 'rejected',
        updatedAt: at,
        ...(nextStatus !== prevStatus ? { status: nextStatus } : {}),
      });
      tx.update(authorizationRef, {
        customerApprovalStatus: decision,
        customerApprovalResolvedAt: at,
        customerApprovalNote: note,
        updatedAt: at,
      });
      tx.create(eventRef, {
        tenantId: job.tenantId,
        branchId: job.branchId,
        jobId,
        at,
        actorUid: 'public_customer',
        actorName: 'العميل — رابط عام',
        action: 'approval_resolved',
        domainEvent: decision === 'approved' ? 'customer.approved' : 'customer.rejected',
        eventSchemaVersion: 1,
        statusBefore: prevStatus,
        statusAfter: nextStatus,
        note: decision === 'approved' ? 'موافقة عبر الرابط العام' : `رفض عبر الرابط: ${note || '—'}`,
      });
      return nextStatus;
    });
    return { ok: true as const, status: afterStatus };
  },
);

export const createDepartmentConsumableIssue = onCall(
  { region: 'us-central1', memory: '512MiB' },
  createDepartmentConsumableIssueHandler,
);

export const submitDepartmentConsumableIssue = onCall(
  { region: 'us-central1', memory: '256MiB' },
  submitDepartmentConsumableIssueHandler,
);

export const approveDepartmentConsumableIssue = onCall(
  { region: 'us-central1', memory: '256MiB' },
  approveDepartmentConsumableIssueHandler,
);

export const rejectDepartmentConsumableIssue = onCall(
  { region: 'us-central1', memory: '256MiB' },
  rejectDepartmentConsumableIssueHandler,
);

export const issueDepartmentConsumableIssue = onCall(
  { region: 'us-central1', memory: '512MiB' },
  issueDepartmentConsumableIssueHandler,
);

export const cancelDepartmentConsumableIssue = onCall(
  { region: 'us-central1', memory: '256MiB' },
  cancelDepartmentConsumableIssueHandler,
);

export const returnDepartmentConsumableIssue = onCall(
  { region: 'us-central1', memory: '512MiB' },
  returnDepartmentConsumableIssueHandler,
);

export const getDepartmentConsumableMonthlyReport = onCall(
  { region: 'us-central1', memory: '512MiB' },
  getDepartmentConsumableMonthlyReportHandler,
);

export const createRepairSpareIssue = onCall(
  { region: 'us-central1', memory: '512MiB' },
  createRepairSpareIssueHandler,
);

export const submitRepairSpareIssue = onCall(
  { region: 'us-central1', memory: '256MiB' },
  submitRepairSpareIssueHandler,
);

export const approveRepairSpareIssue = onCall(
  { region: 'us-central1', memory: '256MiB' },
  approveRepairSpareIssueHandler,
);

export const rejectRepairSpareIssue = onCall(
  { region: 'us-central1', memory: '256MiB' },
  rejectRepairSpareIssueHandler,
);

export const issueRepairSpareIssue = onCall(
  { region: 'us-central1', memory: '512MiB' },
  issueRepairSpareIssueHandler,
);

export const cancelRepairSpareIssue = onCall(
  { region: 'us-central1', memory: '256MiB' },
  cancelRepairSpareIssueHandler,
);

export const returnRepairSpareIssue = onCall(
  { region: 'us-central1', memory: '512MiB' },
  returnRepairSpareIssueHandler,
);

export const createSparePartsReplenishment = onCall(
  { region: 'us-central1', memory: '512MiB' },
  createSparePartsReplenishmentHandler,
);

export const approveSparePartsReplenishment = onCall(
  { region: 'us-central1', memory: '512MiB' },
  approveSparePartsReplenishmentHandler,
);

export const prepareSparePartsReplenishment = onCall(
  { region: 'us-central1', memory: '512MiB' },
  prepareSparePartsReplenishmentHandler,
);

export const responsibleApproveSparePartsReplenishment = onCall(
  { region: 'us-central1', memory: '512MiB' },
  responsibleApproveSparePartsReplenishmentHandler,
);

export const receiveSparePartsReplenishment = onCall(
  { region: 'us-central1', memory: '512MiB' },
  receiveSparePartsReplenishmentHandler,
);

export const rejectSparePartsReplenishment = onCall(
  { region: 'us-central1', memory: '512MiB' },
  rejectSparePartsReplenishmentHandler,
);

export const cancelSparePartsReplenishment = onCall(
  { region: 'us-central1', memory: '512MiB' },
  cancelSparePartsReplenishmentHandler,
);

export const listMaintenanceCenterSpareBalances = onCall(
  { region: 'us-central1', memory: '512MiB' },
  listMaintenanceCenterSpareBalancesHandler,
);

export const createSparePartsRecall = onCall(
  { region: 'us-central1', memory: '512MiB' },
  createSparePartsRecallHandler,
);

export const confirmSparePartsRecall = onCall(
  { region: 'us-central1', memory: '512MiB' },
  confirmSparePartsRecallHandler,
);

export const cancelSparePartsRecall = onCall(
  { region: 'us-central1', memory: '256MiB' },
  cancelSparePartsRecallHandler,
);

export const requestRepairJobSparePart = onCall(
  { region: 'us-central1', memory: '512MiB' },
  requestRepairJobSparePartHandler,
);

export const issuePendingRepairPartUsage = onCall(
  { region: 'us-central1', memory: '512MiB' },
  issuePendingRepairPartUsageHandler,
);

export const deliverRepairJobAndCollect = onCall(
  { region: 'us-central1', memory: '512MiB' },
  async () => {
    throw new HttpsError(
      'failed-precondition',
      'تم تعطيل مسار التسليم والتحصيل القديم. استخدم إذن الدفع والتحصيل ثم التسليم من المسار الجديد.',
    );
  },
);

export const mutateRepairSalesInvoice = onCall(
  { region: 'us-central1', memory: '512MiB' },
  mutateRepairSalesInvoiceHandler,
);

export const mutateRepairPayment = onCall(
  { region: 'us-central1', memory: '512MiB' },
  mutateRepairPaymentHandler,
);

export const mutateRepairTreasury = onCall(
  { region: 'us-central1', memory: '512MiB' },
  mutateRepairTreasuryHandler,
);

export const mutateSparePartsPurchaseInvoice = onCall(
  { region: 'us-central1', memory: '512MiB' },
  mutateSparePartsPurchaseInvoiceHandler,
);

export const repairTechnicianOps = onCall(
  { region: 'us-central1', memory: '256MiB' },
  repairTechnicianOpsHandler,
);

export const mutateAccounting = onCall(
  { region: 'us-central1', memory: '512MiB' },
  mutateAccountingHandler,
);

export const mutateRepairServiceCatalog = onCall(
  { region: 'us-central1', memory: '256MiB' },
  mutateRepairServiceCatalogHandler,
);

export const updateRepairPartsPricing = onCall(
  { region: 'us-central1', memory: '512MiB' },
  updateRepairPartsPricingHandler,
);

export const createInventoryCountSession = onCall(
  { region: 'us-central1', memory: '512MiB' },
  createInventoryCountSessionHandler,
);

export const customerPortalLogin = onCall(
  { region: 'us-central1', memory: '256MiB', cors: true, invoker: 'public', secrets: ['CUSTOMER_PORTAL_PIN_PEPPER'] },
  customerPortalLoginHandler,
);

export const getCustomerPortalHome = onCall(
  { region: 'us-central1', memory: '256MiB', cors: true, invoker: 'public' },
  getCustomerPortalHomeHandler,
);

export const lookupPortalProduct = onCall(
  { region: 'us-central1', memory: '256MiB', cors: true, invoker: 'public' },
  lookupPortalProductHandler,
);

export const createCustomerServiceRequest = onCall(
  { region: 'us-central1', memory: '256MiB', cors: true, invoker: 'public' },
  createCustomerServiceRequestHandler,
);

export const mutateRepairCustomerOps = onCall(
  { region: 'us-central1', memory: '512MiB', secrets: ['CUSTOMER_PORTAL_PIN_PEPPER'] },
  mutateRepairCustomerOpsHandler,
);

export const getCustomerFinancialAnalytics = onCall(
  { region: 'us-central1', memory: '512MiB' },
  getCustomerFinancialAnalyticsHandler,
);

export { confirmProductionHandoverReceipt } from './productionHandover.js';
export { issueProductionIssueStock } from './productionIssueStock.js';
export {
  applyProductionReportInventory,
  reverseProductionReportInventory,
} from './productionReportInventory.js';
export { adminCreateUser, bootstrapTenantAdmin } from './adminUserProvisioning.js';
export { syncBuiltInRolePermissionGrants } from './rolePermissionMigration.js';
export { onRepairJobCreatedCustody } from './repairCustomerPortalOps.js';
export { purgeRepairOperationalData } from './purgeRepairOperationalData.js';
