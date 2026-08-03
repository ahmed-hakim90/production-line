import { getDocs, orderBy, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsClient, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type {
  InventoryTransferRequest,
  ProductionHandoverReceipt,
} from '../types';
import { buildProductionHandoverIdempotencyKey } from '../lib/productionHandoverIdempotency';
import { transferApprovalService } from './transferApprovalService';
import { getCurrentBoundInventoryWarehouseId } from './inventoryWarehouseScopeService';

const RECEIPTS_COLLECTION = 'production_handover_receipts';

export const productionHandoverService = {
  async listPending(): Promise<InventoryTransferRequest[]> {
    if (!isConfigured) return [];
    const pending = await transferApprovalService.getByStatus('pending');
    return pending.filter((row) => (row.requestType || '') === 'production_handover');
  },

  async listReceipts(handoverRequestId?: string): Promise<ProductionHandoverReceipt[]> {
    if (!isConfigured) return [];
    const constraints: any[] = [orderBy('createdAt', 'desc')];
    if (handoverRequestId) constraints.unshift(where('handoverRequestId', '==', handoverRequestId));
    const boundWarehouseId = await getCurrentBoundInventoryWarehouseId();
    const load = async (field?: 'fromWarehouseId' | 'toWarehouseId' | 'warehouseId') => {
      const snap = await getDocs(tenantQuery(
        db,
        RECEIPTS_COLLECTION,
        ...(field ? [where(field, '==', boundWarehouseId)] : []),
        ...constraints,
      ));
      return snap.docs;
    };
    const docs = boundWarehouseId
      ? [
        ...await load('fromWarehouseId'),
        ...await load('toWarehouseId'),
        ...await load('warehouseId'),
      ]
      : await load();
    return [...new Map(docs.map((row) => [
      row.id,
      { id: row.id, ...row.data() } as ProductionHandoverReceipt,
    ])).values()]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },

  /**
   * Packaging supervisor confirms an actual received quantity (partial allowed).
   * Server-authoritative via confirmProductionHandoverReceipt callable.
   */
  async confirmReceipt(input: {
    handoverRequestId: string;
    quantity: number;
    expectedReceivedQuantity: number;
    actor: string;
    actorUserId?: string;
    note?: string;
  }): Promise<{ receiptId: string; remainingQuantity: number }> {
    if (!isConfigured || !functionsClient) {
      throw new Error('النظام غير مهيأ أو لم تُنشر دوال الخادم.');
    }
    const qty = Number(input.quantity || 0);
    if (!(qty > 0)) throw new Error('كمية الاستلام يجب أن تكون أكبر من صفر.');
    const expectedReceivedQuantity = Number(input.expectedReceivedQuantity);
    if (!Number.isFinite(expectedReceivedQuantity) || expectedReceivedQuantity < 0) {
      throw new Error('تعذر تحديد الكمية المستلمة السابقة.');
    }
    const idempotencyKey = buildProductionHandoverIdempotencyKey(
      input.handoverRequestId,
      expectedReceivedQuantity,
      qty,
    );

    const callable = httpsCallable<
      {
        handoverRequestId: string;
        quantity: number;
        expectedReceivedQuantity: number;
        note?: string;
        idempotencyKey: string;
      },
      { receiptId: string; remainingQuantity: number; idempotent?: boolean }
    >(functionsClient, 'confirmProductionHandoverReceipt');

    try {
      const result = await callable({
        handoverRequestId: input.handoverRequestId,
        quantity: qty,
        expectedReceivedQuantity,
        note: input.note,
        idempotencyKey,
      });
      return {
        receiptId: String(result.data.receiptId || ''),
        remainingQuantity: Number(result.data.remainingQuantity || 0),
      };
    } catch (error: unknown) {
      const callableError = error as { code?: string; message?: string };
      const code = String(callableError.code || '');
      const message = String(callableError.message || '').trim();
      if (code.includes('permission-denied') || message.includes('permission-denied')) {
        throw new Error('لا تملك صلاحية اعتماد استلام التغليف.');
      }
      if (code.includes('unauthenticated') || message.includes('unauthenticated')) {
        throw new Error('يجب تسجيل الدخول أولاً.');
      }
      const safeMessage = message
        .replace(/^Firebase(?:Error)?:\s*/i, '')
        .replace(/\s*\(functions\/[^)]*\)\s*$/i, '')
        .trim();
      const isExpectedUserMessage = (
        code.includes('invalid-argument')
        || code.includes('failed-precondition')
        || code.includes('not-found')
      ) && /[\u0600-\u06ff]/.test(safeMessage) && safeMessage.length <= 200;
      throw new Error(isExpectedUserMessage ? safeMessage : 'تعذر تأكيد الاستلام.');
    }
  },
};
