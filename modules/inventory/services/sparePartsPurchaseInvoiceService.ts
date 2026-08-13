import {
  getDocs,
  limit,
  orderBy,
  where,
} from 'firebase/firestore';
import { db, isConfigured, mutateSparePartsPurchaseInvoiceCallable } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { toUserSafeFirestoreError } from '../../repair/lib/repairFirestoreErrors';
import type { SparePartsPurchaseInvoice } from '../types';
import { resolveInventoryWarehouseReadScope } from './inventoryWarehouseScopeService';

const COLLECTION = 'spare_parts_purchase_invoices';

const toUserSafeError = (error: unknown, fallback: string): Error =>
  new Error(toUserSafeFirestoreError(error, fallback));

export const sparePartsPurchaseInvoiceService = {
  async list(limitCount = 40): Promise<SparePartsPurchaseInvoice[]> {
    if (!isConfigured) return [];
    const scope = await resolveInventoryWarehouseReadScope();
    if (scope.denied) return [];
    const constraints = [
      orderBy('postedAt', 'desc'),
      limit(Math.min(100, Math.max(1, limitCount))),
    ];
    if (scope.warehouseId) {
      constraints.unshift(where('warehouseId', '==', scope.warehouseId));
    }
    try {
      const snap = await getDocs(tenantQuery(db, COLLECTION, ...constraints));
      return snap.docs.map((row) => ({ id: row.id, ...row.data() } as SparePartsPurchaseInvoice));
    } catch (error: unknown) {
      throw toUserSafeError(error, 'تعذر تحميل فواتير الشراء.');
    }
  },

  async post(input: {
    supplierName?: string;
    supplierInvoiceNo?: string;
    notes?: string;
    lines: Array<{ materialId: string; quantity: number; unitPrice: number }>;
  }): Promise<{ invoiceId: string; invoiceNo: string }> {
    try {
      const requestId = globalThis.crypto?.randomUUID?.() || `spi_${Date.now()}`;
      const result = await mutateSparePartsPurchaseInvoiceCallable({
        operation: 'post',
        requestId,
        supplierName: input.supplierName,
        supplierInvoiceNo: input.supplierInvoiceNo,
        notes: input.notes,
        lines: input.lines,
      });
      return {
        invoiceId: String(result.invoiceId || ''),
        invoiceNo: String(result.invoiceNo || ''),
      };
    } catch (error: unknown) {
      throw toUserSafeError(error, 'تعذر ترحيل فاتورة الشراء.');
    }
  },
};
