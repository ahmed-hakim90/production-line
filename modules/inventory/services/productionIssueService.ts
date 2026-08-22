import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  updateDoc,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsClient, isConfigured } from '../../auth/services/firebase';
import type { FirestoreProduct, ProductionPlan, WorkOrder } from '../../../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { productService } from '../../production/services/productService';
import { productionPlanService } from '../../production/services/productionPlanService';
import { workOrderService } from '../../production/services/workOrderService';
import { bomService } from '../../manufacturing/services/bomService';
import { materialService } from '../../manufacturing/services/materialService';
import { rawMaterialService } from './rawMaterialService';
import { stockService } from './stockService';
import type {
  InventoryItemType,
  ProductionIssueOrder,
  ProductionIssueOrderLine,
  ProductionIssueShortageRow,
  Warehouse,
} from '../types';
import { warehouseService } from './warehouseService';
import { warehouseLocationService } from './warehouseLocationService';
import { allocateProductionIssueFromLocations } from '../lib/productionIssueAllocation';
import { defaultItemLocationService } from './defaultItemLocationService';
import {
  findBlockingOpenIssue,
  summarizeOrdersForSource,
  type IssueSourceSummary,
} from '../lib/productionIssueRequest';
import { resolveInventoryRoutingV1 } from '../lib/inventoryRoutingResolver';
import { resolveProductionFloorWarehouseForIssue } from '../lib/resolveProductionFloorWarehouse';
import { resolveSuppliesWarehouseId } from '../lib/resolveSuppliesWarehouse';

function callableUserError(error: unknown, fallback: string): Error {
  const message = String((error as { message?: string })?.message || '').trim();
  if (message.includes('permission-denied') || message.includes('Permission')) {
    return new Error('لا تملك صلاحية تنفيذ هذه العملية.');
  }
  if (message.includes('unauthenticated')) {
    return new Error('يجب تسجيل الدخول أولاً.');
  }
  const cleaned = message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)$/, '').trim();
  return new Error(cleaned || fallback);
}
import { assemblableCapacityService } from './assemblableCapacityService';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import { allocateNextProductionIssueReference } from './productionIssueSequence';
import { getCurrentBoundInventoryWarehouseId } from './inventoryWarehouseScopeService';

const COLLECTION = 'production_issue_orders';

async function loadWarehouseScopedIssueOrders(
  ...constraints: QueryConstraint[]
): Promise<ProductionIssueOrder[]> {
  const boundWarehouseId = await getCurrentBoundInventoryWarehouseId();
  const load = async (warehouseField?: 'sourceWarehouseId' | 'targetWarehouseId') => {
    const snap = await getDocs(tenantQuery(
      db,
      COLLECTION,
      ...(warehouseField
        ? [where(warehouseField, '==', boundWarehouseId)]
        : []),
      ...constraints,
    ));
    return snap.docs;
  };
  const docs = boundWarehouseId
    ? [...await load('sourceWarehouseId'), ...await load('targetWarehouseId')]
    : await load();
  return [...new Map(docs.map((row) => [
    row.id,
    { id: row.id, ...row.data() } as ProductionIssueOrder,
  ])).values()];
}

const toIsoNow = () => new Date().toISOString();
const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

export class ProductionIssueApprovalError extends Error {
  readonly shortages: ProductionIssueShortageRow[];

  constructor(shortages: ProductionIssueShortageRow[]) {
    const summary = shortages
      .map((row) => {
        const loc = row.locationCode ? ` (${row.locationCode})` : '';
        return `${row.itemName}${loc}: مطلوب ${row.requiredQty} / متاح ${row.availableQty}`;
      })
      .join('\n');
    super(`لا يمكن اعتماد الصرف:\n${summary}`);
    this.name = 'ProductionIssueApprovalError';
    this.shortages = shortages;
  }
}

export function isProductionIssueApprovalError(error: unknown): error is ProductionIssueApprovalError {
  return error instanceof ProductionIssueApprovalError;
}

function sourceQty(source: WorkOrder | ProductionPlan): number {
  if ('workOrderNumber' in source) {
    return Number((source as WorkOrder).quantity || 0);
  }
  const plan = source as ProductionPlan;
  const remaining =
    plan.remainingQuantity ??
    (Number(plan.plannedQuantity || 0) - Number(plan.producedQuantity || 0));
  return Number(remaining || plan.plannedQuantity || 0);
}

async function resolveMaterialStockLine(materialId: string, fallbackName = ''): Promise<{
  materialId: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  minStock?: number;
}> {
  const material = await materialService.getById(materialId);
  if (material?.id) {
    return {
      materialId: material.id,
      itemType: 'material',
      itemId: material.id,
      itemName: material.name,
      itemCode: material.code,
      unit: material.baseUnit || 'unit',
      minStock: material.minStock,
    };
  }
  const rawRows = await rawMaterialService.getAll();
  const raw = rawRows.find((row) => row.id === materialId || row.name.trim().toLowerCase() === fallbackName.trim().toLowerCase());
  if (!raw?.id) {
    throw new Error(`تعذر تحديد مكون BOM: ${fallbackName || materialId}`);
  }
  return {
    materialId: raw.id,
    itemType: 'raw_material',
    itemId: raw.id,
    itemName: raw.name,
    itemCode: raw.code,
    unit: raw.unit || 'unit',
    minStock: raw.minStock,
  };
}

async function buildLines(productId: string, quantity: number, warehouseId: string): Promise<ProductionIssueOrderLine[]> {
  const { items } = await bomService.getActiveBomWithLegacyFallback('product', productId);
  if (!items.length) throw new Error('لا يوجد BOM نشط أو مكونات legacy لهذا المنتج.');
  const byItem = new Map<string, ProductionIssueOrderLine>();
  for (const item of items) {
    if (item.itemType !== 'material') continue;
    const qtyPerUnit = Number(item.qtyPerUnit || 0);
    // Catalog-only spare lines (qty 0) are not issued on production floors.
    if (!(qtyPerUnit > 0)) continue;
    const stockLine = await resolveMaterialStockLine(item.itemId, item.itemName || '');
    const wastePercent = Number(item.wastePercent || 0);
    const baseRequiredQty = qtyPerUnit * quantity;
    const plannedWasteQty = baseRequiredQty * (wastePercent / 100);
    const requiredQty = baseRequiredQty + plannedWasteQty;
    const locationBalances = await stockService.getLocationBalances({
      warehouseId,
      itemType: stockLine.itemType,
      itemId: stockLine.itemId,
    });
    const defaultLocation = await defaultItemLocationService.get({
      warehouseId,
      itemType: stockLine.itemType,
      itemId: stockLine.itemId,
    });
    const allocation = allocateProductionIssueFromLocations(locationBalances, requiredQty, defaultLocation?.locationId);
    const existing = byItem.get(`${stockLine.itemType}__${stockLine.itemId}`);
    if (existing) {
      existing.qtyPerUnit += qtyPerUnit;
      existing.baseRequiredQty += baseRequiredQty;
      existing.plannedWasteQty += plannedWasteQty;
      existing.requiredQty += requiredQty;
      const nextAllocation = allocateProductionIssueFromLocations(locationBalances, existing.requiredQty, defaultLocation?.locationId);
      existing.allocations = nextAllocation.allocations;
      existing.availableQty = nextAllocation.availableQty;
      existing.shortageQty = nextAllocation.shortageQty;
      continue;
    }
    byItem.set(`${stockLine.itemType}__${stockLine.itemId}`, {
      materialId: stockLine.materialId,
      itemType: stockLine.itemType,
      itemId: stockLine.itemId,
      itemName: stockLine.itemName,
      itemCode: stockLine.itemCode,
      unit: stockLine.unit,
      qtyPerUnit,
      baseRequiredQty,
      wastePercent,
      plannedWasteQty,
      requiredQty,
      issuedQty: 0,
      returnedQty: 0,
      compensatedQty: 0,
      actualScrapQty: 0,
      availableQty: allocation.availableQty,
      shortageQty: allocation.shortageQty,
      allocations: allocation.allocations,
    });
  }
  return Array.from(byItem.values());
}

async function loadSource(params: {
  workOrderId?: string;
  productionPlanId?: string;
}): Promise<{
  sourceType: 'work_order' | 'production_plan';
  source: WorkOrder | ProductionPlan;
}> {
  if (params.workOrderId) {
    const source = await workOrderService.getById(params.workOrderId);
    if (!source) throw new Error('أمر الشغل غير موجود.');
    return { sourceType: 'work_order', source };
  }
  if (params.productionPlanId) {
    const source = await productionPlanService.getById(params.productionPlanId);
    if (!source) throw new Error('خطة الإنتاج غير موجودة.');
    return { sourceType: 'production_plan', source };
  }
  throw new Error('حدد أمر شغل أو خطة إنتاج.');
}

async function listOrdersForSource(params: {
  workOrderId?: string;
  productionPlanId?: string;
}): Promise<ProductionIssueOrder[]> {
  const field = params.workOrderId ? 'workOrderId' : 'productionPlanId';
  const value = params.workOrderId || params.productionPlanId;
  if (!value) return [];
  return loadWarehouseScopedIssueOrders(where(field, '==', value));
}

async function assertNoBlockingOpenIssue(params: {
  workOrderId?: string;
  productionPlanId?: string;
}): Promise<void> {
  const rows = await listOrdersForSource(params);
  const active = findBlockingOpenIssue(rows);
  if (active?.id) {
    throw new Error('يوجد طلب/إذن صرف معلّق لنفس أمر الشغل أو الخطة. أنهِه أو ألغه قبل إنشاء طلب جديد.');
  }
}

async function resolveSuppliesWarehouse(): Promise<Warehouse> {
  const settings = await systemSettingsService.get();
  if (!settings) throw new Error('تعذر تحميل إعدادات النظام.');
  const routing = resolveInventoryRoutingV1(settings);
  const warehouses = await warehouseService.getAllWarehouses();
  const warehouseId = resolveSuppliesWarehouseId(routing, warehouses);
  const warehouse = warehouses.find((w) => w.id === warehouseId);
  if (!warehouse?.id) throw new Error('حدّد مخزن المستلزمات في توجيه المخازن أولاً.');
  return warehouse;
}

async function resolveProductionFloorWarehouse(): Promise<Warehouse> {
  const settings = await systemSettingsService.get();
  if (!settings) throw new Error('تعذر تحميل إعدادات النظام.');
  const routing = resolveInventoryRoutingV1(settings);
  const floorId = String(routing.productionFloorWarehouseId || '').trim();
  const boundWarehouseId = await getCurrentBoundInventoryWarehouseId();
  // A supplies operator is intentionally scoped to their own source warehouse.
  // Trust the admin-configured routing target instead of trying to validate a
  // destination warehouse that the operator is not authorized to inspect.
  const loaded = floorId && !boundWarehouseId
    ? await warehouseService.getById(floorId)
    : null;
  return resolveProductionFloorWarehouseForIssue({
    routingFloorWarehouseId: floorId,
    decomposedWarehouseId: routing.decomposedWarehouseId,
    loadedWarehouse: loaded,
  });
}

const OPEN_ISSUE_STATUSES = new Set<ProductionIssueOrder['status']>([
  'draft',
  'submitted',
  'requested',
]);

export const productionIssueService = {
  async getAll(): Promise<ProductionIssueOrder[]> {
    if (!isConfigured) return [];
    const rows = await loadWarehouseScopedIssueOrders(orderBy('createdAt', 'desc'));
    return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },

  /**
   * Issued orders that landed on a production-floor warehouse.
   * Bounded recent scan — the floor page groups these into product cards.
   */
  async listIssuedForTargetWarehouse(warehouseId: string): Promise<ProductionIssueOrder[]> {
    if (!isConfigured) return [];
    const id = String(warehouseId || '').trim();
    if (!id) return [];
    const boundWarehouseId = await getCurrentBoundInventoryWarehouseId();
    if (boundWarehouseId && boundWarehouseId !== id) return [];
    const snap = await getDocs(tenantQuery(
      db,
      COLLECTION,
      where('targetWarehouseId', '==', id),
      orderBy('createdAt', 'desc'),
      limit(200),
    ));
    return snap.docs
      .map((row) => ({ id: row.id, ...row.data() } as ProductionIssueOrder))
      .filter((row) => row.status === 'issued');
  },

  /** Recent open issues sourced from one warehouse — control/alerts badges, not a full scan. */
  async listOpenForSourceWarehouse(warehouseId: string): Promise<ProductionIssueOrder[]> {
    if (!isConfigured) return [];
    const id = String(warehouseId || '').trim();
    if (!id) return [];
    const boundWarehouseId = await getCurrentBoundInventoryWarehouseId();
    if (boundWarehouseId && boundWarehouseId !== id) return [];
    const snap = await getDocs(tenantQuery(
      db,
      COLLECTION,
      where('sourceWarehouseId', '==', id),
      orderBy('createdAt', 'desc'),
      limit(100),
    ));
    return snap.docs
      .map((row) => ({ id: row.id, ...row.data() } as ProductionIssueOrder))
      .filter((row) => OPEN_ISSUE_STATUSES.has(row.status));
  },

  async getById(id: string): Promise<ProductionIssueOrder | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as ProductionIssueOrder) : null;
  },

  async getByStatus(status: ProductionIssueOrder['status']): Promise<ProductionIssueOrder[]> {
    if (!isConfigured) return [];
    const all = await this.getAll();
    return all.filter((row) => row.status === status);
  },

  async summarizeIssuedForSource(params: {
    workOrderId?: string;
    productionPlanId?: string;
  }): Promise<IssueSourceSummary & { sourceRemainingQty: number }> {
    if (!isConfigured) {
      return { issuedQty: 0, openRequestedQty: 0, rejectedQty: 0, orderCount: 0, sourceRemainingQty: 0 };
    }
    const rows = await listOrdersForSource(params);
    const summary = summarizeOrdersForSource(rows);
    let sourceRemainingQty = 0;
    try {
      const { source } = await loadSource(params);
      sourceRemainingQty = Math.max(0, sourceQty(source));
    } catch {
      sourceRemainingQty = 0;
    }
    return { ...summary, sourceRemainingQty };
  },

  async hasIssuedForProduction(params: {
    workOrderId?: string;
    productionPlanId?: string;
    productionReportId?: string;
  }): Promise<boolean> {
    if (!isConfigured) return false;

    if (params.productionReportId) {
      const reportRows = await loadWarehouseScopedIssueOrders(
        where('productionReportId', '==', params.productionReportId),
        where('status', '==', 'issued'),
      );
      if (reportRows.length > 0) return true;
    }

    const field = params.workOrderId ? 'workOrderId' : 'productionPlanId';
    const value = params.workOrderId || params.productionPlanId;
    if (!value) return false;
    const rows = await loadWarehouseScopedIssueOrders(
      where(field, '==', value),
      where('status', '==', 'issued'),
    );
    // Report-scoped issues must not block other reports on the same WO/plan.
    return rows.some((row) => {
      return row.sourceType !== 'production_report';
    });
  },

  async createDraft(input: {
    workOrderId?: string;
    productionPlanId?: string;
    productionReportId?: string;
    sourceWarehouseId: string;
    createdBy: string;
    createdByUserId?: string;
    quantityOverride?: number;
    note?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;

    // صرف الإنتاج من تقرير إنتاج لم يعد مدعومًا — المصدر المسموح: أمر شغل أو خطة فقط.
    if (input.productionReportId) {
      throw new Error('لا يمكن إنشاء صرف إنتاج من تقرير إنتاج. اختر أمر شغل أو خطة إنتاج.');
    }

    const activeField = input.workOrderId ? 'workOrderId' : 'productionPlanId';
    const activeValue = input.workOrderId || input.productionPlanId;
    if (activeValue) {
      await assertNoBlockingOpenIssue({
        workOrderId: input.workOrderId,
        productionPlanId: input.productionPlanId,
      });
    }

    const { sourceType, source } = await loadSource(input);
    const quantity = Number(input.quantityOverride || sourceQty(source));
    if (quantity <= 0) throw new Error('كمية أمر الصرف يجب أن تكون أكبر من صفر.');
    const product = await productService.getById(source.productId) as FirestoreProduct | null;
    if (!product?.id) throw new Error('تعذر تحميل المنتج المرتبط.');
    const warehouses = await warehouseService.getAllWarehouses();
    const warehouse = warehouses.find((w) => w.id === input.sourceWarehouseId) as Warehouse | undefined;
    if (!warehouse?.id) throw new Error('حدد مخزن صرف المكونات.');
    const floorWarehouse = await resolveProductionFloorWarehouse();
    const lines = await buildLines(product.id, quantity, warehouse.id);
    const now = toIsoNow();
    const referenceNo = await allocateNextProductionIssueReference();
    const payload: ProductionIssueOrder = {
      referenceNo,
      sourceType,
      workOrderId: sourceType === 'work_order' ? source.id : undefined,
      productionPlanId: sourceType === 'production_plan' ? source.id : undefined,
      productId: product.id,
      productName: product.name,
      productCode: product.code,
      lineId: source.lineId,
      quantity,
      sourceWarehouseId: warehouse.id,
      sourceWarehouseName: warehouse.name,
      targetWarehouseId: floorWarehouse.id,
      targetWarehouseName: floorWarehouse.name,
      status: 'draft',
      origin: 'warehouse',
      lines,
      createdBy: input.createdBy,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      note: input.note,
    };
    const ref = await addDoc(collection(db, COLLECTION), stripUndefined({
      ...payload,
      tenantId: getCurrentTenantId(),
    }));
    return ref.id;
  },

  /**
   * Production-side request: no stock deduction until materials approve.
   * Blocked when assemblable capacity is 0 or an open request/draft already exists.
   */
  async createRequest(input: {
    workOrderId?: string;
    productionPlanId?: string;
    quantity: number;
    note?: string;
    createdBy: string;
    createdByUserId?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    if (!input.workOrderId && !input.productionPlanId) {
      throw new Error('حدد أمر شغل أو خطة إنتاج.');
    }
    await assertNoBlockingOpenIssue({
      workOrderId: input.workOrderId,
      productionPlanId: input.productionPlanId,
    });

    const { sourceType, source } = await loadSource(input);
    const maxSourceQty = Math.max(0, sourceQty(source));
    const quantity = Number(input.quantity || 0);
    if (!(quantity > 0)) throw new Error('كمية الطلب يجب أن تكون أكبر من صفر.');
    if (maxSourceQty > 0 && quantity > maxSourceQty + 0.000001) {
      throw new Error(`كمية الطلب تتجاوز متبقي المصدر (${maxSourceQty}).`);
    }

    const product = await productService.getById(source.productId) as FirestoreProduct | null;
    if (!product?.id) throw new Error('تعذر تحميل المنتج المرتبط.');
    const warehouse = await resolveSuppliesWarehouse();
    const floorWarehouse = await resolveProductionFloorWarehouse();

    const capacityRows = await assemblableCapacityService.getForWarehouse(warehouse.id);
    const capacity = capacityRows.find((row) => row.productId === product.id);
    const maxAssemblable = Math.max(0, Number(capacity?.maxAssemblable || 0));
    if (!(maxAssemblable > 0)) {
      throw new Error(
        'لا يمكن إرسال طلب صرف: لا توجد مكونات كافية للتجميع في مخزن المستلزمات. أبلغ المستلزم لاستلام المكونات أولاً.',
      );
    }
    if (quantity > maxAssemblable + 0.000001) {
      throw new Error(`الكمية أكبر من المتاح للتجميع (${maxAssemblable}).`);
    }

    const now = toIsoNow();
    const referenceNo = await allocateNextProductionIssueReference();
    const payload: ProductionIssueOrder = {
      referenceNo,
      sourceType,
      workOrderId: sourceType === 'work_order' ? source.id : undefined,
      productionPlanId: sourceType === 'production_plan' ? source.id : undefined,
      productId: product.id,
      productName: product.name,
      productCode: product.code,
      lineId: source.lineId,
      quantity,
      requestedQuantity: quantity,
      sourceWarehouseId: warehouse.id,
      sourceWarehouseName: warehouse.name,
      targetWarehouseId: floorWarehouse.id,
      targetWarehouseName: floorWarehouse.name,
      status: 'requested',
      origin: 'production_request',
      lines: [],
      createdBy: input.createdBy,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      requestedBy: input.createdBy,
      requestedByUserId: input.createdByUserId,
      requestedAt: now,
      assemblableAtRequest: maxAssemblable,
      note: input.note,
    };
    const ref = await addDoc(collection(db, COLLECTION), stripUndefined({
      ...payload,
      tenantId: getCurrentTenantId(),
    }));
    return ref.id;
  },

  async rejectRequest(id: string, actor: string, reason?: string): Promise<void> {
    if (!isConfigured || !id) return;
    const order = await this.getById(id);
    if (!order?.id) throw new Error('طلب الصرف غير موجود.');
    if (order.status !== 'requested') throw new Error('يمكن رفض الطلبات بحالة «مطلوب» فقط.');
    await updateDoc(doc(db, COLLECTION, order.id), stripUndefined({
      status: 'rejected',
      rejectedBy: actor,
      rejectedAt: toIsoNow(),
      rejectionReason: String(reason || '').trim() || 'مرفوض من مخزن المستلزمات',
    }));
  },

  /**
   * Build BOM component lines for a production request (or draft) without posting stock.
   * Keeps current status so materials can review/print before approve.
   */
  async prepareRequestLines(
    id: string,
    options?: { quantityOverride?: number; sourceWarehouseId?: string },
  ): Promise<ProductionIssueOrder> {
    if (!isConfigured || !id) throw new Error('طلب الصرف غير موجود.');
    const order = await this.getById(id);
    if (!order?.id) throw new Error('طلب الصرف غير موجود.');
    if (order.status !== 'requested' && order.status !== 'draft') {
      throw new Error('يمكن تجهيز بنود المكونات للطلبات أو المسودات فقط.');
    }

    const quantity = Number(
      options?.quantityOverride != null ? options.quantityOverride : order.quantity,
    );
    if (!(quantity > 0)) throw new Error('كمية الاعتماد يجب أن تكون أكبر من صفر.');

    const warehouseId = String(options?.sourceWarehouseId || order.sourceWarehouseId || '').trim();
    const warehouses = await warehouseService.getAllWarehouses();
    const warehouse = warehouses.find((w) => w.id === warehouseId);
    if (!warehouse?.id) throw new Error('حدد مخزن صرف المكونات.');

    const capacityRows = await assemblableCapacityService.getForWarehouse(warehouse.id);
    const capacity = capacityRows.find((row) => row.productId === order.productId);
    const maxAssemblable = Math.max(0, Number(capacity?.maxAssemblable || 0));
    if (!(maxAssemblable > 0)) {
      throw new Error('لا يمكن تجهيز البنود: المتاح للتجميع = 0 في مخزن المستلزمات.');
    }
    if (quantity > maxAssemblable + 0.000001) {
      throw new Error(`الكمية أكبر من المتاح للتجميع (${maxAssemblable}).`);
    }

    const lines = await buildLines(order.productId, quantity, warehouse.id);
    await updateDoc(doc(db, COLLECTION, order.id), stripUndefined({
      quantity,
      lines,
      sourceWarehouseId: warehouse.id,
      sourceWarehouseName: warehouse.name,
    }));

    const refreshed = await this.getById(order.id);
    if (!refreshed?.id) throw new Error('تعذر تحديث طلب الصرف.');
    return refreshed;
  },

  /**
   * Persist production request as warehouse draft with BOM lines (no stock movement).
   */
  async saveRequestAsDraft(
    id: string,
    options?: { quantityOverride?: number; sourceWarehouseId?: string },
  ): Promise<ProductionIssueOrder> {
    const prepared = await this.prepareRequestLines(id, options);
    if (prepared.status === 'draft') return prepared;
    if (prepared.status !== 'requested') {
      throw new Error('يمكن حفظ المسودة من طلبات الإنتاج فقط.');
    }
    await updateDoc(doc(db, COLLECTION, prepared.id!), {
      status: 'draft',
    });
    const refreshed = await this.getById(prepared.id!);
    if (!refreshed?.id) throw new Error('تعذر حفظ المسودة.');
    return refreshed;
  },

  /**
   * Materials approves a production request: ensure lines exist, then submit + issue stock.
   */
  async approveRequest(
    id: string,
    actor: string,
    options?: { quantityOverride?: number; sourceWarehouseId?: string },
  ): Promise<void> {
    if (!isConfigured || !id) return;
    const order = await this.getById(id);
    if (!order?.id) throw new Error('طلب الصرف غير موجود.');
    if (order.status !== 'requested' && !(order.status === 'draft' && order.origin === 'production_request')) {
      throw new Error('يمكن اعتماد طلبات الإنتاج أو مسوداتها فقط.');
    }

    const quantity = Number(
      options?.quantityOverride != null ? options.quantityOverride : order.quantity,
    );
    const needsRebuild =
      order.lines.length === 0
      || Math.abs(Number(order.quantity || 0) - quantity) > 0.000001
      || (options?.sourceWarehouseId
        && String(options.sourceWarehouseId) !== String(order.sourceWarehouseId || ''));

    if (needsRebuild || order.status === 'requested') {
      await this.prepareRequestLines(id, options);
    }

    const now = toIsoNow();
    await updateDoc(doc(db, COLLECTION, order.id), stripUndefined({
      status: 'submitted',
      submittedAt: now,
      approvedBy: actor,
      approvedAt: now,
    }));

    await this.issue(order.id, actor);
  },

  async submit(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'submitted',
      submittedAt: toIsoNow(),
    });
  },

  async setLineSingleLocation(input: {
    orderId: string;
    itemType: InventoryItemType;
    itemId: string;
    locationId: string;
  }): Promise<void> {
    if (!isConfigured) return;
    const order = await this.getById(input.orderId);
    if (!order?.id) throw new Error('أمر الصرف غير موجود.');
    if (order.status === 'issued') throw new Error('لا يمكن تعديل لوكيشن أمر صرف تم ترحيله.');
    const locations = await warehouseLocationService.getActiveByWarehouse(order.sourceWarehouseId);
    const loc = locations.find((row) => row.id === input.locationId);
    if (!loc?.id) throw new Error('اللوكيشن غير موجود أو غير نشط.');
    const balances = await stockService.getLocationBalances({
      warehouseId: order.sourceWarehouseId,
      locationId: loc.id,
      itemType: input.itemType,
      itemId: input.itemId,
    });
    const availableQty = balances.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const lines = order.lines.map((line) => {
      if (line.itemType !== input.itemType || line.itemId !== input.itemId) return line;
      const requiredQty = Number(line.requiredQty || 0);
      return {
        ...line,
        availableQty,
        shortageQty: Math.max(0, requiredQty - availableQty),
        allocations: availableQty > 0
          ? [{
            locationId: loc.id!,
            locationCode: loc.code,
            rack: loc.rack,
            shelf: loc.shelf,
            quantity: Math.min(requiredQty, availableQty),
          }]
          : [],
      };
    });
    await updateDoc(doc(db, COLLECTION, order.id), { lines });
  },

  async issue(id: string, _actor: string): Promise<void> {
    if (!isConfigured || !functionsClient) {
      throw new Error('النظام غير مهيأ أو لم تُنشر دوال الخادم.');
    }
    const order = await this.getById(id);
    if (!order?.id) throw new Error('أمر الصرف غير موجود.');
    if (order.status === 'issued') return;

    const callable = httpsCallable<{ orderId: string }, { ok: boolean; idempotent?: boolean }>(
      functionsClient,
      'issueProductionIssueStock',
    );
    try {
      await callable({ orderId: order.id });
    } catch (error: unknown) {
      throw callableUserError(error, 'تعذر ترحيل صرف الإنتاج.');
    }
  },

  async recordActualScrap(issueOrderId: string, materialId: string, quantity: number): Promise<void> {
    const order = await this.getById(issueOrderId);
    if (!order?.id) return;
    const lines = order.lines.map((line) => (
      line.materialId === materialId || line.itemId === materialId
        ? { ...line, actualScrapQty: Number(line.actualScrapQty || 0) + Number(quantity || 0) }
        : line
    ));
    await updateDoc(doc(db, COLLECTION, order.id), { lines });
  },

  /**
   * Cancels a production issue order.
   * - draft/submitted: mark cancelled (no stock impact)
   * - issued: reverse linked OUT movements (warehouse + location) then mark cancelled
   * Blocks if the order already has returns, compensation, or scrap recorded.
   */
  async cancel(id: string, actor: string): Promise<void> {
    if (!isConfigured || !id.trim()) throw new Error('معرّف أمر الصرف غير صالح.');
    const order = await this.getById(id);
    if (!order?.id) throw new Error('أمر الصرف غير موجود.');
    if (order.status === 'cancelled') return;
    if (order.status === 'requested' || order.status === 'rejected') {
      await updateDoc(doc(db, COLLECTION, order.id), {
        status: 'cancelled',
        cancelledAt: toIsoNow(),
        cancelledBy: actor,
      });
      return;
    }

    const hasFollowUp = order.lines.some((line) =>
      Number(line.returnedQty || 0) > 0
      || Number(line.compensatedQty || 0) > 0
      || Number(line.actualScrapQty || 0) > 0);
    if (hasFollowUp) {
      throw new Error(
        'لا يمكن إلغاء أمر صرف عليه مرتجعات أو تعويض أو هالك. ألغِ السجلات المرتبطة أولاً أو سجّل مرتجع كامل.',
      );
    }

    if (order.status === 'issued') {
      const movements = await stockService.getTransactionsBySource({
        sourceModule: 'production_issue',
        sourceId: order.id,
      });
      if (movements.length > 0) {
        await stockService.deleteMovements(movements);
      }
    }

    const lines = order.lines.map((line) => ({
      ...line,
      issuedQty: 0,
    }));
    await updateDoc(doc(db, COLLECTION, order.id), {
      status: 'cancelled',
      cancelledAt: toIsoNow(),
      cancelledBy: actor,
      lines,
    });
  },
};
