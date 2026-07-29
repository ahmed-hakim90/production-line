import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { BOMS_COLLECTION, BOM_ITEMS_COLLECTION } from '../../manufacturing/collections';
import type { Bom, BomItem } from '../../manufacturing/types';
import { materialService } from '../../manufacturing/services/materialService';
import { bomService } from '../../manufacturing/services/bomService';
import { productService } from '../../production/services/productService';
import { stockService } from './stockService';
import {
  buildAvailableByItemCode,
  buildAvailableByItemId,
  computeAssemblableCapacity,
  lineTouchesStock,
  type AssemblableCapacityRow,
  type AssemblableProductInput,
} from '../lib/assemblableCapacity';

async function loadActiveProductBoms(): Promise<{ boms: Bom[]; itemsByBomId: Map<string, BomItem[]> }> {
  if (!isConfigured) return { boms: [], itemsByBomId: new Map() };
  const tenantId = getCurrentTenantId();
  // Filter client-side to avoid requiring a composite index (tenantId+ownerType+status).
  const bomSnap = await getDocs(
    query(collection(db, BOMS_COLLECTION), where('tenantId', '==', tenantId)),
  );
  const boms = bomSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Bom))
    .filter((bom) => bom.ownerType === 'product' && bom.status === 'active');
  if (boms.length === 0) return { boms: [], itemsByBomId: new Map() };

  const itemSnap = await getDocs(
    query(collection(db, BOM_ITEMS_COLLECTION), where('tenantId', '==', tenantId)),
  );
  const bomIdSet = new Set(boms.map((b) => b.id).filter(Boolean) as string[]);
  const itemsByBomId = new Map<string, BomItem[]>();
  for (const d of itemSnap.docs) {
    const item = { id: d.id, ...d.data() } as BomItem;
    if (!bomIdSet.has(item.bomId)) continue;
    if (item.itemType !== 'material') continue;
    const list = itemsByBomId.get(item.bomId) || [];
    list.push(item);
    itemsByBomId.set(item.bomId, list);
  }
  for (const [bomId, list] of itemsByBomId) {
    list.sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
    itemsByBomId.set(bomId, list);
  }
  return { boms, itemsByBomId };
}

function pickPreferredBom(boms: Bom[]): Bom | null {
  if (!boms.length) return null;
  return [...boms].sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0] ?? null;
}

export const assemblableCapacityService = {
  async getForWarehouse(warehouseId: string): Promise<AssemblableCapacityRow[]> {
    if (!warehouseId) return [];

    const [balances, products, materials, { boms, itemsByBomId }] = await Promise.all([
      stockService.getBalances(warehouseId),
      productService.getAll(),
      materialService.getAll(),
      loadActiveProductBoms(),
    ]);

    const stockRows = balances.filter(
      (row) => row.itemType === 'material' || row.itemType === 'raw_material',
    );
    const availableByItemId = buildAvailableByItemId(stockRows);
    const availableByItemCode = buildAvailableByItemCode(stockRows);

    const materialById = new Map(materials.filter((m) => m.id).map((m) => [m.id!, m]));
    const materialByLegacy = new Map(
      materials
        .filter((m) => m.legacyRawMaterialId)
        .map((m) => [String(m.legacyRawMaterialId), m] as const),
    );
    const materialByCode = new Map(
      materials
        .filter((m) => String(m.code || '').trim())
        .map((m) => [String(m.code).trim().toUpperCase(), m] as const),
    );

    const resolveStockKeys = (
      materialId: string,
      fallbackCode = '',
    ): { code: string; stockKeys: string[] } => {
      const material = materialById.get(materialId);
      if (material?.id) {
        return {
          code: material.code || fallbackCode,
          stockKeys: [material.id, material.legacyRawMaterialId].filter(Boolean) as string[],
        };
      }
      const viaLegacy = materialByLegacy.get(materialId);
      if (viaLegacy?.id) {
        return {
          code: viaLegacy.code || fallbackCode,
          stockKeys: [viaLegacy.id, viaLegacy.legacyRawMaterialId, materialId].filter(Boolean) as string[],
        };
      }
      const viaCode = materialByCode.get(String(fallbackCode || '').trim().toUpperCase());
      if (viaCode?.id) {
        return {
          code: viaCode.code || fallbackCode,
          stockKeys: [viaCode.id, viaCode.legacyRawMaterialId, materialId].filter(Boolean) as string[],
        };
      }
      return { code: fallbackCode, stockKeys: [materialId].filter(Boolean) };
    };

    const bomsByProduct = new Map<string, Bom[]>();
    for (const bom of boms) {
      const ownerId = String(bom.ownerId || '').trim();
      if (!ownerId) continue;
      const list = bomsByProduct.get(ownerId) || [];
      list.push(bom);
      bomsByProduct.set(ownerId, list);
    }

    const productInputs: AssemblableProductInput[] = [];
    for (const product of products) {
      if (!product.id) continue;
      const preferred = pickPreferredBom(bomsByProduct.get(product.id) || []);
      let items = preferred?.id ? itemsByBomId.get(preferred.id) || [] : [];

      // Shared master-data fallback (canonical BOM or legacy via bomService)
      if (!items.length) {
        const { items: fallbackItems } = await bomService.getActiveBomWithLegacyFallback(
          'product',
          product.id,
        );
        items = fallbackItems.filter((item) => item.itemType === 'material');
      }
      if (!items.length) continue;

      productInputs.push({
        productId: product.id,
        productName: product.name,
        productCode: product.code || '',
        lines: items.map((item) => {
          const resolved = resolveStockKeys(item.itemId);
          return {
            materialId: item.itemId,
            materialName: item.itemName || materialById.get(item.itemId)?.name || item.itemId,
            materialCode: resolved.code || materialById.get(item.itemId)?.code || '',
            qtyPerUnit: Number(item.qtyPerUnit || 0),
            wastePercent: Number(item.wastePercent || 0),
            stockKeys: resolved.stockKeys,
          };
        }),
      });
    }

    const stockedIds = new Set(availableByItemId.keys());
    const stockedCodes = new Set(availableByItemCode.keys());
    const relevant = productInputs.filter((product) =>
      product.lines.some((line) => lineTouchesStock(line, stockedIds, stockedCodes)),
    );

    return computeAssemblableCapacity(relevant, availableByItemId, availableByItemCode);
  },
};

export type { AssemblableCapacityRow };
