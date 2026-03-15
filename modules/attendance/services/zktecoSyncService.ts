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
import { attendanceLogsRef, ATTENDANCE_COLLECTIONS } from './collections';
import type {
  AttendanceEventType,
  AttendanceImportResult,
  AttendanceImportRow,
  AttendanceSource,
  NormalizedAttendanceLogInput,
} from '../types';

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

function buildDedupeKey(deviceUserId: string, timestamp: Date): string {
  return `${deviceUserId.trim()}|${timestamp.toISOString()}`;
}

function buildLogDocId(deviceUserId: string, timestamp: Date): string {
  return encodeURIComponent(buildDedupeKey(deviceUserId, timestamp));
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
        const timestamp = parseDateValue(
          keys.datetime ?? keys.timestamp ?? keys.punchtime ?? keys.time ?? keys.logtime,
        );
        if (!timestamp) return null;
        return {
          employeeCode: String(keys.userid ?? keys.employeecode ?? keys.enrollnumber ?? '').trim() || undefined,
          deviceUserId: String(keys.deviceuserid ?? keys.userid ?? keys.enrollnumber ?? '').trim() || undefined,
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
