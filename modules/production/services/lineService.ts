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
import { FirestoreProductionLine } from '../../../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';

const COLLECTION = 'production_lines';

const lineSortValue = (line: FirestoreProductionLine): number => {
  const value = Number(line.sortOrder || 0);
  return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
};

const sortLines = (lines: FirestoreProductionLine[]): FirestoreProductionLine[] => (
  [...lines].sort((a, b) => {
    const orderCompare = lineSortValue(a) - lineSortValue(b);
    if (orderCompare !== 0) return orderCompare;
    const codeCompare = (a.code || '').localeCompare((b.code || ''), 'en', {
      numeric: true,
      sensitivity: 'base',
    });
    if (codeCompare !== 0) return codeCompare;
    return (a.name || '').localeCompare(b.name || '', 'ar');
  })
);

export const lineService = {
  async getAll(): Promise<FirestoreProductionLine[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(tenantQuery(db, COLLECTION));
      return sortLines(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreProductionLine)));
    } catch (error) {
      console.error('lineService.getAll error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<FirestoreProductionLine | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as FirestoreProductionLine;
    } catch (error) {
      console.error('lineService.getById error:', error);
      throw error;
    }
  },

  async create(data: Omit<FirestoreProductionLine, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...(data as Record<string, unknown>),
        tenantId: getCurrentTenantId(),
      });
      return ref.id;
    } catch (error) {
      console.error('lineService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<FirestoreProductionLine>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('lineService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('lineService.delete error:', error);
      throw error;
    }
  },
};
