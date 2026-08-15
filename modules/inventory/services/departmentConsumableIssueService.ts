import {
  getDocs,
  orderBy,
  where,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsClient, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type {
  DepartmentConsumableIssue,
  DepartmentConsumableIssueStatus,
  DepartmentConsumableMonthlyReport,
  DepartmentConsumableReturnLine,
} from '../types';
import { DEPARTMENT_CONSUMABLE_ISSUES_COLLECTION } from '../lib/departmentConsumableIssue';
import { toUserSafeFirestoreError } from '../../repair/lib/repairFirestoreErrors';
import { resolveInventoryWarehouseReadScope } from './inventoryWarehouseScopeService';

const COLLECTION = DEPARTMENT_CONSUMABLE_ISSUES_COLLECTION;
const MAX_PAGE = 50;

type FirestoreCursor = QueryDocumentSnapshot | null;

type CallableCreateInput = {
  warehouseId: string;
  departmentId: string;
  note?: string;
  lines: Array<{
    itemId: string;
    quantity: number;
    locationId?: string;
    locationCode?: string;
  }>;
};

const requireFunctions = () => {
  if (!isConfigured || !functionsClient) {
    throw new Error('Firebase غير مهيأ.');
  }
  return functionsClient;
};

const callSafe = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error: any) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').trim();
    if (code.includes('unauthenticated')) throw new Error('يجب تسجيل الدخول أولًا ثم إعادة المحاولة.');
    if (/missing or insufficient permissions/i.test(message)) {
      throw new Error('ليس لديك صلاحية لتنفيذ هذا الإجراء.');
    }
    if (code.includes('permission-denied')) throw new Error(message || 'ليس لديك صلاحية لتنفيذ هذا الإجراء.');
    if (code.includes('failed-precondition')) throw new Error(message || 'لا يمكن تنفيذ العملية في الحالة الحالية.');
    if (code.includes('invalid-argument')) throw new Error(message || 'بيانات غير صالحة.');
    if (code.includes('not-found')) throw new Error(message || 'السند غير موجود.');
    if (message) throw new Error(message);
    throw new Error('تعذر تنفيذ العملية.');
  }
};

export const departmentConsumableIssueService = {
  async listPaged(params?: {
    status?: DepartmentConsumableIssueStatus;
    departmentId?: string;
    warehouseId?: string;
    limit?: number;
    cursor?: FirestoreCursor;
  }): Promise<{
    items: DepartmentConsumableIssue[];
    nextCursor: FirestoreCursor;
    hasMore: boolean;
  }> {
    if (!isConfigured) return { items: [], nextCursor: null, hasMore: false };
    const scope = await resolveInventoryWarehouseReadScope(params?.warehouseId);
    if (scope.denied) return { items: [], nextCursor: null, hasMore: false };
    const pageSize = Math.max(1, Math.min(Number(params?.limit || 25), MAX_PAGE));
    const constraints: any[] = [orderBy('createdAt', 'desc'), limit(pageSize)];
    if (params?.status) constraints.unshift(where('status', '==', params.status));
    if (params?.departmentId) constraints.unshift(where('departmentId', '==', params.departmentId));
    if (scope.warehouseId) constraints.unshift(where('warehouseId', '==', scope.warehouseId));
    if (params?.cursor) constraints.push(startAfter(params.cursor));
    const snap = await getDocs(tenantQuery(db, COLLECTION, ...constraints)).catch((error) => {
      throw new Error(toUserSafeFirestoreError(error, 'تعذر تحميل سندات صرف المستهلكات.'));
    });
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DepartmentConsumableIssue));
    const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { items, nextCursor, hasMore: snap.docs.length === pageSize };
  },

  async listRecent(
    max = 200,
    warehouseIds?: string[],
  ): Promise<DepartmentConsumableIssue[]> {
    if (!isConfigured) return [];
    const scope = await resolveInventoryWarehouseReadScope();
    if (scope.denied) return [];
    const requestedWarehouseIds = warehouseIds == null
      ? null
      : Array.from(new Set(warehouseIds.map((id) => String(id || '').trim()).filter(Boolean)));
    if (
      scope.warehouseId
      && requestedWarehouseIds
      && !requestedWarehouseIds.includes(scope.warehouseId)
    ) return [];
    const scopedWarehouseIds = scope.warehouseId
      ? [scope.warehouseId]
      : requestedWarehouseIds;
    if (scopedWarehouseIds && scopedWarehouseIds.length === 0) return [];
    if (scopedWarehouseIds && scopedWarehouseIds.length > 10) {
      throw new Error('نطاق المخازن أكبر من الحد المسموح للاستعلام.');
    }
    const constraints: any[] = [orderBy('createdAt', 'desc'), limit(Math.min(max, 500))];
    if (scopedWarehouseIds?.length === 1) {
      constraints.unshift(where('warehouseId', '==', scopedWarehouseIds[0]));
    } else if (scopedWarehouseIds && scopedWarehouseIds.length > 1) {
      constraints.unshift(where('warehouseId', 'in', scopedWarehouseIds));
    }
    const snap = await getDocs(
      tenantQuery(db, COLLECTION, ...constraints),
    ).catch((error) => {
      throw new Error(toUserSafeFirestoreError(error, 'تعذر تحميل سندات صرف المستهلكات.'));
    });
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DepartmentConsumableIssue));
  },

  async addStock(input: {
    warehouseId: string;
    itemId: string;
    quantity: number;
    locationId?: string;
    locationCode?: string;
    note?: string;
  }): Promise<{ id: string; referenceNo: string }> {
    return callSafe(async () => {
      const callable = httpsCallable<
        {
          warehouseId: string;
          itemId: string;
          quantity: number;
          locationId?: string;
          locationCode?: string;
          note?: string;
        },
        { id: string; referenceNo: string }
      >(requireFunctions(), 'addDepartmentConsumableStock');
      const result = await callable(input);
      return result.data;
    });
  },

  async create(input: CallableCreateInput): Promise<{ id: string; referenceNo: string; status: string }> {
    return callSafe(async () => {
      const callable = httpsCallable<
        CallableCreateInput,
        { id: string; referenceNo: string; status: string }
      >(requireFunctions(), 'createDepartmentConsumableIssue');
      const result = await callable(input);
      return result.data;
    });
  },

  async submit(issueId: string): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<{ issueId: string }, { id: string }>(
        requireFunctions(),
        'submitDepartmentConsumableIssue',
      );
      await callable({ issueId });
    });
  },

  async approve(issueId: string): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<{ issueId: string }, { id: string }>(
        requireFunctions(),
        'approveDepartmentConsumableIssue',
      );
      await callable({ issueId });
    });
  },

  async reject(issueId: string, reason?: string): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<{ issueId: string; reason?: string }, { id: string }>(
        requireFunctions(),
        'rejectDepartmentConsumableIssue',
      );
      await callable({ issueId, reason });
    });
  },

  async issue(issueId: string): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<{ issueId: string }, { id: string }>(
        requireFunctions(),
        'issueDepartmentConsumableIssue',
      );
      await callable({ issueId });
    });
  },

  async cancel(issueId: string): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<{ issueId: string }, { id: string }>(
        requireFunctions(),
        'cancelDepartmentConsumableIssue',
      );
      await callable({ issueId });
    });
  },

  async returnLines(issueId: string, lines: DepartmentConsumableReturnLine[]): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<
        { issueId: string; lines: DepartmentConsumableReturnLine[] },
        { id: string; ok: true }
      >(requireFunctions(), 'returnDepartmentConsumableIssue');
      await callable({ issueId, lines });
    });
  },

  async monthlyReport(params: {
    month: string;
    departmentId?: string;
    warehouseId?: string;
  }): Promise<DepartmentConsumableMonthlyReport> {
    return callSafe(async () => {
      const callable = httpsCallable<
        { month: string; departmentId?: string; warehouseId?: string },
        DepartmentConsumableMonthlyReport
      >(requireFunctions(), 'getDepartmentConsumableMonthlyReport');
      const result = await callable(params);
      return result.data;
    });
  },
};
