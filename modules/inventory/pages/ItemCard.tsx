import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button, SearchableSelect } from '../components/UI';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedPrint } from '../../../utils/printManager';
import { materialService } from '../../manufacturing/services/materialService';
import { bomService } from '../../manufacturing/services/bomService';
import type { Material } from '../../manufacturing/types';
import { warehouseService } from '../services/warehouseService';
import { stockService } from '../services/stockService';
import { itemTypeLabel } from '../lib/stockLabels';
import { movementFateLabel, movementPathLabel } from '../lib/itemMovementTrace';
import type {
  InventoryItemType,
  StockItemBalance,
  StockLocationBalance,
  StockTransaction,
  Warehouse,
} from '../types';
import {
  ItemCardPrint,
  type ItemCardBomLine,
  type ItemCardPrintModel,
} from '../components/ItemCardPrint';
import { BarcodeLabelPrintEngineModal } from '../components/BarcodeLabelPrintEngineModal';
import { ProductBomCountCardPreviewModal } from '../../production/components/ProductBomCountCardPreviewModal';
import { buildProductBomCountCards } from '../../production/lib/buildProductBomCountCards';
import type { ProductBomCountCard } from '../../production/components/ProductBomCountCardPrint';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

const PAGE_SIZE = 40;

type CatalogOption = {
  id: string;
  code: string;
  name: string;
  unit?: string;
  category?: string;
  itemType: InventoryItemType;
  barcode?: string;
};

type MovementCursorState = {
  byType: Partial<Record<InventoryItemType, unknown>>;
  hasMoreByType: Partial<Record<InventoryItemType, boolean>>;
};
type MovementCachedPage = {
  rows: StockTransaction[];
  cursorState: MovementCursorState;
  hasNext: boolean;
};

function itemMovementTypes(itemType: InventoryItemType): InventoryItemType[] {
  return itemType === 'finished_good'
    ? ['finished_good']
    : ['material', 'raw_material'];
}

function mergeUniqueMovements(rows: StockTransaction[]): StockTransaction[] {
  const unique = new Map<string, StockTransaction>();
  rows.forEach((tx) => {
    const key = tx.id || `${tx.createdAt}-${tx.referenceNo}-${tx.quantity}-${tx.warehouseId}-${tx.movementType}`;
    if (!unique.has(key)) unique.set(key, tx);
  });
  return [...unique.values()].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  );
}

const matchesItemBalance = (
  row: StockItemBalance,
  itemType: InventoryItemType,
  itemId: string,
) => {
  if (String(row.itemId || '') !== itemId) return false;
  if (itemType === 'material' || itemType === 'raw_material') {
    return row.itemType === 'material' || row.itemType === 'raw_material';
  }
  return row.itemType === itemType;
};

export const ItemCard: React.FC = () => {
  const { can } = usePermission();
  const canView = can('inventory.view');
  const [searchParams, setSearchParams] = useSearchParams();
  const products = useAppStore((s) => s._rawProducts || []);
  const printSettings = useAppStore((s) => s.systemSettings?.printTemplate);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [itemType, setItemType] = useState<InventoryItemType>(
    () => (searchParams.get('itemType') as InventoryItemType) || 'finished_good',
  );
  const [itemId, setItemId] = useState(() => searchParams.get('itemId') || '');
  const [warehouseId, setWarehouseId] = useState(() => searchParams.get('warehouseId') || '');
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [locationBalances, setLocationBalances] = useState<StockLocationBalance[]>([]);
  const [bomLines, setBomLines] = useState<ItemCardBomLine[]>([]);
  const [movements, setMovements] = useState<StockTransaction[]>([]);
  const [hasMoreMovements, setHasMoreMovements] = useState(false);
  const [movementPages, setMovementPages] = useState<MovementCachedPage[]>([]);
  const [movementPageIndex, setMovementPageIndex] = useState(0);
  const movementCursorStateRef = useRef<MovementCursorState>({
    byType: {},
    hasMoreByType: {},
  });

  const [countCards, setCountCards] = useState<ProductBomCountCard[]>([]);
  const [countPreviewOpen, setCountPreviewOpen] = useState(false);
  const [countLoading, setCountLoading] = useState(false);
  const [countWarning, setCountWarning] = useState<string | null>(null);
  const [labelEngineOpen, setLabelEngineOpen] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({
    contentRef: printRef,
    printSettings,
    documentTitle: 'كارت الصنف',
  });

  const warehouseNameById = useMemo(() => {
    const map = new Map<string, string>();
    warehouses.forEach((w) => {
      if (w.id) map.set(w.id, w.name || w.id);
    });
    return map;
  }, [warehouses]);

  const catalogOptions = useMemo((): CatalogOption[] => {
    if (itemType === 'finished_good') {
      return products.map((p) => ({
        id: p.id,
        code: p.code || '',
        name: p.name || '',
        unit: 'piece',
        category: p.category || '',
        itemType: 'finished_good' as const,
        barcode: String((p as { barcode?: string }).barcode || ''),
      }));
    }
    return materials
      .filter((m) => m.isActive !== false)
      .map((m) => ({
        id: String(m.id || ''),
        code: m.code || '',
        name: m.name || '',
        unit: m.baseUnit || 'piece',
        category: m.categoryName || m.type || '',
        itemType: 'material' as const,
        barcode: String((m as { barcode?: string }).barcode || ''),
      }))
      .filter((m) => m.id);
  }, [itemType, products, materials]);

  const itemSelectOptions = useMemo(
    () =>
      catalogOptions.map((opt) => ({
        value: opt.id,
        label: opt.code ? `${opt.name} (${opt.code})` : opt.name,
        hint: opt.category || undefined,
      })),
    [catalogOptions],
  );

  const selected = useMemo(
    () => catalogOptions.find((opt) => opt.id === itemId) || null,
    [catalogOptions, itemId],
  );

  const itemBalances = useMemo(() => {
    if (!selected) return [];
    return balances
      .filter((row) => matchesItemBalance(row, selected.itemType, selected.id))
      .filter((row) => !warehouseId || row.warehouseId === warehouseId)
      .map((row) => ({
        ...row,
        warehouseName: warehouseNameById.get(row.warehouseId) || row.warehouseId,
      }))
      .sort((a, b) => String(a.warehouseName).localeCompare(String(b.warehouseName), 'ar'));
  }, [balances, selected, warehouseId, warehouseNameById]);

  const itemLocationRows = useMemo(() => {
    if (!selected) return [];
    return locationBalances
      .filter((row) => String(row.itemId || '') === selected.id)
      .filter((row) => !warehouseId || row.warehouseId === warehouseId)
      .sort((a, b) =>
        String(a.locationCode || '').localeCompare(String(b.locationCode || ''), 'ar')
        || Number(b.quantity || 0) - Number(a.quantity || 0),
      );
  }, [locationBalances, selected, warehouseId]);

  const printModel = useMemo((): ItemCardPrintModel | null => {
    if (!selected) return null;
    return {
      itemType: selected.itemType,
      itemId: selected.id,
      itemCode: selected.code,
      itemName: selected.name,
      unit: selected.unit,
      category: selected.category,
      warehouseName: warehouseId
        ? warehouseNameById.get(warehouseId)
        : undefined,
      balances: itemBalances,
      bomLines,
      movements,
    };
  }, [selected, warehouseId, warehouseNameById, itemBalances, bomLines, movements]);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    void (async () => {
      try {
        const [mats, whs] = await Promise.all([
          materialService.getAll().catch(() => [] as Material[]),
          warehouseService.getActiveWarehouses().catch(() => [] as Warehouse[]),
        ]);
        if (!active) return;
        setMaterials(mats);
        setWarehouses(whs);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'تعذر تحميل بيانات الكارت.');
      }
    })();
    return () => {
      active = false;
    };
  }, [canView]);

  const loadCard = useCallback(async (resetMovements = true) => {
    if (!canView || !itemId) return;
    setLoading(true);
    try {
      const nextParams = new URLSearchParams();
      nextParams.set('itemType', itemType);
      nextParams.set('itemId', itemId);
      if (warehouseId) nextParams.set('warehouseId', warehouseId);
      setSearchParams(nextParams, { replace: true });

      const selectedOption = catalogOptions.find((opt) => opt.id === itemId);
      const ownerType = itemType === 'finished_good' ? 'product' : 'material';
      const movementTypes = itemMovementTypes(itemType);

      const [allBalances, locBalances, bomResult, ...movementPages] = await Promise.all([
        stockService.getBalances(warehouseId || undefined),
        stockService.getLocationBalances({
          warehouseId: warehouseId || undefined,
          itemId,
        }).catch(() => [] as StockLocationBalance[]),
        bomService.getActiveBomWithLegacyFallback(ownerType, itemId).catch(() => ({ items: [] })),
        ...movementTypes.map((type) =>
          stockService.getTransactionsPaged({
            itemId,
            itemType: type,
            warehouseId: warehouseId || undefined,
            limit: PAGE_SIZE,
            cursor: null,
          }),
        ),
      ]);

      setBalances(allBalances);
      setLocationBalances(locBalances);

      const materialById = new Map(
        materials.map((m) => [String(m.id || ''), m] as const).filter(([id]) => Boolean(id)),
      );
      const productById = new Map(products.map((p) => [p.id, p] as const));
      const lines: ItemCardBomLine[] = [...(bomResult.items || [])]
        .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
        .map((item) => {
          const material = materialById.get(String(item.itemId || ''));
          const nestedProduct = productById.get(String(item.itemId || ''));
          const isProduct = item.itemType === 'product';
          const code = isProduct
            ? String(nestedProduct?.code || '')
            : String(material?.code || '');
          const name =
            String(item.itemName || '').trim()
            || (isProduct ? String(nestedProduct?.name || '') : String(material?.name || ''))
            || '—';
          const stockKeys = [
            String(item.itemId || ''),
            String(material?.id || ''),
            String(material?.legacyRawMaterialId || ''),
          ].filter(Boolean);
          const stockQty = warehouseId
            ? allBalances
              .filter((row) =>
                row.warehouseId === warehouseId
                && (
                  stockKeys.includes(String(row.itemId || ''))
                  || (
                    code
                    && String(row.itemCode || '').trim().toUpperCase() === code.toUpperCase()
                  )
                ),
              )
              .reduce((sum, row) => sum + Number(row.quantity || 0), 0)
            : undefined;
          return {
            itemCode: code || '—',
            itemName: name,
            unit: String(item.unit || material?.baseUnit || 'piece'),
            qtyPerUnit: Number(item.qtyPerUnit || 0),
            stockQty,
          };
        });
      setBomLines(lines);

      if (resetMovements) {
        const nextState: MovementCursorState = { byType: {}, hasMoreByType: {} };
        movementTypes.forEach((type, index) => {
          const page = movementPages[index];
          nextState.byType[type] = page?.nextCursor || null;
          nextState.hasMoreByType[type] = Boolean(page?.hasMore);
        });
        movementCursorStateRef.current = nextState;
        const firstRows = mergeUniqueMovements(movementPages.flatMap((page) => page.items));
        const firstHasNext = movementTypes.some((type) => nextState.hasMoreByType[type]);
        setMovements(firstRows);
        setHasMoreMovements(firstHasNext);
        setMovementPages([{ rows: firstRows, cursorState: nextState, hasNext: firstHasNext }]);
        setMovementPageIndex(0);
      }

      if (!selectedOption) {
        toast.error('تعذر العثور على الصنف المحدد في الكتالوج.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل كارت الصنف.');
      setBalances([]);
      setBomLines([]);
      setMovements([]);
      setMovementPages([]);
      setMovementPageIndex(0);
    } finally {
      setLoading(false);
    }
  }, [
    canView,
    itemId,
    itemType,
    warehouseId,
    catalogOptions,
    materials,
    products,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!itemId) {
      setBalances([]);
      setBomLines([]);
      setMovements([]);
      setMovementPages([]);
      setMovementPageIndex(0);
      return;
    }
    void loadCard(true);
  }, [itemId, itemType, warehouseId, loadCard]);

  const loadNextMovementsPage = async () => {
    if (!itemId || !hasMoreMovements) return;
    const cached = movementPages[movementPageIndex + 1];
    if (cached) {
      movementCursorStateRef.current = cached.cursorState;
      setMovementPageIndex((value) => value + 1);
      setMovements(cached.rows);
      setHasMoreMovements(cached.hasNext);
      return;
    }
    setLoading(true);
    try {
      const movementTypes = itemMovementTypes(itemType);
      const openTypes = movementTypes.filter(
        (type) => movementCursorStateRef.current.hasMoreByType[type],
      );
      if (openTypes.length === 0) {
        setHasMoreMovements(false);
        return;
      }

      const pages = await Promise.all(
        openTypes.map((type) =>
          stockService.getTransactionsPaged({
            itemId,
            itemType: type,
            warehouseId: warehouseId || undefined,
            limit: PAGE_SIZE,
            cursor: (movementCursorStateRef.current.byType[type] || null) as never,
          }),
        ),
      );

      const nextState: MovementCursorState = {
        byType: { ...movementCursorStateRef.current.byType },
        hasMoreByType: { ...movementCursorStateRef.current.hasMoreByType },
      };
      openTypes.forEach((type, index) => {
        const page = pages[index];
        nextState.byType[type] = page?.nextCursor || null;
        nextState.hasMoreByType[type] = Boolean(page?.hasMore);
      });
      movementCursorStateRef.current = nextState;

      const nextRows = mergeUniqueMovements(pages.flatMap((page) => page.items));
      const nextHasMore = movementTypes.some((type) => nextState.hasMoreByType[type]);
      const nextPage: MovementCachedPage = { rows: nextRows, cursorState: nextState, hasNext: nextHasMore };
      setMovementPages((prev) => [...prev.slice(0, movementPageIndex + 1), nextPage]);
      setMovementPageIndex((value) => value + 1);
      setMovements(nextRows);
      setHasMoreMovements(nextHasMore);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل صفحة الحركات التالية.');
    } finally {
      setLoading(false);
    }
  };

  const loadPreviousMovementsPage = () => {
    if (movementPageIndex === 0 || loading) return;
    const previous = movementPages[movementPageIndex - 1];
    if (!previous) return;
    movementCursorStateRef.current = previous.cursorState;
    setMovementPageIndex((value) => value - 1);
    setMovements(previous.rows);
    setHasMoreMovements(previous.hasNext);
  };

  const openCountCard = async () => {
    if (!selected || selected.itemType !== 'finished_good') return;
    setCountLoading(true);
    setCountPreviewOpen(true);
    setCountWarning(null);
    try {
      const result = await buildProductBomCountCards({
        productIds: [selected.id],
        products: products as unknown as import('../../../types').Product[],
        warehouseId: warehouseId || undefined,
        warehouseName: warehouseId
          ? warehouseNameById.get(warehouseId)
          : undefined,
      });
      setCountCards(result.cards);
      if (result.skippedWithoutBom.length > 0) {
        setCountWarning('لا توجد مكونات BOM لهذا المنتج.');
      }
    } catch (error) {
      setCountCards([]);
      toast.error(error instanceof Error ? error.message : 'تعذر تجهيز كارت الجرد.');
      setCountPreviewOpen(false);
    } finally {
      setCountLoading(false);
    }
  };

  if (!canView) {
    return (
      <ModuleOpsPageShell eyebrow="كارت الصنف">
        <p className="text-sm text-[var(--color-text-muted)]">ليس لديك صلاحية عرض هذه الصفحة.</p>
      </ModuleOpsPageShell>
    );
  }

  return (
    <ModuleOpsPageShell
      eyebrow="كارت الصنف"
      rangeLabel="دفتر حركة الصنف عبر كل المخازن (أو مخزن محدد) — صرف/وارد/تحويل/جرد/صيانة وإنتاج."
      actions={(
        <div className="flex flex-wrap gap-2">
          {selected?.itemType === 'finished_good' ? (
            <Button type="button" variant="secondary" onClick={() => void openCountCard()}>
              كارت جرد المكونات
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={!selected}
            onClick={() => setLabelEngineOpen(true)}
          >
            طباعة ملصق باركود
          </Button>
          <Button type="button" disabled={!printModel} onClick={() => handlePrint()}>
            طباعة الكارت
          </Button>
        </div>
      )}
    >
      <OpsDashPanel title="اختيار الصنف" accent="inventory">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm font-semibold space-y-1">
            <span>نوع الصنف</span>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-[var(--color-card)]"
              value={itemType === 'raw_material' ? 'material' : itemType}
              onChange={(e) => {
                const next = e.target.value as InventoryItemType;
                setItemType(next === 'material' ? 'material' : 'finished_good');
                setItemId('');
              }}
            >
              <option value="finished_good">{itemTypeLabel('finished_good')}</option>
              <option value="material">{itemTypeLabel('material')}</option>
            </select>
          </label>

          <label className="text-sm font-semibold space-y-1 md:col-span-2">
            <span>بحث بالاسم أو الكود</span>
            <SearchableSelect
              options={itemSelectOptions}
              value={itemId}
              onChange={setItemId}
              placeholder="ابحث بالاسم أو الكود…"
            />
          </label>

          <label className="text-sm font-semibold space-y-1">
            <span>مخزن (اختياري)</span>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-[var(--color-card)]"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">كل المخازن</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </label>
        </div>
      </OpsDashPanel>

      {!itemId ? (
        <OpsDashPanel title="اختر صنفاً" accent="inventory">
          <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">
            اختر صنفاً من القائمة لعرض الكارت.
          </p>
        </OpsDashPanel>
      ) : loading && !selected ? (
        <OpsDashPanel title="جاري التحميل" accent="inventory">
          <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">جاري التحميل…</p>
        </OpsDashPanel>
      ) : selected ? (
        <>
          <OpsDashPanel title="بيانات الصنف" accent="inventory">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <p><span className="font-bold">الاسم:</span> {selected.name}</p>
              <p><span className="font-bold">الكود:</span> <span className="font-mono">{selected.code || '—'}</span></p>
              <p><span className="font-bold">النوع:</span> {itemTypeLabel(selected.itemType)}</p>
              <p><span className="font-bold">الوحدة:</span> {selected.unit || '—'}</p>
            </div>
          </OpsDashPanel>

          <OpsDashPanel title="الأرصدة حسب المخزن" accent="inventory">
            {itemBalances.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">لا يوجد رصيد.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table w-full">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">المخزن</th>
                      <th className="erp-th text-center">الرصيد</th>
                      <th className="erp-th text-center">محجوز</th>
                      <th className="erp-th text-center">متاح</th>
                      <th className="erp-th text-center">الحد الأدنى</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemBalances.map((row) => (
                      <tr key={row.id || `${row.warehouseId}-${row.itemId}`}>
                        <td className="p-2 text-sm">{row.warehouseName}</td>
                        <td className="p-2 text-sm text-center tabular-nums font-bold">{fmt(Number(row.quantity || 0))}</td>
                        <td className="p-2 text-sm text-center tabular-nums">{fmt(Number(row.reservedQty || 0))}</td>
                        <td className="p-2 text-sm text-center tabular-nums font-bold">
                          {fmt(Number(row.availableQty ?? row.quantity ?? 0))}
                        </td>
                        <td className="p-2 text-sm text-center tabular-nums">{fmt(Number(row.minStock || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OpsDashPanel>

          <OpsDashPanel title="الأرصدة حسب اللوكيشن" accent="inventory">
            {itemLocationRows.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">لا يوجد تفصيل مواقع لهذا الصنف.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table w-full">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">المخزن</th>
                      <th className="erp-th">اللوكيشن</th>
                      <th className="erp-th">الراك</th>
                      <th className="erp-th text-center">الكمية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemLocationRows.map((row) => (
                      <tr key={row.id || `${row.locationId}-${row.itemId}`}>
                        <td className="p-2 text-sm">
                          {warehouseNameById.get(row.warehouseId) || row.warehouseName || row.warehouseId}
                        </td>
                        <td className="p-2 text-sm font-mono">{row.locationCode || '—'}</td>
                        <td className="p-2 text-sm">{row.rackName || row.rack || '—'}</td>
                        <td className="p-2 text-sm text-center tabular-nums font-bold">{fmt(Number(row.quantity || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OpsDashPanel>

          <OpsDashPanel title="المكونات (BOM)" accent="inventory">
            {bomLines.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">لا توجد مكونات مرتبطة.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table w-full">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">كود المكون</th>
                      <th className="erp-th">اسم المكون</th>
                      <th className="erp-th text-center">الكمية / وحدة</th>
                      <th className="erp-th text-center">الوحدة</th>
                      {warehouseId ? <th className="erp-th text-center">رصيد المخزن</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {bomLines.map((line, index) => (
                      <tr key={`${line.itemCode}-${index}`}>
                        <td className="p-2 text-sm font-mono">{line.itemCode}</td>
                        <td className="p-2 text-sm">{line.itemName}</td>
                        <td className="p-2 text-sm text-center tabular-nums">{fmt(line.qtyPerUnit)}</td>
                        <td className="p-2 text-sm text-center">{line.unit}</td>
                        {warehouseId ? (
                          <td className="p-2 text-sm text-center tabular-nums">
                            {line.stockQty == null ? '—' : fmt(line.stockQty)}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OpsDashPanel>

          <OpsDashPanel
            title={`كل الحركات${warehouseId ? ' (المخزن المحدد)' : ' (كل المخازن)'}`}
            accent="inventory"
            action={
              movements.length > 0 ? (
                <span className="text-xs font-semibold text-[var(--color-text-muted)] tabular-nums">
                  {movements.length} حركة
                </span>
              ) : undefined
            }
          >
            <div className="overflow-x-auto">
              <table className="erp-table w-full">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">التاريخ</th>
                    <th className="erp-th">المرجع</th>
                    <th className="erp-th">المسار</th>
                    <th className="erp-th">الكمية</th>
                    <th className="erp-th">النوع</th>
                    <th className="erp-th">ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && movements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-sm text-[var(--color-text-muted)]">
                        جاري التحميل…
                      </td>
                    </tr>
                  ) : null}
                  {!loading && movements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-sm text-[var(--color-text-muted)]">
                        لا توجد حركات لهذا الصنف.
                      </td>
                    </tr>
                  ) : null}
                  {movements.map((tx) => (
                    <tr key={tx.id || `${tx.createdAt}-${tx.referenceNo}-${tx.quantity}`}>
                      <td className="p-2 text-xs">
                        {String(tx.createdAt || '').slice(0, 16).replace('T', ' ') || '—'}
                      </td>
                      <td className="p-2 text-xs font-bold">{tx.referenceNo || tx.sourceId || '—'}</td>
                      <td className="p-2 text-xs">{movementPathLabel(tx)}</td>
                      <td className="p-2 text-xs tabular-nums">
                        {tx.movementType === 'OUT' ? '−' : tx.movementType === 'IN' ? '+' : ''}
                        {fmt(Math.abs(Number(tx.quantity || 0)))} {tx.unit || selected.unit || ''}
                      </td>
                      <td className="p-2 text-xs">{movementFateLabel(tx)}</td>
                      <td className="p-2 text-xs text-[var(--color-text-muted)]">{tx.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataPaginationFooter
              page={movementPageIndex + 1}
              itemCount={movements.length}
              itemLabel="حركة"
              hasPrevious={movementPageIndex > 0}
              hasNext={hasMoreMovements}
              onPrevious={loadPreviousMovementsPage}
              onNext={() => void loadNextMovementsPage()}
              loading={loading}
            />
          </OpsDashPanel>
        </>
      ) : null}

      {/* Off-screen printable surface */}
      <div className="fixed -left-[10000px] top-0" aria-hidden>
        <ItemCardPrint ref={printRef} card={printModel} printSettings={printSettings} />
      </div>

      <BarcodeLabelPrintEngineModal
        open={labelEngineOpen}
        onClose={() => setLabelEngineOpen(false)}
        warehouseName={warehouseId ? warehouseNameById.get(warehouseId) : undefined}
        printSettings={printSettings}
        items={selected ? [{
          id: selected.id,
          code: selected.code,
          name: selected.name,
          barcode: selected.barcode,
        }] : catalogOptions.map((opt) => ({
          id: opt.id,
          code: opt.code,
          name: opt.name,
          barcode: opt.barcode,
        }))}
        locations={itemLocationRows
          .filter((row) => row.locationId)
          .map((row) => ({
            id: String(row.locationId),
            code: String(row.locationCode || ''),
            rackName: row.rackName || row.rack,
            shelf: row.shelfName || row.shelf,
          }))}
        initialMode="items"
        initialItemId={selected?.id || ''}
        initialCopies={1}
      />

      <ProductBomCountCardPreviewModal
        open={countPreviewOpen}
        cards={countCards}
        printSettings={printSettings}
        loading={countLoading}
        warningText={countWarning}
        onClose={() => setCountPreviewOpen(false)}
      />
    </ModuleOpsPageShell>
  );
};
