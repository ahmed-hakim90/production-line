import React, { useEffect, useMemo, useState } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Card, Badge, Button } from '../components/UI';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockItemBalance, Warehouse, WarehouseRole } from '../types';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { WAREHOUSE_ROLE_LABELS, balanceKey, itemTypeLabel } from '../lib/stockLabels';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { useAppStore } from '../../../store/useAppStore';
import {
  downloadInventoryInByCodeTemplate,
  downloadInventoryRawInByCodeTemplate,
} from '../../../utils/downloadTemplates';
import { exportHRData } from '../../../utils/exportExcel';
import { PageHeader } from '../../../components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { Skeleton } from '@/components/ui/skeleton';

export const StockBalances: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const rawProducts = useAppStore((s) => s._rawProducts);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [lastMovementByKey, setLastMovementByKey] = useState<Record<string, string>>({});
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const [bals, whs, txs] = await Promise.all([
      stockService.getBalances(),
      warehouseService.getWarehousesForReportingFilters(),
      stockService.getTransactions(),
    ]);
    const movementMap: Record<string, string> = {};
    txs.forEach((tx) => {
      const key = balanceKey(tx.warehouseId, tx.itemType, tx.itemId);
      const prev = movementMap[key];
      if (!prev || new Date(tx.createdAt).getTime() > new Date(prev).getTime()) {
        movementMap[key] = tx.createdAt;
      }
    });
    setBalances(bals);
    setWarehouses(whs);
    setLastMovementByKey(movementMap);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const warehouseNameById = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w.name])),
    [warehouses],
  );
  const warehouseRoleById = useMemo(
    () => new Map(warehouses.map((w) => [w.id || '', w.warehouseRole || 'general'])),
    [warehouses],
  );
  const unitsPerCartonByProductId = useMemo(
    () => new Map(rawProducts.map((p) => [p.id || '', Number(p.unitsPerCarton || 0)])),
    [rawProducts],
  );

  const rows = useMemo(() => balances.filter((row) => {
    const matchesWarehouse = !warehouseFilter || row.warehouseId === warehouseFilter;
    const rowRole = warehouseRoleById.get(row.warehouseId) || 'general';
    const matchesRole = !roleFilter || rowRole === roleFilter;
    const matchesType = !itemTypeFilter || row.itemType === itemTypeFilter;
    const isLow = row.minStock > 0 && row.quantity <= row.minStock;
    const isOut = row.quantity <= 0;
    const isNegative = Number(row.quantity || 0) < 0;
    const matchesStatus = !statusFilter
      || (statusFilter === 'low' && isLow)
      || (statusFilter === 'out' && isOut)
      || (statusFilter === 'ok' && !isLow && !isOut);
    const matchesNegative = !negativeOnly || isNegative;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q
      || row.itemName.toLowerCase().includes(q)
      || row.itemCode.toLowerCase().includes(q);
    return matchesWarehouse && matchesRole && matchesType && matchesStatus && matchesNegative && matchesSearch;
  }), [balances, warehouseFilter, roleFilter, itemTypeFilter, statusFilter, negativeOnly, search, warehouseRoleById]);

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
      const role = warehouseRoleById.get(row.warehouseId) || 'general';
      return {
        'الصنف': row.itemName,
        'الكود': row.itemCode,
        'النوع': itemTypeLabel(row.itemType),
        'دور المخزن': WAREHOUSE_ROLE_LABELS[role as WarehouseRole] ?? role,
        'المخزن': warehouseNameById.get(row.warehouseId) ?? row.warehouseId,
        'الرصيد': Number(row.quantity || 0),
        'المتاح': Number(row.quantity || 0),
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
            {
              key: 'role',
              placeholder: 'كل الأدوار',
              options: (Object.keys(WAREHOUSE_ROLE_LABELS) as WarehouseRole[]).map((role) => ({
                value: role,
                label: WAREHOUSE_ROLE_LABELS[role],
              })),
            },
          ]}
          quickFilterValues={{
            warehouse: warehouseFilter || 'all',
            status: statusFilter || 'all',
            role: roleFilter || 'all',
          }}
          onQuickFilterChange={(key, value) => {
            if (key === 'warehouse') setWarehouseFilter(value === 'all' ? '' : value);
            if (key === 'status') setStatusFilter(value === 'all' ? '' : value);
            if (key === 'role') setRoleFilter(value === 'all' ? '' : value);
          }}
          advancedFilters={[
            {
              key: 'itemType',
              label: 'النوع',
              placeholder: 'كل الأنواع',
              options: [
                { value: 'finished_good', label: 'منتج نهائي' },
                { value: 'raw_material', label: 'مادة خام' },
                { value: 'material', label: 'مادة تصنيع' },
              ],
            },
            {
              key: 'negative',
              label: 'رصيد سالب',
              placeholder: 'الكل',
              options: [{ value: 'yes', label: 'سالب فقط' }],
            },
          ]}
          advancedFilterValues={{
            itemType: itemTypeFilter || 'all',
            negative: negativeOnly ? 'yes' : 'all',
          }}
          onAdvancedFilterChange={(key, value) => {
            if (key === 'itemType') setItemTypeFilter(value === 'all' ? '' : value);
            if (key === 'negative') setNegativeOnly(value === 'yes');
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
                <th className="erp-th">دور المخزن</th>
                <th className="erp-th text-center">الرصيد</th>
                <th className="erp-th text-center">محجوز</th>
                <th className="erp-th text-center">متاح</th>
                <th className="erp-th text-center">الرصيد / كرتونة</th>
                <th className="erp-th text-center">الحد الأدنى</th>
                <th className="erp-th">آخر حركة</th>
                <th className="erp-th text-center">الحالة</th>
                {can('inventory.transactions.create') && <th className="erp-th text-center">إجراء</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={`balance-skeleton-${i}`}>
                  <td className="px-4 py-3" colSpan={11}>
                    <Skeleton className="h-5 w-full rounded-md" />
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td className="px-4 py-10 text-center text-slate-400" colSpan={11}>لا توجد بيانات مطابقة.</td></tr>
              )}
              {!loading && rows.map((row) => {
                const isLow = row.minStock > 0 && row.quantity <= row.minStock;
                const isOut = row.quantity <= 0;
                const isNegative = Number(row.quantity || 0) < 0;
                const reserved = Number(row.reservedQty ?? 0);
                const available = Number(row.availableQty ?? row.quantity ?? 0);
                const role = warehouseRoleById.get(row.warehouseId) || 'general';
                const lastAt = lastMovementByKey[balanceKey(row.warehouseId, row.itemType, row.itemId)];
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
                    <td className="px-4 py-3 text-sm">{itemTypeLabel(row.itemType)}</td>
                    <td className="px-4 py-3 text-sm">{warehouseNameById.get(row.warehouseId) ?? row.warehouseId}</td>
                    <td className="px-4 py-3 text-xs">{WAREHOUSE_ROLE_LABELS[role as WarehouseRole] ?? role}</td>
                    <td className={`px-4 py-3 text-sm text-center font-bold tabular-nums ${isNegative ? 'text-rose-600' : ''}`}>{formatNumber(row.quantity)}</td>
                    <td className="px-4 py-3 text-sm text-center tabular-nums text-slate-500">{formatNumber(reserved)}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">{formatNumber(available)}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">
                      {cartonBalance == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(cartonBalance)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">{formatNumber(row.minStock || 0)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {lastAt ? new Date(lastAt).toLocaleString('ar-EG') : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isNegative ? <Badge variant="danger">سالب</Badge>
                        : isOut ? <Badge variant="danger">نفد</Badge>
                          : isLow ? <Badge variant="warning">منخفض</Badge>
                            : <Badge variant="success">متوفر</Badge>}
                    </td>
                    {can('inventory.transactions.create') && (
                      <td className="px-4 py-3 text-center">
                        <Button
                          variant="outline"
                          className="!py-1 !px-2 text-xs"
                          onClick={() => openModal(MODAL_KEYS.INVENTORY_STOCK_ADJUSTMENT, {
                            warehouseId: row.warehouseId,
                            itemType: row.itemType,
                            itemId: row.itemId,
                            itemName: row.itemName,
                            itemCode: row.itemCode,
                            createdBy: userDisplayName || userEmail || 'User',
                            onSaved: () => void reload(),
                          })}
                        >
                          تسوية
                        </Button>
                      </td>
                    )}
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




