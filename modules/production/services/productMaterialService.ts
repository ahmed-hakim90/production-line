import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantIdOrNull } from '../../../lib/currentTenant';
import { ProductMaterial } from '../../../types';

const COLLECTION = 'product_materials';

export const productMaterialService = {
  async getAll(): Promise<ProductMaterial[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) return [];
    try {
      const q = query(collection(db, COLLECTION), where('tenantId', '==', tenantId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductMaterial));
    } catch (error) {
      console.error('productMaterialService.getAll error:', error);
      throw error;
    }
  },

  async getByProduct(productId: string): Promise<ProductMaterial[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('tenantId', '==', tenantId),
        where('productId', '==', productId)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductMaterial));
    } catch (error) {
      console.error('productMaterialService.getByProduct error:', error);
      throw error;
    }
  },

  async create(data: Omit<ProductMaterial, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), { ...data, tenantId });
      return ref.id;
    } catch (error) {
      console.error('productMaterialService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<ProductMaterial>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('productMaterialService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('productMaterialService.delete error:', error);
      throw error;
    }
  },
};
