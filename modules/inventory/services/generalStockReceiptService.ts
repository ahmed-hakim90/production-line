import { getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsClient, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { InventoryItemType } from '../types';

export type GeneralReceiptReason = 'purchase' | 'production_output' | 'center_replenishment_receipt' | 'issue_return' | 'opening_balance' | 'department_return' | 'maintenance_return' | 'other';
export const GENERAL_RECEIPT_REASON_LABELS: Record<GeneralReceiptReason, string> = {
  purchase: 'شراء / توريد', production_output: 'ناتج إنتاج', center_replenishment_receipt: 'استلام تموين مركز', issue_return: 'مرتجع إذن صرف',
  opening_balance: 'رصيد افتتاحي', department_return: 'استرداد من قسم',
  maintenance_return: 'استرداد من صيانة', other: 'إضافة أخرى',
};

export interface GeneralStockReceipt {
  id?: string;
  referenceNo: string;
  status: 'draft' | 'posted' | 'voided' | 'converted';
  warehouseId: string;
  warehouseName: string;
  reason: GeneralReceiptReason;
  sourceParty?: string | null;
  sourceDocumentNo?: string | null;
  sourceIssueId?: string | null;
  workOrderNumber?: string | null;
  note?: string | null;
  lines: Array<{ itemType: InventoryItemType; itemId: string; itemName: string; itemCode: string; unit: string; quantity: number; locationId?: string | null; locationCode?: string }>;
  createdByName: string;
  createdAt: string;
  postedAt?: string;
  voidedAt?: string;
  voidReason?: string;
}

const safeError = (error: any) => {
  const message = String(error?.message || '').replace(/^FirebaseError:\s*/i, '').trim();
  if (String(error?.code || '').includes('unauthenticated')) return new Error('يجب تسجيل الدخول أولًا.');
  if (String(error?.code || '').includes('permission-denied')) return new Error(message || 'ليس لديك صلاحية تنفيذ الإضافة.');
  return new Error(message || 'تعذر تنفيذ إذن الإضافة.');
};

export const generalStockReceiptService = {
  async listRecent(max = 50): Promise<GeneralStockReceipt[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(tenantQuery(db, 'general_stock_receipts'));
    return snap.docs.map((row) => ({ id: row.id, ...row.data() } as GeneralStockReceipt)).filter((row) => row.status !== 'converted')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, Math.min(max, 100));
  },
  async post(input: {
    draftId?: string;
    warehouseId: string; reason: GeneralReceiptReason; workOrderId?: string; workOrderNumber?: string;
    sourceIssueId?: string; sourceParty?: string; sourceDocumentNo?: string; note?: string;
    lines: Array<{ itemType: InventoryItemType; itemId: string; locationId?: string; quantity: number }>;
  }): Promise<{ id: string; referenceNo: string }> {
    if (!isConfigured || !functionsClient) throw new Error('Firebase غير مهيأ.');
    try {
      const callable = httpsCallable<typeof input, { ok: boolean; id: string; referenceNo: string }>(functionsClient, 'postGeneralStockReceipt');
      const result = await callable(input);
      return { id: result.data.id, referenceNo: result.data.referenceNo };
    } catch (error) { throw safeError(error); }
  },
  async saveDraft(input: {
    draftId?: string; warehouseId: string; reason: GeneralReceiptReason;
    sourceIssueId?: string; sourceParty?: string; sourceDocumentNo?: string; note?: string;
    lines: Array<{ itemType: InventoryItemType; itemId: string; locationId?: string; quantity: number }>;
  }): Promise<{ id: string; referenceNo: string }> {
    if (!isConfigured || !functionsClient) throw new Error('Firebase غير مهيأ.');
    try {
      const callable = httpsCallable<typeof input, { ok: boolean; id: string; referenceNo: string }>(functionsClient, 'saveGeneralStockReceiptDraft');
      const result = await callable(input);
      return { id: result.data.id, referenceNo: result.data.referenceNo };
    } catch (error) { throw safeError(error); }
  },
  async void(voucherId: string, reason: string): Promise<void> {
    if (!isConfigured || !functionsClient) throw new Error('Firebase غير مهيأ.');
    try {
      await httpsCallable(functionsClient, 'voidGeneralStockReceipt')({ voucherId, reason });
    } catch (error) { throw safeError(error); }
  },
};
