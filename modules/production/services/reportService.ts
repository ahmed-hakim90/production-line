import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  writeBatch,
  Unsubscribe,
  startAfter,
  QueryDocumentSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { ProductionReport } from '../../../types';
import { createReportDuplicateError } from '../utils/reportDuplicateError';

const COLLECTION = 'production_reports';
const UNIQUE_COLLECTION = 'production_report_uniques';
const MAX_PAGE_SIZE = 100;

function isMissingIndexError(error: unknown): boolean {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    code.includes('failed-precondition')
    || message.includes('requires an index')
    || message.includes('create it here')
    || message.includes('failed precondition')
  );
}

const normalizeKeyPart = (value: string) =>
  encodeURIComponent(String(value || '').trim().toLowerCase());

const resolveReportType = (value?: ProductionReport['reportType']): NonNullable<ProductionReport['reportType']> =>
  value === 'component_injection' ? 'component_injection' : 'finished_product';

const buildReportUniqueKey = (data: Pick<ProductionReport, 'date' | 'lineId' | 'employeeId' | 'productId' | 'reportType'>): string =>
  [
    normalizeKeyPart(data.date),
    normalizeKeyPart(data.lineId),
    normalizeKeyPart(data.employeeId),
    normalizeKeyPart(data.productId),
    normalizeKeyPart(resolveReportType(data.reportType)),
  ].join('__');

export type FirestoreCursor = QueryDocumentSnapshot | null;
export interface FirestorePageResult<T> {
  items: T[];
  nextCursor: FirestoreCursor;
  hasMore: boolean;
}

export interface ReportPagedParams {
  startDate: string;
  endDate: string;
  limit?: number;
  cursor?: FirestoreCursor;
  lineId?: string;
  productId?: string;
  employeeId?: string;
}

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
  async listByDateRangePaged(params: ReportPagedParams): Promise<FirestorePageResult<ProductionReport>> {
    if (!isConfigured) return { items: [], nextCursor: null, hasMore: false };
    const pageSize = Math.max(1, Math.min(Number(params.limit || 25), MAX_PAGE_SIZE));
    const constraints: any[] = [
      where('date', '>=', params.startDate),
      where('date', '<=', params.endDate),
      orderBy('date', 'desc'),
      limit(pageSize),
    ];
    if (params.lineId) constraints.unshift(where('lineId', '==', params.lineId));
    if (params.productId) constraints.unshift(where('productId', '==', params.productId));
    if (params.employeeId) constraints.unshift(where('employeeId', '==', params.employeeId));
    if (params.cursor) constraints.push(startAfter(params.cursor));
    const q = query(collection(db, COLLECTION), ...constraints);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
    const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { items, nextCursor, hasMore: snap.docs.length === pageSize };
  },

  async getAll(): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const reports: ProductionReport[] = [];
      let cursor: FirestoreCursor = null;
      const maxPages = 10;
      for (let page = 0; page < maxPages; page += 1) {
        const res = await this.listByDateRangePaged({
          startDate: '1900-01-01',
          endDate: '2999-12-31',
          limit: MAX_PAGE_SIZE,
          cursor,
        });
        reports.push(...res.items);
        if (!res.hasMore || !res.nextCursor) break;
        cursor = res.nextCursor;
      }
      return reports;
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
      const all: ProductionReport[] = [];
      let cursor: FirestoreCursor = null;
      do {
        const page = await this.listByDateRangePaged({
          startDate,
          endDate,
          limit: MAX_PAGE_SIZE,
          cursor,
        });
        all.push(...page.items);
        cursor = page.nextCursor;
        if (!page.hasMore) break;
      } while (cursor);
      return all;
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
      const reportRef = doc(collection(db, COLLECTION));
      const uniqueKey = buildReportUniqueKey({
        date: data.date,
        lineId: data.lineId,
        employeeId: data.employeeId,
        productId: data.productId,
        reportType: data.reportType,
      });
      const uniqueRef = doc(db, UNIQUE_COLLECTION, uniqueKey);

      await runTransaction(db, async (tx) => {
        const uniqueSnap = await tx.get(uniqueRef);
        if (uniqueSnap.exists()) {
          throw createReportDuplicateError();
        }

        tx.set(reportRef, {
          ...data,
          reportType: resolveReportType(data.reportType),
          reportCode,
          workersProductionCount: data.workersProductionCount ?? 0,
          workersPackagingCount: data.workersPackagingCount ?? 0,
          workersQualityCount: data.workersQualityCount ?? 0,
          workersMaintenanceCount: data.workersMaintenanceCount ?? 0,
          workersExternalCount: data.workersExternalCount ?? 0,
          createdAt: serverTimestamp(),
        });
        tx.set(uniqueRef, {
          reportId: reportRef.id,
          date: data.date,
          lineId: data.lineId,
          employeeId: data.employeeId,
          productId: data.productId,
          reportType: resolveReportType(data.reportType),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      return reportRef.id;
    } catch (error) {
      console.error('reportService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<ProductionReport>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, createdAt: _ts, ...fields } = data as any;
      if (Object.keys(fields).length === 0) return;

      const reportRef = doc(db, COLLECTION, id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(reportRef);
        if (!snap.exists()) {
          throw new Error('التقرير غير موجود أو تم حذفه بالفعل.');
        }

        const current = { id: snap.id, ...snap.data() } as ProductionReport;
        const next = { ...current, ...fields } as ProductionReport;
        const oldKey = buildReportUniqueKey(current);
        const nextKey = buildReportUniqueKey(next);

        if (oldKey !== nextKey) {
          const nextUniqueRef = doc(db, UNIQUE_COLLECTION, nextKey);
          const nextUniqueSnap = await tx.get(nextUniqueRef);
          if (nextUniqueSnap.exists()) {
            const ownerId = String((nextUniqueSnap.data() as { reportId?: string })?.reportId || '');
            if (!ownerId || ownerId !== id) {
              throw createReportDuplicateError();
            }
          }
          const oldUniqueRef = doc(db, UNIQUE_COLLECTION, oldKey);
          tx.delete(oldUniqueRef);
          tx.set(
            nextUniqueRef,
            {
              reportId: id,
              date: next.date,
              lineId: next.lineId,
              employeeId: next.employeeId,
              productId: next.productId,
              reportType: resolveReportType(next.reportType),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        } else {
          const sameUniqueRef = doc(db, UNIQUE_COLLECTION, nextKey);
          tx.set(sameUniqueRef, { reportId: id, updatedAt: serverTimestamp() }, { merge: true });
        }

        tx.update(reportRef, fields);
      });
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
      const reportRef = doc(db, COLLECTION, id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(reportRef);
        if (!snap.exists()) return;
        const current = { id: snap.id, ...snap.data() } as ProductionReport;
        tx.delete(reportRef);
        const uniqueRef = doc(db, UNIQUE_COLLECTION, buildReportUniqueKey(current));
        tx.delete(uniqueRef);
      });
    } catch (error) {
      console.error('reportService.delete error:', error);
      throw error;
    }
  },

  async getByLineAndProduct(lineId: string, productId: string, fromDate?: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const constraints: any[] = [
        where('lineId', '==', lineId),
        where('productId', '==', productId),
        orderBy('date', 'desc'),
        limit(MAX_PAGE_SIZE),
      ];
      if (fromDate) constraints.unshift(where('date', '>=', fromDate));
      const q = query(collection(db, COLLECTION), ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
    } catch (error) {
      const requiresIndex = isMissingIndexError(error);
      if (!requiresIndex) {
        console.error('reportService.getByLineAndProduct error:', error);
        throw error;
      }

      // Fallback for live environments where composite index is not yet deployed.
      // Uses index-free query (lineId only), then filters/sorts client-side.
      try {
        const fallbackQ = query(
          collection(db, COLLECTION),
          where('lineId', '==', lineId),
          limit(Math.max(MAX_PAGE_SIZE * 5, 500)),
        );
        const fallbackSnap = await getDocs(fallbackQ);
        let rows = fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
        rows = rows.filter((r) => r.productId === productId);
        if (fromDate) rows = rows.filter((r) => (r.date || '') >= fromDate);
        rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return rows.slice(0, MAX_PAGE_SIZE);
      } catch (fallbackError) {
        console.error('reportService.getByLineAndProduct fallback error:', fallbackError);
        throw fallbackError;
      }
    }
  },

  async getByProduct(productId: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('productId', '==', productId), orderBy('date', 'desc'), limit(MAX_PAGE_SIZE));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
    } catch (error) {
      const requiresIndex = isMissingIndexError(error);
      if (!requiresIndex) {
        console.error('reportService.getByProduct error:', error);
        throw error;
      }

      // Fallback for environments where the productId+date index is not deployed yet.
      // Uses index-free query (productId only), then sorts client-side by date.
      try {
        const fallbackQ = query(
          collection(db, COLLECTION),
          where('productId', '==', productId),
          limit(Math.max(MAX_PAGE_SIZE * 5, 500)),
        );
        const fallbackSnap = await getDocs(fallbackQ);
        const rows = fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
        rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return rows.slice(0, MAX_PAGE_SIZE);
      } catch (fallbackError) {
        console.error('reportService.getByProduct fallback error:', fallbackError);
        throw fallbackError;
      }
    }
  },

  async getByLine(lineId: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('lineId', '==', lineId), orderBy('date', 'desc'), limit(MAX_PAGE_SIZE));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
    } catch (error) {
      console.error('reportService.getByLine error:', error);
      throw error;
    }
  },

  async getByEmployee(employeeId: string): Promise<ProductionReport[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('employeeId', '==', employeeId), orderBy('date', 'desc'), limit(MAX_PAGE_SIZE));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
    } catch (error) {
      const requiresIndex = isMissingIndexError(error);
      if (!requiresIndex) {
        console.error('reportService.getByEmployee error:', error);
        throw error;
      }

      // Fallback for environments where employeeId+date index is not deployed yet.
      // Uses index-free query (employeeId only), then sorts client-side by date.
      try {
        const fallbackQ = query(
          collection(db, COLLECTION),
          where('employeeId', '==', employeeId),
          limit(Math.max(MAX_PAGE_SIZE * 5, 500)),
        );
        const fallbackSnap = await getDocs(fallbackQ);
        const rows = fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
        rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return rows.slice(0, MAX_PAGE_SIZE);
      } catch (fallbackError) {
        console.error('reportService.getByEmployee fallback error:', fallbackError);
        throw fallbackError;
      }
    }
  },

  async getByWorkOrderId(workOrderId: string): Promise<ProductionReport[]> {
    if (!isConfigured || !workOrderId) return [];
    try {
      const q = query(collection(db, COLLECTION), where('workOrderId', '==', workOrderId), orderBy('date', 'desc'), limit(MAX_PAGE_SIZE));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
    } catch (error) {
      const requiresIndex = isMissingIndexError(error);
      if (!requiresIndex) {
        console.error('reportService.getByWorkOrderId error:', error);
        throw error;
      }

      // Fallback for environments where workOrderId+date index is not deployed yet.
      // Uses index-free query (workOrderId only), then sorts client-side by date.
      try {
        const fallbackQ = query(
          collection(db, COLLECTION),
          where('workOrderId', '==', workOrderId),
          limit(Math.max(MAX_PAGE_SIZE * 5, 500)),
        );
        const fallbackSnap = await getDocs(fallbackQ);
        const rows = fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionReport));
        rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return rows.slice(0, MAX_PAGE_SIZE);
      } catch (fallbackError) {
        console.error('reportService.getByWorkOrderId fallback error:', fallbackError);
        throw fallbackError;
      }
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
