import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import type { PurchaseGapRow } from './purchaseGapService';

const COLLECTION = 'purchase_orders';

export type PurchaseOrderDraft = {
  id?: string;
  tenantId: string;
  status: 'draft';
  source: 'purchase_gap';
  lines: Array<{
    materialId: string;
    materialName: string;
    quantity: number;
    unit?: string;
  }>;
  createdAt?: unknown;
};

export const purchaseOrderDraftService = {
  async createFromGap(rows: PurchaseGapRow[]): Promise<string | null> {
    if (!isConfigured || rows.length === 0) return null;
    const payload: Omit<PurchaseOrderDraft, 'id'> = {
      tenantId: getCurrentTenantId(),
      status: 'draft',
      source: 'purchase_gap',
      lines: rows.map((r) => ({
        materialId: r.materialId,
        materialName: r.materialName,
        quantity: r.gapQty,
        unit: r.unit,
      })),
    };
    const ref = await addDoc(collection(db, COLLECTION), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },
};
