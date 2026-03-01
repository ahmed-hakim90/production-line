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
  limit,
  serverTimestamp,
  onSnapshot,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { ProductionReport } from '../../../types';

const COLLECTION = 'production_reports';

async function generateNextReportCode(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return `PR-${year}-0001`;

    const latest = snap.docs[0].data() as Partial<ProductionReport>;
    const latestCode = latest.reportCode ?? '';
    const match = /^PR-(\d{4})-(\d+)$/.exec(latestCode);

    if (!match) return `PR-${year}-0001`;
    const codeYear = Number(match[1]);
    const codeSeq = Number(match[2]) || 0;
    if (codeYear !== year) return `PR-${year}-0001`;

    return `PR-${year}-${String(codeSeq + 1).padStart(4, '0')}`;
  } catch {
    return `PR-${year}-${Date.now().toString().slice(-4)}`;
  }
}

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
      const reportCode = data.reportCode || await generateNextReportCode();
      const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        reportCode,
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

  async updateByReportCode(reportCode: string, fields: Partial<ProductionReport>): Promise<boolean> {
    if (!isConfigured || !reportCode) return false;
    try {
      const q = query(
        collection(db, COLLECTION),
        where('reportCode', '==', reportCode),
        limit(1),
      );
      const snap = await getDocs(q);
      if (snap.empty) return false;
      const { id: _id, createdAt: _ts, reportCode: _code, ...updatable } = fields as any;
      if (Object.keys(updatable).length === 0) return false;
      await updateDoc(snap.docs[0].ref, updatable);
      return true;
    } catch (error) {
      console.error('reportService.updateByReportCode error:', error);
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

  async backfillMissingReportCodes(): Promise<number> {
    if (!isConfigured) return 0;
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      if (snap.empty) return 0;

      const codeRegex = /^PR-(\d{4})-(\d+)$/;
      const maxSeqByYear = new Map<number, number>();

      const records = snap.docs.map((d) => {
        const data = d.data() as ProductionReport;
        return { id: d.id, ref: d.ref, data };
      });

      records.forEach(({ data }) => {
        const code = data.reportCode || '';
        const match = codeRegex.exec(code);
        if (!match) return;
        const year = Number(match[1]);
        const seq = Number(match[2]) || 0;
        const prev = maxSeqByYear.get(year) || 0;
        if (seq > prev) maxSeqByYear.set(year, seq);
      });

      const getMs = (r: ProductionReport): number => {
        const createdAt = r.createdAt as any;
        if (createdAt?.toDate) return createdAt.toDate().getTime();
        if (typeof createdAt?.seconds === 'number') return createdAt.seconds * 1000;
        if (createdAt) {
          const parsed = new Date(createdAt).getTime();
          if (!Number.isNaN(parsed)) return parsed;
        }
        const parsedDate = new Date(r.date).getTime();
        return Number.isNaN(parsedDate) ? 0 : parsedDate;
      };

      const getYear = (r: ProductionReport): number => {
        if (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
          return Number(r.date.slice(0, 4));
        }
        const ms = getMs(r);
        if (ms > 0) return new Date(ms).getFullYear();
        return new Date().getFullYear();
      };

      const missing = records
        .filter(({ data }) => !data.reportCode)
        .sort((a, b) => {
          const t = getMs(a.data) - getMs(b.data);
          if (t !== 0) return t;
          return a.id.localeCompare(b.id);
        });

      if (missing.length === 0) return 0;

      let updated = 0;
      let batch = writeBatch(db);
      let batchOps = 0;

      for (const rec of missing) {
        const year = getYear(rec.data);
        const nextSeq = (maxSeqByYear.get(year) || 0) + 1;
        maxSeqByYear.set(year, nextSeq);
        const reportCode = `PR-${year}-${String(nextSeq).padStart(4, '0')}`;

        batch.update(rec.ref, { reportCode });
        batchOps++;
        updated++;

        if (batchOps >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          batchOps = 0;
        }
      }

      if (batchOps > 0) await batch.commit();
      return updated;
    } catch (error) {
      console.error('reportService.backfillMissingReportCodes error:', error);
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
