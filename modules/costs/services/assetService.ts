import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { Asset, AssetDepreciationMethod } from '../../../types';

const COLLECTION = 'assets';

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min = 0): number => (value < min ? min : value);

export const calculateMonthlyDepreciation = (
  purchaseCost: number,
  salvageValue: number,
  usefulLifeMonths: number,
  method: AssetDepreciationMethod,
): number => {
  const safeCost = clamp(toNumber(purchaseCost));
  const safeSalvage = clamp(toNumber(salvageValue));
  const safeLife = Math.max(1, Math.floor(toNumber(usefulLifeMonths, 1)));
  const depreciable = Math.max(0, safeCost - safeSalvage);

  // MVP: declining balance is reserved for future iterations.
  if (method === 'declining_balance') {
    return depreciable / safeLife;
  }
  return depreciable / safeLife;
};

const buildComputedValues = (base: Partial<Asset>): Pick<Asset, 'monthlyDepreciation' | 'currentValue' | 'accumulatedDepreciation'> => {
  const purchaseCost = clamp(toNumber(base.purchaseCost));
  const salvageValue = clamp(toNumber(base.salvageValue));
  const usefulLifeMonths = Math.max(1, Math.floor(toNumber(base.usefulLifeMonths, 1)));
  const depreciationMethod = (base.depreciationMethod || 'straight_line') as AssetDepreciationMethod;
  const accumulatedDepreciation = clamp(toNumber(base.accumulatedDepreciation));
  const monthlyDepreciation = clamp(
    calculateMonthlyDepreciation(purchaseCost, salvageValue, usefulLifeMonths, depreciationMethod),
  );
  const currentValue = clamp(purchaseCost - accumulatedDepreciation, salvageValue);

  return {
    monthlyDepreciation,
    accumulatedDepreciation,
    currentValue,
  };
};

const normalizeAssetPayload = (data: Partial<Asset>): Partial<Asset> => {
  const purchaseCost = clamp(toNumber(data.purchaseCost));
  const salvageValue = clamp(toNumber(data.salvageValue));
  const usefulLifeMonths = Math.max(1, Math.floor(toNumber(data.usefulLifeMonths, 1)));
  const depreciationMethod = (data.depreciationMethod || 'straight_line') as AssetDepreciationMethod;
  const computed = buildComputedValues({
    ...data,
    purchaseCost,
    salvageValue,
    usefulLifeMonths,
    depreciationMethod,
  });

  return {
    ...data,
    purchaseCost,
    salvageValue,
    usefulLifeMonths,
    depreciationMethod,
    ...computed,
    status: data.status || 'active',
  };
};

const mergeWithExisting = (existing: Asset, patch: Partial<Asset>): Partial<Asset> => ({
  ...existing,
  ...patch,
});

export const assetService = {
  async getAll(): Promise<Asset[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Asset));
    } catch (error) {
      console.error('assetService.getAll error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<Asset | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Asset;
    } catch (error) {
      console.error('assetService.getById error:', error);
      throw error;
    }
  },

  async getActive(): Promise<Asset[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('status', '==', 'active'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Asset));
    } catch (error) {
      console.error('assetService.getActive error:', error);
      throw error;
    }
  },

  async create(data: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const payload = normalizeAssetPayload(data);
      const ref = await addDoc(collection(db, COLLECTION), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      console.error('assetService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<Asset>): Promise<void> {
    if (!isConfigured) return;
    try {
      const existing = await this.getById(id);
      if (!existing) throw new Error('Asset not found');
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = data as Asset;
      const merged = mergeWithExisting(existing, rest);
      const payload = normalizeAssetPayload(merged);
      await updateDoc(doc(db, COLLECTION, id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('assetService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('assetService.delete error:', error);
      throw error;
    }
  },
};
