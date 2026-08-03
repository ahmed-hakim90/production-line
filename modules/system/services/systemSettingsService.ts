import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { SystemSettings } from '../../../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { mergeOperationPathSettingsPatch } from '../lib/operationPathSettings';

const COLLECTION = 'system_settings';

export const systemSettingsService = {
  async get(): Promise<SystemSettings | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, getCurrentTenantId()));
      if (!snap.exists()) return null;
      return snap.data() as SystemSettings;
    } catch (error) {
      console.error('systemSettingsService.get error:', error);
      return null;
    }
  },

  /** Strict read for mutation policy checks; provider errors must fail the operation closed. */
  async getStrict(): Promise<SystemSettings | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, COLLECTION, getCurrentTenantId()));
    return snap.exists() ? snap.data() as SystemSettings : null;
  },

  async set(data: SystemSettings): Promise<void> {
    if (!isConfigured) return;
    try {
      await setDoc(
        doc(db, COLLECTION, getCurrentTenantId()),
        { ...data, tenantId: getCurrentTenantId() } as Record<string, unknown>,
        { merge: true },
      );
    } catch (error) {
      console.error('systemSettingsService.set error:', error);
      throw error;
    }
  },

  async patch(data: Partial<SystemSettings>): Promise<SystemSettings> {
    if (!isConfigured) return data as SystemSettings;
    const tenantId = getCurrentTenantId();
    const ref = doc(db, COLLECTION, tenantId);
    try {
      return await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        const latest = snap.exists() ? snap.data() as SystemSettings : {} as SystemSettings;
        const next = {
          ...latest,
          ...data,
          tenantId,
          ...(data.operationPaths
            ? {
              operationPaths: mergeOperationPathSettingsPatch(
                latest.operationPaths,
                data.operationPaths,
              ),
            }
            : {}),
          ...(data.planSettings
            ? {
              planSettings: {
                ...(latest.planSettings ?? {}),
                ...data.planSettings,
                inventoryRouting: {
                  ...(latest.planSettings?.inventoryRouting ?? {}),
                  ...(data.planSettings.inventoryRouting ?? {}),
                },
                reportBehavior: {
                  ...(latest.planSettings?.reportBehavior ?? {}),
                  ...(data.planSettings.reportBehavior ?? {}),
                },
              },
            }
            : {}),
        } as SystemSettings;
        transaction.set(ref, next, { merge: true });
        return next;
      });
    } catch (error) {
      console.error('systemSettingsService.patch error:', error);
      throw error;
    }
  },
};
