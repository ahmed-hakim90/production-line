import {
  getDocs,
  orderBy,
  where,
  limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsClient, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type {
  MaintenanceCenterSpareBalanceRow,
  SparePartsRecallRequest,
} from '../types';
import { SPARE_PARTS_RECALL_COLLECTION } from '../lib/sparePartsRecall';
import { getCurrentBoundInventoryWarehouseId } from './inventoryWarehouseScopeService';
import { warehouseService } from './warehouseService';

const requireFunctions = () => {
  if (!isConfigured || !functionsClient) {
    throw new Error('Firebase غير مهيأ.');
  }
  return functionsClient;
};

const toUserSafeError = (error: unknown, fallback: string): Error => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').trim();
  if (code.includes('unauthenticated')) {
    return new Error('يجب تسجيل الدخول أولًا ثم إعادة المحاولة.');
  }
  if (code.includes('permission-denied')) {
    return new Error(message || 'ليس لديك صلاحية كافية.');
  }
  if (code.includes('not-found') || code.includes('unimplemented')) {
    return new Error('خدمة أرصدة المراكز غير متاحة حالياً. أعد المحاولة بعد لحظات.');
  }
  if (code.includes('failed-precondition') || code.includes('invalid-argument')) {
    return new Error(message || fallback);
  }
  // Firebase often maps missing/undeployed callables to opaque "internal".
  if (code.includes('internal') && (!message || /^internal$/i.test(message))) {
    return new Error('تعذر الاتصال بالخادم. أعد المحاولة بعد لحظات.');
  }
  if (message && !/^internal$/i.test(message)) return new Error(message);
  return new Error(fallback);
};

const callSafe = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error: unknown) {
    throw toUserSafeError(error, 'تعذر تنفيذ العملية.');
  }
};

export const sparePartsRecallService = {
  async listCenterBalances(params?: {
    warehouseId?: string;
    search?: string;
  }): Promise<{
    rows: MaintenanceCenterSpareBalanceRow[];
    centers: Array<{ id: string; name: string }>;
  }> {
    return callSafe(async () => {
      const fn = httpsCallable(requireFunctions(), 'listMaintenanceCenterSpareBalances');
      const result = await fn({
        warehouseId: params?.warehouseId || '',
        search: params?.search || '',
      });
      const data = (result.data || {}) as {
        rows?: MaintenanceCenterSpareBalanceRow[];
        centers?: Array<{ id: string; name: string }>;
      };
      return {
        rows: Array.isArray(data.rows) ? data.rows : [],
        centers: Array.isArray(data.centers) ? data.centers : [],
      };
    });
  },

  async listRecent(max = 100): Promise<SparePartsRecallRequest[]> {
    if (!isConfigured) return [];
    try {
      const boundId = await getCurrentBoundInventoryWarehouseId();
      const pageSize = Math.min(Math.max(max, 1), 200);
      if (!boundId) {
        const q = tenantQuery(
          db,
          SPARE_PARTS_RECALL_COLLECTION,
          orderBy('createdAt', 'desc'),
          limit(pageSize),
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SparePartsRecallRequest));
      }

      const warehouses = await warehouseService.getActiveWarehouses().catch(() => []);
      const bound = warehouses.find((w) => w.id === boundId);
      const role = bound?.warehouseRole || 'general';
      const field = role === 'spare_parts_central' ? 'toWarehouseId' : 'fromWarehouseId';
      const q = tenantQuery(
        db,
        SPARE_PARTS_RECALL_COLLECTION,
        where(field, '==', boundId),
        orderBy('createdAt', 'desc'),
        limit(pageSize),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SparePartsRecallRequest));
    } catch (error: unknown) {
      throw toUserSafeError(error, 'تعذر تحميل طلبات السحب.');
    }
  },

  async create(input: {
    fromWarehouseId: string;
    note?: string;
    lines: Array<{ itemId: string; quantity: number }>;
  }): Promise<{ id: string; referenceNo: string }> {
    return callSafe(async () => {
      const fn = httpsCallable(requireFunctions(), 'createSparePartsRecall');
      const result = await fn(input);
      const data = (result.data || {}) as { id?: string; referenceNo?: string };
      if (!data.id) throw new Error('تعذر إنشاء طلب السحب.');
      return { id: data.id, referenceNo: String(data.referenceNo || '') };
    });
  },

  async confirm(requestId: string): Promise<void> {
    await callSafe(async () => {
      const fn = httpsCallable(requireFunctions(), 'confirmSparePartsRecall');
      await fn({ requestId });
    });
  },

  async cancel(requestId: string): Promise<void> {
    await callSafe(async () => {
      const fn = httpsCallable(requireFunctions(), 'cancelSparePartsRecall');
      await fn({ requestId });
    });
  },
};
