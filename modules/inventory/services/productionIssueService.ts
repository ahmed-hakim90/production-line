import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
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

const COLLECTION = 'production_issue_orders';

const toIsoNow = () => new Date().toISOString();
const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
const issueRef = () => `PI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

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
    const stockLine = await resolveMaterialStockLine(item.itemId, item.itemName || '');
    const qtyPerUnit = Number(item.qtyPerUnit || 0);
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

export const productionIssueService = {
  async getAll(): Promise<ProductionIssueOrder[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(tenantQuery(db, COLLECTION, orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionIssueOrder));
  },

  async getById(id: string): Promise<ProductionIssueOrder | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as ProductionIssueOrder) : null;
  },

  async hasIssuedForProduction(params: {
    workOrderId?: string;
    productionPlanId?: string;
    productionReportId?: string;
  }): Promise<boolean> {
    if (!isConfigured) return false;

    if (params.productionReportId) {
      const reportSnap = await getDocs(query(
        tenantQuery(db, COLLECTION),
        where('productionReportId', '==', params.productionReportId),
        where('status', '==', 'issued'),
      ));
      if (!reportSnap.empty) return true;
    }

    const field = params.workOrderId ? 'workOrderId' : 'productionPlanId';
    const value = params.workOrderId || params.productionPlanId;
    if (!value) return false;
    const snap = await getDocs(query(
      tenantQuery(db, COLLECTION),
      where(field, '==', value),
      where('status', '==', 'issued'),
    ));
    // Report-scoped issues must not block other reports on the same WO/plan.
    return snap.docs.some((d) => {
      const row = d.data() as ProductionIssueOrder;
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
      const activeSnap = await getDocs(query(
        tenantQuery(db, COLLECTION),
        where(activeField, '==', activeValue),
      ));
      const active = activeSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as ProductionIssueOrder))
        .find((row) => row.status !== 'cancelled' && row.sourceType !== 'production_report');
      if (active?.id) {
        throw new Error('يوجد إذن صرف نشط بالفعل لنفس أمر الشغل/الخطة. استخدم طلب تعويض مستقل بدلاً من إذن صرف جديد.');
      }
    }

    const { sourceType, source } = await loadSource(input);
    const quantity = Number(input.quantityOverride || sourceQty(source));
    if (quantity <= 0) throw new Error('كمية أمر الصرف يجب أن تكون أكبر من صفر.');
    const product = await productService.getById(source.productId) as FirestoreProduct | null;
    if (!product?.id) throw new Error('تعذر تحميل المنتج المرتبط.');
    const warehouses = await warehouseService.getAllWarehouses();
    const warehouse = warehouses.find((w) => w.id === input.sourceWarehouseId) as Warehouse | undefined;
    if (!warehouse?.id) throw new Error('حدد مخزن صرف المكونات.');
    const lines = await buildLines(product.id, quantity, warehouse.id);
    const now = toIsoNow();
    const payload: ProductionIssueOrder = {
      referenceNo: issueRef(),
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
      status: 'draft',
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

  async issue(id: string, actor: string): Promise<void> {
    const order = await this.getById(id);
    if (!order?.id) throw new Error('أمر الصرف غير موجود.');
    if (order.status === 'issued') return;
    const activeLocations = await warehouseLocationService.getActiveByWarehouse(order.sourceWarehouseId);
    const activeLocationIds = new Set(activeLocations.map((loc) => loc.id).filter(Boolean));
    const shortages: ProductionIssueShortageRow[] = [];
    for (const line of order.lines) {
      const requiredQty = Number(line.requiredQty || 0);
      const allocatedQty = line.allocations.reduce((total, row) => total + Number(row.quantity || 0), 0);
      if (allocatedQty + 0.000001 < requiredQty) {
        shortages.push({
          itemName: line.itemName,
          itemCode: line.itemCode,
          unit: line.unit,
          requiredQty,
          availableQty: Number(line.availableQty || allocatedQty || 0),
          kind: 'insufficient_allocation',
        });
        continue;
      }
      for (const allocation of line.allocations) {
        if (!activeLocationIds.has(allocation.locationId)) {
          shortages.push({
            itemName: line.itemName,
            itemCode: line.itemCode,
            unit: line.unit,
            requiredQty: Number(allocation.quantity || 0),
            availableQty: 0,
            kind: 'inactive_location',
            locationCode: allocation.locationCode,
          });
          continue;
        }
        const balances = await stockService.getLocationBalances({
          warehouseId: order.sourceWarehouseId,
          locationId: allocation.locationId,
          itemType: line.itemType,
          itemId: line.itemId,
        });
        const availableQty = balances.reduce((total, row) => total + Number(row.quantity || 0), 0);
        const allocationQty = Number(allocation.quantity || 0);
        if (availableQty + 0.000001 < allocationQty) {
          shortages.push({
            itemName: line.itemName,
            itemCode: line.itemCode,
            unit: line.unit,
            requiredQty: allocationQty,
            availableQty,
            kind: 'stale_balance',
            locationCode: allocation.locationCode,
          });
        }
      }
    }
    if (shortages.length) throw new ProductionIssueApprovalError(shortages);
    for (const line of order.lines) {
      for (const allocation of line.allocations) {
        if (Number(allocation.quantity || 0) <= 0) continue;
        await stockService.createMovement({
          warehouseId: order.sourceWarehouseId,
          locationId: allocation.locationId,
          locationCode: allocation.locationCode,
          itemType: line.itemType,
          itemId: line.itemId,
          itemName: line.itemName,
          itemCode: line.itemCode,
          unit: line.unit,
          movementType: 'OUT',
          quantity: Number(allocation.quantity || 0),
          sourceModule: 'production_issue',
          sourceId: order.id,
          sourceReportId: order.productionReportId,
          sourceIssueOrderId: order.id,
          sourceWorkOrderId: order.workOrderId,
          sourcePlanId: order.productionPlanId,
          note: order.productionReportCode
            ? `Production issue ${order.referenceNo} for report ${order.productionReportCode}`
            : `Production issue ${order.referenceNo}`,
          createdBy: actor,
        });
      }
      line.issuedQty = Number(line.requiredQty || 0);
    }
    await updateDoc(doc(db, COLLECTION, order.id), {
      status: 'issued',
      issuedAt: toIsoNow(),
      issuedBy: actor,
      lines: order.lines,
    });
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
