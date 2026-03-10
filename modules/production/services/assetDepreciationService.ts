import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { AssetDepreciation } from '../../../types';

const COLLECTION = 'asset_depreciations';

const buildDocId = (assetId: string, period: string) => `${assetId}_${period}`;

export const assetDepreciationService = {
  buildDocId,

  async getByPeriod(period: string): Promise<AssetDepreciation[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('period', '==', period));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AssetDepreciation));
    } catch (error) {
      console.error('assetDepreciationService.getByPeriod error:', error);
      throw error;
    }
  },

  async getByAsset(assetId: string): Promise<AssetDepreciation[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('assetId', '==', assetId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as AssetDepreciation))
        .sort((a, b) => String(b.period || '').localeCompare(String(a.period || '')));
    } catch (error) {
      console.error('assetDepreciationService.getByAsset error:', error);
      throw error;
    }
  },

  async getByYear(year: string): Promise<AssetDepreciation[]> {
    if (!isConfigured) return [];
    try {
      const start = `${year}-01`;
      const end = `${year}-12`;
      const q = query(
        collection(db, COLLECTION),
        where('period', '>=', start),
        where('period', '<=', end),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AssetDepreciation));
    } catch (error) {
      console.error('assetDepreciationService.getByYear error:', error);
      throw error;
    }
  },

  async upsert(entry: Omit<AssetDepreciation, 'id' | 'createdAt'>): Promise<void> {
    if (!isConfigured) return;
    try {
      const docId = buildDocId(entry.assetId, entry.period);
      await setDoc(doc(db, COLLECTION, docId), {
        ...entry,
        createdAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error('assetDepreciationService.upsert error:', error);
      throw error;
    }
  },
};
