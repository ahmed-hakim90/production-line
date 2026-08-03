import { addDoc, collection, doc, getDoc, getDocs, orderBy, updateDoc, where } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { productService } from '../../production/services/productService';
import { bomService } from '../../manufacturing/services/bomService';
import { materialService } from '../../manufacturing/services/materialService';
import { rawMaterialService } from './rawMaterialService';
import { stockService } from './stockService';
import {
  INVENTORY_DOCUMENT_OPERATION_KEYS,
  INVENTORY_STOCK_MOVE_PATHS,
  assertCurrentTenantOperationPathEnabled,
  type InventoryDocumentPath,
} from '../../system/lib/operationPathSettings';
import { defaultItemLocationService } from './defaultItemLocationService';
import { warehouseLocationService } from './warehouseLocationService';
import { warehouseLocationSettingsService } from './warehouseLocationSettingsService';
import type { DisassemblyLine, DisassemblyOrder, InventoryItemType } from '../types';
import { getCurrentBoundInventoryWarehouseId } from './inventoryWarehouseScopeService';

const COLLECTION = 'disassembly_orders';
const toIsoNow = () => new Date().toISOString();
const disRef = () => `DIS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

async function resolveMaterial(itemId: string, itemName?: string): Promise<{
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
}> {
  const material = await materialService.getById(itemId);
  if (material?.id) {
    return {
      itemType: 'material',
      itemId: material.id,
      itemName: material.name,
      itemCode: material.code,
      unit: material.baseUnit || 'unit',
    };
  }
  const rawRows = await rawMaterialService.getAll();
  const raw = rawRows.find((row) => row.id === itemId || row.name.trim().toLowerCase() === String(itemName || '').trim().toLowerCase());
  if (!raw?.id) throw new Error(`تعذر تحديد مكون التفكيك: ${itemName || itemId}`);
  return {
    itemType: 'raw_material',
    itemId: raw.id,
    itemName: raw.name,
    itemCode: raw.code,
    unit: raw.unit || 'unit',
  };
}

export const disassemblyService = {
  async getAll(): Promise<DisassemblyOrder[]> {
    if (!isConfigured) return [];
    const boundWarehouseId = await getCurrentBoundInventoryWarehouseId();
    const load = async (field?: 'sourceWarehouseId' | 'targetWarehouseId') => {
      const snap = await getDocs(tenantQuery(
        db,
        COLLECTION,
        ...(field ? [where(field, '==', boundWarehouseId)] : []),
        orderBy('createdAt', 'desc'),
      ));
      return snap.docs;
    };
    const docs = boundWarehouseId
      ? [...await load('sourceWarehouseId'), ...await load('targetWarehouseId')]
      : await load();
    return [...new Map(docs.map((row) => [
      row.id,
      { id: row.id, ...row.data() } as DisassemblyOrder,
    ])).values()]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },

  async getById(id: string): Promise<DisassemblyOrder | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as DisassemblyOrder) : null;
  },

  async previewLines(productId: string, quantity: number, targetWarehouseId?: string): Promise<Omit<DisassemblyLine, 'locationId' | 'locationCode'>[]> {
    if (quantity <= 0) throw new Error('كمية التفكيك يجب أن تكون أكبر من صفر.');
    const { items } = await bomService.getActiveBomWithLegacyFallback('product', productId);
    if (!items.length) throw new Error('لا يوجد BOM للمنتج المطلوب تفكيكه.');
    const lines: Omit<DisassemblyLine, 'locationId' | 'locationCode'>[] = [];
    for (const item of items) {
      if (item.itemType !== 'material') continue;
      const material = await resolveMaterial(item.itemId, item.itemName);
      const baseQty = Number(item.qtyPerUnit || 0) * quantity;
      const wasteQty = baseQty * (Number(item.wastePercent || 0) / 100);
      const defaultLocation = targetWarehouseId
        ? await defaultItemLocationService.get({
          warehouseId: targetWarehouseId,
          itemType: material.itemType,
          itemId: material.itemId,
        })
        : null;
      lines.push({
        ...material,
        quantity: Math.max(0, baseQty - wasteQty),
        wasteQty,
        defaultLocationId: defaultLocation?.locationId,
        defaultLocationCode: defaultLocation?.locationCode,
      });
    }
    return lines;
  },

  async create(input: {
    sourceWarehouseId: string;
    sourceWarehouseName?: string;
    sourceLocationId?: string;
    sourceLocationCode?: string;
    targetWarehouseId: string;
    targetWarehouseName?: string;
    productId: string;
    productName?: string;
    productCode?: string;
    quantity: number;
    lines: DisassemblyLine[];
    createdBy: string;
    createdByUserId?: string;
    note?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    if (input.quantity <= 0) throw new Error('كمية التفكيك يجب أن تكون أكبر من صفر.');
    if (!input.lines.length) throw new Error('لا توجد مكونات لإدخالها من التفكيك.');
    const product = await productService.getById(input.productId);
    if (!product?.id) throw new Error('المنتج غير موجود.');
    const refNo = disRef();
    const docRef = await addDoc(collection(db, COLLECTION), {
      tenantId: getCurrentTenantId(),
      referenceNo: refNo,
      status: 'draft',
      sourceWarehouseId: input.sourceWarehouseId,
      sourceWarehouseName: input.sourceWarehouseName,
      sourceLocationId: input.sourceLocationId,
      sourceLocationCode: input.sourceLocationCode,
      targetWarehouseId: input.targetWarehouseId,
      targetWarehouseName: input.targetWarehouseName,
      productId: product.id,
      productName: product.name,
      productCode: product.code,
      quantity: input.quantity,
      lines: input.lines,
      createdBy: input.createdBy,
      createdByUserId: input.createdByUserId,
      createdAt: toIsoNow(),
      note: input.note,
    });
    return docRef.id;
  },

  async submit(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    const order = await this.getById(id);
    if (!order?.id) throw new Error('طلب التفكيك غير موجود.');
    if (order.status !== 'draft') throw new Error('لا يمكن إرسال طلب تفكيك ليس مسودة.');
    await updateDoc(doc(db, COLLECTION, id), { status: 'submitted', submittedAt: toIsoNow() });
  },

  async approve(
    id: string,
    actor: string,
    context: { path: InventoryDocumentPath },
    actorUserId?: string,
  ): Promise<void> {
    await assertCurrentTenantOperationPathEnabled(
      INVENTORY_DOCUMENT_OPERATION_KEYS.disassemblyApprove,
      context.path,
    );
    if (!isConfigured || !id) return;
    const order = await this.getById(id);
    if (!order?.id) throw new Error('طلب التفكيك غير موجود.');
    if (order.status !== 'submitted') throw new Error('لا يمكن اعتماد طلب غير مرسل.');
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'approved',
      approvedAt: toIsoNow(),
      approvedBy: actor,
      approvedByUserId: actorUserId,
    });
  },

  async reject(
    id: string,
    actor: string,
    context: { path: InventoryDocumentPath },
    reason: string,
    actorUserId?: string,
  ): Promise<void> {
    await assertCurrentTenantOperationPathEnabled(
      INVENTORY_DOCUMENT_OPERATION_KEYS.disassemblyReject,
      context.path,
    );
    if (!isConfigured || !id) return;
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'rejected',
      rejectedAt: toIsoNow(),
      rejectedBy: actor,
      rejectedByUserId: actorUserId,
      rejectionReason: reason,
    });
  },

  async execute(
    id: string,
    actor: string,
    context: { path: InventoryDocumentPath },
    actorUserId?: string,
  ): Promise<void> {
    await assertCurrentTenantOperationPathEnabled(
      INVENTORY_DOCUMENT_OPERATION_KEYS.disassemblyExecute,
      context.path,
    );
    const order = await this.getById(id);
    if (!order?.id) throw new Error('طلب التفكيك غير موجود.');
    if (order.status !== 'approved') throw new Error('لا يمكن تنفيذ التفكيك قبل الاعتماد.');
    const product = await productService.getById(order.productId);
    if (!product?.id) throw new Error('المنتج غير موجود.');
    const settings = await warehouseLocationSettingsService.get(order.sourceWarehouseId);
    if (settings?.requireFinishedGoodLocation && !order.sourceLocationId) {
      throw new Error('حدد لوكيشن المنتج المصدر قبل تنفيذ التفكيك.');
    }
    if (order.sourceLocationId) {
      const activeSourceLocs = await warehouseLocationService.getActiveByWarehouse(order.sourceWarehouseId);
      if (!activeSourceLocs.some((loc) => loc.id === order.sourceLocationId)) throw new Error('لوكيشن المنتج المصدر موقوف أو غير صالح.');
    }
    const productBalance = order.sourceLocationId
      ? (await stockService.getLocationBalances({
        warehouseId: order.sourceWarehouseId,
        locationId: order.sourceLocationId,
        itemType: 'finished_good',
        itemId: product.id,
      })).reduce((sum, row) => sum + Number(row.quantity || 0), 0)
      : await stockService.getBalance(order.sourceWarehouseId, 'finished_good', product.id);
    if (productBalance + 0.000001 < order.quantity) {
      throw new Error(`لا يمكن تنفيذ التفكيك: رصيد المنتج الحالي ${productBalance} أقل من ${order.quantity}.`);
    }
    const activeTargetLocs = await warehouseLocationService.getActiveByWarehouse(order.targetWarehouseId);
    const activeTargetIds = new Set(activeTargetLocs.map((loc) => loc.id).filter(Boolean));
    const invalidLine = order.lines.find((line) => !line.locationId || !activeTargetIds.has(line.locationId));
    if (invalidLine) throw new Error(`مكون "${invalidLine.itemName}" لا يحتوي على رف دخول نشط.`);

    await stockService.createMovement({
      warehouseId: order.sourceWarehouseId,
      locationId: order.sourceLocationId,
      locationCode: order.sourceLocationCode,
      itemType: 'finished_good',
      itemId: product.id,
      itemName: product.name,
      itemCode: product.code,
      unit: 'piece',
      movementType: 'OUT',
      quantity: order.quantity,
      sourceModule: 'disassembly',
      sourceId: order.referenceNo,
      note: `Disassembly ${order.referenceNo}`,
      createdBy: actor,
    }, { path: INVENTORY_STOCK_MOVE_PATHS.disassembly });
    for (const line of order.lines) {
      if (Number(line.quantity || 0) <= 0) continue;
      await stockService.createMovement({
        warehouseId: order.targetWarehouseId,
        locationId: line.locationId,
        locationCode: line.locationCode,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        itemCode: line.itemCode,
        unit: line.unit,
        movementType: 'IN',
        quantity: line.quantity,
        sourceModule: 'disassembly',
        sourceId: order.referenceNo,
        note: `Disassembly ${order.referenceNo}`,
        createdBy: actor,
      }, { path: INVENTORY_STOCK_MOVE_PATHS.disassembly });
    }
    await updateDoc(doc(db, COLLECTION, order.id), {
      status: 'executed',
      executedAt: toIsoNow(),
      executedBy: actor,
      executedByUserId: actorUserId,
    });
  },
};
