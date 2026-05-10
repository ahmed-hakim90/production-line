import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  type Transaction,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { REPAIR_JOBS_COLLECTION, REPAIR_SERVICE_EVENTS_SUBCOLLECTION } from '../collections';
import { REPAIR_DOMAIN_EVENT_VERSION } from '../utils/repairDomainEvents';
import type { RepairServiceEvent } from '../types';

const withSchemaVersion = (event: Omit<RepairServiceEvent, 'id' | 'jobId'>): Record<string, unknown> => {
  const base = { ...event } as Record<string, unknown>;
  if (event.domainEvent && event.eventSchemaVersion === undefined) {
    base.eventSchemaVersion = REPAIR_DOMAIN_EVENT_VERSION;
  }
  return base;
};

export const appendRepairServiceEventTx = (
  tx: Transaction,
  jobId: string,
  event: Omit<RepairServiceEvent, 'id' | 'jobId'>,
): void => {
  const jobRef = doc(db, REPAIR_JOBS_COLLECTION, jobId);
  const evRef = doc(collection(jobRef, REPAIR_SERVICE_EVENTS_SUBCOLLECTION));
  tx.set(evRef, {
    ...withSchemaVersion(event),
    jobId,
  } as Record<string, unknown>);
};

/** إضافة حدث خدمة (خارج معاملة) — للمسارات التي لا تستخدم runTransaction/writeBatch على الطلب. */
export const appendRepairServiceEvent = async (
  jobId: string,
  event: Omit<RepairServiceEvent, 'id' | 'jobId'>,
): Promise<void> => {
  if (!isConfigured || !jobId) return;
  const jobRef = doc(db, REPAIR_JOBS_COLLECTION, jobId);
  await addDoc(collection(jobRef, REPAIR_SERVICE_EVENTS_SUBCOLLECTION), {
    ...withSchemaVersion(event),
    jobId,
  } as Record<string, unknown>);
};

export const repairServiceEventService = {
  async listByJob(jobId: string): Promise<RepairServiceEvent[]> {
    if (!isConfigured || !jobId) return [];
    const jobRef = doc(db, REPAIR_JOBS_COLLECTION, jobId);
    const q = query(collection(jobRef, REPAIR_SERVICE_EVENTS_SUBCOLLECTION), orderBy('at', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairServiceEvent));
  },
};
