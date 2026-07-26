import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  runTransaction,
  where,
  limit,
  setDoc,
  updateDoc,
  writeBatch,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type {
  CreateStockMovementInput,
  InventoryItemType,
  StockCountLine,
  StockCountSession,
  StockItemBalance,
  StockLocationBalance,
  StockTransaction,
} from '../types';
import {
  allocateInvReferenceInTransaction,
  ensureInvCounter,
  formatInvReference,
  peekNextInvReferenceNo,
} from './inventoryInvSequence';

const BALANCES_COLLECTION = 'stock_items';
const LOCATION_BALANCES_COLLECTION = 'stock_location_balances';
const WAREHOUSE_LOCATIONS_COLLECTION = 'warehouse_locations';
const TRANSACTIONS_COLLECTION = 'stock_transactions';
const COUNTS_COLLECTION = 'stock_counts';
const TRANSFER_REQUESTS_COLLECTION = 'inventory_transfer_requests';
const DELETE_BATCH = 500;
const MAX_PAGE_SIZE = 100;
const KPI_MAX_PAGES = 200;

export type InventoryKpiSummary = {
  totalLines: number;
  totalQty: number;
  lowStockCount: number;
  pagesScanned: number;
  truncated: boolean;
};

type FirestoreCursor = QueryDocumentSnapshot | null;
interface StockPageResult<T> {
  items: T[];
  nextCursor: FirestoreCursor;
  hasMore: boolean;
}

const balanceDocId = (warehouseId: string, itemType: InventoryItemType, itemId: string) =>
  `${warehouseId}__${itemType}__${itemId}`;
const locationBalanceDocId = (warehouseId: string, locationId: string, itemType: InventoryItemType, itemId: string) =>
  `${warehouseId}__${locationId}__${itemType}__${itemId}`;

const toIsoNow = () => new Date().toISOString();
const stripUndefined = <T extends Record<string, any>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>;
const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};
const locationMeta = async (locationId?: string): Promise<Record<string, any>> => {
  if (!isConfigured || !locationId) return {};
  const snap = await getDoc(doc(db, WAREHOUSE_LOCATIONS_COLLECTION, locationId));
  if (!snap.exists()) return {};
  const data = snap.data();
  return stripUndefined({
    locationCode: data.code,
    rackId: data.rackId,
    rackName: data.rackName || data.rack,
    rackCode: data.rackCode,
    rack: data.rackName || data.rack,
    shelfName: data.shelfName || data.shelf,
    shelfCode: data.shelfCode,
    shelf: data.shelfName || data.shelf,
  });
};

/** Firestore rejects `undefined` field values — always strip before location-balance writes. */
const locationBalanceWrite = (fields: {
  warehouseId: string;
  locationId: string;
  locationCode?: string;
  rackId?: string;
  rackName?: string;
  rackCode?: string;
  rack?: string;
  shelfName?: string;
  shelfCode?: string;
  shelf?: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  unit?: string;
  minStock?: number;
  quantity: number;
  updatedAt: string;
  lastMovementAt: string;
  tenantId: string;
}) =>
  stripUndefined({
    warehouseId: fields.warehouseId,
    locationId: fields.locationId,
    locationCode: fields.locationCode || fields.locationId,
    rackId: fields.rackId,
    rackName: fields.rackName,
    rackCode: fields.rackCode,
    rack: fields.rack,
    shelfName: fields.shelfName,
    shelfCode: fields.shelfCode,
    shelf: fields.shelf,
    itemType: fields.itemType,
    itemId: fields.itemId,
    itemName: fields.itemName,
    itemCode: fields.itemCode,
    unit: fields.unit,
    minStock: fields.minStock ?? 0,
    quantity: fields.quantity,
    updatedAt: fields.updatedAt,
    lastMovementAt: fields.lastMovementAt,
    tenantId: fields.tenantId,
  });

export const stockService = {
  async getBalancesPaged(params?: {
    warehouseId?: string;
    limit?: number;
    cursor?: FirestoreCursor;
  }): Promise<StockPageResult<StockItemBalance>> {
    if (!isConfigured) return { items: [], nextCursor: null, hasMore: false };
    const pageSize = Math.max(1, Math.min(Number(params?.limit || 50), MAX_PAGE_SIZE));
    const constraints: any[] = [orderBy('updatedAt', 'desc'), limit(pageSize)];
    if (params?.warehouseId) constraints.unshift(where('warehouseId', '==', params.warehouseId));
    if (params?.cursor) constraints.push(startAfter(params.cursor));
    const q = tenantQuery(db, BALANCES_COLLECTION, ...constraints);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockItemBalance));
    const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { items, nextCursor, hasMore: snap.docs.length === pageSize };
  },

  async getTransactionsPaged(params?: {
    warehouseId?: string;
    limit?: number;
    cursor?: FirestoreCursor;
    movementType?: StockTransaction['movementType'];
    sourceModule?: StockTransaction['sourceModule'];
    startDate?: string;
    endDate?: string;
  }): Promise<StockPageResult<StockTransaction>> {
    if (!isConfigured) return { items: [], nextCursor: null, hasMore: false };
    const pageSize = Math.max(1, Math.min(Number(params?.limit || 50), MAX_PAGE_SIZE));
    const constraints: any[] = [orderBy('createdAt', 'desc'), limit(pageSize)];
    if (params?.warehouseId) constraints.unshift(where('warehouseId', '==', params.warehouseId));
    if (params?.movementType) constraints.unshift(where('movementType', '==', params.movementType));
    if (params?.sourceModule) constraints.unshift(where('sourceModule', '==', params.sourceModule));
    if (params?.startDate) constraints.unshift(where('createdAt', '>=', params.startDate));
    if (params?.endDate) constraints.unshift(where('createdAt', '<=', params.endDate));
    if (params?.cursor) constraints.push(startAfter(params.cursor));
    const q = tenantQuery(db, TRANSACTIONS_COLLECTION, ...constraints);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockTransaction));
    const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { items, nextCursor, hasMore: snap.docs.length === pageSize };
  },

  /** Display-only hint; actual allocation happens atomically in `createMovement`. */
  async getNextInvReferenceNo(): Promise<string> {
    if (!isConfigured) return formatInvReference(1);
    return peekNextInvReferenceNo();
  },

  /**
   * Loads balances in pages of up to `MAX_PAGE_SIZE` each, at most 10 pages (1000 rows max per tenant scope).
   * Heavy for very large catalogs; callers that only need KPIs should use `getBalancesPaged` instead.
   */
  /**
   * Scans all balance pages for tenant-wide KPIs (not capped at dashboard sample size).
   */
  async getInventoryKpiSummary(warehouseId?: string): Promise<InventoryKpiSummary> {
    if (!isConfigured) {
      return { totalLines: 0, totalQty: 0, lowStockCount: 0, pagesScanned: 0, truncated: false };
    }
    let totalLines = 0;
    let totalQty = 0;
    let lowStockCount = 0;
    let cursor: FirestoreCursor = null;
    let pagesScanned = 0;
    let truncated = false;

    for (let page = 0; page < KPI_MAX_PAGES; page += 1) {
      const res = await this.getBalancesPaged({ warehouseId, limit: MAX_PAGE_SIZE, cursor });
      pagesScanned += 1;
      for (const row of res.items) {
        totalLines += 1;
        const qty = Number(row.quantity || 0);
        totalQty += qty;
        const min = Number(row.minStock || 0);
        if (min > 0 && qty < min) lowStockCount += 1;
      }
      if (!res.hasMore || !res.nextCursor) break;
      cursor = res.nextCursor;
      if (page === KPI_MAX_PAGES - 1 && res.hasMore) truncated = true;
    }

    return { totalLines, totalQty, lowStockCount, pagesScanned, truncated };
  },

  async getBalances(warehouseId?: string): Promise<StockItemBalance[]> {
    if (!isConfigured) return [];
    const rows: StockItemBalance[] = [];
    let cursor: FirestoreCursor = null;
    // Match KPI scan depth so balances pages aren't silently truncated after large imports.
    const maxPages = KPI_MAX_PAGES;
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.getBalancesPaged({ warehouseId, limit: MAX_PAGE_SIZE, cursor });
      rows.push(...res.items);
      if (!res.hasMore || !res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return rows;
  },

  async getLocationBalances(params?: {
    warehouseId?: string;
    locationId?: string;
    itemType?: InventoryItemType;
    itemId?: string;
  }): Promise<StockLocationBalance[]> {
    if (!isConfigured) return [];
    const constraints: any[] = [orderBy('updatedAt', 'desc'), limit(1000)];
    if (params?.warehouseId) constraints.unshift(where('warehouseId', '==', params.warehouseId));
    if (params?.locationId) constraints.unshift(where('locationId', '==', params.locationId));
    if (params?.itemType) constraints.unshift(where('itemType', '==', params.itemType));
    if (params?.itemId) constraints.unshift(where('itemId', '==', params.itemId));
    const q = tenantQuery(db, LOCATION_BALANCES_COLLECTION, ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockLocationBalance));
  },

  async getTransactions(warehouseId?: string): Promise<StockTransaction[]> {
    if (!isConfigured) return [];
    const q = warehouseId
      ? tenantQuery(
        db,
        TRANSACTIONS_COLLECTION,
        where('warehouseId', '==', warehouseId),
        orderBy('createdAt', 'desc'),
        limit(500),
      )
      : tenantQuery(db, TRANSACTIONS_COLLECTION, orderBy('createdAt', 'desc'), limit(500));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockTransaction));
  },

  /**
   * Deletes all tenant-scoped inventory data tied to a warehouse (transfer requests, transactions,
   * balances, count sessions). Caller deletes the warehouse document afterward.
   */
  async deleteAllDataForWarehouse(warehouseId: string): Promise<void> {
    if (!isConfigured || !warehouseId.trim()) {
      throw new Error('معرّف المخزن غير صالح.');
    }
    const id = warehouseId.trim();

    const deleteWhereEquals = async (collectionName: string, field: string, value: string) => {
      for (;;) {
        const q = tenantQuery(db, collectionName, where(field, '==', value), limit(DELETE_BATCH));
        const snap = await getDocs(q);
        if (snap.empty) break;
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    };

    await deleteWhereEquals(TRANSFER_REQUESTS_COLLECTION, 'fromWarehouseId', id);
    await deleteWhereEquals(TRANSFER_REQUESTS_COLLECTION, 'toWarehouseId', id);
    await deleteWhereEquals(TRANSACTIONS_COLLECTION, 'warehouseId', id);
    await deleteWhereEquals(TRANSACTIONS_COLLECTION, 'toWarehouseId', id);
    await deleteWhereEquals(BALANCES_COLLECTION, 'warehouseId', id);
    await deleteWhereEquals(COUNTS_COLLECTION, 'warehouseId', id);
  },

  async getTransactionsByReferenceNo(referenceNo: string): Promise<StockTransaction[]> {
    if (!isConfigured || !referenceNo.trim()) return [];
    const q = tenantQuery(
      db,
      TRANSACTIONS_COLLECTION,
      where('referenceNo', '==', referenceNo.trim()),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockTransaction));
  },

  async getTransactionsByNote(note: string): Promise<StockTransaction[]> {
    if (!isConfigured || !note.trim()) return [];
    const q = tenantQuery(
      db,
      TRANSACTIONS_COLLECTION,
      where('note', '==', note.trim()),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockTransaction));
  },

  async getTransactionsBySource(params: {
    sourceModule: StockTransaction['sourceModule'];
    sourceId: string;
  }): Promise<StockTransaction[]> {
    if (!isConfigured || !params.sourceId.trim() || !params.sourceModule) return [];
    try {
      const q = tenantQuery(
        db,
        TRANSACTIONS_COLLECTION,
        where('sourceModule', '==', params.sourceModule),
        where('sourceId', '==', params.sourceId.trim()),
        orderBy('createdAt', 'desc'),
        limit(500),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockTransaction));
    } catch {
      const q = tenantQuery(
        db,
        TRANSACTIONS_COLLECTION,
        where('sourceId', '==', params.sourceId.trim()),
        limit(500),
      );
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as StockTransaction))
        .filter((tx) => tx.sourceModule === params.sourceModule || !tx.sourceModule);
    }
  },

  async getBalance(
    warehouseId: string,
    itemType: InventoryItemType,
    itemId: string,
  ): Promise<number> {
    if (!isConfigured) return 0;
    const balRef = doc(db, BALANCES_COLLECTION, balanceDocId(warehouseId, itemType, itemId));
    const direct = await getDoc(balRef);
    return direct.exists() ? Number(direct.data().quantity || 0) : 0;
  },

  async createMovement(input: CreateStockMovementInput): Promise<string | null> {
    if (!isConfigured) return null;
    if (input.movementType === 'ADJUSTMENT') {
      if (input.quantity === 0) throw new Error('قيمة التسوية يجب ألا تساوي صفر.');
    } else if (input.quantity <= 0) {
      throw new Error('الكمية يجب أن تكون أكبر من صفر.');
    }

    if (!input.referenceNo?.trim()) {
      await ensureInvCounter();
    }

    const tenantId = getCurrentTenantId();
    const txRef = doc(collection(db, TRANSACTIONS_COLLECTION));
    const sourceLocMeta = await locationMeta(input.locationId);
    const targetLocMeta = await locationMeta(input.toLocationId);
    const sourceLocationFields = stripUndefined({
      locationCode: input.locationCode || sourceLocMeta.locationCode,
      rackId: input.rackId || sourceLocMeta.rackId,
      rackName: input.rackName || sourceLocMeta.rackName,
      rackCode: input.rackCode || sourceLocMeta.rackCode,
      shelfName: input.shelfName || sourceLocMeta.shelfName,
      shelfCode: input.shelfCode || sourceLocMeta.shelfCode,
    });
    const targetLocationFields = stripUndefined({
      locationCode: input.toLocationCode || targetLocMeta.locationCode,
      rackId: input.toRackId || targetLocMeta.rackId,
      rackName: input.toRackName || targetLocMeta.rackName,
      rackCode: input.toRackCode || targetLocMeta.rackCode,
      shelfName: input.toShelfName || targetLocMeta.shelfName,
      shelfCode: input.toShelfCode || targetLocMeta.shelfCode,
    });

    if (input.movementType === 'TRANSFER') {
      const isSameWarehouse =
        !input.toWarehouseId || input.toWarehouseId === input.warehouseId;

      if (isSameWarehouse) {
        if (!input.locationId || !input.toLocationId) {
          throw new Error('حدد رف المصدر ورف الوجهة لنقل داخل نفس المخزن.');
        }
        if (input.locationId === input.toLocationId) {
          throw new Error('رف المصدر ورف الوجهة يجب أن يكونا مختلفين.');
        }

        const linkedRef = doc(collection(db, TRANSACTIONS_COLLECTION));
        await runTransaction(db, async (t) => {
          const resolvedReferenceNo =
            input.referenceNo?.trim() || (await allocateInvReferenceInTransaction(t));
          const sourceLocationRef = doc(
            db,
            LOCATION_BALANCES_COLLECTION,
            locationBalanceDocId(input.warehouseId, input.locationId!, input.itemType, input.itemId),
          );
          const targetLocationRef = doc(
            db,
            LOCATION_BALANCES_COLLECTION,
            locationBalanceDocId(input.warehouseId, input.toLocationId!, input.itemType, input.itemId),
          );

          const sourceLocationSnap = await t.get(sourceLocationRef);
          const sourceLocationQty = sourceLocationSnap.exists()
            ? Number(sourceLocationSnap.data().quantity || 0)
            : 0;
          const nextSourceLocation = sourceLocationQty - input.quantity;
          if (nextSourceLocation < 0 && !input.allowNegative) {
            throw new Error('لا يمكن تنفيذ النقل: الرصيد غير كافٍ في رف المصدر.');
          }
          const targetLocationSnap = await t.get(targetLocationRef);
          const targetLocationQty = targetLocationSnap.exists()
            ? Number(targetLocationSnap.data().quantity || 0)
            : 0;
          const nextTargetLocation = targetLocationQty + input.quantity;
          const now = toIsoNow();

          const lineage = {
            unit: input.unit,
            sourceModule: input.sourceModule,
            sourceId: input.sourceId,
            sourceIssueOrderId: input.sourceIssueOrderId,
            sourceWorkOrderId: input.sourceWorkOrderId,
            sourcePlanId: input.sourcePlanId,
            adjustmentReason: input.adjustmentReason,
          };
          const outPayload: StockTransaction = {
            warehouseId: input.warehouseId,
            locationId: input.locationId,
            locationCode: sourceLocationFields.locationCode,
            rackId: sourceLocationFields.rackId,
            rackName: sourceLocationFields.rackName,
            rackCode: sourceLocationFields.rackCode,
            shelfName: sourceLocationFields.shelfName,
            shelfCode: sourceLocationFields.shelfCode,
            toWarehouseId: input.warehouseId,
            toLocationId: input.toLocationId,
            toLocationCode: targetLocationFields.locationCode,
            toRackId: targetLocationFields.rackId,
            toRackName: targetLocationFields.rackName,
            toRackCode: targetLocationFields.rackCode,
            toShelfName: targetLocationFields.shelfName,
            toShelfCode: targetLocationFields.shelfCode,
            itemType: input.itemType,
            itemId: input.itemId,
            itemName: input.itemName,
            itemCode: input.itemCode,
            movementType: 'TRANSFER',
            quantity: input.quantity,
            requestQuantity: input.requestQuantity,
            requestUnit: input.requestUnit,
            unitsPerCarton: input.unitsPerCarton,
            note: input.note,
            referenceNo: resolvedReferenceNo,
            relatedTransactionId: linkedRef.id,
            transferDirection: 'OUT',
            createdBy: input.createdBy,
            createdAt: now,
            ...lineage,
          };
          const inPayload: StockTransaction = {
            ...outPayload,
            warehouseId: input.warehouseId,
            locationId: input.toLocationId,
            locationCode: targetLocationFields.locationCode,
            rackId: targetLocationFields.rackId,
            rackName: targetLocationFields.rackName,
            rackCode: targetLocationFields.rackCode,
            shelfName: targetLocationFields.shelfName,
            shelfCode: targetLocationFields.shelfCode,
            toWarehouseId: input.warehouseId,
            toLocationId: input.locationId,
            toLocationCode: sourceLocationFields.locationCode,
            toRackId: sourceLocationFields.rackId,
            toRackName: sourceLocationFields.rackName,
            toRackCode: sourceLocationFields.rackCode,
            toShelfName: sourceLocationFields.shelfName,
            toShelfCode: sourceLocationFields.shelfCode,
            relatedTransactionId: txRef.id,
            transferDirection: 'IN',
          };

          t.set(txRef, stripUndefined({ ...outPayload, tenantId }));
          t.set(linkedRef, stripUndefined({ ...inPayload, tenantId }));

          t.set(
            sourceLocationRef,
            locationBalanceWrite({
              warehouseId: input.warehouseId,
              locationId: input.locationId!,
              locationCode: sourceLocationFields.locationCode,
              rackId: sourceLocationFields.rackId,
              rackName: sourceLocationFields.rackName,
              rackCode: sourceLocationFields.rackCode,
              rack: sourceLocMeta.rack,
              shelfName: sourceLocationFields.shelfName,
              shelfCode: sourceLocationFields.shelfCode,
              shelf: sourceLocMeta.shelf,
              itemType: input.itemType,
              itemId: input.itemId,
              itemName: input.itemName,
              itemCode: input.itemCode,
              unit: input.unit,
              minStock: input.minStock,
              quantity: nextSourceLocation,
              updatedAt: now,
              lastMovementAt: now,
              tenantId,
            }),
            { merge: true },
          );

          t.set(
            targetLocationRef,
            locationBalanceWrite({
              warehouseId: input.warehouseId,
              locationId: input.toLocationId!,
              locationCode: targetLocationFields.locationCode,
              rackId: targetLocationFields.rackId,
              rackName: targetLocationFields.rackName,
              rackCode: targetLocationFields.rackCode,
              rack: targetLocMeta.rack,
              shelfName: targetLocationFields.shelfName,
              shelfCode: targetLocationFields.shelfCode,
              shelf: targetLocMeta.shelf,
              itemType: input.itemType,
              itemId: input.itemId,
              itemName: input.itemName,
              itemCode: input.itemCode,
              unit: input.unit,
              minStock: input.minStock,
              quantity: nextTargetLocation,
              updatedAt: now,
              lastMovementAt: now,
              tenantId,
            }),
            { merge: true },
          );
        });
        return txRef.id;
      }

      if (!input.toWarehouseId) {
        throw new Error('اختر مخزن وجهة مختلف للتحويل.');
      }

      const linkedRef = doc(collection(db, TRANSACTIONS_COLLECTION));
      await runTransaction(db, async (t) => {
        const resolvedReferenceNo =
          input.referenceNo?.trim() || (await allocateInvReferenceInTransaction(t));
        const sourceBalanceRef = doc(
          db,
          BALANCES_COLLECTION,
          balanceDocId(input.warehouseId, input.itemType, input.itemId),
        );
        const targetBalanceRef = doc(
          db,
          BALANCES_COLLECTION,
          balanceDocId(input.toWarehouseId!, input.itemType, input.itemId),
        );
        const sourceLocationRef = input.locationId
          ? doc(
            db,
            LOCATION_BALANCES_COLLECTION,
            locationBalanceDocId(input.warehouseId, input.locationId, input.itemType, input.itemId),
          )
          : null;
        const targetLocationRef = input.toLocationId
          ? doc(
            db,
            LOCATION_BALANCES_COLLECTION,
            locationBalanceDocId(input.toWarehouseId!, input.toLocationId, input.itemType, input.itemId),
          )
          : null;

        const sourceSnap = await t.get(sourceBalanceRef);
        const sourceQty = sourceSnap.exists() ? Number(sourceSnap.data().quantity || 0) : 0;
        const nextSource = sourceQty - input.quantity;
        if (nextSource < 0 && !input.allowNegative) {
          throw new Error('لا يمكن تنفيذ التحويل: الرصيد غير كافٍ في المخزن المصدر.');
        }

        const targetSnap = await t.get(targetBalanceRef);
        const targetQty = targetSnap.exists() ? Number(targetSnap.data().quantity || 0) : 0;
        const nextTarget = targetQty + input.quantity;
        const sourceLocationSnap = sourceLocationRef ? await t.get(sourceLocationRef) : null;
        const sourceLocationQty = sourceLocationSnap?.exists() ? Number(sourceLocationSnap.data().quantity || 0) : 0;
        const nextSourceLocation = sourceLocationQty - input.quantity;
        if (sourceLocationRef && nextSourceLocation < 0 && !input.allowNegative) {
          throw new Error('لا يمكن تنفيذ التحويل: الرصيد غير كافٍ في اللوكيشن المصدر.');
        }
        const targetLocationSnap = targetLocationRef ? await t.get(targetLocationRef) : null;
        const targetLocationQty = targetLocationSnap?.exists() ? Number(targetLocationSnap.data().quantity || 0) : 0;
        const nextTargetLocation = targetLocationQty + input.quantity;
        const now = toIsoNow();

        const lineage = {
          unit: input.unit,
          sourceModule: input.sourceModule,
          sourceId: input.sourceId,
          sourceIssueOrderId: input.sourceIssueOrderId,
          sourceWorkOrderId: input.sourceWorkOrderId,
          sourcePlanId: input.sourcePlanId,
          adjustmentReason: input.adjustmentReason,
        };
        const outPayload: StockTransaction = {
          warehouseId: input.warehouseId,
          locationId: input.locationId,
          locationCode: sourceLocationFields.locationCode,
          rackId: sourceLocationFields.rackId,
          rackName: sourceLocationFields.rackName,
          rackCode: sourceLocationFields.rackCode,
          shelfName: sourceLocationFields.shelfName,
          shelfCode: sourceLocationFields.shelfCode,
          toWarehouseId: input.toWarehouseId,
          toLocationId: input.toLocationId,
          toLocationCode: targetLocationFields.locationCode,
          toRackId: targetLocationFields.rackId,
          toRackName: targetLocationFields.rackName,
          toRackCode: targetLocationFields.rackCode,
          toShelfName: targetLocationFields.shelfName,
          toShelfCode: targetLocationFields.shelfCode,
          itemType: input.itemType,
          itemId: input.itemId,
          itemName: input.itemName,
          itemCode: input.itemCode,
          movementType: 'TRANSFER',
          quantity: input.quantity,
          requestQuantity: input.requestQuantity,
          requestUnit: input.requestUnit,
          unitsPerCarton: input.unitsPerCarton,
          note: input.note,
          referenceNo: resolvedReferenceNo,
          relatedTransactionId: linkedRef.id,
          transferDirection: 'OUT',
          createdBy: input.createdBy,
          createdAt: now,
          ...lineage,
        };
        const inPayload: StockTransaction = {
          ...outPayload,
          warehouseId: input.toWarehouseId!,
          locationId: input.toLocationId,
          locationCode: targetLocationFields.locationCode,
          rackId: targetLocationFields.rackId,
          rackName: targetLocationFields.rackName,
          rackCode: targetLocationFields.rackCode,
          shelfName: targetLocationFields.shelfName,
          shelfCode: targetLocationFields.shelfCode,
          toWarehouseId: input.warehouseId,
          toLocationId: input.locationId,
          toLocationCode: sourceLocationFields.locationCode,
          toRackId: sourceLocationFields.rackId,
          toRackName: sourceLocationFields.rackName,
          toRackCode: sourceLocationFields.rackCode,
          toShelfName: sourceLocationFields.shelfName,
          toShelfCode: sourceLocationFields.shelfCode,
          relatedTransactionId: txRef.id,
          transferDirection: 'IN',
        };

        t.set(txRef, stripUndefined({ ...outPayload, tenantId }));
        t.set(linkedRef, stripUndefined({ ...inPayload, tenantId }));

        t.set(sourceBalanceRef, {
          warehouseId: input.warehouseId,
          itemType: input.itemType,
          itemId: input.itemId,
          itemName: input.itemName,
          itemCode: input.itemCode,
          minStock: input.minStock ?? 0,
          quantity: nextSource,
          updatedAt: now,
          tenantId,
        }, { merge: true });

        t.set(targetBalanceRef, {
          warehouseId: input.toWarehouseId!,
          itemType: input.itemType,
          itemId: input.itemId,
          itemName: input.itemName,
          itemCode: input.itemCode,
          minStock: input.minStock ?? 0,
          quantity: nextTarget,
          updatedAt: now,
          tenantId,
        }, { merge: true });
        if (sourceLocationRef && input.locationId) {
          t.set(
            sourceLocationRef,
            locationBalanceWrite({
              warehouseId: input.warehouseId,
              locationId: input.locationId,
              locationCode: sourceLocationFields.locationCode,
              rackId: sourceLocationFields.rackId,
              rackName: sourceLocationFields.rackName,
              rackCode: sourceLocationFields.rackCode,
              rack: sourceLocMeta.rack,
              shelfName: sourceLocationFields.shelfName,
              shelfCode: sourceLocationFields.shelfCode,
              shelf: sourceLocMeta.shelf,
              itemType: input.itemType,
              itemId: input.itemId,
              itemName: input.itemName,
              itemCode: input.itemCode,
              unit: input.unit,
              minStock: input.minStock,
              quantity: nextSourceLocation,
              updatedAt: now,
              lastMovementAt: now,
              tenantId,
            }),
            { merge: true },
          );
        }
        if (targetLocationRef && input.toLocationId) {
          t.set(
            targetLocationRef,
            locationBalanceWrite({
              warehouseId: input.toWarehouseId!,
              locationId: input.toLocationId,
              locationCode: targetLocationFields.locationCode,
              rackId: targetLocationFields.rackId,
              rackName: targetLocationFields.rackName,
              rackCode: targetLocationFields.rackCode,
              rack: targetLocMeta.rack,
              shelfName: targetLocationFields.shelfName,
              shelfCode: targetLocationFields.shelfCode,
              shelf: targetLocMeta.shelf,
              itemType: input.itemType,
              itemId: input.itemId,
              itemName: input.itemName,
              itemCode: input.itemCode,
              unit: input.unit,
              minStock: input.minStock,
              quantity: nextTargetLocation,
              updatedAt: now,
              lastMovementAt: now,
              tenantId,
            }),
            { merge: true },
          );
        }
      });
      return txRef.id;
    }

    await runTransaction(db, async (t) => {
      const resolvedReferenceNo =
        input.referenceNo?.trim() || (await allocateInvReferenceInTransaction(t));
      const balRef = doc(db, BALANCES_COLLECTION, balanceDocId(input.warehouseId, input.itemType, input.itemId));
      const locRef = input.locationId
        ? doc(
          db,
          LOCATION_BALANCES_COLLECTION,
          locationBalanceDocId(input.warehouseId, input.locationId, input.itemType, input.itemId),
        )
        : null;
      const balSnap = await t.get(balRef);
      const currentQty = balSnap.exists() ? Number(balSnap.data().quantity || 0) : 0;
      let delta = input.quantity;
      if (input.movementType === 'OUT') delta = -input.quantity;
      if (input.movementType === 'ADJUSTMENT') delta = input.quantity;

      const nextQty = currentQty + delta;
      if (nextQty < 0 && !input.allowNegative) {
        throw new Error('لا يمكن تنفيذ العملية: الرصيد الحالي لا يسمح بهذه الحركة.');
      }
      const locSnap = locRef ? await t.get(locRef) : null;
      const currentLocQty = locSnap?.exists() ? Number(locSnap.data().quantity || 0) : 0;
      const nextLocQty = currentLocQty + delta;
      if (locRef && nextLocQty < 0 && !input.allowNegative) {
        throw new Error('لا يمكن تنفيذ العملية: رصيد اللوكيشن الحالي لا يسمح بهذه الحركة.');
      }

      const now = toIsoNow();
      const payload: StockTransaction = {
        warehouseId: input.warehouseId,
        locationId: input.locationId,
        locationCode: sourceLocationFields.locationCode,
        rackId: sourceLocationFields.rackId,
        rackName: sourceLocationFields.rackName,
        rackCode: sourceLocationFields.rackCode,
        shelfName: sourceLocationFields.shelfName,
        shelfCode: sourceLocationFields.shelfCode,
        itemType: input.itemType,
        itemId: input.itemId,
        itemName: input.itemName,
        itemCode: input.itemCode,
        movementType: input.movementType,
        quantity: delta,
        unit: input.unit,
        note: input.note,
        referenceNo: resolvedReferenceNo,
        sourceModule: input.sourceModule,
        sourceId: input.sourceId,
        sourceReportId: input.sourceReportId,
        sourceIssueOrderId: input.sourceIssueOrderId,
        sourceWorkOrderId: input.sourceWorkOrderId,
        sourcePlanId: input.sourcePlanId,
        adjustmentReason: input.adjustmentReason,
        createdBy: input.createdBy,
        createdAt: now,
      };

      t.set(txRef, stripUndefined({ ...payload, tenantId }));
      t.set(
        balRef,
        {
          warehouseId: input.warehouseId,
          itemType: input.itemType,
          itemId: input.itemId,
          itemName: input.itemName,
          itemCode: input.itemCode,
          minStock: input.minStock ?? 0,
          quantity: nextQty,
          updatedAt: now,
          tenantId,
        },
        { merge: true },
      );
      if (locRef && input.locationId) {
        t.set(
          locRef,
          locationBalanceWrite({
            warehouseId: input.warehouseId,
            locationId: input.locationId,
            locationCode: sourceLocationFields.locationCode,
            rackId: sourceLocationFields.rackId,
            rackName: sourceLocationFields.rackName,
            rackCode: sourceLocationFields.rackCode,
            rack: sourceLocMeta.rack,
            shelfName: sourceLocationFields.shelfName,
            shelfCode: sourceLocationFields.shelfCode,
            shelf: sourceLocMeta.shelf,
            itemType: input.itemType,
            itemId: input.itemId,
            itemName: input.itemName,
            itemCode: input.itemCode,
            unit: input.unit,
            minStock: input.minStock,
            quantity: nextLocQty,
            updatedAt: now,
            lastMovementAt: now,
            tenantId,
          }),
          { merge: true },
        );
      }
    });

    return txRef.id;
  },

  async updateMovement(
    tx: StockTransaction,
    updates: { quantity: number; referenceNo?: string },
  ): Promise<void> {
    if (!isConfigured || !tx.id) return;
    if (tx.movementType === 'TRANSFER') {
      throw new Error('تعديل التحويلة غير مدعوم مباشرة. احذف التحويلة ثم أنشئها من جديد.');
    }

    const typedQty = Number(updates.quantity || 0);
    if (tx.movementType === 'ADJUSTMENT') {
      if (typedQty === 0) throw new Error('قيمة التسوية لا يمكن أن تساوي صفر.');
    } else if (typedQty <= 0) {
      throw new Error('الكمية يجب أن تكون أكبر من صفر.');
    }

    const nextSignedQty =
      tx.movementType === 'OUT'
        ? -Math.abs(typedQty)
        : tx.movementType === 'IN'
          ? Math.abs(typedQty)
          : typedQty;

    await runTransaction(db, async (t) => {
      const tenantId = getCurrentTenantId();
      const balRef = doc(db, BALANCES_COLLECTION, balanceDocId(tx.warehouseId, tx.itemType, tx.itemId));
      const txRef = doc(db, TRANSACTIONS_COLLECTION, tx.id!);
      const balSnap = await t.get(balRef);
      const currentQty = balSnap.exists() ? Number(balSnap.data().quantity || 0) : 0;
      const delta = nextSignedQty - Number(tx.quantity || 0);
      const nextQty = currentQty + delta;
      if (nextQty < 0) {
        throw new Error('تعذر تعديل الحركة لأن الرصيد الحالي لا يسمح بهذه الكمية.');
      }

      const now = toIsoNow();
      t.set(
        balRef,
        {
          warehouseId: tx.warehouseId,
          itemType: tx.itemType,
          itemId: tx.itemId,
          itemName: tx.itemName,
          itemCode: tx.itemCode,
          minStock: 0,
          quantity: nextQty,
          updatedAt: now,
          tenantId,
        },
        { merge: true },
      );
      t.update(txRef, stripUndefined({
        quantity: nextSignedQty,
        referenceNo: updates.referenceNo?.trim() || tx.referenceNo,
      }));
    });
  },

  async deleteMovement(tx: StockTransaction): Promise<void> {
    if (!isConfigured || !tx.id) return;

    if (tx.movementType === 'TRANSFER') {
      if (tx.referenceNo?.trim()) {
        await this.deleteTransferByReference(tx.referenceNo.trim());
        return;
      }
      throw new Error('لا يمكن حذف تحويلة بدون رقم مرجع.');
    }

    await runTransaction(db, async (t) => {
      const tenantId = getCurrentTenantId();
      const balRef = doc(db, BALANCES_COLLECTION, balanceDocId(tx.warehouseId, tx.itemType, tx.itemId));
      const balSnap = await t.get(balRef);
      const currentQty = balSnap.exists() ? Number(balSnap.data().quantity || 0) : 0;
      const nextQty = currentQty - Number(tx.quantity || 0);
      if (nextQty < 0) {
        throw new Error('تعذر حذف الحركة لأن رصيد الصنف الحالي لا يسمح بعكسها.');
      }

      const txRef = doc(db, TRANSACTIONS_COLLECTION, tx.id!);
      t.set(
        balRef,
        {
          warehouseId: tx.warehouseId,
          itemType: tx.itemType,
          itemId: tx.itemId,
          itemName: tx.itemName,
          itemCode: tx.itemCode,
          minStock: 0,
          quantity: nextQty,
          updatedAt: toIsoNow(),
          tenantId,
        },
        { merge: true },
      );
      t.delete(txRef);
    });
  },

  async deleteTransferByReference(referenceNo: string): Promise<void> {
    if (!isConfigured || !referenceNo.trim()) return;
    const tenantId = getCurrentTenantId();
    const base = tenantQuery(
      db,
      TRANSACTIONS_COLLECTION,
      where('movementType', '==', 'TRANSFER'),
      where('referenceNo', '==', referenceNo.trim()),
    );
    const snap = await getDocs(base);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockTransaction));
    if (rows.length === 0) return;

    const txById = new Map(rows.map((row) => [row.id!, row]));
    const outRows = rows.filter((row) => row.transferDirection === 'OUT');
    if (outRows.length === 0) {
      throw new Error('هذه التحويلة قديمة وغير مدعومة للحذف التلقائي. أنشئ تحويلة عكسية بدلًا من الحذف.');
    }

    await runTransaction(db, async (t) => {
      for (const row of outRows) {
        if (!row.id || !row.toWarehouseId) continue;
        const sourceRef = doc(db, BALANCES_COLLECTION, balanceDocId(row.warehouseId, row.itemType, row.itemId));
        const targetRef = doc(db, BALANCES_COLLECTION, balanceDocId(row.toWarehouseId, row.itemType, row.itemId));

        const sourceSnap = await t.get(sourceRef);
        const targetSnap = await t.get(targetRef);
        const sourceQty = sourceSnap.exists() ? Number(sourceSnap.data().quantity || 0) : 0;
        const targetQty = targetSnap.exists() ? Number(targetSnap.data().quantity || 0) : 0;
        const qty = Number(row.quantity || 0);
        const nextSource = sourceQty + qty;
        const nextTarget = targetQty - qty;
        if (nextTarget < 0) {
          throw new Error(`تعذر حذف التحويلة لأن رصيد المخزن الوجهة للصنف "${row.itemName}" أقل من الكمية المحولة.`);
        }

        t.set(
          sourceRef,
          {
            warehouseId: row.warehouseId,
            itemType: row.itemType,
            itemId: row.itemId,
            itemName: row.itemName,
            itemCode: row.itemCode,
            minStock: 0,
            quantity: nextSource,
            updatedAt: toIsoNow(),
            tenantId,
          },
          { merge: true },
        );
        t.set(
          targetRef,
          {
            warehouseId: row.toWarehouseId,
            itemType: row.itemType,
            itemId: row.itemId,
            itemName: row.itemName,
            itemCode: row.itemCode,
            minStock: 0,
            quantity: nextTarget,
            updatedAt: toIsoNow(),
            tenantId,
          },
          { merge: true },
        );

        const outRef = doc(db, TRANSACTIONS_COLLECTION, row.id);
        t.delete(outRef);
        if (row.relatedTransactionId && txById.has(row.relatedTransactionId)) {
          const inRef = doc(db, TRANSACTIONS_COLLECTION, row.relatedTransactionId);
          t.delete(inRef);
        }
      }
    });
  },

  async deleteMovements(rows: StockTransaction[]): Promise<void> {
    if (!isConfigured || rows.length === 0) return;

    const transferRefs = new Set(
      rows
        .filter((row) => row.movementType === 'TRANSFER' && row.referenceNo?.trim())
        .map((row) => row.referenceNo!.trim()),
    );
    for (const ref of transferRefs) {
      await this.deleteTransferByReference(ref);
    }

    const nonTransferRows = rows.filter((row) => row.movementType !== 'TRANSFER' && row.id);
    for (const row of nonTransferRows) {
      await this.deleteMovement(row);
    }
  },

  async purgeAllMovements(): Promise<void> {
    if (!isConfigured) return;
    const [txSnap, balancesSnap] = await Promise.all([
      getDocs(tenantQuery(db, TRANSACTIONS_COLLECTION)),
      getDocs(tenantQuery(db, BALANCES_COLLECTION)),
    ]);

    const docsToDelete = [...txSnap.docs, ...balancesSnap.docs];
    if (docsToDelete.length === 0) return;

    const chunks = chunkArray(docsToDelete, 400);
    for (const group of chunks) {
      const batch = writeBatch(db);
      for (const row of group) {
        batch.delete(row.ref);
      }
      await batch.commit();
    }
  },

  async createCountSession(payload: {
    warehouseId: string;
    warehouseName: string;
    lines: StockCountLine[];
    note?: string;
    createdBy: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = doc(collection(db, COUNTS_COLLECTION));
    const session: StockCountSession = {
      warehouseId: payload.warehouseId,
      warehouseName: payload.warehouseName,
      status: 'open',
      note: payload.note,
      lines: payload.lines,
      createdBy: payload.createdBy,
      createdAt: toIsoNow(),
      tenantId: getCurrentTenantId(),
    } as StockCountSession;
    await setDoc(ref, session);
    return ref.id;
  },

  async getCountSessions(): Promise<StockCountSession[]> {
    if (!isConfigured) return [];
    const q = tenantQuery(db, COUNTS_COLLECTION, orderBy('createdAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockCountSession));
  },

  async saveCountLines(sessionId: string, lines: StockCountLine[]): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, COUNTS_COLLECTION, sessionId), {
      lines,
      status: 'counted',
    });
  },

  async approveCountSession(session: StockCountSession, approvedBy: string): Promise<void> {
    if (!isConfigured || !session.id) return;
    const diffs = session.lines
      .map((line) => ({
        ...line,
        diff: Number(line.countedQty || 0) - Number(line.expectedQty || 0),
      }))
      .filter((line) => line.diff !== 0);

    const adjustmentReason = session.adjustmentReason ?? 'count_correction';
    for (const line of diffs) {
      await this.createMovement({
        warehouseId: session.warehouseId,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        itemCode: line.itemCode,
        movementType: 'ADJUSTMENT',
        quantity: line.diff,
        adjustmentReason,
        sourceModule: 'stock_count',
        sourceId: session.id,
        note: `Count adjustment from session ${session.id}`,
        createdBy: approvedBy,
      });
    }

    await updateDoc(doc(db, COUNTS_COLLECTION, session.id), {
      status: 'approved',
      approvedAt: toIsoNow(),
      approvedBy,
      adjustmentReason,
    });
  },
};
