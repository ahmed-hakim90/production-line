import {
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import type {
  ProductionWorker,
  ProductionWorkerManagementReview,
  ProductionWorkerRatingRecord,
  ProductionWorkerRatingReviewStatus,
} from '@/types';
import { productionWorkersRef } from '../collections';

const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const ratingDocId = (workerId: string, supervisorId: string, date: string) =>
  [workerId, supervisorId, date].map((part) => encodeURIComponent(part)).join('__');

const decodeRatingWorkerId = (id: string) => {
  const [workerId] = id.split('__');
  try {
    return decodeURIComponent(workerId || '');
  } catch {
    return workerId || '';
  }
};

const getWorkers = async (): Promise<ProductionWorker[]> => {
  const snap = await getDocs(query(
    productionWorkersRef(),
    where('tenantId', '==', getCurrentTenantId()),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionWorker));
};

const collectRatingRecords = (workers: ProductionWorker[]): ProductionWorkerRatingRecord[] => (
  workers.flatMap((worker) => Object.entries(worker.ratingRecords ?? {}).map(([id, record]) => ({
    ...record,
    id: record.id || id,
    workerId: record.workerId || worker.id || '',
    workerName: record.workerName || worker.name,
    tenantId: record.tenantId || worker.tenantId,
  })))
);

const findWorkerForRating = async (id: string): Promise<ProductionWorker | null> => {
  const workerId = decodeRatingWorkerId(id);
  if (workerId) {
    const snap = await getDoc(doc(productionWorkersRef(), workerId));
    if (snap.exists()) {
      const worker = { id: snap.id, ...snap.data() } as ProductionWorker;
      if (worker.ratingRecords?.[id]) return worker;
    }
  }
  return (await getWorkers()).find((worker) => Boolean(worker.ratingRecords?.[id])) ?? null;
};

export type UpsertProductionWorkerRatingInput = Omit<
  ProductionWorkerRatingRecord,
  'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'managementReview'
>;

export const productionWorkerRatingService = {
  async getRecent(maxRows = 200): Promise<ProductionWorkerRatingRecord[]> {
    if (!isConfigured) return [];
    return collectRatingRecords(await getWorkers())
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, maxRows);
  },

  async getBySupervisorAndDate(supervisorId: string, date: string): Promise<ProductionWorkerRatingRecord[]> {
    if (!isConfigured || !supervisorId || !date) return [];
    return collectRatingRecords(await getWorkers())
      .filter((row) => row.supervisorId === supervisorId && row.date === date);
  },

  async upsertSupervisorRating(data: UpsertProductionWorkerRatingInput): Promise<string> {
    if (!isConfigured || !data.workerId || !data.supervisorId || !data.date) return '';
    const id = ratingDocId(data.workerId, data.supervisorId, data.date);
    const ref = doc(productionWorkersRef(), data.workerId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return '';
    const worker = { id: snap.id, ...snap.data() } as ProductionWorker;
    const existing = worker.ratingRecords?.[id];
    const payload = stripUndefined({
      ...data,
      id,
      workerName: data.workerName || worker.name,
      period: data.period || data.date,
      tenantId: getCurrentTenantId(),
      managementReview: existing?.managementReview ?? { status: 'pending' as ProductionWorkerRatingReviewStatus },
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }) as unknown as ProductionWorkerRatingRecord;
    await updateDoc(ref, {
      ratingRecords: {
        ...(worker.ratingRecords ?? {}),
        [id]: payload,
      },
      updatedAt: serverTimestamp(),
    });
    return id;
  },

  async deleteSupervisorRating(data: { workerId: string; supervisorId: string; date: string }): Promise<string> {
    if (!isConfigured || !data.workerId || !data.supervisorId || !data.date) return '';
    const id = ratingDocId(data.workerId, data.supervisorId, data.date);
    await updateDoc(
      doc(productionWorkersRef(), data.workerId),
      new FieldPath('ratingRecords', id),
      deleteField(),
      'updatedAt',
      serverTimestamp(),
    );
    return id;
  },

  async reviewByManagement(
    id: string,
    review: Omit<ProductionWorkerManagementReview, 'reviewedAt'>,
  ): Promise<void> {
    if (!isConfigured || !id) return;
    const worker = await findWorkerForRating(id);
    if (!worker?.id) return;
    const existing = worker.ratingRecords?.[id];
    if (!existing) return;
    await updateDoc(doc(productionWorkersRef(), worker.id), {
      ratingRecords: {
        ...(worker.ratingRecords ?? {}),
        [id]: {
          ...existing,
          managementReview: stripUndefined({
            ...review,
            reviewedAt: new Date().toISOString(),
          }),
          updatedAt: new Date().toISOString(),
        },
      },
      updatedAt: serverTimestamp(),
    });
  },
};
