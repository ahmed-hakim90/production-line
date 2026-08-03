/**
 * HR Config Firestore Collection References
 *
 * Structure:
 *   hr_config_modules/{tenantId}__{moduleName}  — one doc per tenant+module
 *   hr_config_audit_logs                        — audit trail for all config changes
 *
 * Legacy docs used `{moduleName}` only; dual-read via hrConfigModuleLegacyDocRef.
 */
import {
  collection,
  doc,
  CollectionReference,
  DocumentReference,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import type { HRConfigModuleName } from './types';

export const HR_CONFIG_COLLECTIONS = {
  HR_CONFIG_MODULES: 'hr_config_modules',
  HR_CONFIG_AUDIT_LOGS: 'hr_config_audit_logs',
} as const;

export function hrConfigTenantModuleDocId(moduleName: HRConfigModuleName, tenantId?: string): string {
  const tid = String(tenantId || getCurrentTenantId()).trim();
  return `${tid}__${moduleName}`;
}

export function hrConfigModulesRef(): CollectionReference {
  return collection(db, HR_CONFIG_COLLECTIONS.HR_CONFIG_MODULES);
}

export function hrConfigModuleDocRef(moduleName: HRConfigModuleName): DocumentReference {
  return doc(
    db,
    HR_CONFIG_COLLECTIONS.HR_CONFIG_MODULES,
    hrConfigTenantModuleDocId(moduleName),
  );
}

/** Pre-multi-tenant doc id (module name only). */
export function hrConfigModuleLegacyDocRef(moduleName: HRConfigModuleName): DocumentReference {
  return doc(db, HR_CONFIG_COLLECTIONS.HR_CONFIG_MODULES, moduleName);
}

export function hrConfigAuditLogsRef(): CollectionReference {
  return collection(db, HR_CONFIG_COLLECTIONS.HR_CONFIG_AUDIT_LOGS);
}
