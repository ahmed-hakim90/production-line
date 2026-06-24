/**
 * HR Config Audit Logger
 *
 * Logs every configuration change with:
 *   - Which module changed
 *   - Previous/new version numbers
 *   - Which fields changed
 *   - Who made the change
 */
import { addDoc, serverTimestamp, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import { hrConfigAuditLogsRef } from './collections';
import type {
  HRConfigModuleName,
  HRConfigAuditAction,
  FirestoreHRConfigAuditLog,
} from './types';

export const hrConfigAuditService = {
  async log(
    module: HRConfigModuleName,
    action: HRConfigAuditAction,
    previousVersion: number,
    newVersion: number,
    changedFields: string[],
    performedBy: string,
    details: string,
  ): Promise<void> {
    if (!isConfigured) return;

    await addDoc(hrConfigAuditLogsRef(), {
      tenantId: getCurrentTenantId(),
      module,
      action,
      previousVersion,
      newVersion,
      changedFields,
      performedBy,
      timestamp: serverTimestamp(),
      details,
    } satisfies Omit<FirestoreHRConfigAuditLog, 'id'>);
  },

  async getByModule(
    module: HRConfigModuleName,
    maxResults = 50,
  ): Promise<FirestoreHRConfigAuditLog[]> {
    if (!isConfigured) return [];

    const q = query(
      hrConfigAuditLogsRef(),
      where('module', '==', module),
      orderBy('timestamp', 'desc'),
      limit(maxResults),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreHRConfigAuditLog));
  },

  async getRecent(maxResults = 100): Promise<FirestoreHRConfigAuditLog[]> {
    if (!isConfigured) return [];

    const q = query(
      hrConfigAuditLogsRef(),
      orderBy('timestamp', 'desc'),
      limit(maxResults),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreHRConfigAuditLog));
  },
};
