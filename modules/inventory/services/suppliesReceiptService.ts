import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, updateDoc, where } from 'firebase/firestore';
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
import {
  collectExecutableLines,
  suggestedReceiptQty,
  validateSuppliesReceiptDraft,
} from '../lib/suppliesReceipt';
import type {
  InventoryItemType,
  SuppliesReceiptLine,
  SuppliesReceiptOrder,
  SuppliesReceiptOrderStatus,
  SuppliesReceiptProductGroup,
} from '../types';
import { resolveInventoryWarehouseReadScope } from './inventoryWarehouseScopeService';

const COLLECTION = 'supplies_receipt_orders';
const DELETABLE_STATUSES: SuppliesReceiptOrderStatus[] = ['draft', 'rejected', 'cancelled'];
const toIsoNow = () => new Date().toISOString();
const receiptRef = () =>
  `SR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

/** Firestore rejects `undefined` field values — drop them (including nested). */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefinedDeep(v)]),
    ) as T;
  }
  return value;
}

type ResolvedMaterial = {
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
};

/** Batch-resolve BOM material ids — avoids N× getAll(raw) fallback. */
async function resolveMaterialsBatch(
  items: Array<{ itemId: string; itemName?: string; unit?: string }>,
): Promise<Map<string, ResolvedMaterial>> {
  const uniqueIds = [...new Set(items.map((i) => i.itemId).filter(Boolean))];
  const byId = new Map<string, ResolvedMaterial>();

  await Promise.all(
    uniqueIds.map(async (id) => {
      const material = await materialService.getById(id);
      if (material?.id) {
        byId.set(id, {
          itemType: 'material',
          itemId: material.id,
          itemName: material.name,
          itemCode: material.code,
          unit: material.baseUnit || 'unit',
        });
      }
    }),
  );

  const missing = uniqueIds.filter((id) => !byId.has(id));
  if (missing.length) {
    const rawRows = await rawMaterialService.getAll();
    const rawById = new Map(rawRows.filter((r) => r.id).map((r) => [r.id!, r]));
    const rawByName = new Map(
      rawRows.map((r) => [String(r.name || '').trim().toLowerCase(), r]),
    );
    for (const id of missing) {
      const bomItem = items.find((i) => i.itemId === id);
      const raw =
        rawById.get(id)
        || rawByName.get(String(bomItem?.itemName || '').trim().toLowerCase());
      if (!raw?.id) continue;
      byId.set(id, {
        itemType: 'raw_material',
        itemId: raw.id,
        itemName: raw.name,
        itemCode: raw.code,
        unit: raw.unit || bomItem?.unit || 'unit',
      });
    }
  }

  return byId;
}

async function locationsRequiredForWarehouse(warehouseId: string): Promise<boolean> {
  const locs = await warehouseLocationService.getActiveByWarehouse(warehouseId);
  return locs.length > 0;
}

function sanitizeLine(line: SuppliesReceiptLine): SuppliesReceiptLine {
  const cleaned: SuppliesReceiptLine = {
    itemType: line.itemType,
    itemId: line.itemId,
    itemName: line.itemName,
    itemCode: line.itemCode,
    unit: line.unit,
    quantity: Number(line.quantity || 0),
    locationId: line.locationId || '',
    locationCode: line.locationCode || '',
  };
  if (line.suggestedQty != null) cleaned.suggestedQty = Number(line.suggestedQty);
  if (line.defaultLocationId) cleaned.defaultLocationId = line.defaultLocationId;
  if (line.defaultLocationCode) cleaned.defaultLocationCode = line.defaultLocationCode;
  return cleaned;
}

function sanitizeGroup(group: SuppliesReceiptProductGroup): SuppliesReceiptProductGroup {
  const cleaned: SuppliesReceiptProductGroup = {
    productId: group.productId,
    productName: group.productName,
    quantity: Number(group.quantity || 0),
    lines: (group.lines || []).map(sanitizeLine),
  };
  if (group.productCode) cleaned.productCode = group.productCode;
  return cleaned;
}

export const suppliesReceiptService = {
  async getAll(warehouseId?: string): Promise<SuppliesReceiptOrder[]> {
    if (!isConfigured) return [];
    const scope = await resolveInventoryWarehouseReadScope(warehouseId);
    if (scope.denied) return [];
    const snap = await getDocs(tenantQuery(
      db,
      COLLECTION,
      ...(scope.warehouseId ? [where('warehouseId', '==', scope.warehouseId)] : []),
      orderBy('createdAt', 'desc'),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SuppliesReceiptOrder));
  },

  async getById(id: string): Promise<SuppliesReceiptOrder | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as SuppliesReceiptOrder) : null;
  },

  async previewGroupLines(
    productId: string,
    quantity: number,
    warehouseId?: string,
  ): Promise<Omit<SuppliesReceiptLine, 'locationId' | 'locationCode'>[]> {
    if (quantity <= 0) throw new Error('كمية المنتج يجب أن تكون أكبر من صفر.');
    const { items } = await bomService.getActiveBomWithLegacyFallback('product', productId);
    if (!items.length) throw new Error('لا يوجد BOM للمنتج المطلوب استلامه.');

    const materialItems = items.filter((item) => item.itemType === 'material' && item.itemId);
    if (!materialItems.length) throw new Error('لا توجد مكونات مادة في BOM المنتج.');

    const [resolved, defaults] = await Promise.all([
      resolveMaterialsBatch(
        materialItems.map((item) => ({
          itemId: item.itemId,
          itemName: item.itemName,
          unit: String(item.unit || 'unit'),
        })),
      ),
      warehouseId
        ? defaultItemLocationService.getAll(warehouseId).catch(() => [])
        : Promise.resolve([]),
    ]);

    const defaultByKey = new Map(
      defaults.map((row) => [`${row.itemType}__${row.itemId}`, row] as const),
    );

    const lines: Omit<SuppliesReceiptLine, 'locationId' | 'locationCode'>[] = [];
    for (const item of materialItems) {
      const material = resolved.get(item.itemId);
      if (!material) {
        throw new Error(`تعذر تحديد المكون: ${item.itemName || item.itemId}`);
      }
      const suggested = suggestedReceiptQty(Number(item.qtyPerUnit || 0), quantity);
      if (!(suggested > 0)) continue;
      const defaultLocation = defaultByKey.get(`${material.itemType}__${material.itemId}`);
      lines.push({
        ...material,
        quantity: suggested,
        suggestedQty: suggested,
        ...(defaultLocation?.locationId
          ? {
            defaultLocationId: defaultLocation.locationId,
            defaultLocationCode: defaultLocation.locationCode,
          }
          : {}),
      });
    }
    if (!lines.length) throw new Error('لا توجد مكونات مادة في BOM المنتج.');
    return lines;
  },

  async create(input: {
    warehouseId: string;
    warehouseName?: string;
    containerRef?: string;
    groups: SuppliesReceiptProductGroup[];
    standaloneLines: SuppliesReceiptLine[];
    createdBy: string;
    createdByUserId?: string;
    note?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const locationsRequired = await locationsRequiredForWarehouse(input.warehouseId);
    const groups = (input.groups || []).map(sanitizeGroup);
    const standaloneLines = (input.standaloneLines || []).map(sanitizeLine);
    validateSuppliesReceiptDraft({
      warehouseId: input.warehouseId,
      groups,
      standaloneLines,
      locationsRequired,
    });

    for (const group of groups) {
      const product = await productService.getById(group.productId);
      if (!product?.id) throw new Error(`المنتج غير موجود: ${group.productName || group.productId}`);
      group.productName = product.name;
      group.productCode = product.code;
    }

    const refNo = receiptRef();
    const containerRef = input.containerRef?.trim() || '';
    const note = input.note?.trim() || '';
    const payload = stripUndefinedDeep({
      tenantId: getCurrentTenantId(),
      referenceNo: refNo,
      status: 'draft' as const,
      warehouseId: input.warehouseId,
      ...(input.warehouseName ? { warehouseName: input.warehouseName } : {}),
      ...(containerRef ? { containerRef } : {}),
      groups,
      standaloneLines,
      createdBy: input.createdBy,
      ...(input.createdByUserId ? { createdByUserId: input.createdByUserId } : {}),
      createdAt: toIsoNow(),
      ...(note ? { note } : {}),
    });
    const docRef = await addDoc(collection(db, COLLECTION), payload);
    return docRef.id;
  },

  async updateDraft(
    id: string,
    input: {
      warehouseId: string;
      warehouseName?: string;
      containerRef?: string;
      groups: SuppliesReceiptProductGroup[];
      standaloneLines: SuppliesReceiptLine[];
      note?: string;
    },
  ): Promise<void> {
    if (!isConfigured || !id) return;
    const order = await this.getById(id);
    if (!order?.id) throw new Error('مستند الاستلام غير موجود.');
    if (order.status !== 'draft') throw new Error('لا يمكن تعديل مستند ليس مسودة.');
    const locationsRequired = await locationsRequiredForWarehouse(input.warehouseId);
    const groups = (input.groups || []).map(sanitizeGroup);
    const standaloneLines = (input.standaloneLines || []).map(sanitizeLine);
    validateSuppliesReceiptDraft({
      warehouseId: input.warehouseId,
      groups,
      standaloneLines,
      locationsRequired,
    });
    const containerRef = input.containerRef?.trim() || '';
    const note = input.note?.trim() || '';
    await updateDoc(
      doc(db, COLLECTION, id),
      stripUndefinedDeep({
        warehouseId: input.warehouseId,
        ...(input.warehouseName ? { warehouseName: input.warehouseName } : {}),
        containerRef,
        groups,
        standaloneLines,
        note,
      }),
    );
  },

  async submit(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    const order = await this.getById(id);
    if (!order?.id) throw new Error('مستند الاستلام غير موجود.');
    if (order.status !== 'draft') throw new Error('لا يمكن تقديم مستند ليس مسودة.');
    const locationsRequired = await locationsRequiredForWarehouse(order.warehouseId);
    validateSuppliesReceiptDraft({
      warehouseId: order.warehouseId,
      groups: order.groups || [],
      standaloneLines: order.standaloneLines || [],
      locationsRequired,
    });
    await updateDoc(doc(db, COLLECTION, id), { status: 'submitted', submittedAt: toIsoNow() });
  },

  async approve(
    id: string,
    actor: string,
    context: { path: InventoryDocumentPath },
    actorUserId?: string,
  ): Promise<void> {
    await assertCurrentTenantOperationPathEnabled(
      INVENTORY_DOCUMENT_OPERATION_KEYS.suppliesReceiptApprove,
      context.path,
    );
    if (!isConfigured || !id) return;
    const order = await this.getById(id);
    if (!order?.id) throw new Error('مستند الاستلام غير موجود.');
    if (order.status !== 'submitted') throw new Error('لا يمكن اعتماد مستند غير مقدّم.');
    await updateDoc(doc(db, COLLECTION, id), stripUndefinedDeep({
      status: 'approved',
      approvedAt: toIsoNow(),
      approvedBy: actor,
      ...(actorUserId ? { approvedByUserId: actorUserId } : {}),
    }));
  },

  async reject(
    id: string,
    actor: string,
    context: { path: InventoryDocumentPath },
    reason: string,
    actorUserId?: string,
  ): Promise<void> {
    await assertCurrentTenantOperationPathEnabled(
      INVENTORY_DOCUMENT_OPERATION_KEYS.suppliesReceiptReject,
      context.path,
    );
    if (!isConfigured || !id) return;
    const order = await this.getById(id);
    if (!order?.id) throw new Error('مستند الاستلام غير موجود.');
    if (order.status !== 'submitted' && order.status !== 'approved') {
      throw new Error('لا يمكن رفض هذا المستند في حالته الحالية.');
    }
    await updateDoc(doc(db, COLLECTION, id), stripUndefinedDeep({
      status: 'rejected',
      rejectedAt: toIsoNow(),
      rejectedBy: actor,
      ...(actorUserId ? { rejectedByUserId: actorUserId } : {}),
      rejectionReason: reason || '',
    }));
  },

  async execute(
    id: string,
    actor: string,
    context: { path: InventoryDocumentPath },
    actorUserId?: string,
  ): Promise<void> {
    await assertCurrentTenantOperationPathEnabled(
      INVENTORY_DOCUMENT_OPERATION_KEYS.suppliesReceiptExecute,
      context.path,
    );
    const order = await this.getById(id);
    if (!order?.id) throw new Error('مستند الاستلام غير موجود.');
    if (order.status !== 'approved') throw new Error('لا يمكن تنفيذ الاستلام قبل الاعتماد.');

    const activeLocs = await warehouseLocationService.getActiveByWarehouse(order.warehouseId);
    const locationsRequired = activeLocs.length > 0;
    const activeIds = new Set(activeLocs.map((loc) => loc.id).filter(Boolean) as string[]);

    validateSuppliesReceiptDraft({
      warehouseId: order.warehouseId,
      groups: order.groups || [],
      standaloneLines: order.standaloneLines || [],
      locationsRequired,
    });

    const lines = collectExecutableLines({
      groups: order.groups || [],
      standaloneLines: order.standaloneLines || [],
    });

    if (locationsRequired) {
      const invalid = lines.find((line) => !line.locationId || !activeIds.has(line.locationId));
      if (invalid) throw new Error(`مكون "${invalid.itemName}" لا يحتوي على رف دخول نشط.`);
    }

    for (const line of lines) {
      const group = (order.groups || []).find((g) =>
        (g.lines || []).some(
          (l) =>
            l.itemId === line.itemId
            && l.itemType === line.itemType
            && (l.locationId || '') === (line.locationId || ''),
        ),
      );
      const noteParts = [`استلام مستلزمات ${order.referenceNo}`];
      if (order.containerRef) noteParts.push(`أمر توريد ${order.containerRef}`);
      if (group) noteParts.push(`${group.productName} × ${group.quantity}`);

      await stockService.createMovement({
        warehouseId: order.warehouseId,
        locationId: line.locationId || undefined,
        locationCode: line.locationCode || undefined,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        itemCode: line.itemCode,
        unit: line.unit,
        movementType: 'IN',
        quantity: line.quantity,
        sourceModule: 'supplies_receipt',
        sourceId: order.referenceNo,
        note: noteParts.join(' — '),
        createdBy: actor,
      }, { path: INVENTORY_STOCK_MOVE_PATHS.suppliesReceipt });
    }

    await updateDoc(doc(db, COLLECTION, order.id), stripUndefinedDeep({
      status: 'executed',
      executedAt: toIsoNow(),
      executedBy: actor,
      ...(actorUserId ? { executedByUserId: actorUserId } : {}),
    }));
  },

  /** Only draft / rejected / cancelled — never executed (stock already posted). */
  async remove(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    const order = await this.getById(id);
    if (!order?.id) throw new Error('مستند الاستلام غير موجود.');
    if (!DELETABLE_STATUSES.includes(order.status)) {
      throw new Error('لا يمكن حذف مستند مقدّم أو معتمد أو منفّذ. ارفضه أولاً إن لزم.');
    }
    await deleteDoc(doc(db, COLLECTION, order.id));
  },
};
