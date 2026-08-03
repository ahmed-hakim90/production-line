import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type {
  ComponentCompensationReason,
  ComponentCompensationRequest,
  InventoryItemType,
  ProductionIssueOrder,
  ProductionIssueOrderLine,
  ProductionIssueOrigin,
} from '../types';
import { stockService } from './stockService';
import { productionIssueService } from './productionIssueService';
import { warehouseLocationService } from './warehouseLocationService';
import { assertCanRequestCompensation } from '../lib/componentCompensationRequest';
import { INVENTORY_STOCK_MOVE_PATHS } from '../../system/lib/operationPathSettings';
import { resolveInventoryWarehouseReadScope } from './inventoryWarehouseScopeService';

const COLLECTION = 'component_compensation_requests';
const ISSUE_COLLECTION = 'production_issue_orders';
const toIsoNow = () => new Date().toISOString();
const compRef = () => `CMP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

export const componentCompensationService = {
  async getAll(warehouseId?: string): Promise<ComponentCompensationRequest[]> {
    if (!isConfigured) return [];
    const scope = await resolveInventoryWarehouseReadScope(warehouseId);
    if (scope.denied) return [];
    const snap = await getDocs(tenantQuery(
      db,
      COLLECTION,
      ...(scope.warehouseId ? [where('warehouseId', '==', scope.warehouseId)] : []),
      orderBy('createdAt', 'desc'),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ComponentCompensationRequest));
  },

  async getById(id: string): Promise<ComponentCompensationRequest | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as ComponentCompensationRequest) : null;
  },

  async getByIssueOrderId(issueOrderId: string): Promise<ComponentCompensationRequest[]> {
    if (!isConfigured || !issueOrderId) return [];
    const all = await this.getAll();
    return all.filter((row) => row.issueOrderId === issueOrderId);
  },

  async create(input: {
    issueOrderId: string;
    issueReferenceNo?: string;
    reason: ComponentCompensationReason;
    line: ProductionIssueOrderLine;
    quantity: number;
    warehouseId: string;
    warehouseName?: string;
    locationId: string;
    locationCode: string;
    origin?: ProductionIssueOrigin;
    createdBy: string;
    createdByUserId?: string;
    note?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    if (input.quantity <= 0) throw new Error('كمية التعويض يجب أن تكون أكبر من صفر.');
    if (!input.locationId) throw new Error('حدد لوكيشن صرف التعويض.');
    const ref = await addDoc(collection(db, COLLECTION), stripUndefined({
      tenantId: getCurrentTenantId(),
      issueOrderId: input.issueOrderId,
      issueReferenceNo: input.issueReferenceNo,
      referenceNo: compRef(),
      reason: input.reason,
      warehouseId: input.warehouseId,
      warehouseName: input.warehouseName,
      line: input.line,
      quantity: input.quantity,
      locationId: input.locationId,
      locationCode: input.locationCode,
      origin: input.origin || 'warehouse',
      status: 'pending',
      createdBy: input.createdBy,
      createdByUserId: input.createdByUserId,
      createdAt: toIsoNow(),
      note: input.note,
    }));
    return ref.id;
  },

  /**
   * Production requests compensatory OUT against an already-issued production issue.
   * Location defaults from the original issue allocation; materials still approve before stock moves.
   */
  async createFromProductionRequest(input: {
    issueOrderId: string;
    itemType: InventoryItemType;
    itemId: string;
    quantity: number;
    reason: ComponentCompensationReason;
    createdBy: string;
    createdByUserId?: string;
    note?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const order = await productionIssueService.getById(input.issueOrderId);
    const { line, location } = assertCanRequestCompensation({
      order,
      itemType: input.itemType,
      itemId: input.itemId,
      quantity: input.quantity,
    });
    return this.create({
      issueOrderId: order!.id!,
      issueReferenceNo: order!.referenceNo,
      reason: input.reason,
      line,
      quantity: Number(input.quantity),
      warehouseId: order!.sourceWarehouseId,
      warehouseName: order!.sourceWarehouseName,
      locationId: location.locationId,
      locationCode: location.locationCode,
      origin: 'production_request',
      createdBy: input.createdBy,
      createdByUserId: input.createdByUserId,
      note: input.note,
    });
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
    }, { path: INVENTORY_STOCK_MOVE_PATHS.componentCompensation });
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
