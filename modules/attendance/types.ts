export type AttendanceEventType = 'check_in' | 'check_out' | 'unknown';
export type AttendanceRecordStatus = 'present' | 'late' | 'absent' | 'partial';
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
  checkIn: any | null;
  checkOut: any | null;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  status: AttendanceRecordStatus;
  sourceLogs: string[];
  sourceBatchIds?: string[];
  updatedAt?: any;
  createdAt?: any;
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
}

export interface AttendanceProcessResult {
  date: string;
  totalEmployees: number;
  recordsUpserted: number;
  absentGenerated: number;
}
