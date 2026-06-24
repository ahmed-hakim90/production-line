import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type {
  ProductionAttendanceRecord,
  ProductionReport,
} from '../../../types';
import { buildProductionAttendanceRecords } from '../utils/productionAttendanceRecords';

const COLLECTION = 'production_attendance_records';
const REPORTS_COLLECTION = 'production_reports';
const MAX_PAGE_SIZE = 500;

export type ProductionAttendanceListParams = {
  startDate: string;
  endDate: string;
  lineId?: string;
  status?: ProductionAttendanceRecord['status'] | 'all';
};

const cleanText = (value: unknown): string => String(value || '').trim();

const stripUndefined = <T extends Record<string, unknown>>(value: T): T => (
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
);

const recordKey = (
  reportId: string,
  row: Pick<ProductionAttendanceRecord, 'employeeId' | 'workerId' | 'source'>,
): string => {
  const subject = cleanText(row.employeeId) || cleanText(row.workerId) || row.source;
  return `${reportId}_${encodeURIComponent(subject)}`;
};

const isPermissionDenied = (error: unknown): boolean => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return code.includes('permission-denied') || message.includes('missing or insufficient permissions');
};

const isMissingIndexError = (error: unknown): boolean => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    code.includes('failed-precondition')
    || message.includes('requires an index')
    || message.includes('create it here')
    || message.includes('failed precondition')
  );
};

const isNotFound = (error: unknown): boolean => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return code.includes('not-found') || message.includes('no document to update');
};

const filterRows = (
  rows: ProductionAttendanceRecord[],
  params: ProductionAttendanceListParams,
): ProductionAttendanceRecord[] => rows.filter((row) => (
  row.date >= params.startDate
  && row.date <= params.endDate
  && (!params.lineId || row.lineId === params.lineId)
  && (!params.status || params.status === 'all' || row.status === params.status)
));

async function listFromReports(params: ProductionAttendanceListParams): Promise<ProductionAttendanceRecord[]> {
  const constraints: any[] = [
    where('date', '>=', params.startDate),
    where('date', '<=', params.endDate),
    orderBy('date', 'desc'),
    limit(MAX_PAGE_SIZE),
  ];
  if (params.lineId) constraints.unshift(where('lineId', '==', params.lineId));

  const snap = await getDocs(tenantQuery(db, REPORTS_COLLECTION, ...constraints));
  return filterRows(
    snap.docs.flatMap((item) => buildProductionAttendanceRecords({
      id: item.id,
      ...item.data(),
    } as ProductionReport)),
    params,
  );
}

async function updateReportAttendanceStatus(
  record: ProductionAttendanceRecord,
  status: ProductionAttendanceRecord['status'],
): Promise<void> {
  if (!record.reportId) throw new Error('لا يمكن تحديث سجل حضور غير مرتبط بتقرير إنتاج.');

  const reportRef = doc(db, REPORTS_COLLECTION, record.reportId);
  const snap = await getDoc(reportRef);
  if (!snap.exists()) throw new Error('تعذر العثور على تقرير الإنتاج المرتبط بسجل الحضور.');

  const report = { id: snap.id, ...snap.data() } as ProductionReport;
  const isPresent = status === 'present';

  if (record.source === 'shift_workers') {
    const employeeId = cleanText(record.employeeId);
    const shiftWorkers = (report.shiftWorkers || []).map((worker) => (
      cleanText(worker.employeeId) === employeeId ? { ...worker, isPresent } : worker
    ));
    await updateDoc(reportRef, { shiftWorkers, updatedAt: serverTimestamp() });
    return;
  }

  const workerId = cleanText(record.workerId);
  const workerOutputs = (report.workerOutputs || []).map((worker) => (
    cleanText(worker.workerId) === workerId ? { ...worker, isPresent } : worker
  ));
  await updateDoc(reportRef, { workerOutputs, updatedAt: serverTimestamp() });
}

export const productionAttendanceService = {
  buildRecords: buildProductionAttendanceRecords,

  async replaceForReport(report: ProductionReport): Promise<number> {
    if (!isConfigured || !report.id) return 0;
    try {
      const rows = buildProductionAttendanceRecords(report);
      const existing = await getDocs(
        tenantQuery(db, COLLECTION, where('reportId', '==', report.id)),
      );
      if (existing.empty && rows.length === 0) return 0;

      const batch = writeBatch(db);
      existing.docs.forEach((item) => batch.delete(item.ref));

      rows.forEach((row) => {
        const rowId = row.id || recordKey(report.id as string, row);
        batch.set(doc(db, COLLECTION, rowId), stripUndefined({
          ...row,
          id: undefined,
          tenantId: getCurrentTenantId(),
          recordedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }));
      });

      await batch.commit();
      return rows.length;
    } catch (error) {
      if (isPermissionDenied(error)) return 0;
      throw error;
    }
  },

  async deleteForReport(reportId: string): Promise<number> {
    if (!isConfigured || !reportId) return 0;
    try {
      const existing = await getDocs(
        tenantQuery(db, COLLECTION, where('reportId', '==', reportId)),
      );
      if (existing.empty) return 0;
      const batch = writeBatch(db);
      existing.docs.forEach((item) => batch.delete(item.ref));
      await batch.commit();
      return existing.size;
    } catch (error) {
      if (isPermissionDenied(error)) return 0;
      throw error;
    }
  },

  async deleteByIds(ids: string[]): Promise<number> {
    if (!isConfigured || ids.length === 0) return 0;
    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(doc(db, COLLECTION, id)));
    await batch.commit();
    return ids.length;
  },

  async list(params: ProductionAttendanceListParams): Promise<ProductionAttendanceRecord[]> {
    if (!isConfigured) return [];
    const constraints: any[] = [
      where('date', '>=', params.startDate),
      where('date', '<=', params.endDate),
      orderBy('date', 'desc'),
      limit(MAX_PAGE_SIZE),
    ];
    if (params.lineId) constraints.unshift(where('lineId', '==', params.lineId));
    if (params.status && params.status !== 'all') constraints.unshift(where('status', '==', params.status));
    try {
      const snap = await getDocs(tenantQuery(db, COLLECTION, ...constraints));
      const rows = snap.docs.map((item) => ({ id: item.id, ...item.data() } as ProductionAttendanceRecord));
      if (rows.length > 0) return rows;

      // Newly added attendance records are materialized from report saves/closes.
      // Existing closed reports may not have backfilled documents yet, so derive them at read time.
      return listFromReports(params);
    } catch (error) {
      if (!isPermissionDenied(error) && !isMissingIndexError(error)) throw error;
      return listFromReports(params);
    }
  },

  async updateStatus(
    id: string,
    status: ProductionAttendanceRecord['status'],
    notes?: string,
  ): Promise<void> {
    if (!isConfigured || !id) return;
    const batch = writeBatch(db);
    batch.update(doc(collection(db, COLLECTION), id), stripUndefined({
      status,
      notes: cleanText(notes) || undefined,
      updatedAt: serverTimestamp(),
    }));
    await batch.commit();
  },

  async updateRecordStatus(
    record: ProductionAttendanceRecord,
    status: ProductionAttendanceRecord['status'],
  ): Promise<void> {
    if (!isConfigured || !record.id) return;
    try {
      await this.updateStatus(record.id, status, record.notes);
    } catch (error) {
      if (!isPermissionDenied(error) && !isNotFound(error)) throw error;
      await updateReportAttendanceStatus(record, status);
    }
  },
};
