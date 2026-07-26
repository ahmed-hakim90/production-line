import { addDoc, collection, doc, getDocs, orderBy, updateDoc, where } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { ComponentReturnInput, ComponentReturnRecord, ProductionIssueOrder } from '../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { stockService } from './stockService';
import { productionIssueService } from './productionIssueService';
import { warehouseLocationService } from './warehouseLocationService';

const ISSUE_COLLECTION = 'production_issue_orders';
const RETURN_COLLECTION = 'component_return_records';
const toIsoNow = () => new Date().toISOString();
const returnRef = () => `RET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

export const componentReturnService = {
  async getAll(issueOrderId?: string): Promise<ComponentReturnRecord[]> {
    if (!isConfigured) return [];
    const constraints: any[] = [orderBy('createdAt', 'desc')];
    if (issueOrderId) constraints.unshift(where('issueOrderId', '==', issueOrderId));
    const snap = await getDocs(tenantQuery(db, RETURN_COLLECTION, ...constraints));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ComponentReturnRecord));
  },

  async returnComponent(input: ComponentReturnInput): Promise<void> {
    if (!isConfigured) return;
    if (input.quantity <= 0) throw new Error('كمية المرتجع يجب أن تكون أكبر من صفر.');
    const order = await productionIssueService.getById(input.issueOrderId);
    if (!order?.id) throw new Error('أمر الصرف غير موجود.');
    const activeLocations = await warehouseLocationService.getActiveByWarehouse(input.warehouseId);
    const loc = activeLocations.find((row) => row.id === input.locationId);
    if (!loc?.id) throw new Error('لا يمكن استلام المرتجع على رف موقوف أو غير صالح.');
    const currentLine = order.lines.find((line) => line.itemType === input.line.itemType && line.itemId === input.line.itemId);
    if (!currentLine) throw new Error('المكون غير موجود في أمر الصرف.');
    const maxReturnQty = Number(currentLine.issuedQty || 0) + Number(currentLine.compensatedQty || 0) - Number(currentLine.returnedQty || 0);
    if (input.quantity > maxReturnQty + 0.000001) {
      throw new Error(`لا يمكن تسجيل مرتجع أكبر من الصافي المتاح (${Math.max(0, maxReturnQty)}).`);
    }
    await stockService.createMovement({
      warehouseId: input.warehouseId,
      locationId: loc.id,
      locationCode: loc.code,
      itemType: input.line.itemType,
      itemId: input.line.itemId,
      itemName: input.line.itemName,
      itemCode: input.line.itemCode,
      unit: input.line.unit,
      movementType: 'IN',
      quantity: input.quantity,
      sourceModule: 'component_return',
      sourceId: input.issueOrderId,
      sourceIssueOrderId: input.issueOrderId,
      sourceWorkOrderId: order.workOrderId,
      sourcePlanId: order.productionPlanId,
      note: input.note || `Component return for ${order.referenceNo}`,
      createdBy: input.createdBy,
    });
    await addDoc(collection(db, RETURN_COLLECTION), {
      tenantId: getCurrentTenantId(),
      issueOrderId: input.issueOrderId,
      referenceNo: returnRef(),
      warehouseId: input.warehouseId,
      warehouseName: input.warehouseName,
      locationId: loc.id,
      locationCode: loc.code,
      line: input.line,
      quantity: input.quantity,
      reason: input.reason || 'unused',
      returnedBy: input.returnedBy || input.createdBy,
      returnedByUserId: input.returnedByUserId || input.createdByUserId,
      receivedBy: input.receivedBy || input.createdBy,
      receivedByUserId: input.receivedByUserId || input.createdByUserId,
      createdAt: toIsoNow(),
      note: input.note,
    });
    const lines: ProductionIssueOrder['lines'] = order.lines.map((line) => (
      line.itemType === input.line.itemType && line.itemId === input.line.itemId
        ? { ...line, returnedQty: Number(line.returnedQty || 0) + input.quantity }
        : line
    ));
    await updateDoc(doc(db, ISSUE_COLLECTION, order.id), { lines });
  },
};
