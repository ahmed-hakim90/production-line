import {
  Timestamp,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import { employeeService } from '@/modules/hr/employeeService';
import { shiftsRef } from '@/modules/hr/collections';
import type { FirestoreShift } from '@/modules/hr/types';
import { systemSettingsService } from '@/modules/system/services/systemSettingsService';
import {
  attendanceLogsRef,
  attendanceMonthlySummariesRef,
  attendanceRecordsRef,
  ATTENDANCE_COLLECTIONS,
} from './collections';
import type {
  AttendanceMonthlySummary,
  AttendanceProcessResult,
  AttendanceRecord,
} from '../types';
import { processDayRecord } from '@/src/services/attendanceProcessor';
import type { AttendanceShiftType } from '@/src/types/attendance';

const WRITE_CHUNK = 400;

function toDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function asClock(value: unknown): string | null {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : null;
}

function toClockFromDate(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function resolveSinglePunchSplitTime(shift?: FirestoreShift): string | undefined {
  if (!shift) return undefined;
  return (
    asClock(shift.firstCheckOutTime) ||
    asClock(shift.latestCheckInTime) ||
    asClock(shift.endTime) ||
    undefined
  );
}

function buildRecordId(employeeId: string, date: string): string {
  return `${employeeId}_${date}`;
}

function toMonth(date: string): string {
  return date.slice(0, 7);
}

function toTimestampFromClock(date: string, clock: string | null): Timestamp | null {
  if (!clock) return null;
  const value = clock.trim();
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  return Timestamp.fromDate(new Date(`${date}T${value}:00`));
}

function startAndEndForMonth(month: string): { startDate: string; endDate: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
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

    const [employees, shiftsSnapshot] = await Promise.all([
      employeeService.getAll(),
      getDocs(shiftsRef()),
    ]);
    const activeEmployees = employees.filter((employee) => employee.isActive !== false && employee.id);
    const shiftsMap = new Map<string, FirestoreShift>();
    shiftsSnapshot.docs.forEach((docSnap) => {
      shiftsMap.set(docSnap.id, { id: docSnap.id, ...(docSnap.data() as FirestoreShift) });
    });

    const records: AttendanceRecord[] = activeEmployees.map((employee) => {
      const employeeId = employee.id as string;
      const logs = (grouped.get(employeeId) || []).sort(
        (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
      );
      const rawPunches = logs.map((entry) => toClockFromDate(entry.timestamp));
      const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
      const workDays = Array.isArray(employee.workDays) && employee.workDays.length > 0
        ? employee.workDays
        : [0, 1, 2, 3, 4, 6];
      const isWorkDay = workDays.includes(dayOfWeek);
      const shift = employee.shiftId ? shiftsMap.get(employee.shiftId) : undefined;
      const processed = processDayRecord({
        rawPunches,
        shiftType: (employee.shiftType || 'shift1') as AttendanceShiftType,
        date,
        isHoliday: false,
        isWorkDay,
        singlePunchSplitTime: resolveSinglePunchSplitTime(shift),
      });
      const checkInTs = toTimestampFromClock(date, processed.checkIn);
      const checkOutTs = toTimestampFromClock(date, processed.checkOut);
      const workedMinutes = processed.workMinutes ?? 0;

      return {
        id: buildRecordId(employeeId, date),
        employeeId,
        date,
        dayOfWeek,
        isHoliday: false,
        isWorkDay,
        shiftType: (employee.shiftType || 'shift1') as AttendanceShiftType,
        checkIn: checkInTs,
        checkOut: checkOutTs,
        workedMinutes,
        workMinutes: processed.workMinutes,
        workHours: processed.workHours,
        lateMinutes: processed.lateMinutes,
        earlyLeaveMinutes: processed.earlyLeaveMinutes,
        overtimeMinutes: processed.overtimeMinutes,
        punchCount: processed.normalizedPunches.length,
        rawPunches,
        normalizedPunches: processed.normalizedPunches,
        status: processed.status,
        statusDetails: processed.statusDetails,
        hasAnomaly: processed.hasAnomaly,
        anomalyNote: processed.anomalyNote,
        singlePunchSplitTime: resolveSinglePunchSplitTime(shift) || attendanceSettings?.singlePunchDefaultSplitTime || '12:00',
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
    await this.recalculateMonthlySummary(date.slice(0, 7));
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
    const { startDate, endDate } = startAndEndForMonth(month);
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

  async recalculateMonthlySummary(month: string): Promise<AttendanceMonthlySummary[]> {
    if (!isConfigured || !month) return [];
    const records = await this.getRecordsForMonth(month);
    const grouped = new Map<string, AttendanceRecord[]>();
    records.forEach((record) => {
      if (!record.employeeId) return;
      const list = grouped.get(record.employeeId) || [];
      list.push(record);
      grouped.set(record.employeeId, list);
    });

    const summaries: AttendanceMonthlySummary[] = [];
    for (const [employeeId, rows] of grouped.entries()) {
      let workDaysInMonth = 0;
      let presentDays = 0;
      let absentDays = 0;
      let lateDays = 0;
      let earlyLeaveDays = 0;
      let totalWorkMinutes = 0;
      let totalLateMinutes = 0;
      let totalEarlyLeaveMinutes = 0;
      let totalOvertimeMinutes = 0;

      rows.forEach((day) => {
        const status = String(day.status || '');
        if (day.isHoliday || status === 'holiday' || status === 'off_day') return;
        workDaysInMonth += 1;

        if (
          ['present', 'present_late', 'present_early_leave', 'present_late_early', 'overtime', 'no_checkout', 'late', 'partial'].includes(status)
        ) {
          presentDays += 1;
        } else if (status === 'absent') {
          absentDays += 1;
        }

        if ((day.lateMinutes || 0) > 0) lateDays += 1;
        if ((day.earlyLeaveMinutes || 0) > 30) earlyLeaveDays += 1;
        totalWorkMinutes += day.workMinutes ?? day.workedMinutes ?? 0;
        totalLateMinutes += day.lateMinutes ?? 0;
        totalEarlyLeaveMinutes += day.earlyLeaveMinutes ?? 0;
        totalOvertimeMinutes += day.overtimeMinutes ?? 0;
      });

      const summary: AttendanceMonthlySummary = {
        id: `${employeeId}_${month}`,
        employeeId,
        month,
        workDaysInMonth,
        presentDays,
        absentDays,
        lateDays,
        earlyLeaveDays,
        totalWorkHours: Math.round((totalWorkMinutes / 60) * 10) / 10,
        totalLateMinutes,
        totalEarlyLeaveMinutes,
        totalOvertimeMinutes,
        attendanceRate: workDaysInMonth > 0 ? Math.round((presentDays / workDaysInMonth) * 100) : 0,
        updatedAt: serverTimestamp(),
      };
      summaries.push(summary);
      await setDoc(doc(attendanceMonthlySummariesRef(), summary.id), summary);
    }

    return summaries;
  },

  async getMonthlySummaries(month: string): Promise<AttendanceMonthlySummary[]> {
    if (!isConfigured || !month) return [];
    const snap = await getDocs(query(attendanceMonthlySummariesRef(), where('month', '==', month)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceMonthlySummary));
  },

  async updateRecordTimes(
    recordId: string,
    payload: { checkIn: string | null; checkOut: string | null },
  ): Promise<void> {
    if (!isConfigured || !recordId) return;

    const ref = doc(attendanceRecordsRef(), recordId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('سجل الحضور غير موجود');
    }

    const current = { id: snap.id, ...snap.data() } as AttendanceRecord;
    const rawPunches = [payload.checkIn, payload.checkOut]
      .map((v) => (v || '').trim())
      .filter((v): v is string => /^\d{2}:\d{2}$/.test(v));

    const processed = processDayRecord({
      rawPunches,
      shiftType: current.shiftType || 'shift1',
      date: current.date,
      isHoliday: Boolean(current.isHoliday),
      isWorkDay: current.isWorkDay !== false,
      singlePunchSplitTime: asClock(current.singlePunchSplitTime) || undefined,
    });

    await updateDoc(ref, {
      rawPunches,
      normalizedPunches: processed.normalizedPunches,
      punchCount: processed.normalizedPunches.length,
      checkIn: toTimestampFromClock(current.date, processed.checkIn),
      checkOut: toTimestampFromClock(current.date, processed.checkOut),
      workedMinutes: processed.workMinutes ?? 0,
      workMinutes: processed.workMinutes,
      workHours: processed.workHours,
      status: processed.status,
      statusDetails: processed.statusDetails,
      lateMinutes: processed.lateMinutes,
      earlyLeaveMinutes: processed.earlyLeaveMinutes,
      overtimeMinutes: processed.overtimeMinutes,
      hasAnomaly: processed.hasAnomaly,
      anomalyNote: processed.anomalyNote,
      updatedAt: serverTimestamp(),
    });

    await this.recalculateMonthlySummary(toMonth(current.date));
  },

  async deleteRecordsByIds(
    recordIds: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ deleted: number }> {
    if (!isConfigured || recordIds.length === 0) return { deleted: 0 };
    const months = new Set<string>();
    const validIds: string[] = [];

    for (const recordId of recordIds) {
      const snap = await getDoc(doc(attendanceRecordsRef(), recordId));
      if (!snap.exists()) continue;
      const data = snap.data() as AttendanceRecord;
      if (data.date) months.add(toMonth(data.date));
      validIds.push(recordId);
    }

    let deleted = 0;
    onProgress?.(0, validIds.length);
    for (let i = 0; i < validIds.length; i += WRITE_CHUNK) {
      const chunk = validIds.slice(i, i + WRITE_CHUNK);
      const batch = writeBatch(db);
      chunk.forEach((id) => batch.delete(doc(db, ATTENDANCE_COLLECTIONS.ATTENDANCE_RECORDS, id)));
      await batch.commit();
      deleted += chunk.length;
      onProgress?.(deleted, validIds.length);
    }

    for (const month of months) {
      await this.recalculateMonthlySummary(month);
    }
    return { deleted };
  },

  async deleteRecordsByImportBatch(
    batchId: string,
    options?: { startDate?: string; endDate?: string },
  ): Promise<{ deleted: number }> {
    if (!isConfigured || !batchId) return { deleted: 0 };

    const [importedFromSnap, sourceBatchSnap] = await Promise.all([
      getDocs(query(attendanceRecordsRef(), where('importedFrom', '==', batchId))),
      getDocs(query(attendanceRecordsRef(), where('sourceBatchIds', 'array-contains', batchId))),
    ]);

    const byId = new Map<string, AttendanceRecord>();
    [...importedFromSnap.docs, ...sourceBatchSnap.docs].forEach((d) => {
      byId.set(d.id, { id: d.id, ...d.data() } as AttendanceRecord);
    });

    const filtered = Array.from(byId.values()).filter((record) => {
      if (options?.startDate && record.date < options.startDate) return false;
      if (options?.endDate && record.date > options.endDate) return false;
      return true;
    });

    if (filtered.length === 0) return { deleted: 0 };

    const months = new Set(filtered.map((r) => toMonth(r.date)));
    let deleted = 0;

    for (let i = 0; i < filtered.length; i += WRITE_CHUNK) {
      const chunk = filtered.slice(i, i + WRITE_CHUNK);
      const batch = writeBatch(db);
      chunk.forEach((record) => batch.delete(doc(db, ATTENDANCE_COLLECTIONS.ATTENDANCE_RECORDS, record.id)));
      await batch.commit();
      deleted += chunk.length;
    }

    for (const month of months) {
      await this.recalculateMonthlySummary(month);
    }

    return { deleted };
  },

  async getSinglePunchRecordsByEmployee(
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<AttendanceRecord[]> {
    if (!isConfigured || !employeeId) return [];
    const q = query(
      attendanceRecordsRef(),
      where('employeeId', '==', employeeId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord))
      .filter((record) => {
        const status = String(record.status || '');
        return status === 'no_checkout' || status === 'single_punch' || status === 'partial' || (record.punchCount || 0) === 1;
      });
  },
};
