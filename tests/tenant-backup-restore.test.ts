/**
 * Pure-logic tests for tenant-scoped backup restore validation.
 * Avoid importing services/backupService (pulls Vite firebase env).
 */
import assert from 'node:assert/strict';

const BACKUP_VERSION = '2.1.0';

function validateBackupFile(data: any, expectedTenantId?: string | null): {
  valid: boolean;
  error?: string;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'ملف غير صالح — ليس كائن JSON' };
  }
  if (!data.metadata?.version) {
    return { valid: false, error: 'الملف لا يحتوي على رقم الإصدار' };
  }
  const [major] = String(data.metadata.version).split('.');
  const [currentMajor] = BACKUP_VERSION.split('.');
  if (major !== currentMajor) {
    return { valid: false, error: 'إصدار غير متوافق' };
  }
  if (!data.collections || typeof data.collections !== 'object') {
    return { valid: false, error: 'الملف لا يحتوي على بيانات المجموعات (collections)' };
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

const base = {
  metadata: {
    version: '2.1.0',
    createdAt: new Date().toISOString(),
    type: 'full' as const,
    tenantId: 'tenantA',
    collectionsIncluded: ['products'],
    documentCounts: { products: 1 },
    totalDocuments: 1,
    createdBy: 'test',
  },
  collections: {
    products: [{ _docId: 'p1', tenantId: 'tenantA', name: 'P1' }],
  },
};

assert.equal(validateBackupFile(base, 'tenantA').valid, true);
assert.equal(validateBackupFile(base, 'tenantB').valid, false);
assert.match(String(validateBackupFile(base, 'tenantB').error), /مستأجراً آخر/);

const noTenant = {
  ...base,
  metadata: { ...base.metadata, tenantId: undefined },
};
assert.equal(validateBackupFile(noTenant, 'tenantA').valid, false);
assert.match(String(validateBackupFile(noTenant, 'tenantA').error), /metadata\.tenantId/);

assert.equal(validateBackupFile(base).valid, true);

console.log('tenant-backup-restore.test.ts: ok');
