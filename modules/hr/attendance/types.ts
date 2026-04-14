import type { AttendanceShiftType, AttendanceStatus } from '@/src/types/attendance';

export type AttendanceEventType = 'check_in' | 'check_out' | 'unknown';
export type AttendanceRecordStatus = AttendanceStatus;
export type AttendanceSource = 'zkteco_excel' | 'zkteco_watch_folder' | 'zkteco_gateway' | 'manual';

export interface AttendanceLog {
  id: string;
  employeeId: string;
  deviceUserId: string;
  deviceId: string;
  timestamp: any;
  eventType: AttendanceEventType;
  source: AttendanceSource;
  syncedAt: any;
  dedupeKey: string;
  importBatchId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  dayOfWeek?: number;
  acNo?: string;
  checkIn: any | null;
  checkOut: any | null;
  workedMinutes: number;
  workHours?: number | null;
  workMinutes?: number | null;
  lateMinutes: number;
  earlyLeaveMinutes?: number;
  overtimeMinutes: number;
  isHoliday?: boolean;
  isWorkDay?: boolean;
  shiftType?: AttendanceShiftType;
  expectedCheckIn?: string;
  expectedCheckOut?: string;
  singlePunchSplitTime?: string;
  punchCount?: number;
  rawPunches?: string[];
  statusDetails?: string;
  hasAnomaly?: boolean;
  anomalyNote?: string;
  importedFrom?: string;
  processedAt?: any;
  status: AttendanceRecordStatus;
  sourceLogs: string[];
  sourceBatchIds?: string[];
  updatedAt?: any;
  createdAt?: any;
}

export interface AttendanceMonthlySummary {
  id: string;
  employeeId: string;
  month: string;
  workDaysInMonth: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  totalWorkHours: number;
  totalLateMinutes: number;
  totalEarlyLeaveMinutes: number;
  totalOvertimeMinutes: number;
  attendanceRate: number;
  updatedAt?: any;
}

export interface AttendanceImportRow {
  employeeId?: string;
  employeeCode?: string;
  deviceUserId?: string;
  timestamp: Date;
  deviceId?: string;
  eventType?: AttendanceEventType;
}

export interface ZKTecoRawRecord {
  employeeId?: string;
  employeeCode?: string;
  deviceUserId: string;
  deviceId: string;
  timestamp: string;
  eventType?: AttendanceEventType;
}

export interface AttendanceSyncPayload {
  source?: AttendanceSource;
  batchId?: string;
  logs: ZKTecoRawRecord[];
}

export interface NormalizedAttendanceLogInput {
  employeeId: string;
  deviceUserId: string;
  deviceId: string;
  timestamp: Date;
  eventType: AttendanceEventType;
  source: AttendanceSource;
  importBatchId?: string;
}

export interface AttendanceImportResult {
  batchId: string;
  totalRows: number;
  importedRows: number;
  dedupedRows: number;
  failedRows: number;
  errors: string[];
  processedDates?: string[];
  recordsReady?: boolean;
  detectedFormat?: 'zk_standard' | 'zk_export';
}

export interface AttendanceProcessResult {
  date: string;
  totalEmployees: number;
  recordsUpserted: number;
  absentGenerated: number;
}
