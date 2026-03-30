/**
 * Super-admin tenant backup export (Admin SDK).
 * Mirrors client `services/backupService.ts` ALL_COLLECTIONS / COLLECTION_GROUPS layout.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { TENANT_SCOPED_COLLECTIONS } from './tenantFootprintCollections.js';

export const BACKUP_VERSION = '2.1.0';

/** Subcollection group names used in backup `collectionGroups` (aligned with client `backupService`). */
export const BACKUP_COLLECTION_GROUPS = ['preferences', 'fcmTokens', 'daily'] as const;

/** Same order/names as client `ALL_COLLECTIONS` (backupService). */
export const ALL_BACKUP_COLLECTIONS: readonly string[] = [
  'products',
  'production_lines',
  'productionLines',
  'employees',
  'production_reports',
  'line_status',
  'line_product_config',
  'production_plans',
  'production_plan_followups',
  'supervisors',
  'supervisor_line_assignments',
  'supervisorAssignmentLog',
  'work_orders',
  'notifications',
  'scan_events',
  'product_materials',
  'monthly_production_costs',
  'line_worker_assignments',
  'warehouses',
  'raw_materials',
  'stock_items',
  'stock_transactions',
  'stock_counts',
  'inventory_transfer_requests',
  'cost_centers',
  'cost_center_values',
  'cost_allocations',
  'labor_settings',
  'assets',
  'asset_depreciations',
  'roles',
  'users',
  'system_settings',
  'activity_logs',
  'audit_logs',
  'departments',
  'job_positions',
  'shifts',
  'hr_settings',
  'penalty_rules',
  'late_rules',
  'allowance_types',
  'attendance_raw_logs',
  'attendance_logs',
  'attendance_records',
  'attendance_monthly_summaries',
  'attendance_import_history',
  'leave_requests',
  'leave_balances',
  'employee_loans',
  'employee_allowances',
  'employee_deductions',
  'vehicles',
  'approval_requests',
  'approval_settings',
  'approval_delegations',
  'approval_audit_logs',
  'hr_notifications',
  'employee_performance',
  'employee_bonuses',
  'payroll_months',
  'payroll_records',
  'payroll_audit_logs',
  'payroll_cost_summary',
  'payroll_distributions',
  'hr_config_modules',
  'hr_config_audit_logs',
  'quality_settings',
  'quality_reason_catalog',
  'quality_workers_assignments',
  'quality_inspections',
  'quality_defects',
  'quality_rework_orders',
  'quality_capa',
  'quality_print_logs',
  'production_report_uniques',
  'product_categories',
  'user_devices',
  'user_presence',
  'automation_runs',
  'dashboardStats',
  'tenants',
  'backups',
];

const MAX_JSON_CHARS = 28 * 1024 * 1024;

async function readCollectionTenantScoped(
  db: Firestore,
  name: string,
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  if (name === 'dashboardStats') {
    const [dailySnap, monthlySnap] = await Promise.all([
      db.collection('dashboardStats').doc(tenantId).collection('daily').get(),
      db.collection('dashboardStats').doc(tenantId).collection('monthly').get(),
    ]);
    return [
      ...dailySnap.docs.map((d) => ({ _docId: d.id, ...d.data() })),
      ...monthlySnap.docs.map((d) => ({ _docId: d.id, ...d.data() })),
    ];
  }
  if (name === 'tenants') {
    const d = await db.collection('tenants').doc(tenantId).get();
    return d.exists ? [{ _docId: d.id, ...d.data() }] : [];
  }
  if (name === 'user_devices') {
    const usersSnap = await db.collection('users').where('tenantId', '==', tenantId).get();
    const out: Record<string, unknown>[] = [];
    for (const u of usersSnap.docs) {
      const devSnap = await db.collection('user_devices').where('userId', '==', u.id).get();
      devSnap.docs.forEach((d) => {
        out.push({ _docId: d.id, ...d.data() });
      });
    }
    return out;
  }
  if (name === 'user_presence') {
    const usersSnap = await db.collection('users').where('tenantId', '==', tenantId).get();
    const out: Record<string, unknown>[] = [];
    for (const u of usersSnap.docs) {
      const d = await db.collection('user_presence').doc(u.id).get();
      if (d.exists) {
        out.push({ _docId: d.id, ...d.data() });
      }
    }
    return out;
  }
  const snap = await db.collection(name).where('tenantId', '==', tenantId).get();
  return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
}

async function readCollectionGroupTenantScoped(
  db: Firestore,
  groupName: string,
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  if (groupName === 'daily') {
    const snap = await db.collection('dashboardStats').doc(tenantId).collection('daily').get();
    return snap.docs.map((d) => ({
      _path: d.ref.path,
      ...d.data(),
    }));
  }
  if (groupName === 'preferences' || groupName === 'fcmTokens') {
    const usersSnap = await db.collection('users').where('tenantId', '==', tenantId).get();
    const out: Record<string, unknown>[] = [];
    for (const u of usersSnap.docs) {
      const sub = await db.collection('users').doc(u.id).collection(groupName).get();
      sub.docs.forEach((d) => {
        out.push({ _path: d.ref.path, ...d.data() });
      });
    }
    return out;
  }
  return [];
}

export interface TenantBackupFile {
  metadata: {
    version: string;
    createdAt: string;
    type: 'full';
    collectionsIncluded: string[];
    documentCounts: Record<string, number>;
    totalDocuments: number;
    createdBy: string;
    tenantId: string;
  };
  collections: Record<string, Record<string, unknown>[]>;
  collectionGroups?: Record<string, Record<string, unknown>[]>;
}

export async function buildTenantBackup(
  db: Firestore,
  tenantId: string,
  createdBy: string,
): Promise<TenantBackupFile> {
  const collections: Record<string, Record<string, unknown>[]> = {};
  const collectionGroups: Record<string, Record<string, unknown>[]> = {};
  const documentCounts: Record<string, number> = {};
  let totalDocuments = 0;

  for (const name of ALL_BACKUP_COLLECTIONS) {
    const docs = await readCollectionTenantScoped(db, name, tenantId);
    collections[name] = docs;
    documentCounts[name] = docs.length;
    totalDocuments += docs.length;
  }

  for (const groupName of BACKUP_COLLECTION_GROUPS) {
    const docs = await readCollectionGroupTenantScoped(db, groupName, tenantId);
    collectionGroups[groupName] = docs;
    documentCounts[`group:${groupName}`] = docs.length;
    totalDocuments += docs.length;
  }

  return {
    metadata: {
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      type: 'full',
      collectionsIncluded: [...ALL_BACKUP_COLLECTIONS],
      documentCounts,
      totalDocuments,
      createdBy,
      tenantId,
    },
    collections,
    collectionGroups,
  };
}

export function assertBackupJsonSize(backup: TenantBackupFile): void {
  const jsonStr = JSON.stringify(backup);
  if (jsonStr.length > MAX_JSON_CHARS) {
    throw new Error(
      'النسخة الاحتياطية كبيرة جداً لتُحمَّل عبر المتصفح. استخدم تصدير Google Cloud من صفحة «نسخة المشروع الكامل».',
    );
  }
}

export const TENANT_DELETE_QUERY_COLLECTIONS: readonly string[] = TENANT_SCOPED_COLLECTIONS;
