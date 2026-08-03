import {
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import type { ProductionLineWorkerAssignment } from '@/types';
import { productionLineWorkerAssignmentsRef } from '../collections';
import {
  WORKER_ASSIGNMENT_OPERATION_KEYS,
  assertCurrentTenantOperationPathEnabled,
  type PermanentWorkerAssignmentPath,
} from '../../system/lib/operationPathSettings';

const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const eqTenant = () => where('tenantId', '==', getCurrentTenantId());

const isActiveOnDate = (row: ProductionLineWorkerAssignment, date: string): boolean => {
  if (!row.isActive) return false;
  if (row.startDate > date) return false;
  if (row.endDate && row.endDate < date) return false;
  return true;
};

export const productionLineWorkerAssignmentService = {
  async getAll(): Promise<ProductionLineWorkerAssignment[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(query(productionLineWorkerAssignmentsRef(), eqTenant()));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionLineWorkerAssignment));
  },

  async getByWorker(workerId: string): Promise<ProductionLineWorkerAssignment[]> {
    if (!isConfigured || !workerId) return [];
    const snap = await getDocs(
      query(productionLineWorkerAssignmentsRef(), eqTenant(), where('workerId', '==', workerId)),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionLineWorkerAssignment));
  },

  async getActiveByLineAndDate(lineId: string, date: string): Promise<ProductionLineWorkerAssignment[]> {
    if (!isConfigured || !lineId || !date) return [];
    const snap = await getDocs(
      query(productionLineWorkerAssignmentsRef(), eqTenant(), where('lineId', '==', lineId)),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as ProductionLineWorkerAssignment))
      .filter((row) => isActiveOnDate(row, date));
  },

  async create(
    data: Omit<ProductionLineWorkerAssignment, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>,
    context: { path: PermanentWorkerAssignmentPath },
  ): Promise<string> {
    await assertCurrentTenantOperationPathEnabled(
      WORKER_ASSIGNMENT_OPERATION_KEYS.permanent,
      context.path,
    );
    if (!isConfigured) return '';
    const ref = await addDoc(productionLineWorkerAssignmentsRef(), {
      ...stripUndefined(data as Record<string, unknown>),
      tenantId: getCurrentTenantId(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  async update(
    id: string,
    data: Partial<ProductionLineWorkerAssignment>,
    context: { path: PermanentWorkerAssignmentPath },
  ): Promise<void> {
    await assertCurrentTenantOperationPathEnabled(
      WORKER_ASSIGNMENT_OPERATION_KEYS.permanent,
      context.path,
    );
    if (!isConfigured || !id) return;
    const { id: _id, createdAt: _c, tenantId: _t, ...rest } = data;
    await updateDoc(doc(productionLineWorkerAssignmentsRef(), id), {
      ...stripUndefined(rest as Record<string, unknown>),
      updatedAt: serverTimestamp(),
    });
  },

  async remove(
    id: string,
    context: { path: PermanentWorkerAssignmentPath },
  ): Promise<void> {
    await assertCurrentTenantOperationPathEnabled(
      WORKER_ASSIGNMENT_OPERATION_KEYS.permanent,
      context.path,
    );
    if (!isConfigured || !id) return;
    await deleteDoc(doc(productionLineWorkerAssignmentsRef(), id));
  },
};
