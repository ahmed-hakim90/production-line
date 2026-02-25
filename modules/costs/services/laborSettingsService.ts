import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { LaborSettings } from '../../../types';

const COLLECTION = 'labor_settings';
const DOC_ID = 'default';

export const laborSettingsService = {
  async get(): Promise<LaborSettings | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, DOC_ID));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as LaborSettings;
    } catch (error) {
      console.error('laborSettingsService.get error:', error);
      throw error;
    }
  },

  async set(data: Omit<LaborSettings, 'id'>): Promise<void> {
    if (!isConfigured) return;
    try {
      await setDoc(doc(db, COLLECTION, DOC_ID), data, { merge: true });
    } catch (error) {
      console.error('laborSettingsService.set error:', error);
      throw error;
    }
  },
};
