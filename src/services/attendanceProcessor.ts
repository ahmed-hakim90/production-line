import type { AttendanceShiftType, AttendanceStatus, ShiftConfig } from '@/src/types/attendance';
import { SHIFT_CONFIGS } from '@/src/types/attendance';

export interface RawPunchRecord {
  acNo: string;
  date: string;
  punches: string[];
}

export type AttendanceCSVFormat = 'zk_standard' | 'zk_export';

export interface AttendanceCSVParseResult {
  records: RawPunchRecord[];
  totalRows: number;
  validRows: number;
  skippedRows: number;
  errors: string[];
}

export interface AttendanceCSVAutoResult extends AttendanceCSVParseResult {
  detectedFormat: AttendanceCSVFormat;
}

export interface ProcessDayInput {
  rawPunches: string[];
  shiftType?: AttendanceShiftType;
  date: string;
  isHoliday: boolean;
  isWorkDay: boolean;
  singlePunchSplitTime?: string;
}

export interface ProcessedDayResult {
  checkIn: string | null;
  checkOut: string | null;
  workHours: number | null;
  workMinutes: number | null;
  status: AttendanceStatus;
  statusDetails: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  hasAnomaly: boolean;
  anomalyNote: string;
  normalizedPunches: string[];
}

function isValidClock(value: string | undefined): value is string {
  return Boolean(value) && /^\d{2}:\d{2}$/.test(String(value));
}

function dedupeTimesBy2Minutes(times: string[]): string[] {
  if (times.length <= 1) return [...times];
  const normalized = [...times].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  const deduped: string[] = [normalized[0]];
  for (let i = 1; i < normalized.length; i += 1) {
    const prev = deduped[deduped.length - 1];
    if (Math.abs(timeToMinutes(normalized[i]) - timeToMinutes(prev)) > 2) {
      deduped.push(normalized[i]);
    }
  }
  return deduped;
}

/**
 * Parse ZK export format:
 * AC-No,"Name","Department","Date","Time"
 * 100,"100","OUR COMPANY","2026-03-14","07:57 14:39"
 */
export function parseZKExportCSV(csvText: string): AttendanceCSVParseResult {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const records: RawPunchRecord[] = [];
  const errors: string[] = [];
  let skippedRows = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (i === 0 && /ac-no/i.test(line)) {
      skippedRows += 1;
      continue;
    }

    const match = line.match(/^(\d+),(?:"[^"]*",){2}"(\d{4}-\d{2}-\d{2})","([^"]*)"$/);
    if (!match) {
      const parts = line.replace(/"/g, '').split(',');
      if (parts.length < 5) {
        errors.push(`Row ${i + 1}: cannot parse`);
        skippedRows += 1;
        continue;
      }
      const [acNo, , , date, timeStr] = parts.map((part) => part.trim());
      if (!acNo || !date) {
        errors.push(`Row ${i + 1}: missing AC-No or Date`);
        skippedRows += 1;
        continue;
      }
      const times = String(timeStr || '')
        .trim()
        .split(/\s+/)
        .filter((time) => /^\d{2}:\d{2}$/.test(time));
      records.push({ acNo, date, punches: dedupeTimesBy2Minutes(times) });
      continue;
    }

    const [, acNo, date, timeStr] = match;
    const times = String(timeStr || '')
      .trim()
      .split(/\s+/)
      .filter((time) => /^\d{2}:\d{2}$/.test(time));
    records.push({ acNo, date, punches: dedupeTimesBy2Minutes(times) });
  }

  return {
    records,
    totalRows: Math.max(0, lines.length - 1),
    validRows: records.length,
    skippedRows,
    errors,
  };
}

/**
 * Parse ZK standard format:
 * UserID,DateTime,DeviceID
 * 100,2026-03-14 07:57:00,DEV01
 */
export function parseZKStandardCSV(csvText: string): AttendanceCSVParseResult {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const byEmployeeDate = new Map<string, RawPunchRecord>();
  const errors: string[] = [];
  let skippedRows = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (i === 0 && /userid/i.test(line) && /datetime/i.test(line)) {
      skippedRows += 1;
      continue;
    }

    const parts = line.split(',').map((part) => part.replace(/"/g, '').trim());
    if (parts.length < 2) {
      errors.push(`Row ${i + 1}: cannot parse`);
      skippedRows += 1;
      continue;
    }

    const acNo = String(parts[0] || '').trim();
    const dtRaw = String(parts[1] || '').trim();
    if (!acNo || !dtRaw) {
      errors.push(`Row ${i + 1}: missing UserID or DateTime`);
      skippedRows += 1;
      continue;
    }

    const dtMatch = dtRaw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::\d{2})?$/);
    if (!dtMatch) {
      errors.push(`Row ${i + 1}: invalid DateTime "${dtRaw}"`);
      skippedRows += 1;
      continue;
    }

    const [, date, time] = dtMatch;
    const key = `${acNo}|${date}`;
    const existing = byEmployeeDate.get(key) || { acNo, date, punches: [] };
    existing.punches.push(time);
    byEmployeeDate.set(key, existing);
  }

  const records = Array.from(byEmployeeDate.values()).map((item) => ({
    ...item,
    punches: dedupeTimesBy2Minutes(item.punches),
  }));

  return {
    records,
    totalRows: Math.max(0, lines.length - 1),
    validRows: records.length,
    skippedRows,
    errors,
  };
}

export function parseAttendanceCSVAuto(csvText: string): AttendanceCSVAutoResult {
  const firstLine = csvText.trim().split('\n')[0] ?? '';
  const isExportFormat =
    /ac-no/i.test(firstLine) || (firstLine.includes('"Date"') && firstLine.includes('"Time"'));

  if (isExportFormat) {
    const result = parseZKExportCSV(csvText);
    return { ...result, detectedFormat: 'zk_export' };
  }

  const result = parseZKStandardCSV(csvText);
  return { ...result, detectedFormat: 'zk_standard' };
}

export function parseAttendanceCSV(csvText: string): RawPunchRecord[] {
  return parseAttendanceCSVAuto(csvText).records;
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

function deduplicatePunches(punches: string[]): string[] {
  if (punches.length <= 1) return [...punches];
  const sorted = [...punches].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  const deduped: string[] = [];
  for (const item of sorted) {
    const prev = deduped[deduped.length - 1];
    if (!prev) {
      deduped.push(item);
      continue;
    }
    if (Math.abs(timeToMinutes(item) - timeToMinutes(prev)) > 5) deduped.push(item);
  }
  return deduped;
}

function normalizePunches(rawPunches: string[], shift: ShiftConfig): { punches: string[]; note: string } {
  if (rawPunches.length === 0) return { punches: [], note: '' };
  const deduped = deduplicatePunches(rawPunches);
  const sorted = [...deduped].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  let note = deduped.length !== rawPunches.length ? `Removed duplicate punches (${rawPunches.length} -> ${deduped.length})` : '';

  // Midnight spillover: in day-based exports, first punch before 04:00 is usually previous day checkout.
  if (shift.shiftType !== 'shift3' && sorted.length > 1 && timeToMinutes(sorted[0]) < 240) {
    sorted.shift();
    note = note ? `${note}; ignored pre-04:00 spillover punch` : 'Ignored pre-04:00 spillover punch';
  }

  return { punches: sorted, note };
}

function calcWorkedMinutes(checkIn: string, checkOut: string, shiftType: AttendanceShiftType): number {
  const inMinutes = timeToMinutes(checkIn);
  let outMinutes = timeToMinutes(checkOut);
  if (shiftType === 'shift3' && outMinutes < inMinutes) outMinutes += 24 * 60;
  return Math.max(0, outMinutes - inMinutes);
}

export function processDayRecord(input: ProcessDayInput): ProcessedDayResult {
  const shiftType = input.shiftType || 'shift1';
  const shift = SHIFT_CONFIGS[shiftType] || SHIFT_CONFIGS.shift1;
  const dayOfWeek = new Date(`${input.date}T00:00:00`).getDay();
  const normalized = normalizePunches(input.rawPunches, shift);
  const punches = normalized.punches;
  let hasAnomaly = normalized.note.length > 0;
  let anomalyNote = normalized.note;

  if (input.isHoliday) {
    return {
      checkIn: null,
      checkOut: null,
      workHours: 0,
      workMinutes: 0,
      status: 'holiday',
      statusDetails: 'يوم إجازة رسمية',
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      hasAnomaly: false,
      anomalyNote: '',
      normalizedPunches: punches,
    };
  }

  if (!input.isWorkDay) {
    return {
      checkIn: null,
      checkOut: null,
      workHours: 0,
      workMinutes: 0,
      status: dayOfWeek === 5 ? 'holiday' : 'off_day',
      statusDetails: dayOfWeek === 5 ? 'إجازة جمعة' : 'يوم راحة',
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      hasAnomaly: false,
      anomalyNote: '',
      normalizedPunches: punches,
    };
  }

  if (punches.length === 0) {
    return {
      checkIn: null,
      checkOut: null,
      workHours: 0,
      workMinutes: 0,
      status: 'absent',
      statusDetails: 'غائب',
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      hasAnomaly: false,
      anomalyNote: '',
      normalizedPunches: punches,
    };
  }

  const checkIn = punches[0];
  const checkOut = punches.length >= 2 ? punches[punches.length - 1] : null;

  if (punches.length >= 3) {
    hasAnomaly = true;
    anomalyNote = anomalyNote
      ? `${anomalyNote}; multiple punches detected, used first and last`
      : 'Multiple punches detected, used first and last';
  }

  if (!checkOut) {
    const checkInMinutes = timeToMinutes(checkIn);
    const splitTime = isValidClock(input.singlePunchSplitTime)
      ? input.singlePunchSplitTime
      : (isValidClock(shift.checkOutMin) ? shift.checkOutMin : '12:00');
    const splitMinutes = timeToMinutes(splitTime);
    const likelyCheckoutOnly = checkInMinutes >= splitMinutes;
    if (likelyCheckoutOnly) {
      hasAnomaly = true;
      anomalyNote = anomalyNote
        ? `${anomalyNote}; single punch after ${splitTime} (likely checkout only)`
        : `Single punch after ${splitTime} (likely checkout only)`;
      return {
        checkIn: null,
        checkOut: checkIn,
        workHours: null,
        workMinutes: null,
        status: 'single_punch',
        statusDetails: 'بصمة واحدة (خروج فقط)',
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        overtimeMinutes: 0,
        hasAnomaly: true,
        anomalyNote: anomalyNote || 'Single checkout-only punch',
        normalizedPunches: punches,
      };
    }
    const lateMinutes = Math.max(0, checkInMinutes - timeToMinutes(shift.checkInExpected));
    return {
      checkIn,
      checkOut: null,
      workHours: null,
      workMinutes: null,
      status: 'no_checkout',
      statusDetails: 'حضر بدون تسجيل خروج',
      lateMinutes,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      hasAnomaly: true,
      anomalyNote: anomalyNote || 'Single punch without checkout',
      normalizedPunches: punches,
    };
  }

  const workMinutes = calcWorkedMinutes(checkIn, checkOut, shift.shiftType);
  const workHours = minutesToDecimalHours(workMinutes);
  const lateMinutes = Math.max(0, timeToMinutes(checkIn) - timeToMinutes(shift.checkInExpected));
  const earlyLeaveMinutes = Math.max(0, timeToMinutes(shift.checkOutExpected) - timeToMinutes(checkOut));
  const overtimeMinutes = Math.max(0, workMinutes - Math.round(shift.workHoursExpected * 60) - 30);

  if (timeToMinutes(checkIn) >= 19 * 60 || timeToMinutes(checkOut) >= 22 * 60) {
    hasAnomaly = true;
    anomalyNote = anomalyNote ? `${anomalyNote}; unusually late punches` : 'Unusually late punches';
  }

  let status: AttendanceStatus = 'present';
  let statusDetails = 'حضور طبيعي';
  if (lateMinutes > 0 && earlyLeaveMinutes > 30) {
    status = 'present_late_early';
    statusDetails = `متأخر ${lateMinutes} دقيقة + خرج مبكر ${earlyLeaveMinutes} دقيقة`;
  } else if (lateMinutes > 0) {
    status = 'present_late';
    statusDetails = `متأخر ${lateMinutes} دقيقة`;
  } else if (earlyLeaveMinutes > 30) {
    status = 'present_early_leave';
    statusDetails = `خرج مبكر ${earlyLeaveMinutes} دقيقة`;
  } else if (overtimeMinutes > 0) {
    status = 'overtime';
    statusDetails = `عمل أوفر تايم ${overtimeMinutes} دقيقة`;
  }

  return {
    checkIn,
    checkOut,
    workHours,
    workMinutes,
    status,
    statusDetails,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeMinutes,
    hasAnomaly,
    anomalyNote,
    normalizedPunches: punches,
  };
}
