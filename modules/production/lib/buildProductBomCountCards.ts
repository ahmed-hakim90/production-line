import { bomService } from '../../manufacturing/services/bomService';
import { materialService } from '../../manufacturing/services/materialService';
import type { BomItem } from '../../manufacturing/types';
import { defaultItemLocationService } from '../../inventory/services/defaultItemLocationService';
import { stockService } from '../../inventory/services/stockService';
import type { DefaultItemLocation, StockItemBalance, StockLocationBalance } from '../../inventory/types';
import type { Product } from '../../../types';
import type { ProductBomCountCard, ProductBomCountCardLine } from '../components/ProductBomCountCardPrint';

export type BuildProductBomCountCardsInput = {
  productIds: string[];
  products: Product[];
  /** When set, fills stockQty / availableQty / location from this warehouse. */
  warehouseId?: string;
  warehouseName?: string;
};

export type BuildProductBomCountCardsResult = {
  cards: ProductBomCountCard[];
  skippedWithoutBom: string[];
};

function sumStockForItem(
  balances: StockItemBalance[],
  keys: string[],
  itemCode: string,
): { stockQty: number; availableQty: number } {
  const keySet = new Set(keys.map((k) => String(k || '').trim()).filter(Boolean));
  const code = String(itemCode || '').trim().toUpperCase();
  let stockQty = 0;
  let availableQty = 0;

  for (const row of balances) {
    const type = String(row.itemType || '');
    if (type !== 'material' && type !== 'raw_material' && type !== 'finished_good') continue;
    const id = String(row.itemId || '').trim();
    const rowCode = String(row.itemCode || '').trim().toUpperCase();
    const match = (id && keySet.has(id)) || (code && rowCode === code);
    if (!match) continue;
    const qty = Number(row.quantity || 0);
    const avail = Number(row.availableQty ?? row.quantity ?? 0);
    stockQty += Number.isFinite(qty) ? qty : 0;
    availableQty += Number.isFinite(avail) ? avail : 0;
  }

  return { stockQty, availableQty };
}

function resolveLocationCode(
  keys: string[],
  itemCode: string,
  itemType: 'material' | 'product',
  defaults: DefaultItemLocation[],
  locationBalances: StockLocationBalance[],
): string {
  const keySet = new Set(keys.map((k) => String(k || '').trim()).filter(Boolean));
  const code = String(itemCode || '').trim().toUpperCase();
  const preferredTypes =
    itemType === 'product' ? (['finished_good'] as const) : (['material', 'raw_material'] as const);

  for (const type of preferredTypes) {
    const byDefault = defaults.find(
      (row) =>
        row.itemType === type &&
        ((row.itemId && keySet.has(String(row.itemId))) ||
          (code && String(row.itemCode || '').trim().toUpperCase() === code)),
    );
    if (byDefault?.locationCode) return String(byDefault.locationCode);
  }

  let best: StockLocationBalance | null = null;
  for (const row of locationBalances) {
    const type = String(row.itemType || '');
    if (!preferredTypes.includes(type as (typeof preferredTypes)[number])) continue;
    const id = String(row.itemId || '').trim();
    const rowCode = String(row.itemCode || '').trim().toUpperCase();
    const match = (id && keySet.has(id)) || (code && rowCode === code);
    if (!match) continue;
    if (!String(row.locationCode || '').trim()) continue;
    if (!best || Number(row.quantity || 0) > Number(best.quantity || 0)) {
      best = row;
    }
  }
  return best?.locationCode ? String(best.locationCode) : '—';
}

/**
 * Build printable/previewable product BOM count cards.
 * Optionally attaches warehouse stock, available qty, and location for each component line.
 */
export async function buildProductBomCountCards(
  input: BuildProductBomCountCardsInput,
): Promise<BuildProductBomCountCardsResult> {
  const uniqueIds = [
    ...new Set(input.productIds.map((id) => String(id || '').trim()).filter(Boolean)),
  ];
  if (uniqueIds.length === 0) return { cards: [], skippedWithoutBom: [] };

  const warehouseId = String(input.warehouseId || '').trim();
  const [materials, balances, defaults, locationBalances] = await Promise.all([
    materialService.getAll(),
    warehouseId ? stockService.getBalances(warehouseId) : Promise.resolve([] as StockItemBalance[]),
    warehouseId
      ? defaultItemLocationService.getAll(warehouseId)
      : Promise.resolve([] as DefaultItemLocation[]),
    warehouseId
      ? stockService.getLocationBalances({ warehouseId })
      : Promise.resolve([] as StockLocationBalance[]),
  ]);

  const materialById = new Map(
    materials.map((m) => [String(m.id || ''), m] as const).filter(([id]) => Boolean(id)),
  );
  const productById = new Map(input.products.map((p) => [p.id, p] as const));
  const cards: ProductBomCountCard[] = [];
  const skippedWithoutBom: string[] = [];

  for (const productId of uniqueIds) {
    const product = productById.get(productId);
    if (!product) continue;
    const { items } = await bomService.getActiveBomWithLegacyFallback('product', productId);
    if (!items.length) {
      skippedWithoutBom.push(product.code || product.name || productId);
      continue;
    }

    const lines: ProductBomCountCardLine[] = [...items]
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      .map((item: BomItem) => {
        const material = materialById.get(String(item.itemId || ''));
        const nestedProduct = productById.get(String(item.itemId || ''));
        const lineItemType: 'material' | 'product' =
          item.itemType === 'product' ? 'product' : 'material';
        const itemCode =
          lineItemType === 'product'
            ? String(nestedProduct?.code || '')
            : String(material?.code || '');
        const itemName =
          String(item.itemName || '').trim() ||
          (lineItemType === 'product'
            ? String(nestedProduct?.name || '')
            : String(material?.name || '')) ||
          '—';
        const unit =
          String(item.unit || '').trim() ||
          (lineItemType === 'product' ? 'piece' : String(material?.baseUnit || 'piece'));

        const stockKeys = [
          String(item.itemId || ''),
          String(material?.id || ''),
          String(material?.legacyRawMaterialId || ''),
        ].filter(Boolean);
        const stock = warehouseId
          ? sumStockForItem(balances, stockKeys, itemCode)
          : { stockQty: 0, availableQty: 0 };
        const locationCode = warehouseId
          ? resolveLocationCode(stockKeys, itemCode, lineItemType, defaults, locationBalances)
          : '—';

        return {
          itemId: String(item.itemId || ''),
          itemCode: itemCode || '—',
          itemName,
          unit,
          qtyPerUnit: Number(item.qtyPerUnit || 0),
          locationCode,
          stockQty: stock.stockQty,
          availableQty: stock.availableQty,
        };
      });

    cards.push({
      productId: product.id,
      productCode: product.code || '',
      productName: product.name || '',
      category: product.category || '',
      warehouseId: warehouseId || undefined,
      warehouseName: input.warehouseName || undefined,
      lines,
    });
  }

  return { cards, skippedWithoutBom };
}
