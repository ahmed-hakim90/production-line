import { addDoc, collection, getDocs, orderBy, query, updateDoc, doc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { Warehouse } from '../types';

const COLLECTION = 'warehouses';

export const warehouseService = {
  async getAll(): Promise<Warehouse[]> {
    if (!isConfigured) return [];
    const q = query(collection(db, COLLECTION), orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Warehouse));
  },

  async create(payload: Omit<Warehouse, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(collection(db, COLLECTION), {
      ...payload,
      createdAt: new Date().toISOString(),
    });
    return ref.id;
  },

  async update(id: string, payload: Partial<Warehouse>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, ...data } = payload as Warehouse;
    await updateDoc(doc(db, COLLECTION, id), data as any);
  },
};
