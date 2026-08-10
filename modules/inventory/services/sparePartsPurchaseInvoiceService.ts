import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db, isConfigured, mutateSparePartsPurchaseInvoiceCallable } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import type { SparePartsPurchaseInvoice } from '../types';

const COLLECTION = 'spare_parts_purchase_invoices';

export const sparePartsPurchaseInvoiceService = {
  async list(limitCount = 40): Promise<SparePartsPurchaseInvoice[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(query(
      collection(db, COLLECTION),
      where('tenantId', '==', getCurrentTenantId()),
      orderBy('postedAt', 'desc'),
      limit(Math.min(100, Math.max(1, limitCount))),
    ));
    return snap.docs.map((row) => ({ id: row.id, ...row.data() } as SparePartsPurchaseInvoice));
  },

  async post(input: {
    supplierName?: string;
    supplierInvoiceNo?: string;
    notes?: string;
    lines: Array<{ materialId: string; quantity: number; unitPrice: number }>;
  }): Promise<{ invoiceId: string; invoiceNo: string }> {
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
  },
};
