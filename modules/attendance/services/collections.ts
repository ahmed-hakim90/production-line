import { collection, CollectionReference } from 'firebase/firestore';
import { db } from '@/services/firebase';

export const ATTENDANCE_COLLECTIONS = {
  ATTENDANCE_LOGS: 'attendance_logs',
  ATTENDANCE_RECORDS: 'attendance_records',
} as const;

export function attendanceLogsRef(): CollectionReference {
  return collection(db, ATTENDANCE_COLLECTIONS.ATTENDANCE_LOGS);
}

export function attendanceRecordsRef(): CollectionReference {
  return collection(db, ATTENDANCE_COLLECTIONS.ATTENDANCE_RECORDS);
}
