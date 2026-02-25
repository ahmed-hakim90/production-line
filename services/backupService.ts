/**
 * Backup & Restore Service
 *
 * Exports all Firestore collections into a single JSON structure,
 * and imports them back with merge / replace / full-reset modes.
 * Also stores backup history in a "backups" collection.
 */
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  writeBatch,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, isConfigured } from './firebase';

// ─── Constants ───────────────────────────────────────────────────────────────

const BACKUP_VERSION = '2.0.0';
const BACKUPS_COLLECTION = 'backups';

const ALL_COLLECTIONS = [
  // Core production
  'products',
  'production_lines',
  'employees',
  'production_reports',
  'line_status',
  'line_product_config',
  'production_plans',
  // Work orders & notifications
  'work_orders',
  'notifications',
  // Product cost & materials
  'product_materials',
  'monthly_production_costs',
  // Line worker assignments
  'line_worker_assignments',
  // Cost management
  'cost_centers',
  'cost_center_values',
  'cost_allocations',
  'labor_settings',
  // System
  'roles',
  'users',
  'system_settings',
  'activity_logs',
  // HR collections
  'departments',
  'job_positions',
  'shifts',
  'hr_settings',
  'penalty_rules',
  'late_rules',
  'allowance_types',
  'attendance_raw_logs',
  'attendance_logs',
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
  // Payroll collections
  'payroll_months',
  'payroll_records',
  'payroll_audit_logs',
  'payroll_cost_summary',
  // HR Config collections
  'hr_config_modules',
  'hr_config_audit_logs',
  // Quality module collections
  'quality_settings',
  'quality_reason_catalog',
  'quality_workers_assignments',
  'quality_inspections',
  'quality_defects',
  'quality_rework_orders',
  'quality_capa',
  'quality_print_logs',
] as const;

const SETTINGS_COLLECTIONS = [
  'system_settings',
  'roles',
  'labor_settings',
  'line_product_config',
  'product_materials',
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

export interface BackupMetadata {
  version: string;
  createdAt: string;
  type: 'full' | 'monthly' | 'settings';
  month?: string;
  collectionsIncluded: string[];
  documentCounts: Record<string, number>;
  totalDocuments: number;
  createdBy: string;
}

export interface BackupFile {
  metadata: BackupMetadata;
  collections: Record<string, Record<string, any>[]>;
}

export interface BackupHistoryEntry {
  id?: string;
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

export interface FirebaseUsageEstimate {
  generatedAt: string;
  collectionsScanned: number;
  totalDocuments: number;
  estimatedBytes: number;
  documentCounts: Record<string, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function readCollection(name: string): Promise<Record<string, any>[]> {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
}

async function clearCollection(name: string): Promise<void> {
  const snap = await getDocs(collection(db, name));
  const batchSize = 500;
  const docs = snap.docs;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + batchSize);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function writeDocuments(
  collectionName: string,
  documents: Record<string, any>[],
  mode: RestoreMode
): Promise<void> {
  if (mode === 'replace' || mode === 'full_reset') {
    await clearCollection(collectionName);
  }

  const batchSize = 500;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = documents.slice(i, i + batchSize);
    chunk.forEach((docData) => {
      const { _docId, ...fields } = docData;
      const ref = _docId
        ? doc(db, collectionName, _docId)
        : doc(collection(db, collectionName));
      batch.set(ref, fields, { merge: mode === 'merge' });
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

export function validateBackupFile(data: any): {
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

  const invalidCollections = Object.keys(data.collections).filter(
    (c) => !ALL_COLLECTIONS.includes(c as any)
  );
  if (invalidCollections.length > 0) {
    return {
      valid: false,
      error: `مجموعات غير معروفة: ${invalidCollections.join(', ')}`,
    };
  }

  return { valid: true };
}

// ─── Export Functions ────────────────────────────────────────────────────────

export const backupService = {
  async getUsageEstimate(): Promise<FirebaseUsageEstimate> {
    if (!isConfigured) throw new Error('Firebase not configured');

    const documentCounts: Record<string, number> = {};
    let totalDocuments = 0;
    let estimatedBytes = 0;

    for (const name of ALL_COLLECTIONS) {
      const docs = await readCollection(name);
      documentCounts[name] = docs.length;
      totalDocuments += docs.length;

      try {
        estimatedBytes += new Blob([JSON.stringify(docs)]).size;
      } catch {
        estimatedBytes += JSON.stringify(docs).length;
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      collectionsScanned: ALL_COLLECTIONS.length,
      totalDocuments,
      estimatedBytes,
      documentCounts,
    };
  },

  async exportFullBackup(createdBy: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase not configured');

    const collections: Record<string, Record<string, any>[]> = {};
    const documentCounts: Record<string, number> = {};
    let totalDocuments = 0;

    for (const name of ALL_COLLECTIONS) {
      const docs = await readCollection(name);
      collections[name] = docs;
      documentCounts[name] = docs.length;
      totalDocuments += docs.length;
    }

    const backup: BackupFile = {
      metadata: {
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        type: 'full',
        collectionsIncluded: [...ALL_COLLECTIONS],
        documentCounts,
        totalDocuments,
        createdBy,
      },
      collections,
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
      const allDocs = await readCollection(name);
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

    const collections: Record<string, Record<string, any>[]> = {};
    const documentCounts: Record<string, number> = {};
    let totalDocuments = 0;

    for (const name of SETTINGS_COLLECTIONS) {
      const docs = await readCollection(name);
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
    onProgress?: (step: string, progress: number) => void
  ): Promise<{ success: boolean; error?: string; restored: number }> {
    if (!isConfigured) {
      return { success: false, error: 'Firebase not configured', restored: 0 };
    }

    const validation = validateBackupFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error, restored: 0 };
    }

    try {
      // Safety: auto-backup before restore
      onProgress?.('إنشاء نسخة احتياطية تلقائية قبل الاستعادة...', 5);
      await this.exportFullBackup(`${createdBy} (auto-before-restore)`);

      const collectionNames = Object.keys(file.collections);
      let restored = 0;
      const total = collectionNames.length;

      for (let i = 0; i < collectionNames.length; i++) {
        const name = collectionNames[i];

        if (
          mode !== 'full_reset' &&
          !ALL_COLLECTIONS.includes(name as any)
        ) {
          continue;
        }

        onProgress?.(
          `استعادة ${name}...`,
          10 + Math.round((i / total) * 80)
        );

        const docs = file.collections[name];
        if (docs && docs.length > 0) {
          await writeDocuments(name, docs, mode);
          restored += docs.length;
        } else if (mode === 'full_reset' || mode === 'replace') {
          await clearCollection(name);
        }
      }

      // If full_reset, also clear collections not in the backup
      if (mode === 'full_reset') {
        onProgress?.('تنظيف المجموعات غير المشمولة...', 92);
        for (const name of ALL_COLLECTIONS) {
          if (!collectionNames.includes(name)) {
            await clearCollection(name);
          }
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
    } catch (error: any) {
      console.error('importBackup error:', error);
      return {
        success: false,
        error: error.message || 'حدث خطأ أثناء الاستعادة',
        restored: 0,
      };
    }
  },

  // ─── Backup History ────────────────────────────────────────────────────────

  async saveHistory(entry: BackupHistoryEntry): Promise<void> {
    if (!isConfigured) return;
    try {
      await addDoc(collection(db, BACKUPS_COLLECTION), entry);
    } catch (error) {
      console.error('backupService.saveHistory error:', error);
    }
  },

  async getHistory(maxEntries = 20): Promise<BackupHistoryEntry[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, BACKUPS_COLLECTION),
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
