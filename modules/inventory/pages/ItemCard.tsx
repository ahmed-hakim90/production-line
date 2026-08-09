import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Card, Button } from '../components/UI';
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
  StockTransaction,
  Warehouse,
} from '../types';
import {
  ItemCardPrint,
  type ItemCardBomLine,
  type ItemCardPrintModel,
} from '../components/ItemCardPrint';
import { ProductBomCountCardPreviewModal } from '../../production/components/ProductBomCountCardPreviewModal';
import { buildProductBomCountCards } from '../../production/lib/buildProductBomCountCards';
import type { ProductBomCountCard } from '../../production/components/ProductBomCountCardPrint';

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
};

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
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [bomLines, setBomLines] = useState<ItemCardBomLine[]>([]);
  const [movements, setMovements] = useState<StockTransaction[]>([]);
  const [hasMoreMovements, setHasMoreMovements] = useState(false);
  const movementCursorRef = useRef<unknown>(null);

  const [countCards, setCountCards] = useState<ProductBomCountCard[]>([]);
  const [countPreviewOpen, setCountPreviewOpen] = useState(false);
  const [countLoading, setCountLoading] = useState(false);
  const [countWarning, setCountWarning] = useState<string | null>(null);

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
      }))
      .filter((m) => m.id);
  }, [itemType, products, materials]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalogOptions.slice(0, 80);
    return catalogOptions
      .filter((opt) =>
        opt.name.toLowerCase().includes(q)
        || opt.code.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [catalogOptions, search]);

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
      const movementTypes: InventoryItemType[] =
        itemType === 'finished_good'
          ? ['finished_good']
          : ['material', 'raw_material'];

      const [allBalances, bomResult, ...movementPages] = await Promise.all([
        stockService.getBalances(warehouseId || undefined),
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
        const merged = movementPages
          .flatMap((page) => page.items)
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        const unique = new Map<string, StockTransaction>();
        merged.forEach((tx) => {
          const key = tx.id || `${tx.createdAt}-${tx.referenceNo}-${tx.quantity}`;
          if (!unique.has(key)) unique.set(key, tx);
        });
        const rows = [...unique.values()].slice(0, PAGE_SIZE);
        setMovements(rows);
        movementCursorRef.current = movementPages[0]?.nextCursor || null;
        setHasMoreMovements(movementPages.some((page) => page.hasMore));
      }

      if (!selectedOption) {
        toast.error('تعذر العثور على الصنف المحدد في الكتالوج.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل كارت الصنف.');
      setBalances([]);
      setBomLines([]);
      setMovements([]);
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
      return;
    }
    void loadCard(true);
  }, [itemId, itemType, warehouseId, loadCard]);

  const loadMoreMovements = async () => {
    if (!itemId || !hasMoreMovements) return;
    setLoading(true);
    try {
      const page = await stockService.getTransactionsPaged({
        itemId,
        itemType: itemType === 'raw_material' ? 'raw_material' : itemType,
        warehouseId: warehouseId || undefined,
        limit: PAGE_SIZE,
        cursor: movementCursorRef.current as never,
      });
      setMovements((prev) => [...prev, ...page.items]);
      movementCursorRef.current = page.nextCursor;
      setHasMoreMovements(page.hasMore);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل المزيد من الحركات.');
    } finally {
      setLoading(false);
    }
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
      rangeLabel="اختر صنفاً لعرض أرصدته ومكوناته وحركاته، مع إمكانية الطباعة مثل كروت المنتجات."
      actions={(
        <div className="flex flex-wrap gap-2">
          {selected?.itemType === 'finished_good' ? (
            <Button type="button" variant="secondary" onClick={() => void openCountCard()}>
              كارت جرد المكونات
            </Button>
          ) : null}
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
                setSearch('');
              }}
            >
              <option value="finished_good">{itemTypeLabel('finished_good')}</option>
              <option value="material">{itemTypeLabel('material')}</option>
            </select>
          </label>

          <label className="text-sm font-semibold space-y-1 md:col-span-2">
            <span>بحث بالاسم أو الكود</span>
            <input
              className="w-full border rounded-lg px-3 py-2 bg-[var(--color-card)]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اكتب للتصفية…"
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

        <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-[var(--color-border)]">
          {filteredOptions.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-text-muted)]">لا توجد أصناف مطابقة.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {filteredOptions.map((opt) => {
                const active = opt.id === itemId;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      className={`w-full text-right px-3 py-2 text-sm hover:bg-[#f8f9fa] ${
                        active ? 'bg-primary/10 font-bold' : ''
                      }`}
                      onClick={() => setItemId(opt.id)}
                    >
                      <span className="block">{opt.name}</span>
                      <span className="block text-xs text-[var(--color-text-muted)] font-mono">
                        {opt.code || '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
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

          <OpsDashPanel title="الحركات" accent="inventory">
            <div className="overflow-x-auto">
              <table className="erp-table w-full">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">التاريخ</th>
                    <th className="erp-th">المرجع</th>
                    <th className="erp-th">المسار</th>
                    <th className="erp-th">الكمية</th>
                    <th className="erp-th">الحالة</th>
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
            {hasMoreMovements ? (
              <div className="mt-3">
                <Button type="button" variant="secondary" disabled={loading} onClick={() => void loadMoreMovements()}>
                  تحميل المزيد
                </Button>
              </div>
            ) : null}
          </OpsDashPanel>
        </>
      ) : null}

      {/* Off-screen printable surface */}
      <div className="fixed -left-[10000px] top-0" aria-hidden>
        <ItemCardPrint ref={printRef} card={printModel} printSettings={printSettings} />
      </div>

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
