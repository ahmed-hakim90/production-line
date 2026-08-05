import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { toast } from '../../../components/Toast';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { sparePartsRecallService } from '../services/sparePartsRecallService';
import type { MaintenanceCenterSpareBalanceRow } from '../types';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

export const SparePartsCenterStock: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams] = useSearchParams();
  const { can } = usePermission();
  const canView = can('sparePartsRecall.view') || can('sparePartsReplenishment.view') || can('inventory.view');
  const canCreateRecall = can('sparePartsRecall.create');

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MaintenanceCenterSpareBalanceRow[]>([]);
  const [centers, setCenters] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouseFilter, setWarehouseFilter] = useState(searchParams.get('warehouseId') || '');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const result = await sparePartsRecallService.listCenterBalances({
        warehouseId: warehouseFilter || undefined,
        search: search || undefined,
      });
      setRows(result.rows);
      setCenters(result.centers);
    } catch (error: unknown) {
      setRows([]);
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل أرصدة المراكز.');
    } finally {
      setLoading(false);
    }
  }, [canView, warehouseFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectionKey = (row: MaintenanceCenterSpareBalanceRow) =>
    `${row.warehouseId}__${row.itemId}`;

  const selectedRows = useMemo(
    () => rows.filter((row) => Number(selected[selectionKey(row)] || 0) > 0),
    [rows, selected],
  );

  const buildRecallQuery = () => {
    if (selectedRows.length === 0) return '';
    const warehouseId = selectedRows[0]?.warehouseId || '';
    const sameWarehouse = selectedRows.every((row) => row.warehouseId === warehouseId);
    if (!sameWarehouse) {
      toast.error('اختر أصنافاً من نفس المركز لطلب سحب واحد.');
      return '';
    }
    const lines = selectedRows
      .map((row) => {
        const qty = Number(selected[selectionKey(row)] || 0);
        return `${row.itemId}:${qty}`;
      })
      .join(',');
    return `?fromWarehouseId=${encodeURIComponent(warehouseId)}&lines=${encodeURIComponent(lines)}`;
  };

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title="أرصدة المراكز" />
        <p className="text-sm text-[var(--color-text-muted)]">ليس لديك صلاحية العرض.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="أرصدة قطع الغيار في المراكز"
        subtitle="عرض الكمية ومكانها في أي مركز صيانة — يمكن إنشاء طلب سحب للرئيسي من هنا."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link to={withTenantPath(tenantSlug, '/inventory/spare-parts-recall')}>
              <Button type="button" variant="secondary">طلبات السحب</Button>
            </Link>
            {canCreateRecall ? (
              <Button
                type="button"
                onClick={() => {
                  const q = buildRecallQuery();
                  if (!q) return;
                  window.location.assign(withTenantPath(tenantSlug, `/inventory/spare-parts-recall${q}`));
                }}
                disabled={selectedRows.length === 0}
              >
                سحب المحدد للرئيسي
              </Button>
            ) : null}
          </div>
        )}
      />

      <Card title="تصفية">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-semibold space-y-1">
            <span>المركز</span>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
            >
              <option value="">كل المراكز</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold space-y-1 md:col-span-2">
            <span>بحث</span>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اسم أو كود الصنف أو اسم المركز…"
            />
          </label>
        </div>
        <div className="mt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
            تحديث
          </Button>
        </div>
      </Card>

      <Card title="الأرصدة">
        {loading ? (
          <p className="text-sm text-[var(--color-text-muted)]">جاري التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">لا توجد أرصدة موجبة في المراكز.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="text-start py-2 px-2">المركز</th>
                  <th className="text-start py-2 px-2">الصنف</th>
                  <th className="text-start py-2 px-2">الكود</th>
                  <th className="text-start py-2 px-2">الرصيد</th>
                  {canCreateRecall ? <th className="text-start py-2 px-2">كمية السحب</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key = selectionKey(row);
                  return (
                    <tr key={key} className="border-b border-[var(--color-border)]/50">
                      <td className="py-2 px-2 font-medium">{row.warehouseName}</td>
                      <td className="py-2 px-2">{row.itemName}</td>
                      <td className="py-2 px-2 font-mono text-xs">{row.itemCode || '—'}</td>
                      <td className="py-2 px-2 tabular-nums">{fmt(row.quantity)}</td>
                      {canCreateRecall ? (
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min={0}
                            max={row.quantity}
                            step="any"
                            className="w-28 border rounded-lg px-2 py-1"
                            value={selected[key] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setSelected((prev) => ({ ...prev, [key]: value }));
                            }}
                            placeholder="0"
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default SparePartsCenterStock;
