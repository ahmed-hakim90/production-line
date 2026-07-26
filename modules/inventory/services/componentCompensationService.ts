import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  updateDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type {
  ComponentCompensationReason,
  ComponentCompensationRequest,
  ProductionIssueOrder,
  ProductionIssueOrderLine,
} from '../types';
import { stockService } from './stockService';
import { productionIssueService } from './productionIssueService';
import { warehouseLocationService } from './warehouseLocationService';

const COLLECTION = 'component_compensation_requests';
const ISSUE_COLLECTION = 'production_issue_orders';
const toIsoNow = () => new Date().toISOString();
const compRef = () => `CMP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

export const componentCompensationService = {
  async getAll(): Promise<ComponentCompensationRequest[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(tenantQuery(db, COLLECTION, orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ComponentCompensationRequest));
  },

  async getById(id: string): Promise<ComponentCompensationRequest | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as ComponentCompensationRequest) : null;
  },

  async create(input: {
    issueOrderId: string;
    reason: ComponentCompensationReason;
    line: ProductionIssueOrderLine;
    quantity: number;
    warehouseId: string;
    warehouseName?: string;
    locationId: string;
    locationCode: string;
    createdBy: string;
    createdByUserId?: string;
    note?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    if (input.quantity <= 0) throw new Error('كمية التعويض يجب أن تكون أكبر من صفر.');
    if (!input.locationId) throw new Error('حدد لوكيشن صرف التعويض.');
    const ref = await addDoc(collection(db, COLLECTION), {
      tenantId: getCurrentTenantId(),
      issueOrderId: input.issueOrderId,
      referenceNo: compRef(),
      reason: input.reason,
      warehouseId: input.warehouseId,
      warehouseName: input.warehouseName,
      line: input.line,
      quantity: input.quantity,
      locationId: input.locationId,
      locationCode: input.locationCode,
      status: 'pending',
      createdBy: input.createdBy,
      createdByUserId: input.createdByUserId,
      createdAt: toIsoNow(),
      note: input.note,
    });
    return ref.id;
  },

  async approve(id: string, actor: string): Promise<void> {
    const request = await this.getById(id);
    if (!request?.id) throw new Error('طلب التعويض غير موجود.');
    if (request.status !== 'pending') throw new Error('طلب التعويض غير معلق.');
    const order = await productionIssueService.getById(request.issueOrderId);
    if (!order?.id) throw new Error('أمر الصرف المرتبط غير موجود.');
    const activeLocations = await warehouseLocationService.getActiveByWarehouse(request.warehouseId);
    const loc = activeLocations.find((row) => row.id === request.locationId);
    if (!loc?.id) throw new Error('لا يمكن اعتماد التعويض: اللوكيشن موقوف أو غير صالح.');
    const balances = await stockService.getLocationBalances({
      warehouseId: request.warehouseId,
      locationId: request.locationId,
      itemType: request.line.itemType,
      itemId: request.line.itemId,
    });
    const availableQty = balances.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    if (availableQty + 0.000001 < Number(request.quantity || 0)) {
      throw new Error(`لا يمكن اعتماد التعويض: رصيد اللوكيشن الحالي ${availableQty} أقل من المطلوب ${request.quantity}.`);
    }
    await stockService.createMovement({
      warehouseId: request.warehouseId,
      locationId: loc.id,
      locationCode: loc.code,
      itemType: request.line.itemType,
      itemId: request.line.itemId,
      itemName: request.line.itemName,
      itemCode: request.line.itemCode,
      unit: request.line.unit,
      movementType: 'OUT',
      quantity: request.quantity,
      sourceModule: 'component_compensation',
      sourceId: request.id,
      sourceIssueOrderId: request.issueOrderId,
      sourceWorkOrderId: order.workOrderId,
      sourcePlanId: order.productionPlanId,
      note: `Component compensation ${request.referenceNo}`,
      createdBy: actor,
    });
    const lines: ProductionIssueOrder['lines'] = order.lines.map((line) => (
      line.itemType === request.line.itemType && line.itemId === request.line.itemId
        ? { ...line, compensatedQty: Number(line.compensatedQty || 0) + request.quantity }
        : line
    ));
    await Promise.all([
      updateDoc(doc(db, COLLECTION, request.id), {
        status: 'approved',
        resolvedBy: actor,
        resolvedAt: toIsoNow(),
      }),
      updateDoc(doc(db, ISSUE_COLLECTION, order.id), { lines }),
    ]);
  },

  async reject(id: string, actor: string): Promise<void> {
    if (!isConfigured || !id) return;
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'rejected',
      resolvedBy: actor,
      resolvedAt: toIsoNow(),
    });
  },
};
