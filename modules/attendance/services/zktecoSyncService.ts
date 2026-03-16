import {
  Timestamp,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, isConfigured } from '@/services/firebase';
import { employeeService } from '@/modules/hr/employeeService';
import { shiftsRef } from '@/modules/hr/collections';
import { attendanceProcessingService } from './attendanceProcessingService';
import { attendanceLogsRef, attendanceRecordsRef, ATTENDANCE_COLLECTIONS } from './collections';
import { parseAttendanceCSVAuto, processDayRecord } from '@/src/services/attendanceProcessor';
import { SHIFT_CONFIGS, type AttendanceShiftType } from '@/src/types/attendance';
import type {
  AttendanceEventType,
  AttendanceImportResult,
  AttendanceImportRow,
  AttendanceSource,
  NormalizedAttendanceLogInput,
} from '../types';
import type { FirestoreEmployee } from '@/types';
import type { FirestoreShift } from '@/modules/hr/types';

const WRITE_CHUNK = 400;

function buildBatchId(): string {
  const now = new Date();
  return `ATT-${now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeKey(raw: string): string {
  return raw.toLowerCase().replace(/[\s_-]/g, '');
}

function inferEventType(raw: unknown): AttendanceEventType {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return 'unknown';
  if (['in', 'checkin', 'check_in', '0', 'entry'].includes(value)) return 'check_in';
  if (['out', 'checkout', 'check_out', '1', 'exit'].includes(value)) return 'check_out';
  return 'unknown';
}

function parseDateValue(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw);
    if (!date) return null;
    return new Date(date.y, date.m - 1, date.d, date.H, date.M, date.S);
  }
  const value = String(raw).trim();
  if (!value) return null;
  const parsed = new Date(value.replace(/\//g, '-'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mergeDateAndTime(dateRaw: unknown, timeRaw: unknown): Date | null {
  const datePart = parseDateValue(dateRaw);
  if (!datePart) return null;

  const timePart = parseDateValue(timeRaw);
  if (!timePart) return datePart;

  const merged = new Date(datePart);
  merged.setHours(
    timePart.getHours(),
    timePart.getMinutes(),
    timePart.getSeconds(),
    timePart.getMilliseconds(),
  );
  return merged;
}

function isMissingTimeValue(raw: unknown): boolean {
  const value = String(raw ?? '').trim().toLowerCase();
  return value === '' || value === '-' || value === '--' || value === 'n/a' || value === 'na' || value === 'null';
}

function hasClockTime(date: Date): boolean {
  return (
    date.getHours() !== 0 ||
    date.getMinutes() !== 0 ||
    date.getSeconds() !== 0 ||
    date.getMilliseconds() !== 0
  );
}

function parseTimestampFromKeys(keys: Record<string, unknown>): Date | null {
  const directTimestamp = parseDateValue(
    keys.datetime ?? keys.timestamp ?? keys.punchtime ?? keys.logdatetime ?? keys.datatime,
  );
  if (directTimestamp) return directTimestamp;

  const dateRaw = keys.date ?? keys.logdate ?? keys.attendancedate ?? keys.transactiondate;
  const timeRaw = keys.time ?? keys.logtime ?? keys.attendancetime ?? keys.transactiontime;
  const datePart = parseDateValue(dateRaw);
  if (!datePart) return null;

  // If time is missing (empty or placeholder), skip this log row so the day can be treated as absent.
  if (isMissingTimeValue(timeRaw)) {
    return hasClockTime(datePart) ? datePart : null;
  }

  return mergeDateAndTime(dateRaw, timeRaw);
}

function buildDedupeKey(deviceUserId: string, timestamp: Date): string {
  return `${deviceUserId.trim()}|${timestamp.toISOString()}`;
}

function buildLogDocId(deviceUserId: string, timestamp: Date): string {
  return encodeURIComponent(buildDedupeKey(deviceUserId, timestamp));
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function asClock(value: unknown): string | undefined {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : undefined;
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

async function buildEmployeeMap(): Promise<Map<string, string>> {
  const employees = await employeeService.getAll();
  const map = new Map<string, string>();
  employees.forEach((employee) => {
    if (!employee.id) return;
    const code = String(employee.code || '').trim();
    const userId = String(employee.userId || '').trim();
    if (code) map.set(code, employee.id);
    if (userId) map.set(userId, employee.id);
  });
  return map;
}

async function buildEmployeeMapByAcNo(): Promise<Map<string, FirestoreEmployee>> {
  const employees = await employeeService.getAll();
  const map = new Map<string, FirestoreEmployee>();
  employees.forEach((employee) => {
    const acNo = String(employee.acNo || '').trim();
    if (!employee.id || !acNo) return;
    map.set(acNo, employee);
  });
  return map;
}

function parseSheetRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: 'binary' });
        const firstSheet = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          raw: true,
          defval: '',
        });
        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(file);
  });
}

export const zktecoSyncService = {
  async parseExcelFile(file: File): Promise<AttendanceImportRow[]> {
    const rows = await parseSheetRows(file);
    return rows
      .map((row) => {
        const keys = Object.keys(row).reduce<Record<string, unknown>>((acc, key) => {
          acc[normalizeKey(key)] = row[key];
          return acc;
        }, {});
        const timestamp = parseTimestampFromKeys(keys);
        if (!timestamp) return null;
        return {
          employeeCode: String(
            keys.userid ?? keys.employeecode ?? keys.enrollnumber ?? keys.acno ?? keys.badgenumber ?? '',
          ).trim() || undefined,
          deviceUserId: String(
            keys.deviceuserid ?? keys.userid ?? keys.enrollnumber ?? keys.acno ?? keys.badgenumber ?? '',
          ).trim() || undefined,
          timestamp,
          deviceId: String(keys.deviceid ?? keys.terminalid ?? keys.machineid ?? '').trim() || undefined,
          eventType: inferEventType(keys.eventtype ?? keys.verifymode ?? keys.state),
        } satisfies AttendanceImportRow;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  },

  async importFile(file: File, source: AttendanceSource = 'zkteco_excel'): Promise<AttendanceImportResult> {
    const parsedRows = await this.parseExcelFile(file);
    const employeeMap = await buildEmployeeMap();
    const batchId = buildBatchId();

    const normalized: NormalizedAttendanceLogInput[] = [];
    const errors: string[] = [];
    let failedRows = 0;

    parsedRows.forEach((row, index) => {
      const employeeCode = String(row.employeeCode || '').trim();
      const deviceUserId = String(row.deviceUserId || employeeCode).trim();
      const employeeId = row.employeeId || employeeMap.get(employeeCode) || employeeMap.get(deviceUserId);
      if (!employeeId || !deviceUserId) {
        failedRows += 1;
        errors.push(`Row ${index + 1}: employee mapping failed`);
        return;
      }
      normalized.push({
        employeeId,
        deviceUserId,
        deviceId: String(row.deviceId || 'zk-unknown').trim(),
        timestamp: row.timestamp,
        eventType: row.eventType || 'unknown',
        source,
        importBatchId: batchId,
      });
    });

    const imported = await this.importNormalizedLogs(normalized, batchId);
    const processedDates = Array.from(
      new Set(normalized.map((item) => item.timestamp.toISOString().slice(0, 10))),
    );
    return {
      batchId,
      totalRows: parsedRows.length,
      importedRows: imported.importedRows,
      dedupedRows: imported.dedupedRows,
      failedRows,
      errors,
      processedDates,
    };
  },

  async importFingerprintCsvFile(
    file: File,
    options?: {
      importLabel?: string;
      officialHolidays?: string[];
      onProgress?: (done: number, total: number) => void;
    },
  ): Promise<AttendanceImportResult> {
    const text = await file.text();
    return this.importFingerprintCsvText(text, {
      importLabel: options?.importLabel,
      officialHolidays: options?.officialHolidays,
      onProgress: options?.onProgress,
    });
  },

  async importFingerprintCsvText(
    csvText: string,
    options?: {
      importLabel?: string;
      officialHolidays?: string[];
      onProgress?: (done: number, total: number) => void;
    },
  ): Promise<AttendanceImportResult> {
    if (!isConfigured) {
      return {
        batchId: '',
        totalRows: 0,
        importedRows: 0,
        dedupedRows: 0,
        failedRows: 0,
        errors: [],
      };
    }

    const parsedResult = parseAttendanceCSVAuto(csvText);
    const parsed = parsedResult.records;
    const officialHolidays = new Set(options?.officialHolidays || []);
    const [employeeMap, shiftsSnap] = await Promise.all([
      buildEmployeeMapByAcNo(),
      getDocs(shiftsRef()),
    ]);
    const shiftMap = new Map<string, FirestoreShift>();
    shiftsSnap.docs.forEach((d) => {
      shiftMap.set(d.id, { id: d.id, ...(d.data() as FirestoreShift) });
    });
    const importLabel = options?.importLabel || `fingerprint-${toDateString(new Date()).slice(0, 7)}`;

    const groupedByAcNo = new Map<string, Map<string, string[]>>();
    parsed.forEach((row) => {
      if (!groupedByAcNo.has(row.acNo)) groupedByAcNo.set(row.acNo, new Map<string, string[]>());
      groupedByAcNo.get(row.acNo)!.set(row.date, row.punches);
    });

    const errors: string[] = [];
    let done = 0;
    let importedRows = 0;
    let dedupedRows = 0;
    const processedDates = new Set<string>();
    const allDatesToProcess = parsed.length;
    let pendingBatch = writeBatch(db);
    let pendingCount = 0;

    for (const [acNo, dateMap] of groupedByAcNo.entries()) {
      const employee = employeeMap.get(acNo);
      if (!employee?.id) {
        errors.push(`Employee mapping failed for AC-No ${acNo}`);
        done += dateMap.size;
        options?.onProgress?.(done, allDatesToProcess);
        continue;
      }

      const shiftType = (employee.shiftType || 'shift1') as AttendanceShiftType;
      const shift = SHIFT_CONFIGS[shiftType] || SHIFT_CONFIGS.shift1;
      const employeeShift = employee.shiftId ? shiftMap.get(employee.shiftId) : undefined;
      const singlePunchSplitTime = resolveSinglePunchSplitTime(employeeShift);
      const workDays = Array.isArray(employee.workDays) && employee.workDays.length > 0
        ? employee.workDays
        : [0, 1, 2, 3, 4, 6];

      for (const [date, punches] of dateMap.entries()) {
        processedDates.add(date);
        const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
        const isHoliday = officialHolidays.has(date);
        const isWorkDay = workDays.includes(dayOfWeek);
        const processed = processDayRecord({
          rawPunches: punches,
          shiftType,
          date,
          isHoliday,
          isWorkDay,
          singlePunchSplitTime,
        });

        dedupedRows += Math.max(0, punches.length - processed.normalizedPunches.length);
        const checkInTs = processed.checkIn ? Timestamp.fromDate(new Date(`${date}T${processed.checkIn}:00`)) : null;
        const checkOutTs = processed.checkOut ? Timestamp.fromDate(new Date(`${date}T${processed.checkOut}:00`)) : null;
        const recordId = buildRecordId(employee.id, date);
        pendingBatch.set(doc(attendanceRecordsRef(), recordId), {
          employeeId: employee.id,
          acNo,
          date,
          dayOfWeek,
          isHoliday,
          isWorkDay,
          rawPunches: punches,
          normalizedPunches: processed.normalizedPunches,
          punchCount: processed.normalizedPunches.length,
          checkIn: checkInTs,
          checkOut: checkOutTs,
          workedMinutes: processed.workMinutes ?? 0,
          workMinutes: processed.workMinutes,
          workHours: processed.workHours,
          status: processed.status,
          statusDetails: processed.statusDetails,
          shiftType,
          expectedCheckIn: shift.checkInExpected,
          expectedCheckOut: shift.checkOutExpected,
          singlePunchSplitTime: singlePunchSplitTime || '12:00',
          lateMinutes: processed.lateMinutes,
          earlyLeaveMinutes: processed.earlyLeaveMinutes,
          overtimeMinutes: processed.overtimeMinutes,
          hasAnomaly: processed.hasAnomaly,
          anomalyNote: processed.anomalyNote,
          sourceLogs: [],
          sourceBatchIds: [importLabel],
          importedFrom: importLabel,
          processedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
        pendingCount += 1;
        importedRows += 1;
        done += 1;
        options?.onProgress?.(done, allDatesToProcess);

        if (pendingCount >= WRITE_CHUNK) {
          await pendingBatch.commit();
          pendingBatch = writeBatch(db);
          pendingCount = 0;
        }
      }
    }

    if (pendingCount > 0) await pendingBatch.commit();
    const months = Array.from(new Set(Array.from(processedDates).map((date) => date.slice(0, 7))));
    for (const month of months) {
      await attendanceProcessingService.recalculateMonthlySummary(month);
    }

    return {
      batchId: importLabel,
      totalRows: parsed.length,
      importedRows,
      dedupedRows,
      failedRows: Math.max(0, parsed.length - importedRows),
      errors,
      processedDates: Array.from(processedDates).sort(),
      recordsReady: true,
      detectedFormat: parsedResult.detectedFormat,
    };
  },

  async importNormalizedLogs(
    logs: NormalizedAttendanceLogInput[],
    forcedBatchId?: string,
  ): Promise<{ importedRows: number; dedupedRows: number; batchId: string }> {
    if (!isConfigured || logs.length === 0) {
      return { importedRows: 0, dedupedRows: 0, batchId: forcedBatchId || buildBatchId() };
    }

    const batchId = forcedBatchId || buildBatchId();
    const seen = new Set<string>();
    const uniqueLogs: NormalizedAttendanceLogInput[] = [];
    let dedupedRows = 0;

    logs.forEach((log) => {
      const dedupeKey = buildDedupeKey(log.deviceUserId, log.timestamp);
      if (seen.has(dedupeKey)) {
        dedupedRows += 1;
        return;
      }
      seen.add(dedupeKey);
      uniqueLogs.push(log);
    });

    for (let i = 0; i < uniqueLogs.length; i += WRITE_CHUNK) {
      const chunk = uniqueLogs.slice(i, i + WRITE_CHUNK);
      const batch = writeBatch(db);
      chunk.forEach((log) => {
        const dedupeKey = buildDedupeKey(log.deviceUserId, log.timestamp);
        const id = buildLogDocId(log.deviceUserId, log.timestamp);
        batch.set(doc(attendanceLogsRef(), id), {
          employeeId: log.employeeId,
          deviceUserId: log.deviceUserId,
          deviceId: log.deviceId,
          timestamp: Timestamp.fromDate(log.timestamp),
          eventType: log.eventType,
          source: log.source,
          syncedAt: serverTimestamp(),
          dedupeKey,
          importBatchId: log.importBatchId || batchId,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }

    return {
      importedRows: uniqueLogs.length,
      dedupedRows,
      batchId,
    };
  },

  async getLogsByDateRange(startDate: string, endDate: string) {
    if (!isConfigured) return [];
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59`);
    const q = query(
      attendanceLogsRef(),
      where('timestamp', '>=', Timestamp.fromDate(start)),
      where('timestamp', '<=', Timestamp.fromDate(end)),
      orderBy('timestamp', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async upsertGatewayPayload(payload: {
    source?: AttendanceSource;
    batchId?: string;
    logs: Array<{
      employeeId: string;
      deviceUserId: string;
      deviceId: string;
      timestamp: string;
      eventType?: AttendanceEventType;
    }>;
  }): Promise<AttendanceImportResult> {
    const source = payload.source || 'zkteco_gateway';
    const batchId = payload.batchId || buildBatchId();
    const normalized: NormalizedAttendanceLogInput[] = payload.logs.map((log) => ({
      employeeId: log.employeeId,
      deviceUserId: log.deviceUserId,
      deviceId: log.deviceId,
      timestamp: new Date(log.timestamp),
      eventType: log.eventType || 'unknown',
      source,
      importBatchId: batchId,
    }));
    const imported = await this.importNormalizedLogs(normalized, batchId);
    return {
      batchId,
      totalRows: payload.logs.length,
      importedRows: imported.importedRows,
      dedupedRows: imported.dedupedRows,
      failedRows: 0,
      errors: [],
      processedDates: Array.from(
        new Set(payload.logs.map((item) => item.timestamp.slice(0, 10))),
      ),
    };
  },

  async clearBatch(batchId: string): Promise<number> {
    if (!isConfigured) return 0;
    const q = query(attendanceLogsRef(), where('importBatchId', '==', batchId));
    const snap = await getDocs(q);
    if (snap.empty) return 0;
    let deleted = 0;
    for (let i = 0; i < snap.docs.length; i += WRITE_CHUNK) {
      const chunk = snap.docs.slice(i, i + WRITE_CHUNK);
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(doc(db, ATTENDANCE_COLLECTIONS.ATTENDANCE_LOGS, d.id)));
      await batch.commit();
      deleted += chunk.length;
    }
    return deleted;
  },
};
