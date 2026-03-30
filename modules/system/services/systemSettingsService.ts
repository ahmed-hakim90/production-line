import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { SystemSettings } from '../../../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';

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
};
