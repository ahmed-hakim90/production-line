import { collection, doc } from 'firebase/firestore';
import { db } from '@/services/firebase';

export const PRODUCTION_WORKER_COLLECTIONS = {
  WORKERS: 'production_workers',
  LINE_ASSIGNMENTS: 'production_line_worker_assignments',
  TARGETS: 'production_worker_targets',
  PERFORMANCE_SUMMARIES: 'worker_performance_summaries',
  APPROVAL_REQUESTS: 'production_approval_requests',
} as const;

export const productionWorkersRef = () => collection(db, PRODUCTION_WORKER_COLLECTIONS.WORKERS);
export const productionLineWorkerAssignmentsRef = () =>
  collection(db, PRODUCTION_WORKER_COLLECTIONS.LINE_ASSIGNMENTS);
export const productionWorkerTargetsRef = () => collection(db, PRODUCTION_WORKER_COLLECTIONS.TARGETS);
export const productionApprovalRequestsRef = () => collection(db, PRODUCTION_WORKER_COLLECTIONS.APPROVAL_REQUESTS);
export const productionApprovalRequestDocRef = (id: string) =>
  doc(db, PRODUCTION_WORKER_COLLECTIONS.APPROVAL_REQUESTS, id);

export const workerPerformanceSummaryDocRef = (workerId: string, month: string) =>
  doc(db, PRODUCTION_WORKER_COLLECTIONS.PERFORMANCE_SUMMARIES, `${workerId}_${month}`);
