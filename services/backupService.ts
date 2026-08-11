/**
 * Backup & Restore Service
 *
 * Exports all Firestore collections into a single JSON structure,
 * and imports them back with merge / replace / full-reset modes.
 * Also stores backup history in a "backups" collection.
 */
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  addDoc,
  serverTimestamp,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { auth, db, isConfigured } from './firebase';
import { getCurrentTenantIdOrNull } from '../lib/currentTenant';

// ─── Constants ───────────────────────────────────────────────────────────────

const BACKUP_VERSION = '2.1.0';
const BACKUPS_COLLECTION = 'backups';

const ALL_COLLECTIONS = [
  // Production and manufacturing
  'products',
  'production_lines',
  'productionLines',
  'employees',
  'production_reports',
  'production_approval_requests',
  'line_status',
  'line_product_config',
  'production_plans',
  'production_plan_followups',
  'supervisors',
  'supervisor_line_assignments',
  'supervisorAssignmentLog',
  'production_workers',
  'production_line_worker_assignments',
  'production_worker_targets',
  'worker_performance_summaries',
  'worker_daily_performance_logs',
  'production_attendance_records',
  'work_orders',
  'notifications',
  'scan_events',
  'product_materials',
  'materials',
  'boms',
  'bom_items',
  'material_requirement_runs',
  'production_plan_material_requirements',
  'purchase_orders',
  'monthly_production_costs',
  'cost_period_closures',
  'monthly_costs',
  'cost_variances',
  'cost_deviation_analysis',
  'line_worker_assignments',
  'production_report_uniques',
  'product_categories',
  'material_categories',
  'production_routing_plans',
  'production_routing_steps',
  'production_routing_executions',
  'production_routing_execution_steps',
  'supply_cycles',
  'supply_cycle_waste_lines',

  // Inventory
  'warehouses',
  'warehouse_racks',
  'warehouse_locations',
  'warehouse_location_settings',
  'default_item_locations',
  'raw_materials',
  'stock_items',
  'stock_location_balances',
  'stock_transactions',
  'stock_counts',
  'inventory_transfer_requests',
  'inventory_counters',
  'production_issue_orders',
  'production_handover_receipts',
  'component_compensation_requests',
  'component_return_records',
  'component_scrap_records',
  'disassembly_orders',
  'supplies_receipt_orders',
  'department_consumable_issues',
  'spare_parts_replenishment_requests',
  'spare_parts_recall_requests',
  'repair_spare_issues',
  'inventory_exceptions',
  'stock_daily_summaries',
  'stock_period_summaries',

  // Cost management
  'cost_centers',
  'cost_center_values',
  'cost_allocations',
  'labor_settings',
  'assets',
  'asset_depreciations',

  // System and audit
  'roles',
  'users',
  'activity_logs',
  'audit_logs',

  // HR and payroll
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
  // Payroll collections
  'payroll_months',
  'payroll_records',
  'payroll_audit_logs',
  'payroll_cost_summary',
  'payroll_distributions',
  'hr_config_modules',
  'hr_config_audit_logs',

  // Quality
  'quality_settings',
  'quality_reason_catalog',
  'quality_workers_assignments',
  'quality_inspections',
  'quality_defects',
  'quality_rework_orders',
  'quality_capa',
  'quality_print_logs',

  // Customers (CRM master)
  'customers',
  'customer_activities',

  // Repair
  'repair_branches',
  'repair_jobs',
  'repair_job_financials',
  'repair_payment_authorizations',
  'repair_payments',
  'repair_financial_approvals',
  'repair_part_reservations',
  'repair_spare_parts',
  'repair_spare_parts_stock',
  'repair_parts_transactions',
  'repair_treasury_sessions',
  'repair_treasury_entries',
  'repair_treasury_expense_requests',
  'repair_treasury_month_closes',
  'repair_treasury_settlements',
  'spare_parts_purchase_invoices',
  'repair_sales_invoices',
  'repair_counters',
  'repair_followups',
  'repair_complaints',
  'repair_pm_plans',
  'accounting_accounts',
  'accounting_journal_entries',
  'accounting_settings',
  'accounting_periods',
  'accounting_sequences',
  'accounting_posting_outbox',
  'accounting_audit_log',
  'repair_financial_migration_reviews',
  'repair_service_catalog',
  'repair_parts_pricing_audit',
  'customer_service_requests',
  'customer_service_events',
  'repair_custody_records',
  'repair_replacement_requests',
  'customer_portal_credentials',
  'customer_portal_sessions',
  'customer_portal_login_limits',
  'product_barcode_claims',

  // Shared registries carrying tenantId
  'entity_code_counters',
  'entity_code_claims',
  '_counters',
  'automation_runs',
  'backups',

  // Tenant-owned path collections
  'system_settings',
  'user_devices',
  'user_presence',
  'dashboardStats',
  'tenants',
] as const;

const COLLECTION_GROUPS = [
  // users/{userId}/preferences/{docId}
  'preferences',
  // users/{userId}/fcmTokens/{tokenId}
  'fcmTokens',
  // dashboardStats/{tenantId}/daily/{date}
  'daily',
] as const;

const ALL_COLLECTION_SET = new Set<string>(ALL_COLLECTIONS);
const COLLECTION_GROUP_SET = new Set<string>(COLLECTION_GROUPS);

const SETTINGS_COLLECTIONS = [
  'system_settings',
  'roles',
  'labor_settings',
  'line_product_config',
  'product_materials',
  'materials',
  'boms',
  'bom_items',
  'material_requirement_runs',
  'production_plan_material_requirements',
  'hr_settings',
  'hr_config_modules',
  'penalty_rules',
  'late_rules',
  'allowance_types',
  'shifts',
  'departments',
  'job_positions',
  'approval_settings',
  'quality_settings',
  'quality_reason_catalog',
] as const;

export type RestoreMode = 'merge' | 'replace' | 'full_reset';

export interface ImportBackupOptions {
  /** Skip downloading a full auto-backup before restore (avoids permission failures on read). */
  skipAutoBackupBeforeRestore?: boolean;
}

function mapImportError(error: unknown): string {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const msg = error instanceof Error ? error.message : '';
  const combined = `${code} ${msg}`.toLowerCase();
  if (
    combined.includes('permission')
    || combined.includes('insufficient')
    || code.includes('permission-denied')
  ) {
    return (
      'رفضت قواعد Firestore العملية. غالباً: نسخة من شركة أخرى (tenantId مختلف)، أو مجموعات users/roles بدون صلاحيات كافية، أو فشل النسخة التلقائية قبل الاستعادة. ' +
      'جرّب تفعيل «تخطي النسخة التلقائية قبل الاستعادة»، أو استخدم «استعادة عبر الخادم» كمشرف منصة.'
    );
  }
  if (msg) return msg;
  return 'حدث خطأ أثناء الاستعادة';
}

export interface BackupMetadata {
  version: string;
  createdAt: string;
  type: 'full' | 'monthly' | 'settings';
  month?: string;
  /** Owning tenant — required for safe multi-tenant restore. */
  tenantId?: string;
  collectionsIncluded: string[];
  documentCounts: Record<string, number>;
  totalDocuments: number;
  createdBy: string;
}

export interface BackupFile {
  metadata: BackupMetadata;
  collections: Record<string, Record<string, any>[]>;
  collectionGroups?: Record<string, Record<string, any>[]>;
}

export interface BackupHistoryEntry {
  id?: string;
  /** Required for Firestore tenant isolation; set automatically in saveHistory. */
  tenantId?: string;
  type: 'full' | 'monthly' | 'settings';
  mode?: RestoreMode;
  action: 'export' | 'import';
  fileName: string;
  totalDocuments: number;
  collectionsIncluded: string[];
  createdBy: string;
  createdAt: any;
  month?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function readCollection(name: string): Promise<Record<string, any>[]> {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
}

/**
 * Tenant-scoped reads. Unscoped collection scans are denied by Firestore rules for
 * tenant users; some top-level collections use non-standard layouts (dashboardStats, etc.).
 */
async function readCollectionTenantScoped(
  name: string,
  tenantId: string
): Promise<Record<string, any>[]> {
  try {
    if (name === 'dashboardStats') {
      const [dailySnap, monthlySnap] = await Promise.all([
        getDocs(collection(db, 'dashboardStats', tenantId, 'daily')),
        getDocs(collection(db, 'dashboardStats', tenantId, 'monthly')),
      ]);
      return [
        ...dailySnap.docs.map((d) => ({ _docId: d.id, ...d.data() })),
        ...monthlySnap.docs.map((d) => ({ _docId: d.id, ...d.data() })),
      ];
    }
    if (name === 'tenants') {
      const d = await getDoc(doc(db, 'tenants', tenantId));
      return d.exists() ? [{ _docId: d.id, ...d.data() }] : [];
    }
    if (name === 'system_settings') {
      const d = await getDoc(doc(db, 'system_settings', tenantId));
      return d.exists() ? [{ _docId: d.id, ...d.data() }] : [];
    }
    if (name === 'user_devices') {
      const uid = auth?.currentUser?.uid;
      if (!uid) return [];
      const q = query(collection(db, 'user_devices'), where('userId', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
    }
    if (name === 'user_presence') {
      const uid = auth?.currentUser?.uid;
      if (!uid) return [];
      const d = await getDoc(doc(db, 'user_presence', uid));
      return d.exists() ? [{ _docId: d.id, ...d.data() }] : [];
    }
    const q = query(collection(db, name), where('tenantId', '==', tenantId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

async function readCollectionGroup(
  name: string
): Promise<Record<string, any>[]> {
  const snap = await getDocs(collectionGroup(db, name));
  return snap.docs.map((d) => ({ _path: d.ref.path, ...d.data() }));
}

/** Subcollections / paths that are not readable via unscoped collectionGroup queries. */
async function readCollectionGroupTenantScoped(
  groupName: string,
  tenantId: string
): Promise<Record<string, any>[]> {
  try {
    if (groupName === 'daily') {
      const snap = await getDocs(
        collection(db, 'dashboardStats', tenantId, 'daily')
      );
      return snap.docs.map((d) => ({
        _path: d.ref.path,
        ...d.data(),
      }));
    }
    if (groupName === 'preferences' || groupName === 'fcmTokens') {
      const usersSnap = await getDocs(
        query(collection(db, 'users'), where('tenantId', '==', tenantId))
      );
      const out: Record<string, any>[] = [];
      for (const u of usersSnap.docs) {
        const sub = await getDocs(
          collection(db, 'users', u.id, groupName)
        );
        sub.docs.forEach((d) => {
          out.push({ _path: d.ref.path, ...d.data() });
        });
      }
      return out;
    }
    return [];
  } catch {
    return [];
  }
}

async function clearTenantCollection(name: string, tenantId: string): Promise<void> {
  const snap = await getDocs(query(collection(db, name), where('tenantId', '==', tenantId)));
  const batchSize = 500;
  const docs = snap.docs;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + batchSize);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function clearTenantCollectionGroup(name: string, tenantId: string): Promise<void> {
  const snap = await getDocs(
    query(collectionGroup(db, name), where('tenantId', '==', tenantId)),
  );
  const batchSize = 500;
  const docs = snap.docs;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + batchSize);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

function stampTenantId(
  fields: Record<string, unknown>,
  tenantId: string,
): Record<string, unknown> {
  return { ...fields, tenantId };
}

function assertSameTenant(
  fields: Record<string, unknown>,
  tenantId: string,
  context: string,
): void {
  const docTenant = String(fields.tenantId || '').trim();
  if (docTenant && docTenant !== tenantId) {
    throw new Error(`مستند في ${context} يتبع مستأجراً آخر ولا يمكن استعادته.`);
  }
}

async function writeDocuments(
  collectionName: string,
  documents: Record<string, any>[],
  mode: RestoreMode,
  tenantId: string,
): Promise<void> {
  if (mode === 'replace' || mode === 'full_reset') {
    await clearTenantCollection(collectionName, tenantId);
  }

  const batchSize = 500;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = documents.slice(i, i + batchSize);
    chunk.forEach((docData) => {
      const { _docId, ...rawFields } = docData;
      assertSameTenant(rawFields, tenantId, collectionName);
      const fields = stampTenantId(rawFields, tenantId);
      const ref = _docId
        ? doc(db, collectionName, _docId)
        : doc(collection(db, collectionName));
      batch.set(ref, fields, { merge: mode === 'merge' });
    });
    await batch.commit();
  }
}

async function writeCollectionGroupDocuments(
  collectionGroupName: string,
  documents: Record<string, any>[],
  mode: RestoreMode,
  tenantId: string,
): Promise<void> {
  if (mode === 'replace' || mode === 'full_reset') {
    await clearTenantCollectionGroup(collectionGroupName, tenantId);
  }

  const batchSize = 500;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = documents.slice(i, i + batchSize);
    chunk.forEach((docData) => {
      const { _path, ...rawFields } = docData;
      if (typeof _path !== 'string' || !_path.trim()) {
        return;
      }
      assertSameTenant(rawFields, tenantId, collectionGroupName);
      const fields = stampTenantId(rawFields, tenantId);
      batch.set(doc(db, _path), fields, { merge: mode === 'merge' });
    });
    await batch.commit();
  }
}

function downloadJSON(data: BackupFile, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateBackupFile(data: any, expectedTenantId?: string | null): {
  valid: boolean;
  error?: string;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'ملف غير صالح — ليس كائن JSON' };
  }

  if (!data.metadata) {
    return { valid: false, error: 'الملف لا يحتوي على بيانات وصفية (metadata)' };
  }

  if (!data.metadata.version) {
    return { valid: false, error: 'الملف لا يحتوي على رقم الإصدار' };
  }

  const [major] = data.metadata.version.split('.');
  const [currentMajor] = BACKUP_VERSION.split('.');
  if (major !== currentMajor) {
    return {
      valid: false,
      error: `إصدار الملف (${data.metadata.version}) غير متوافق مع الإصدار الحالي (${BACKUP_VERSION})`,
    };
  }

  if (!data.collections || typeof data.collections !== 'object') {
    return { valid: false, error: 'الملف لا يحتوي على بيانات المجموعات (collections)' };
  }

  if (data.collectionGroups && typeof data.collectionGroups !== 'object') {
    return {
      valid: false,
      error: 'الملف يحتوي collectionGroups بصيغة غير صحيحة',
    };
  }

  const unknownCollection = Object.keys(data.collections)
    .find((name) => !ALL_COLLECTION_SET.has(name));
  if (unknownCollection) {
    return {
      valid: false,
      error: `المجموعة ${unknownCollection} غير مسجلة ضمن نطاق النسخ الاحتياطي`,
    };
  }
  const unknownGroup = Object.keys(data.collectionGroups || {})
    .find((name) => !COLLECTION_GROUP_SET.has(name));
  if (unknownGroup) {
    return {
      valid: false,
      error: `المجموعة الفرعية ${unknownGroup} غير مسجلة ضمن نطاق النسخ الاحتياطي`,
    };
  }

  const expected = String(expectedTenantId || '').trim();
  const fileTenant = String(data.metadata?.tenantId || '').trim();
  if (expected) {
    if (!fileTenant) {
      return {
        valid: false,
        error: 'ملف النسخة لا يحتوي metadata.tenantId — لا يمكن استعادته بأمان في وضع متعدد المستأجرين',
      };
    }
    if (fileTenant !== expected) {
      return {
        valid: false,
        error: 'ملف النسخة يتبع مستأجراً آخر ولا يمكن استعادته هنا',
      };
    }
  }

  return { valid: true };
}

// ─── Export Functions ────────────────────────────────────────────────────────

export const backupService = {
  async exportFullBackup(createdBy: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) {
      throw new Error('Tenant context not initialised');
    }

    const collections: Record<string, Record<string, any>[]> = {};
    const collectionGroups: Record<string, Record<string, any>[]> = {};
    const documentCounts: Record<string, number> = {};
    let totalDocuments = 0;

    for (const name of ALL_COLLECTIONS) {
      const docs = await readCollectionTenantScoped(name, tenantId);
      collections[name] = docs;
      documentCounts[name] = docs.length;
      totalDocuments += docs.length;
    }

    for (const groupName of COLLECTION_GROUPS) {
      const docs = await readCollectionGroupTenantScoped(groupName, tenantId);
      collectionGroups[groupName] = docs;
      documentCounts[`group:${groupName}`] = docs.length;
      totalDocuments += docs.length;
    }

    const backup: BackupFile = {
      metadata: {
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        type: 'full',
        tenantId,
        collectionsIncluded: [...ALL_COLLECTIONS],
        documentCounts,
        totalDocuments,
        createdBy,
      },
      collections,
      collectionGroups,
    };

    const fileName = `backup_full_${getTimestamp()}.json`;
    downloadJSON(backup, fileName);

    await this.saveHistory({
      type: 'full',
      action: 'export',
      fileName,
      totalDocuments,
      collectionsIncluded: [...ALL_COLLECTIONS],
      createdBy,
      createdAt: serverTimestamp(),
    });
  },

  async exportMonthlyBackup(month: string, createdBy: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) {
      throw new Error('Tenant context not initialised');
    }

    const monthCollections = [
      'production_reports',
      'line_status',
      'production_plans',
      'work_orders',
      'line_worker_assignments',
      'monthly_production_costs',
      'cost_center_values',
      'cost_allocations',
      'attendance_logs',
      'attendance_raw_logs',
      'leave_requests',
    ] as const;

    const collections: Record<string, Record<string, any>[]> = {};
    const documentCounts: Record<string, number> = {};
    let totalDocuments = 0;

    for (const name of monthCollections) {
      const allDocs = await readCollectionTenantScoped(name, tenantId);
      const filtered = allDocs.filter((d) => {
        const dateField = d.date || d.month || d.createdAt;
        if (typeof dateField === 'string') {
          return dateField.startsWith(month);
        }
        return true;
      });
      collections[name] = filtered;
      documentCounts[name] = filtered.length;
      totalDocuments += filtered.length;
    }

    const backup: BackupFile = {
      metadata: {
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        type: 'monthly',
        month,
        collectionsIncluded: [...monthCollections],
        documentCounts,
        totalDocuments,
        createdBy,
      },
      collections,
    };

    const fileName = `backup_monthly_${month}_${getTimestamp()}.json`;
    downloadJSON(backup, fileName);

    await this.saveHistory({
      type: 'monthly',
      action: 'export',
      fileName,
      totalDocuments,
      collectionsIncluded: [...monthCollections],
      createdBy,
      month,
      createdAt: serverTimestamp(),
    });
  },

  async exportSettingsOnly(createdBy: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) {
      throw new Error('Tenant context not initialised');
    }

    const collections: Record<string, Record<string, any>[]> = {};
    const documentCounts: Record<string, number> = {};
    let totalDocuments = 0;

    for (const name of SETTINGS_COLLECTIONS) {
      const docs = await readCollectionTenantScoped(name, tenantId);
      collections[name] = docs;
      documentCounts[name] = docs.length;
      totalDocuments += docs.length;
    }

    const backup: BackupFile = {
      metadata: {
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        type: 'settings',
        collectionsIncluded: [...SETTINGS_COLLECTIONS],
        documentCounts,
        totalDocuments,
        createdBy,
      },
      collections,
    };

    const fileName = `backup_settings_${getTimestamp()}.json`;
    downloadJSON(backup, fileName);

    await this.saveHistory({
      type: 'settings',
      action: 'export',
      fileName,
      totalDocuments,
      collectionsIncluded: [...SETTINGS_COLLECTIONS],
      createdBy,
      createdAt: serverTimestamp(),
    });
  },

  // ─── Import ──────────────────────────────────────────────────────────────

  async importBackup(
    file: BackupFile,
    mode: RestoreMode,
    createdBy: string,
    onProgress?: (step: string, progress: number) => void,
    options?: ImportBackupOptions
  ): Promise<{ success: boolean; error?: string; restored: number }> {
    if (!isConfigured) {
      return { success: false, error: 'Firebase not configured', restored: 0 };
    }

    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) {
      return { success: false, error: 'لا يوجد مستأجر نشط للاستعادة', restored: 0 };
    }

    // Destructive full_reset is server/super-admin only (Admin SDK tenant-scoped).
    if (mode === 'full_reset') {
      return {
        success: false,
        error: 'الاستعادة الكاملة متاحة فقط عبر مسار الخادم لمسؤول المنصة',
        restored: 0,
      };
    }

    const validation = validateBackupFile(file, tenantId);
    if (!validation.valid) {
      return { success: false, error: validation.error, restored: 0 };
    }

    try {
      if (!options?.skipAutoBackupBeforeRestore) {
        onProgress?.('إنشاء نسخة احتياطية تلقائية قبل الاستعادة...', 5);
        await this.exportFullBackup(`${createdBy} (auto-before-restore)`);
      } else {
        onProgress?.('تخطي النسخة التلقائية — بدء الاستعادة...', 5);
      }

      const collectionNames = Object.keys(file.collections);
      const collectionGroupNames = Object.keys(file.collectionGroups || {});
      let restored = 0;
      const total = collectionNames.length + collectionGroupNames.length;
      let currentStep = 0;

      for (let i = 0; i < collectionNames.length; i++, currentStep++) {
        const name = collectionNames[i];

        onProgress?.(
          `استعادة ${name}...`,
          10 + Math.round((currentStep / Math.max(total, 1)) * 80)
        );

        const docs = file.collections[name];
        if (docs && docs.length > 0) {
          await writeDocuments(name, docs, mode, tenantId);
          restored += docs.length;
        } else if (mode === 'replace') {
          await clearTenantCollection(name, tenantId);
        }
      }

      for (let i = 0; i < collectionGroupNames.length; i++, currentStep++) {
        const groupName = collectionGroupNames[i];
        onProgress?.(
          `استعادة المجموعة الفرعية ${groupName}...`,
          10 + Math.round((currentStep / Math.max(total, 1)) * 80)
        );

        const docs = file.collectionGroups?.[groupName];
        if (docs && docs.length > 0) {
          await writeCollectionGroupDocuments(groupName, docs, mode, tenantId);
          restored += docs.length;
        } else if (mode === 'replace') {
          await clearTenantCollectionGroup(groupName, tenantId);
        }
      }

      onProgress?.('حفظ سجل الاستعادة...', 95);
      await this.saveHistory({
        type: file.metadata.type,
        mode,
        action: 'import',
        fileName: `restore_${mode}_${getTimestamp()}`,
        totalDocuments: restored,
        collectionsIncluded: collectionNames,
        createdBy,
        createdAt: serverTimestamp(),
      });

      onProgress?.('اكتمل!', 100);
      return { success: true, restored };
    } catch (error: unknown) {
      console.error('importBackup error:', error);
      return {
        success: false,
        error: mapImportError(error),
        restored: 0,
      };
    }
  },

  // ─── Backup History ────────────────────────────────────────────────────────

  async saveHistory(entry: BackupHistoryEntry): Promise<void> {
    if (!isConfigured) return;
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) return;
    try {
      await addDoc(collection(db, BACKUPS_COLLECTION), {
        ...entry,
        tenantId,
      });
    } catch (error) {
      console.error('backupService.saveHistory error:', error);
    }
  },

  async getHistory(maxEntries = 20): Promise<BackupHistoryEntry[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) return [];
    try {
      const q = query(
        collection(db, BACKUPS_COLLECTION),
        where('tenantId', '==', tenantId),
        orderBy('createdAt', 'desc'),
        limit(maxEntries)
      );
      const snap = await getDocs(q);
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as BackupHistoryEntry)
      );
    } catch (error) {
      console.error('backupService.getHistory error:', error);
      return [];
    }
  },
};
