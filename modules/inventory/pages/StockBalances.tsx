import React, { useEffect, useMemo, useState } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Card, Badge, Button } from '../components/UI';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockItemBalance, Warehouse } from '../types';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import {
  downloadInventoryInByCodeTemplate,
  downloadInventoryRawInByCodeTemplate,
} from '../../../utils/downloadTemplates';
import { exportHRData } from '../../../utils/exportExcel';
import { useAppStore } from '../../../store/useAppStore';
import { PageHeader } from '../../../components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { Skeleton } from '@/components/ui/skeleton';

export const StockBalances: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const rawProducts = useAppStore((s) => s._rawProducts);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [bals, whs] = await Promise.all([
        stockService.getBalances(),
        warehouseService.getAll(),
      ]);
      setBalances(bals);
      setWarehouses(whs);
      setLoading(false);
    })();
  }, []);

  const warehouseNameById = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w.name])),
    [warehouses],
  );
  const unitsPerCartonByProductId = useMemo(
    () => new Map(rawProducts.map((p) => [p.id || '', Number(p.unitsPerCarton || 0)])),
    [rawProducts],
  );

  const rows = useMemo(() => balances.filter((row) => {
    const matchesWarehouse = !warehouseFilter || row.warehouseId === warehouseFilter;
    const matchesType = !itemTypeFilter || row.itemType === itemTypeFilter;
    const isLow = row.minStock > 0 && row.quantity <= row.minStock;
    const isOut = row.quantity <= 0;
    const matchesStatus = !statusFilter
      || (statusFilter === 'low' && isLow)
      || (statusFilter === 'out' && isOut)
      || (statusFilter === 'ok' && !isLow && !isOut);
    const q = search.trim().toLowerCase();
    const matchesSearch = !q
      || row.itemName.toLowerCase().includes(q)
      || row.itemCode.toLowerCase().includes(q);
    return matchesWarehouse && matchesType && matchesStatus && matchesSearch;
  }), [balances, warehouseFilter, itemTypeFilter, statusFilter, search]);

  const exportBalancesExcel = () => {
    if (rows.length === 0) return;
    const exportRows = rows.map((row) => {
      const isLow = row.minStock > 0 && row.quantity <= row.minStock;
      const isOut = row.quantity <= 0;
      const status = isOut ? 'نفد' : isLow ? 'منخفض' : 'متوفر';
      const unitsPerCarton = row.itemType === 'finished_good'
        ? Number(unitsPerCartonByProductId.get(row.itemId) || 0)
        : 0;
      const cartons = unitsPerCarton > 0
        ? Number((Number(row.quantity || 0) / unitsPerCarton).toFixed(2))
        : null;
      return {
        'الصنف': row.itemName,
        'الكود': row.itemCode,
        'النوع': row.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام',
        'المخزن': warehouseNameById.get(row.warehouseId) ?? row.warehouseId,
        'الرصيد': Number(row.quantity || 0),
        'الرصيد / كرتونة': cartons ?? '—',
        'الحد الأدنى': Number(row.minStock || 0),
        'الحالة': status,
      };
    });
    const date = new Date().toISOString().slice(0, 10);
    exportHRData(exportRows, 'أرصدة المخزون', `أرصدة-المخزون-${date}`);
  };

  return (
    <div className="erp-ds-clean space-y-5">
      <PageHeader
        title="أرصدة المخزون"
        subtitle="عرض الرصيد الحالي لكل صنف داخل كل مخزن"
        icon="warehouse"
        moreActions={[
          {
            label: 'تصدير الأرصدة Excel',
            icon: 'table_view',
            group: 'تصدير',
            hidden: !can('inventory.transactions.export') || rows.length === 0,
            onClick: exportBalancesExcel,
          },
          {
            label: 'تحميل قالب المنتجات النهائية',
            icon: 'file_download',
            group: 'استيراد',
            hidden: !can('inventory.transactions.create'),
            onClick: downloadInventoryInByCodeTemplate,
          },
          {
            label: 'تحميل قالب المواد الخام',
            icon: 'file_download',
            group: 'استيراد',
            hidden: !can('inventory.transactions.create'),
            onClick: downloadInventoryRawInByCodeTemplate,
          },
          {
            label: 'استيراد بالكود والكمية',
            icon: 'upload_file',
            group: 'استيراد',
            hidden: !can('inventory.transactions.create'),
            onClick: () => navigate('/inventory/movements?action=import-in-by-code'),
          },
        ]}
      />

      <Card className="!p-0 overflow-hidden">
        <SmartFilterBar
          searchPlaceholder="ابحث بالاسم أو الكود..."
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'warehouse',
              placeholder: 'كل المخازن',
              options: warehouses.map((warehouse) => ({ value: warehouse.id || '', label: warehouse.name })),
            },
            {
              key: 'status',
              placeholder: 'كل الحالات',
              options: [
                { value: 'ok', label: 'متوفر' },
                { value: 'low', label: 'منخفض' },
                { value: 'out', label: 'نفد' },
              ],
            },
          ]}
          quickFilterValues={{
            warehouse: warehouseFilter || 'all',
            status: statusFilter || 'all',
          }}
          onQuickFilterChange={(key, value) => {
            if (key === 'warehouse') setWarehouseFilter(value === 'all' ? '' : value);
            if (key === 'status') setStatusFilter(value === 'all' ? '' : value);
          }}
          advancedFilters={[
            {
              key: 'itemType',
              label: 'النوع',
              placeholder: 'كل الأنواع',
              options: [
                { value: 'finished_good', label: 'منتج نهائي' },
                { value: 'raw_material', label: 'مادة خام' },
              ],
            },
          ]}
          advancedFilterValues={{ itemType: itemTypeFilter || 'all' }}
          onAdvancedFilterChange={(key, value) => {
            if (key === 'itemType') setItemTypeFilter(value === 'all' ? '' : value);
          }}
          onApply={() => undefined}
          applyLabel="تطبيق"
          className="mb-0 border-0 rounded-none"
        />
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto erp-table-scroll">
          <table className="erp-table w-full text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الصنف</th>
                <th className="erp-th">النوع</th>
                <th className="erp-th">المخزن</th>
                <th className="erp-th text-center">الرصيد</th>
                <th className="erp-th text-center">الرصيد / كرتونة</th>
                <th className="erp-th text-center">الحد الأدنى</th>
                <th className="erp-th text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={`balance-skeleton-${i}`}>
                  <td className="px-4 py-3" colSpan={7}>
                    <Skeleton className="h-5 w-full rounded-md" />
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td className="px-4 py-10 text-center text-slate-400" colSpan={7}>لا توجد بيانات مطابقة.</td></tr>
              )}
              {!loading && rows.map((row) => {
                const isLow = row.minStock > 0 && row.quantity <= row.minStock;
                const isOut = row.quantity <= 0;
                const unitsPerCarton = row.itemType === 'finished_good'
                  ? Number(unitsPerCartonByProductId.get(row.itemId) || 0)
                  : 0;
                const cartonBalance = unitsPerCarton > 0
                  ? Number((Number(row.quantity || 0) / unitsPerCarton).toFixed(2))
                  : null;
                return (
                  <tr key={row.id} className="hover:bg-[#f8f9fa]/70/40">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-[var(--color-text)]">{row.itemName}</p>
                      <p className="text-xs text-[var(--color-text-muted)] font-mono">{row.itemCode}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{row.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام'}</td>
                    <td className="px-4 py-3 text-sm">{warehouseNameById.get(row.warehouseId) ?? row.warehouseId}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">{formatNumber(row.quantity)}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">
                      {cartonBalance == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(cartonBalance)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">{formatNumber(row.minStock || 0)}</td>
                    <td className="px-4 py-3 text-center">
                      {isOut ? <Badge variant="danger">نفد</Badge> : isLow ? <Badge variant="warning">منخفض</Badge> : <Badge variant="success">متوفر</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};




