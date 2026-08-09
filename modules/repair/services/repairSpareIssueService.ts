import {
  getCountFromServer,
  getDocs,
  orderBy,
  where,
  limit,
  startAfter,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsClient, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type {
  RepairSpareIssue,
  RepairSpareIssueStatus,
  RepairSpareReturnLine,
} from '../types';
import { REPAIR_SPARE_ISSUES_COLLECTION } from '../lib/repairSpareIssue';
import { resolveInventoryWarehouseReadScope } from '../../inventory/services/inventoryWarehouseScopeService';

const PENDING_ISSUE_STATUSES: RepairSpareIssueStatus[] = ['draft', 'submitted', 'approved'];

const COLLECTION = REPAIR_SPARE_ISSUES_COLLECTION;
const MAX_PAGE = 50;

type FirestoreCursor = QueryDocumentSnapshot | null;

type CallableCreateInput = {
  warehouseId: string;
  branchId: string;
  jobId?: string;
  jobCode?: string;
  note?: string;
  lines: Array<{
    itemId: string;
    quantity: number;
    locationId?: string;
    locationCode?: string;
    allocations?: Array<{
      locationId: string;
      locationCode: string;
      rack?: string;
      shelf?: string;
      quantity: number;
    }>;
  }>;
  jobPartUsage?: {
    partId: string;
    partName?: string;
    scope?: 'job' | 'product';
    productItemId?: string;
    productName?: string;
  };
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
    if (code.includes('permission-denied')) throw new Error(message || 'ليس لديك صلاحية لتنفيذ هذا الإجراء.');
    if (code.includes('failed-precondition')) throw new Error(message || 'لا يمكن تنفيذ العملية في الحالة الحالية.');
    if (code.includes('invalid-argument')) throw new Error(message || 'بيانات غير صالحة.');
    if (code.includes('not-found')) throw new Error(message || 'السند غير موجود.');
    if (message) throw new Error(message);
    throw new Error('تعذر تنفيذ العملية.');
  }
};

export const repairSpareIssueService = {
  async listRecent(
    max = 200,
    warehouseIds?: string[],
  ): Promise<RepairSpareIssue[]> {
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
    const snap = await getDocs(tenantQuery(db, COLLECTION, ...constraints));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSpareIssue));
  },

  async listPaged(params?: {
    status?: RepairSpareIssueStatus;
    branchId?: string;
    warehouseId?: string;
    limit?: number;
    cursor?: FirestoreCursor;
  }): Promise<{
    items: RepairSpareIssue[];
    nextCursor: FirestoreCursor;
    hasMore: boolean;
  }> {
    if (!isConfigured) return { items: [], nextCursor: null, hasMore: false };
    const scope = await resolveInventoryWarehouseReadScope(params?.warehouseId);
    if (scope.denied) return { items: [], nextCursor: null, hasMore: false };
    const pageSize = Math.max(1, Math.min(Number(params?.limit || 25), MAX_PAGE));
    const constraints: any[] = [orderBy('createdAt', 'desc'), limit(pageSize)];
    if (params?.status) constraints.unshift(where('status', '==', params.status));
    if (params?.branchId) constraints.unshift(where('branchId', '==', params.branchId));
    if (scope.warehouseId) constraints.unshift(where('warehouseId', '==', scope.warehouseId));
    if (params?.cursor) constraints.push(startAfter(params.cursor));
    const snap = await getDocs(tenantQuery(db, COLLECTION, ...constraints));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSpareIssue));
    const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { items, nextCursor, hasMore: snap.docs.length === pageSize };
  },

  /** Open vouchers awaiting submit / approve / issue — warehouse-scoped when bound. */
  async countPending(): Promise<number> {
    if (!isConfigured) return 0;
    try {
      const scope = await resolveInventoryWarehouseReadScope();
      if (scope.denied) return 0;
      const constraints: QueryConstraint[] = [
        where('status', 'in', PENDING_ISSUE_STATUSES),
      ];
      if (scope.warehouseId) {
        constraints.push(where('warehouseId', '==', scope.warehouseId));
      }
      const snap = await getCountFromServer(tenantQuery(db, COLLECTION, ...constraints));
      return snap.data().count;
    } catch (error: unknown) {
      const code = String((error as { code?: string })?.code || '').toLowerCase();
      if (code.includes('permission-denied')) return 0;
      console.error('repairSpareIssue.countPending failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  },

  async create(input: CallableCreateInput): Promise<{
    id: string;
    referenceNo: string;
    status: string;
    approvalMode: string;
  }> {
    return callSafe(async () => {
      const callable = httpsCallable<
        CallableCreateInput,
        { id: string; referenceNo: string; status: string; approvalMode: string }
      >(requireFunctions(), 'createRepairSpareIssue');
      const result = await callable(input);
      return result.data;
    });
  },

  async submit(issueId: string): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<{ issueId: string }, { id: string }>(
        requireFunctions(),
        'submitRepairSpareIssue',
      );
      await callable({ issueId });
    });
  },

  async approve(issueId: string): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<{ issueId: string }, { id: string }>(
        requireFunctions(),
        'approveRepairSpareIssue',
      );
      await callable({ issueId });
    });
  },

  async reject(issueId: string, reason?: string): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<{ issueId: string; reason?: string }, { id: string }>(
        requireFunctions(),
        'rejectRepairSpareIssue',
      );
      await callable({ issueId, reason });
    });
  },

  async issue(issueId: string): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<{ issueId: string }, { id: string }>(
        requireFunctions(),
        'issueRepairSpareIssue',
      );
      await callable({ issueId });
    });
  },

  async cancel(issueId: string): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<{ issueId: string }, { id: string }>(
        requireFunctions(),
        'cancelRepairSpareIssue',
      );
      await callable({ issueId });
    });
  },

  async returnLines(issueId: string, lines: RepairSpareReturnLine[]): Promise<void> {
    await callSafe(async () => {
      const callable = httpsCallable<
        { issueId: string; lines: RepairSpareReturnLine[] },
        { id: string; ok: true }
      >(requireFunctions(), 'returnRepairSpareIssue');
      await callable({ issueId, lines });
    });
  },
};
