import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { warehouseService } from '../services/warehouseService';
import { stockService } from '../services/stockService';
import { transferApprovalService } from '../services/transferApprovalService';
import { sparePartsReplenishmentService } from '../services/sparePartsReplenishmentService';
import { WAREHOUSE_ROLE_LABELS, sourceModuleLabel } from '../lib/stockLabels';
import {
  SPARE_PARTS_REPLENISHMENT_STATUS_LABELS,
} from '../lib/sparePartsReplenishment';
import type {
  SparePartsReplenishmentRequest,
  StockItemBalance,
  StockTransaction,
  Warehouse,
  WarehouseRole,
} from '../types';
import type { InventoryTransferRequest } from '../types';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n || 0));

type ActionLink = {
  label: string;
  path: string;
  description: string;
};

function roleActions(
  role: WarehouseRole | undefined,
  warehouseId: string,
): ActionLink[] {
  switch (role) {
    case 'spare_parts_central':
      return [
        {
          label: 'تموين المراكز',
          path: '/inventory/spare-parts-replenishment',
          description: 'اعتماد / تجهيز / موافقة مسؤول على طلبات المراكز',
        },
        {
          label: 'الأرصدة',
          path: `/inventory/balances?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أرصدة مخزن قطع الغيار المركزي',
        },
        {
          label: 'الحركات',
          path: `/inventory/transactions?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أحدث حركات الصرف للمراكز',
        },
      ];
    case 'maintenance_center':
      return [
        {
          label: 'طلب تموين',
          path: `/inventory/spare-parts-replenishment?toWarehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'طلب قطع غيار من المخزن المركزي ثم تأكيد الاستلام',
        },
        {
          label: 'الأرصدة',
          path: `/inventory/balances?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'ما لدى المركز حالياً',
        },
        {
          label: 'الحركات',
          path: `/inventory/transactions?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أحدث دخول/خروج للمخزن',
        },
      ];
    case 'final_product':
      return [
        {
          label: 'اعتماد التحويلات',
          path: '/inventory/transfer-approvals',
          description: 'الوارد بعد التحويل الذي يحتاج اعتماداً',
        },
        {
          label: 'اعتمادات الإنتاج المخزنية',
          path: '/inventory/production-approvals',
          description: 'إدخالات إنتاج بانتظار الاعتماد',
        },
        {
          label: 'الأرصدة',
          path: `/inventory/balances?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'رصيد المنتج التام',
        },
        {
          label: 'الحركات',
          path: `/inventory/transactions?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أحدث حركات المنتج التام',
        },
      ];
    case 'raw_material':
    case 'decomposed':
      return [
        {
          label: 'تحكم مخزن المستلزمات',
          path: '/inventory/raw-materials/control',
          description: 'عمليات المستلزمات والتنبيهات',
        },
        {
          label: 'استلام مستلزمات',
          path: '/inventory/raw-materials/receive',
          description: 'استلام توريدات',
        },
        {
          label: 'الأرصدة',
          path: `/inventory/balances?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أرصدة المخزن',
        },
      ];
    case 'production_floor':
      return [
        {
          label: 'مخزون صالة الإنتاج',
          path: '/inventory/production-floor',
          description: 'متابعة رصيد الصالة',
        },
        {
          label: 'صرف إنتاج',
          path: '/inventory/production-issues',
          description: 'طلبات وأوامر الصرف',
        },
      ];
    case 'finished_staging':
    case 'production_wip':
      return [
        {
          label: 'تحكم التغليف',
          path: '/production/packaging/control',
          description: 'استلام تحت التسليم / بانتظار التغليف',
        },
        {
          label: 'اعتماد التحويلات',
          path: '/inventory/transfer-approvals',
          description: 'تحويلات معلّقة',
        },
      ];
    default:
      return [
        {
          label: 'كارت الصنف',
          path: `/inventory/item-card?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'عرض مكونات وحركات صنف مع الطباعة',
        },
        {
          label: 'الأرصدة',
          path: `/inventory/balances?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أرصدة هذا المخزن',
        },
        {
          label: 'الحركات',
          path: `/inventory/transactions?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أحدث الحركات',
        },
        {
          label: 'تحويل سريع',
          path: '/quick-inventory-transfer',
          description: 'إنشاء تحويل من/إلى المخزن',
        },
      ];
  }
}

export const WarehouseWorkspace: React.FC = () => {
  const { tenantSlug, warehouseId } = useParams<{ tenantSlug?: string; warehouseId?: string }>();
  const { can } = usePermission();
  const canView = can('inventory.view');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<InventoryTransferRequest[]>([]);
  const [replenishments, setReplenishments] = useState<SparePartsReplenishmentRequest[]>([]);

  const load = useCallback(async () => {
    const id = String(warehouseId || '').trim();
    if (!canView || !id) return;
    setLoading(true);
    setError(null);
    try {
      const allWhs = await warehouseService.getAllWarehouses();
      const wh = allWhs.find((row) => row.id === id) || null;
      if (!wh) {
        setWarehouse(null);
        setError('المخزن غير موجود.');
        return;
      }
      setWarehouse(wh);
      const [bal, tx, transfers, spr] = await Promise.all([
        stockService.getBalances(id).catch(() => [] as StockItemBalance[]),
        stockService.getTransactions(id).catch(() => [] as StockTransaction[]),
        transferApprovalService.getAll().catch(() => [] as InventoryTransferRequest[]),
        sparePartsReplenishmentService.listRecent(50).catch(() => [] as SparePartsReplenishmentRequest[]),
      ]);
      setBalances(bal.slice(0, 30));
      setTransactions(tx.slice(0, 20));
      setPendingTransfers(
        (transfers || [])
          .filter((t) => (
            (t.toWarehouseId === id || t.fromWarehouseId === id)
            && t.status === 'pending'
          ))
          .slice(0, 15),
      );
      setReplenishments(
        spr.filter(
          (r) => r.fromWarehouseId === id || r.toWarehouseId === id,
        ).slice(0, 15),
      );
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل مساحة المخزن.');
    } finally {
      setLoading(false);
    }
  }, [canView, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo(
    () => (warehouse?.id ? roleActions(warehouse.warehouseRole, warehouse.id) : []),
    [warehouse],
  );

  const lowStock = useMemo(
    () => balances.filter((b) => Number(b.quantity || 0) <= Number(b.minStock || 0)).length,
    [balances],
  );
  const totalSkus = balances.length;
  const awaitingReceipt = replenishments.filter((r) => r.status === 'responsible_approved').length;
  const awaitingPrepare = replenishments.filter(
    (r) => r.status === 'approved' || r.status === 'submitted',
  ).length;

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title="مساحة المخزن" />
        <p className="text-sm text-[var(--color-text-muted)]">ليس لديك صلاحية العرض.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="مساحة المخزن" />
        <p className="text-sm text-[var(--color-text-muted)]">جاري التحميل…</p>
      </div>
    );
  }

  if (!warehouse) {
    return (
      <div className="p-6 space-y-3">
        <PageHeader title="مساحة المخزن" />
        <p className="text-sm text-rose-700">{error || 'المخزن غير موجود.'}</p>
        <Link className="text-sm font-bold text-primary underline" to={withTenantPath(tenantSlug, '/inventory/warehouses')}>
          العودة لقائمة المخازن
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title={warehouse.name}
        subtitle={`${WAREHOUSE_ROLE_LABELS[warehouse.warehouseRole || 'general']} · ${warehouse.code}`}
        actions={(
          <Link
            className="text-sm font-bold text-primary underline"
            to={withTenantPath(tenantSlug, '/inventory/warehouses')}
          >
            كل المخازن
          </Link>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="أصناف لها رصيد">
          <div className="text-2xl font-black">{totalSkus}</div>
        </Card>
        <Card title="تحت الحد الأدنى">
          <div className="text-2xl font-black">{lowStock}</div>
        </Card>
        <Card title="تحويلات معلّقة">
          <div className="text-2xl font-black">{pendingTransfers.length}</div>
        </Card>
        <Card title="طلبات تموين نشطة">
          <div className="text-2xl font-black">
            {awaitingPrepare + awaitingReceipt}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            بانتظار معالجة {awaitingPrepare} · بانتظار استلام {awaitingReceipt}
          </p>
        </Card>
      </div>

      <Card title="إجراءات هذا المخزن">
        <div className="grid gap-2 md:grid-cols-2">
          {actions.map((action) => (
            <Link
              key={action.path}
              to={withTenantPath(action.path, tenantSlug)}
              className="rounded-xl border border-[var(--color-border)] p-3 hover:bg-[var(--color-surface-hover)]"
            >
              <div className="font-bold text-sm">{action.label}</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">{action.description}</div>
            </Link>
          ))}
        </div>
      </Card>

      {(warehouse.warehouseRole === 'spare_parts_central'
        || warehouse.warehouseRole === 'maintenance_center')
        && replenishments.length > 0 ? (
        <Card title="طلبات تموين قطع الغيار">
          <div className="space-y-2">
            {replenishments.map((row) => (
              <div key={row.id} className="flex flex-wrap justify-between gap-2 text-sm border-b border-[var(--color-border)]/50 py-2">
                <div>
                  <div className="font-semibold">{row.referenceNo}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {row.fromWarehouseName} → {row.toWarehouseName}
                  </div>
                </div>
                <div className="text-xs font-bold">
                  {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[row.status]}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Link
              className="text-sm font-bold text-primary underline"
              to={withTenantPath(tenantSlug, '/inventory/spare-parts-replenishment')}
            >
              فتح شاشة التموين الكاملة
            </Link>
          </div>
        </Card>
      ) : null}

      {warehouse.warehouseRole === 'final_product' && pendingTransfers.length > 0 ? (
        <Card title="تحويلات تحتاج متابعة / اعتماد">
          <div className="space-y-2">
            {pendingTransfers.map((row) => (
              <div key={row.id} className="text-sm border-b border-[var(--color-border)]/50 py-2">
                <div className="font-semibold">{row.referenceNo || row.id}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {row.fromWarehouseName || row.fromWarehouseId} → {row.toWarehouseName || row.toWarehouseId}
                  {' · '}
                  {row.status}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Link
              className="text-sm font-bold text-primary underline"
              to={withTenantPath(tenantSlug, '/inventory/transfer-approvals')}
            >
              فتح اعتماد التحويلات
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="أرصدة سريعة">
          {balances.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">لا أرصدة بعد.</p>
          ) : (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--color-text-muted)]">
                    <th className="text-start py-1">الصنف</th>
                    <th className="text-start py-1">الكمية</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={`${b.itemType}-${b.itemId}`} className="border-t border-[var(--color-border)]/40">
                      <td className="py-1">{b.itemName}</td>
                      <td className="py-1">{fmt(b.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="أحدث الحركات">
          {transactions.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">لا حركات بعد.</p>
          ) : (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--color-text-muted)]">
                    <th className="text-start py-1">الصنف</th>
                    <th className="text-start py-1">النوع</th>
                    <th className="text-start py-1">الكمية</th>
                    <th className="text-start py-1">المصدر</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-[var(--color-border)]/40">
                      <td className="py-1">{tx.itemName}</td>
                      <td className="py-1">{tx.movementType}{tx.transferDirection ? `/${tx.transferDirection}` : ''}</td>
                      <td className="py-1">{fmt(tx.quantity)}</td>
                      <td className="py-1">{sourceModuleLabel(tx.sourceModule)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={() => void load()}>تحديث</Button>
      </div>
    </div>
  );
};
