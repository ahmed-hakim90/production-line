import { addDoc, collection, doc, getDocs, orderBy, updateDoc, where } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { ComponentCompensationReason, ComponentScrapRecord, ProductionIssueOrder } from '../types';
import { productionIssueService } from './productionIssueService';

const COLLECTION = 'component_scrap_records';
const ISSUE_COLLECTION = 'production_issue_orders';
const toIsoNow = () => new Date().toISOString();
const scrapRef = () => `SCR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

export const componentScrapService = {
  async getAll(issueOrderId?: string): Promise<ComponentScrapRecord[]> {
    if (!isConfigured) return [];
    const constraints: any[] = [orderBy('createdAt', 'desc')];
    if (issueOrderId) constraints.unshift(where('issueOrderId', '==', issueOrderId));
    const snap = await getDocs(tenantQuery(db, COLLECTION, ...constraints));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ComponentScrapRecord));
  },

  async create(input: {
    issueOrderId: string;
    itemType: string;
    itemId: string;
    quantity: number;
    reason: ComponentCompensationReason;
    needsCompensation?: boolean;
    createdBy: string;
    createdByUserId?: string;
    note?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    if (input.quantity <= 0) throw new Error('كمية الهالك يجب أن تكون أكبر من صفر.');
    const order = await productionIssueService.getById(input.issueOrderId);
    if (!order?.id) throw new Error('أمر الصرف غير موجود.');
    const line = order.lines.find((row) => row.itemType === input.itemType && row.itemId === input.itemId);
    if (!line) throw new Error('المكون غير موجود في أمر الصرف.');
    const ref = await addDoc(collection(db, COLLECTION), {
      tenantId: getCurrentTenantId(),
      issueOrderId: order.id,
      workOrderId: order.workOrderId,
      productionPlanId: order.productionPlanId,
      referenceNo: scrapRef(),
      line,
      quantity: input.quantity,
      reason: input.reason,
      needsCompensation: Boolean(input.needsCompensation),
      createdBy: input.createdBy,
      createdByUserId: input.createdByUserId,
      createdAt: toIsoNow(),
      note: input.note,
    });
    const lines: ProductionIssueOrder['lines'] = order.lines.map((row) => (
      row.itemType === input.itemType && row.itemId === input.itemId
        ? { ...row, actualScrapQty: Number(row.actualScrapQty || 0) + input.quantity }
        : row
    ));
    await updateDoc(doc(db, ISSUE_COLLECTION, order.id), { lines });
    return ref.id;
  },
};
