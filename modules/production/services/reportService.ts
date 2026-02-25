import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { ProductionReport } from '../../../types';

const COLLECTION = 'production_reports';

export const reportService = {
  async getAll(): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
    } catch (error) {
      console.error('reportService.getAll error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<ProductionReport | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as ProductionReport;
    } catch (error) {
      console.error('reportService.getById error:', error);
      throw error;
    }
  },

  async getByDateRange(startDate: string, endDate: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
    } catch (error) {
      console.error('reportService.getByDateRange error:', error);
      throw error;
    }
  },

  async existsForLineAndDate(lineId: string, date: string): Promise<boolean> {
    if (!isConfigured) return false;
    try {
      const q = query(collection(db, COLLECTION), where('lineId', '==', lineId), where('date', '==', date));
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (error) {
      console.error('reportService.existsForLineAndDate error:', error);
      throw error;
    }
  },

  async create(data: Omit<ProductionReport, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;

    const required: (keyof typeof data)[] = [
      'employeeId',
      'productId',
      'lineId',
      'date',
      'quantityProduced',
      'workersCount',
      'workHours',
    ];
    for (const field of required) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    try {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        quantityWaste: data.quantityWaste ?? 0,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      console.error('reportService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<ProductionReport>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, createdAt: _ts, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('reportService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('reportService.delete error:', error);
      throw error;
    }
  },

  async getByLineAndProduct(lineId: string, productId: string, fromDate?: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('lineId', '==', lineId));
      const snap = await getDocs(q);
      let reports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
      reports = reports.filter((r) => r.productId === productId);
      if (fromDate) reports = reports.filter((r) => r.date >= fromDate);
      return reports.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (error) {
      console.error('reportService.getByLineAndProduct error:', error);
      throw error;
    }
  },

  async getByProduct(productId: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('productId', '==', productId));
      const snap = await getDocs(q);
      const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
      return reports.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (error) {
      console.error('reportService.getByProduct error:', error);
      throw error;
    }
  },

  async getByLine(lineId: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('lineId', '==', lineId));
      const snap = await getDocs(q);
      const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
      return reports.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (error) {
      console.error('reportService.getByLine error:', error);
      throw error;
    }
  },

  async getByEmployee(employeeId: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('employeeId', '==', employeeId));
      const snap = await getDocs(q);
      const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
      return reports.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (error) {
      console.error('reportService.getByEmployee error:', error);
      throw error;
    }
  },

  async getByWorkOrderId(workOrderId: string): Promise<ProductionReport[]> {
    if (!isConfigured || !workOrderId) return [];
    try {
      const q = query(collection(db, COLLECTION), where('workOrderId', '==', workOrderId));
      const snap = await getDocs(q);
      const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
      return reports.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (error) {
      console.error('reportService.getByWorkOrderId error:', error);
      throw error;
    }
  },

  subscribeToday(todayStr: string, onData: (reports: ProductionReport[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = query(collection(db, COLLECTION), where('date', '==', todayStr));
    return onSnapshot(q, (snap) => {
      const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
      onData(reports);
    });
  },
};
