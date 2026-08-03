import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { LaborSettings } from '../../../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';

const COLLECTION = 'labor_settings';
/** Legacy shared doc — dual-read during migration only. */
const LEGACY_DOC_ID = 'default';

function tenantDocId(): string {
  return getCurrentTenantId();
}

export const laborSettingsService = {
  async get(): Promise<LaborSettings | null> {
    if (!isConfigured) return null;
    try {
      const tid = tenantDocId();
      const snap = await getDoc(doc(db, COLLECTION, tid));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as LaborSettings;
      }
      // Dual-read legacy shared doc (pre-multi-tenant). Prefer tenant doc once written.
      const legacy = await getDoc(doc(db, COLLECTION, LEGACY_DOC_ID));
      if (!legacy.exists()) return null;
      return { id: legacy.id, ...legacy.data() } as LaborSettings;
    } catch (error) {
      console.error('laborSettingsService.get error:', error);
      throw error;
    }
  },

  async set(data: Omit<LaborSettings, 'id'>): Promise<void> {
    if (!isConfigured) return;
    try {
      const tid = tenantDocId();
      await setDoc(
        doc(db, COLLECTION, tid),
        { ...data, tenantId: tid },
        { merge: true },
      );
    } catch (error) {
      console.error('laborSettingsService.set error:', error);
      throw error;
    }
  },
};
