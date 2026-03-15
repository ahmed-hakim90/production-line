import {
  Timestamp,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import { employeeService } from '@/modules/hr/employeeService';
import { systemSettingsService } from '@/modules/system/services/systemSettingsService';
import { attendanceLogsRef, attendanceRecordsRef, ATTENDANCE_COLLECTIONS } from './collections';
import type { AttendanceProcessResult, AttendanceRecord, AttendanceRecordStatus } from '../types';

const WRITE_CHUNK = 400;

function toDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function buildRecordId(employeeId: string, date: string): string {
  return `${employeeId}_${date}`;
}

function calculateStatus(args: {
  workedMinutes: number;
  lateMinutes: number;
  hasCheckIn: boolean;
  hasCheckOut: boolean;
}): AttendanceRecordStatus {
  if (!args.hasCheckIn) return 'absent';
  if (!args.hasCheckOut) return 'partial';
  if (args.lateMinutes > 0) return 'late';
  if (args.workedMinutes <= 0) return 'partial';
  return 'present';
}

export const attendanceProcessingService = {
  async processDate(date: string): Promise<AttendanceProcessResult> {
    if (!isConfigured) {
      return { date, totalEmployees: 0, recordsUpserted: 0, absentGenerated: 0 };
    }

    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59`);
    const settings = await systemSettingsService.get();
    const attendanceSettings = settings?.attendanceIntegration;
    const shiftStartTime = attendanceSettings?.shiftStartTime || '08:00';
    const shiftStartMinutes = parseTimeToMinutes(shiftStartTime);
    const workingMinutesPerDay = Math.max(60, attendanceSettings?.workingMinutesPerDay || 480);
    const graceMinutes = Math.max(0, attendanceSettings?.lateGraceMinutes || 0);
    const overtimeThresholdMinutes = Math.max(60, attendanceSettings?.overtimeThresholdMinutes || workingMinutesPerDay);

    const logsSnap = await getDocs(
      query(
        attendanceLogsRef(),
        where('timestamp', '>=', Timestamp.fromDate(start)),
        where('timestamp', '<=', Timestamp.fromDate(end)),
        orderBy('timestamp', 'asc'),
      ),
    );

    const grouped = new Map<string, Array<{ id: string; timestamp: Date }>>();
    logsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { employeeId?: string; timestamp?: Timestamp };
      const employeeId = String(data.employeeId || '').trim();
      if (!employeeId || !data.timestamp) return;
      const list = grouped.get(employeeId) || [];
      list.push({ id: docSnap.id, timestamp: data.timestamp.toDate() });
      grouped.set(employeeId, list);
    });

    const employees = (await employeeService.getAll()).filter((employee) => employee.isActive !== false && employee.id);
    const activeEmployeeIds = employees.map((employee) => employee.id as string);

    const records: AttendanceRecord[] = activeEmployeeIds.map((employeeId) => {
      const logs = (grouped.get(employeeId) || []).sort(
        (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
      );
      const first = logs[0]?.timestamp || null;
      const last = logs.length > 1 ? logs[logs.length - 1].timestamp : null;
      const workedMinutes = first && last ? Math.max(0, Math.round((last.getTime() - first.getTime()) / 60000)) : 0;
      const checkInMinutes = first ? first.getHours() * 60 + first.getMinutes() : 0;
      const lateMinutes = first
        ? Math.max(0, checkInMinutes - shiftStartMinutes - graceMinutes)
        : 0;
      const overtimeMinutes = Math.max(0, workedMinutes - overtimeThresholdMinutes);
      const status = calculateStatus({
        workedMinutes,
        lateMinutes,
        hasCheckIn: first !== null,
        hasCheckOut: last !== null,
      });

      return {
        id: buildRecordId(employeeId, date),
        employeeId,
        date,
        checkIn: first ? Timestamp.fromDate(first) : null,
        checkOut: last ? Timestamp.fromDate(last) : null,
        workedMinutes: Math.min(workedMinutes, workingMinutesPerDay + overtimeMinutes),
        lateMinutes,
        overtimeMinutes,
        status,
        sourceLogs: logs.map((entry) => entry.id),
        sourceBatchIds: [],
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };
    });

    for (let i = 0; i < records.length; i += WRITE_CHUNK) {
      const chunk = records.slice(i, i + WRITE_CHUNK);
      const batch = writeBatch(db);
      chunk.forEach((record) => {
        batch.set(doc(attendanceRecordsRef(), record.id), {
          employeeId: record.employeeId,
          date: record.date,
          checkIn: record.checkIn,
          checkOut: record.checkOut,
          workedMinutes: record.workedMinutes,
          lateMinutes: record.lateMinutes,
          overtimeMinutes: record.overtimeMinutes,
          status: record.status,
          sourceLogs: record.sourceLogs,
          sourceBatchIds: record.sourceBatchIds,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }

    const absentGenerated = records.filter((record) => record.status === 'absent').length;
    return {
      date,
      totalEmployees: records.length,
      recordsUpserted: records.length,
      absentGenerated,
    };
  },

  async recalculateDate(date: string): Promise<AttendanceProcessResult> {
    if (!isConfigured) return { date, totalEmployees: 0, recordsUpserted: 0, absentGenerated: 0 };
    const existingSnap = await getDocs(
      query(attendanceRecordsRef(), where('date', '==', date)),
    );
    if (!existingSnap.empty) {
      for (let i = 0; i < existingSnap.docs.length; i += WRITE_CHUNK) {
        const chunk = existingSnap.docs.slice(i, i + WRITE_CHUNK);
        const batch = writeBatch(db);
        chunk.forEach((docSnap) =>
          batch.delete(doc(db, ATTENDANCE_COLLECTIONS.ATTENDANCE_RECORDS, docSnap.id)),
        );
        await batch.commit();
      }
    }
    return this.processDate(date);
  },

  async getRecordsByDateRange(startDate: string, endDate: string): Promise<AttendanceRecord[]> {
    if (!isConfigured) return [];
    const q = query(
      attendanceRecordsRef(),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord));
  },

  async getRecordsForMonth(month: string): Promise<AttendanceRecord[]> {
    const startDate = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
    return this.getRecordsByDateRange(startDate, endDate);
  },

  async getRecordsByEmployee(employeeId: string): Promise<AttendanceRecord[]> {
    if (!isConfigured || !employeeId) return [];
    const q = query(
      attendanceRecordsRef(),
      where('employeeId', '==', employeeId),
      orderBy('date', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord));
  },
};
