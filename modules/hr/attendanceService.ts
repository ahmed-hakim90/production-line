import {
  addDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import {
  attendanceImportHistoryRef,
  attendanceLogsRef,
  attendanceRawLogsRef,
} from './collections';
import type {
  FirestoreAttendanceImportHistory,
  FirestoreAttendanceLog,
  FirestoreAttendanceRawLog,
  ProcessedAttendanceRecord,
  ZKRawPunch,
} from './types';

const CHUNK_SIZE = 400;

export const attendanceRawLogService = {
  async saveBatch(punches: ZKRawPunch[], batchId: string): Promise<number> {
    if (!isConfigured || punches.length === 0) return 0;
    let saved = 0;
    for (let i = 0; i < punches.length; i += CHUNK_SIZE) {
      const chunk = punches.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((row) => {
        const docRef = doc(attendanceRawLogsRef());
        batch.set(docRef, {
          employeeCode: row.employeeCode,
          timestamp: row.timestamp,
          deviceId: row.deviceId,
          importedBatchId: batchId,
          createdAt: serverTimestamp(),
        } as Omit<FirestoreAttendanceRawLog, 'id'>);
      });
      await batch.commit();
      saved += chunk.length;
    }
    return saved;
  },
};

export const attendanceLogService = {
  async saveBatch(records: ProcessedAttendanceRecord[], batchId: string): Promise<number> {
    if (!isConfigured || records.length === 0) return 0;
    let saved = 0;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((record) => {
        const docRef = doc(attendanceLogsRef());
        batch.set(docRef, {
          employeeId: record.employeeId,
          date: record.date,
          shiftId: record.shiftId,
          checkIn: record.checkIn,
          checkOut: record.checkOut,
          totalMinutes: record.totalMinutes,
          totalHours: record.totalHours,
          lateMinutes: record.lateMinutes,
          earlyLeaveMinutes: record.earlyLeaveMinutes,
          isAbsent: record.isAbsent,
          isIncomplete: record.isIncomplete,
          isWeeklyOff: record.isWeeklyOff,
          createdFrom: 'zk_csv',
          processedBatchId: batchId,
          createdAt: serverTimestamp(),
        } as Omit<FirestoreAttendanceLog, 'id'>);
      });
      await batch.commit();
      saved += chunk.length;
    }
    return saved;
  },

  async getByEmployeeRange(
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<FirestoreAttendanceLog[]> {
    if (!isConfigured) return [];
    const q = query(
      attendanceLogsRef(),
      where('employeeId', '==', employeeId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreAttendanceLog));
  },
};

export const attendanceImportHistoryService = {
  async save(entry: Omit<FirestoreAttendanceImportHistory, 'id' | 'importedAt'>): Promise<string> {
    if (!isConfigured) return '';
    const ref = await addDoc(attendanceImportHistoryRef(), {
      ...entry,
      importedAt: serverTimestamp(),
    });
    return ref.id;
  },

  async getAll(): Promise<FirestoreAttendanceImportHistory[]> {
    if (!isConfigured) return [];
    const q = query(attendanceImportHistoryRef(), orderBy('importedAt', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreAttendanceImportHistory));
  },

  async deleteByBatchId(batchId: string): Promise<{ deletedLogs: number; deletedRaw: number }> {
    if (!isConfigured) return { deletedLogs: 0, deletedRaw: 0 };

    const logsQ = query(attendanceLogsRef(), where('processedBatchId', '==', batchId));
    const logsSnap = await getDocs(logsQ);
    for (let i = 0; i < logsSnap.docs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      logsSnap.docs.slice(i, i + CHUNK_SIZE).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    const rawQ = query(attendanceRawLogsRef(), where('importedBatchId', '==', batchId));
    const rawSnap = await getDocs(rawQ);
    for (let i = 0; i < rawSnap.docs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      rawSnap.docs.slice(i, i + CHUNK_SIZE).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    const historyQ = query(attendanceImportHistoryRef(), where('batchId', '==', batchId));
    const historySnap = await getDocs(historyQ);
    if (!historySnap.empty) {
      const batch = writeBatch(db);
      historySnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    return { deletedLogs: logsSnap.size, deletedRaw: rawSnap.size };
  },
};
