import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { SystemSettings } from '../../../types';

const COLLECTION = 'system_settings';
const DOC_ID = 'global';

export const systemSettingsService = {
  async get(): Promise<SystemSettings | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, DOC_ID));
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
      await setDoc(doc(db, COLLECTION, DOC_ID), data, { merge: true });
    } catch (error) {
      console.error('systemSettingsService.set error:', error);
      throw error;
    }
  },
};
