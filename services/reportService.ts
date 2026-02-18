/**
 * Production Report Service — CRUD + date queries for "production_reports"
 */
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
import { db, isConfigured } from './firebase';
import { ProductionReport } from '../types';

const COLLECTION = 'production_reports';

export const reportService = {
  async getAll(): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as ProductionReport)
      );
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

  /**
   * Fetch reports filtered by date range.
   * Dates are stored as "YYYY-MM-DD" strings.
   */
  async getByDateRange(
    startDate: string,
    endDate: string
  ): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as ProductionReport)
      );
    } catch (error) {
      console.error('reportService.getByDateRange error:', error);
      throw error;
    }
  },

  /**
   * Check if a report already exists for the same line + date (duplicate guard).
   */
  async existsForLineAndDate(
    lineId: string,
    date: string
  ): Promise<boolean> {
    if (!isConfigured) return false;
    try {
      const q = query(
        collection(db, COLLECTION),
        where('lineId', '==', lineId),
        where('date', '==', date)
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (error) {
      console.error('reportService.existsForLineAndDate error:', error);
      throw error;
    }
  },

  /**
   * Create a report. Uses serverTimestamp() for createdAt.
   * Validates required fields before writing.
   */
  async create(
    data: Omit<ProductionReport, 'id' | 'createdAt'>
  ): Promise<string | null> {
    if (!isConfigured) return null;

    // Required field validation
    const required: (keyof typeof data)[] = [
      'supervisorId',
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

  /**
   * Fetch reports for a specific line + product combo.
   * Queries by lineId only (single-field index), filters productId + date in memory
   * to avoid requiring a Firestore composite index.
   */
  async getByLineAndProduct(
    lineId: string,
    productId: string,
    fromDate?: string
  ): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('lineId', '==', lineId)
      );
      const snap = await getDocs(q);
      let reports = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as ProductionReport)
      );
      reports = reports.filter((r) => r.productId === productId);
      if (fromDate) {
        reports = reports.filter((r) => r.date >= fromDate);
      }
      return reports.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (error) {
      console.error('reportService.getByLineAndProduct error:', error);
      throw error;
    }
  },

  /**
   * Fetch reports filtered by product.
   * Sorts in-memory to avoid needing a Firestore composite index.
   */
  async getByProduct(productId: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('productId', '==', productId)
      );
      const snap = await getDocs(q);
      const reports = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as ProductionReport)
      );
      return reports.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (error) {
      console.error('reportService.getByProduct error:', error);
      throw error;
    }
  },

  /**
   * Fetch reports filtered by line.
   * Sorts in-memory to avoid needing a Firestore composite index.
   */
  async getByLine(lineId: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('lineId', '==', lineId)
      );
      const snap = await getDocs(q);
      const reports = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as ProductionReport)
      );
      return reports.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (error) {
      console.error('reportService.getByLine error:', error);
      throw error;
    }
  },

  /**
   * Fetch reports filtered by supervisor.
   * Sorts in-memory to avoid needing a Firestore composite index.
   */
  async getBySupervisor(supervisorId: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('supervisorId', '==', supervisorId)
      );
      const snap = await getDocs(q);
      const reports = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as ProductionReport)
      );
      return reports.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (error) {
      console.error('reportService.getBySupervisor error:', error);
      throw error;
    }
  },

  /**
   * Real-time listener for today's reports.
   * Returns an unsubscribe function.
   */
  subscribeToday(
    todayStr: string,
    onData: (reports: ProductionReport[]) => void
  ): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = query(
      collection(db, COLLECTION),
      where('date', '==', todayStr)
    );
    return onSnapshot(q, (snap) => {
      const reports = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as ProductionReport)
      );
      onData(reports);
    });
  },
};
