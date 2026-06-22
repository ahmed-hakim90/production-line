import {
  addDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import type { ProductionWorker } from '@/types';
import { productionWorkersRef } from '../collections';

const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const withTenant = <T extends Record<string, unknown>>(data: T) => ({
  ...stripUndefined(data),
  tenantId: getCurrentTenantId(),
});

export type LinkEmployeeInput = {
  employeeId: string;
  name: string;
  code?: string;
  defaultLineId?: string;
  isActive?: boolean;
};

export const resolveWorkerCodeFromEmployee = (employee: {
  code?: string;
  acNo?: string;
  id?: string;
}): string => String(employee.code || employee.acNo || employee.id || '').trim();

export const buildWorkerCreatePayload = (
  input: LinkEmployeeInput,
): Omit<ProductionWorker, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'> => {
  const code = String(input.code || '').trim() || resolveWorkerCodeFromEmployee({
    code: input.code,
    id: input.employeeId,
  });
  const payload: Omit<ProductionWorker, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'> = {
    employeeId: input.employeeId,
    name: input.name.trim(),
    code,
    isActive: input.isActive ?? true,
    workerType: 'production',
    lineIds: input.defaultLineId ? [input.defaultLineId] : [],
  };
  if (input.defaultLineId) {
    payload.defaultLineId = input.defaultLineId;
  }
  return payload;
};

export const productionWorkerService = {
  async getAll(): Promise<ProductionWorker[]> {
    if (!isConfigured) return [];
    const q = query(
      productionWorkersRef(),
      where('tenantId', '==', getCurrentTenantId()),
      orderBy('name', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionWorker));
  },

  async getById(id: string): Promise<ProductionWorker | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(productionWorkersRef(), id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as ProductionWorker;
  },

  async getByEmployeeId(employeeId: string): Promise<ProductionWorker | null> {
    if (!isConfigured || !employeeId) return null;
    const q = query(
      productionWorkersRef(),
      where('tenantId', '==', getCurrentTenantId()),
      where('employeeId', '==', employeeId),
    );
    const snap = await getDocs(q);
    const row = snap.docs[0];
    return row ? ({ id: row.id, ...row.data() } as ProductionWorker) : null;
  },

  async create(data: Omit<ProductionWorker, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>): Promise<string> {
    if (!isConfigured) return '';
    const ref = await addDoc(productionWorkersRef(), {
      ...withTenant({
        ...data,
        workerType: 'production' as const,
        lineIds: data.lineIds ?? [],
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  async linkEmployee(input: LinkEmployeeInput): Promise<string> {
    if (!input.employeeId?.trim()) return '';
    const existing = await this.getByEmployeeId(input.employeeId);
    if (existing?.id) return existing.id;
    return this.create(buildWorkerCreatePayload(input));
  },

  async linkEmployees(
    employees: LinkEmployeeInput[],
    shared?: Pick<LinkEmployeeInput, 'defaultLineId' | 'isActive'>,
    onProgress?: (current: number, total: number) => void,
  ): Promise<{
    linked: number;
    skipped: number;
    failed: number;
    workerIds: string[];
    errors: { employeeId: string; name: string; message: string }[];
  }> {
    const result = {
      linked: 0,
      skipped: 0,
      failed: 0,
      workerIds: [] as string[],
      errors: [] as { employeeId: string; name: string; message: string }[],
    };
    for (const [index, row] of employees.entries()) {
      onProgress?.(index + 1, employees.length);
      if (!row.employeeId?.trim()) continue;
      const input: LinkEmployeeInput = {
        ...row,
        defaultLineId: row.defaultLineId ?? shared?.defaultLineId,
        isActive: row.isActive ?? shared?.isActive,
      };
      try {
        const existing = await this.getByEmployeeId(input.employeeId);
        if (existing?.id) {
          result.skipped += 1;
          result.workerIds.push(existing.id);
          continue;
        }
        const id = await this.create(buildWorkerCreatePayload(input));
        if (id) {
          result.linked += 1;
          result.workerIds.push(id);
        } else {
          result.failed += 1;
          result.errors.push({
            employeeId: input.employeeId,
            name: input.name,
            message: 'تعذر إنشاء ملف العامل',
          });
        }
      } catch (err) {
        result.failed += 1;
        result.errors.push({
          employeeId: input.employeeId,
          name: input.name,
          message: err instanceof Error ? err.message : 'حدث خطأ غير متوقع',
        });
      }
    }
    return result;
  },

  async update(id: string, data: Partial<ProductionWorker>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, createdAt: _c, tenantId: _t, ...rest } = data;
    await updateDoc(doc(productionWorkersRef(), id), {
      ...stripUndefined(rest as Record<string, unknown>),
      updatedAt: serverTimestamp(),
    });
  },

  async removeSupervisorRating(id: string, supervisorId: string): Promise<void> {
    if (!isConfigured || !id || !supervisorId) return;
    await updateDoc(
      doc(productionWorkersRef(), id),
      new FieldPath('supervisorRatings', supervisorId),
      deleteField(),
      'updatedAt',
      serverTimestamp(),
    );
  },
};
