import { getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsClient, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { InventoryItemType } from '../types';

export type GeneralIssuePurpose = 'production' | 'packaging' | 'center_replenishment' | 'maintenance' | 'lubricants' | 'department' | 'waste' | 'sample' | 'other';

export interface GeneralStockIssueLine {
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  quantity: number;
  locationId?: string | null;
  locationCode?: string;
}

export interface GeneralStockIssue {
  id?: string;
  referenceNo: string;
  status: 'draft' | 'posted' | 'voided' | 'converted';
  warehouseId: string;
  warehouseName: string;
  purpose: GeneralIssuePurpose;
  destinationId?: string | null;
  destinationName?: string | null;
  workOrderId?: string | null;
  workOrderNumber?: string | null;
  productId?: string | null;
  productName?: string | null;
  productionLineId?: string | null;
  productionLineName?: string | null;
  productionStageId?: string | null;
  productionStageName?: string | null;
  note?: string | null;
  lines: GeneralStockIssueLine[];
  createdByName: string;
  createdAt: string;
  postedAt?: string;
  voidedAt?: string;
  voidReason?: string;
}

export const GENERAL_ISSUE_PURPOSE_LABELS: Record<GeneralIssuePurpose, string> = {
  production: 'صرف إنتاج', packaging: 'صرف تعبئة وتغليف', center_replenishment: 'تموين قطع غيار المراكز', maintenance: 'صرف صيانة وقطع غيار',
  lubricants: 'صرف زيوت وتشغيل', department: 'صرف لقسم', waste: 'هالك / تالف',
  sample: 'عينة', other: 'صرف آخر',
};

const callError = (error: any) => {
  const message = String(error?.message || '').replace(/^FirebaseError:\s*/i, '').trim();
  if (String(error?.code || '').includes('unauthenticated')) return new Error('يجب تسجيل الدخول أولًا.');
  if (String(error?.code || '').includes('permission-denied')) return new Error(message || 'ليس لديك صلاحية تنفيذ الصرف.');
  return new Error(message || 'تعذر تنفيذ إذن الصرف.');
};

export const generalStockIssueService = {
  async listRecent(max = 50): Promise<GeneralStockIssue[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(tenantQuery(db, 'general_stock_issues'));
    return snap.docs
      .map((row) => ({ id: row.id, ...row.data() } as GeneralStockIssue))
      .filter((row) => row.status !== 'converted')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, Math.min(max, 100));
  },

  async listForWorkOrder(workOrderId: string): Promise<GeneralStockIssue[]> {
    if (!isConfigured || !workOrderId) return [];
    const snap = await getDocs(tenantQuery(db, 'general_stock_issues'));
    return snap.docs
      .map((row) => ({ id: row.id, ...row.data() } as GeneralStockIssue))
      .filter((row) => row.workOrderId === workOrderId && row.status === 'posted');
  },

  async post(input: {
    draftId?: string;
    warehouseId: string;
    purpose: GeneralIssuePurpose;
    destinationId?: string;
    destinationName?: string;
    workOrderId?: string;
    workOrderNumber?: string;
    productionStageId?: string;
    productionStageName?: string;
    note?: string;
    lines: Array<Pick<GeneralStockIssueLine, 'itemType' | 'itemId' | 'quantity' | 'locationId'>>;
  }): Promise<{ id: string; referenceNo: string }> {
    if (!isConfigured || !functionsClient) throw new Error('Firebase غير مهيأ.');
    try {
      const callable = httpsCallable<typeof input, { ok: boolean; id: string; referenceNo: string }>(functionsClient, 'postGeneralStockIssue');
      const result = await callable(input);
      return { id: result.data.id, referenceNo: result.data.referenceNo };
    } catch (error) {
      throw callError(error);
    }
  },

  async saveDraft(input: {
    draftId?: string;
    warehouseId: string;
    purpose: GeneralIssuePurpose;
    destinationId?: string;
    destinationName?: string;
    workOrderId?: string;
    workOrderNumber?: string;
    productionStageId?: string;
    productionStageName?: string;
    note?: string;
    lines: Array<Pick<GeneralStockIssueLine, 'itemType' | 'itemId' | 'quantity' | 'locationId'>>;
  }): Promise<{ id: string; referenceNo: string }> {
    if (!isConfigured || !functionsClient) throw new Error('Firebase غير مهيأ.');
    try {
      const callable = httpsCallable<typeof input, { ok: boolean; id: string; referenceNo: string }>(functionsClient, 'saveGeneralStockIssueDraft');
      const result = await callable(input);
      return { id: result.data.id, referenceNo: result.data.referenceNo };
    } catch (error) { throw callError(error); }
  },

  async void(voucherId: string, reason: string): Promise<void> {
    if (!isConfigured || !functionsClient) throw new Error('Firebase غير مهيأ.');
    try {
      await httpsCallable(functionsClient, 'voidGeneralStockIssue')({ voucherId, reason });
    } catch (error) { throw callError(error); }
  },
};
