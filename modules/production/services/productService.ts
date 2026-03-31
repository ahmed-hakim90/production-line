import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { FirestoreProduct } from '../../../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';

const COLLECTION = 'products';

export const productService = {
  async getAll(): Promise<FirestoreProduct[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(tenantQuery(db, COLLECTION));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreProduct));
    } catch (error) {
      console.error('productService.getAll error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<FirestoreProduct | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as FirestoreProduct;
    } catch (error) {
      console.error('productService.getById error:', error);
      throw error;
    }
  },

  async create(data: Omit<FirestoreProduct, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...(data as Record<string, unknown>),
        tenantId: getCurrentTenantId(),
      });
      return ref.id;
    } catch (error) {
      console.error('productService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<FirestoreProduct>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('productService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('productService.delete error:', error);
      throw error;
    }
  },
};
