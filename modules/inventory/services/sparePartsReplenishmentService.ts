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
  SparePartsReplenishmentRequest,
  SparePartsReplenishmentStatus,
} from '../types';
import { SPARE_PARTS_REPLENISHMENT_COLLECTION } from '../lib/sparePartsReplenishment';
import { resolveInventoryWarehouseReadScope } from './inventoryWarehouseScopeService';

const COLLECTION = SPARE_PARTS_REPLENISHMENT_COLLECTION;
const MAX_PAGE = 50;

type FirestoreCursor = QueryDocumentSnapshot | null;

type CreateInput = {
  fromWarehouseId: string;
  toWarehouseId: string;
  note?: string;
  lines: Array<{ itemId: string; quantity: number }>;
};

const requireFunctions = () => {
  if (!isConfigured || !functionsClient) {
    throw new Error('Firebase غير مهيأ.');
  }
  return functionsClient;
};

const isPermissionDenied = (error: unknown): boolean => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    code.includes('permission-denied')
    || message.includes('missing or insufficient permissions')
    || message.includes('permission-denied')
  );
};

const toUserSafeError = (error: unknown, fallback: string): Error => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').trim();
  if (code.includes('unauthenticated') || message.toLowerCase().includes('unauthenticated')) {
    return new Error('يجب تسجيل الدخول أولًا ثم إعادة المحاولة.');
  }
  if (isPermissionDenied(error)) {
    return new Error(
      'ليس لديك صلاحية قراءة/تنفيذ تموين قطع الغيار. تأكد من صلاحية العرض في الدور، أو أن قواعد Firestore محدّثة.',
    );
  }
  if (code.includes('failed-precondition')) return new Error(message || 'لا يمكن تنفيذ العملية في الحالة الحالية.');
  if (code.includes('invalid-argument')) return new Error(message || 'بيانات غير صالحة.');
  if (code.includes('not-found')) return new Error(message || 'الطلب غير موجود.');
  if (message && !message.toLowerCase().includes('missing or insufficient permissions')) {
    return new Error(message);
  }
  return new Error(fallback);
};

const callSafe = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error: unknown) {
    throw toUserSafeError(error, 'تعذر تنفيذ العملية.');
  }
};

export const sparePartsReplenishmentService = {
  async listPaged(params?: {
    status?: SparePartsReplenishmentStatus;
    fromWarehouseId?: string;
    toWarehouseId?: string;
    limit?: number;
    cursor?: FirestoreCursor;
  }): Promise<{
    items: SparePartsReplenishmentRequest[];
    nextCursor: FirestoreCursor;
    hasMore: boolean;
  }> {
    if (!isConfigured) return { items: [], nextCursor: null, hasMore: false };
    const scope = await resolveInventoryWarehouseReadScope(
      params?.fromWarehouseId || params?.toWarehouseId,
    );
    if (scope.denied) return { items: [], nextCursor: null, hasMore: false };
    const pageSize = Math.max(1, Math.min(Number(params?.limit || 25), MAX_PAGE));
    const constraints: any[] = [orderBy('createdAt', 'desc'), limit(pageSize)];
    if (params?.status) constraints.unshift(where('status', '==', params.status));
    if (scope.warehouseId) {
      // Bound users see requests involving their warehouse (as source OR destination).
      // Prefer destination filter when browsing as a center; otherwise source.
      if (params?.toWarehouseId === scope.warehouseId || !params?.fromWarehouseId) {
        constraints.unshift(where('toWarehouseId', '==', scope.warehouseId));
      } else {
        constraints.unshift(where('fromWarehouseId', '==', scope.warehouseId));
      }
    } else {
      if (params?.fromWarehouseId) {
        constraints.unshift(where('fromWarehouseId', '==', params.fromWarehouseId));
      }
      if (params?.toWarehouseId) {
        constraints.unshift(where('toWarehouseId', '==', params.toWarehouseId));
      }
    }
    if (params?.cursor) constraints.push(startAfter(params.cursor));
    try {
      const snap = await getDocs(tenantQuery(db, COLLECTION, ...constraints));
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SparePartsReplenishmentRequest));
      const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return { items, nextCursor, hasMore: snap.docs.length === pageSize };
    } catch (error: unknown) {
      throw toUserSafeError(error, 'تعذر تحميل طلبات تموين قطع الغيار.');
    }
  },

  async listRecent(max = 100): Promise<SparePartsReplenishmentRequest[]> {
    const { items } = await this.listPaged({ limit: Math.min(max, 100) });
    return items;
  },

  async create(input: CreateInput): Promise<{ id: string; referenceNo: string; status: string }> {
    return callSafe(async () => {
      const callable = httpsCallable<
        CreateInput,
        { id: string; referenceNo: string; status: string }
      >(requireFunctions(), 'createSparePartsReplenishment');
      const result = await callable(input);
      return result.data;
    });
  },

  async approve(requestId: string): Promise<void> {
    await callSafe(async () => {
      await httpsCallable(requireFunctions(), 'approveSparePartsReplenishment')({ requestId });
    });
  },

  async prepare(
    requestId: string,
    lines?: Array<{ lineId: string; preparedQty: number }>,
  ): Promise<void> {
    await callSafe(async () => {
      await httpsCallable(requireFunctions(), 'prepareSparePartsReplenishment')({
        requestId,
        lines,
      });
    });
  },

  async responsibleApprove(requestId: string): Promise<void> {
    await callSafe(async () => {
      await httpsCallable(requireFunctions(), 'responsibleApproveSparePartsReplenishment')({
        requestId,
      });
    });
  },

  async receive(
    requestId: string,
    lines?: Array<{ lineId: string; receivedQty: number }>,
  ): Promise<void> {
    await callSafe(async () => {
      await httpsCallable(requireFunctions(), 'receiveSparePartsReplenishment')({
        requestId,
        lines,
      });
    });
  },

  async reject(requestId: string, reason?: string): Promise<void> {
    await callSafe(async () => {
      await httpsCallable(requireFunctions(), 'rejectSparePartsReplenishment')({
        requestId,
        reason,
      });
    });
  },

  async cancel(requestId: string): Promise<void> {
    await callSafe(async () => {
      await httpsCallable(requireFunctions(), 'cancelSparePartsReplenishment')({ requestId });
    });
  },
};
