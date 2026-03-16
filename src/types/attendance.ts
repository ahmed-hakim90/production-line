export type AttendanceStatus =
  | 'present'
  | 'present_late'
  | 'present_early_leave'
  | 'present_late_early'
  | 'absent'
  | 'holiday'
  | 'no_checkout'
  | 'single_punch'
  | 'overtime'
  | 'off_day'
  | 'late'
  | 'partial';

export type AttendanceShiftType = 'shift1' | 'shift2' | 'shift3' | 'flexible';

export interface ShiftConfig {
  shiftType: AttendanceShiftType;
  checkInStart: string;
  checkInExpected: string;
  checkInLateCutoff: string;
  checkOutMin: string;
  checkOutExpected: string;
  workHoursExpected: number;
}

export const SHIFT_CONFIGS: Record<AttendanceShiftType, ShiftConfig> = {
  shift1: {
    shiftType: 'shift1',
    checkInStart: '06:30',
    checkInExpected: '08:00',
    checkInLateCutoff: '09:00',
    checkOutMin: '13:00',
    checkOutExpected: '14:30',
    workHoursExpected: 6.5,
  },
  shift2: {
    shiftType: 'shift2',
    checkInStart: '09:00',
    checkInExpected: '10:00',
    checkInLateCutoff: '11:00',
    checkOutMin: '15:00',
    checkOutExpected: '16:30',
    workHoursExpected: 6.5,
  },
  shift3: {
    shiftType: 'shift3',
    checkInStart: '18:00',
    checkInExpected: '20:00',
    checkInLateCutoff: '21:00',
    checkOutMin: '04:00',
    checkOutExpected: '06:00',
    workHoursExpected: 10,
  },
  flexible: {
    shiftType: 'flexible',
    checkInStart: '06:00',
    checkInExpected: '08:00',
    checkInLateCutoff: '10:00',
    checkOutMin: '12:00',
    checkOutExpected: '16:00',
    workHoursExpected: 8,
  },
};
