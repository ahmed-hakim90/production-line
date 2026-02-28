import { addDoc, collection, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { RawMaterial } from '../types';

const COLLECTION = 'raw_materials';

export const rawMaterialService = {
  async getAll(): Promise<RawMaterial[]> {
    if (!isConfigured) return [];
    const q = query(collection(db, COLLECTION), orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RawMaterial));
  },

  async create(payload: Omit<RawMaterial, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(collection(db, COLLECTION), {
      ...payload,
      createdAt: new Date().toISOString(),
    });
    return ref.id;
  },

  async update(id: string, payload: Partial<RawMaterial>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, ...data } = payload as RawMaterial;
    await updateDoc(doc(db, COLLECTION, id), data as any);
  },
};
