import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { KPICard } from '@/src/components/erp/KPICard';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { withTenantPath } from '@/lib/tenantPaths';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useRawMaterialWarehouse } from '../hooks/useRawMaterialWarehouse';
import { stockService } from '../services/stockService';
import { transferApprovalService } from '../services/transferApprovalService';
import { productionIssueService } from '../services/productionIssueService';
import {
  assemblableCapacityService,
  type AssemblableCapacityRow,
} from '../services/assemblableCapacityService';
import { sourceModuleLabel } from '../lib/stockLabels';
import type { StockItemBalance, StockTransaction } from '../types';
import { exportGenericRows } from '../../../utils/exportExcel';
import { ClipboardList, Loader2, Package } from 'lucide-react';
import { ProductBomCountCardPreviewModal } from '../../production/components/ProductBomCountCardPreviewModal';
import type { ProductBomCountCard } from '../../production/components/ProductBomCountCardPrint';
import { buildProductBomCountCards } from '../../production/lib/buildProductBomCountCards';
import { productService } from '../../production/services/productService';
import type { Product } from '../../../types';

const ASSEMBLE_PAGE_SIZE = 20;

type Shortcut = {
  key: string;
  label: string;
  description: string;
  icon: string;
  path: string;
  permission?: Parameters<ReturnType<typeof usePermission>['can']>[0];
  primary?: boolean;
};

export const RawMaterialWarehouseControl: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const threshold = useAppStore(
    (s) => Number(s.systemSettings.planSettings?.inventoryExceptionManualThreshold || 500),
  );
  const storeProducts = useAppStore((s) => s.products);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const {
    warehouseId,
    setWarehouseId,
    warehouseName,
    configured,
    loadingWarehouse,
    allowedWarehouses,
    canSwitchWarehouse,
  } = useRawMaterialWarehouse();

  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState(0);
  const [pendingIssues, setPendingIssues] = useState(0);
  const [assemblableRows, setAssemblableRows] = useState<AssemblableCapacityRow[]>([]);
  const [assemblableSearch, setAssemblableSearch] = useState('');
  const [assemblablePage, setAssemblablePage] = useState(1);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [assemblableError, setAssemblableError] = useState<string | null>(null);
  const [countCardPreviewOpen, setCountCardPreviewOpen] = useState(false);
  const [countCardPreviewData, setCountCardPreviewData] = useState<ProductBomCountCard[]>([]);
  const [countCardPreviewBusy, setCountCardPreviewBusy] = useState(false);
  const [countCardPreviewWarning, setCountCardPreviewWarning] = useState<string | null>(null);
  const [countCardMessage, setCountCardMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!warehouseId) {
      setBalances([]);
      setTransactions([]);
      setPendingTransfers(0);
      setPendingIssues(0);
      setAssemblableRows([]);
      setAssemblableError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [bals, txs, pending, issues, assemblableResult] = await Promise.all([
        stockService.getBalances(warehouseId),
        stockService.getTransactions(warehouseId),
        transferApprovalService.getByStatus('pending'),
        productionIssueService.getAll(),
        assemblableCapacityService.getForWarehouse(warehouseId).then(
          (rows) => ({ ok: true as const, rows }),
          (error: unknown) => ({
            ok: false as const,
            rows: [] as AssemblableCapacityRow[],
            error: error instanceof Error ? error.message : 'تعذر حساب المتاح للتجميع',
          }),
        ),
      ]);
      setBalances(bals);
      setTransactions(txs.slice(0, 8));
      setPendingTransfers(
        pending.filter((row) => row.fromWarehouseId === warehouseId || row.toWarehouseId === warehouseId).length,
      );
      setPendingIssues(
        issues.filter(
          (row) =>
            row.sourceWarehouseId === warehouseId &&
            (row.status === 'draft' || row.status === 'submitted'),
        ).length,
      );
      setAssemblableRows(assemblableResult.rows);
      setAssemblableError(assemblableResult.ok ? null : ('error' in assemblableResult ? assemblableResult.error : 'تعذر حساب التجميع'));
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCountCardPreview = useCallback(
    async (productIds: string[]) => {
      if (!warehouseId || countCardPreviewBusy) return;
      setCountCardPreviewBusy(true);
      setCountCardPreviewWarning(null);
      setCountCardMessage(null);
      setCountCardPreviewOpen(true);
      setCountCardPreviewData([]);
      try {
        let products: Product[] = storeProducts;
        if (!products.length) {
          products = await productService.getAll();
        }
        const { cards, skippedWithoutBom } = await buildProductBomCountCards({
          productIds,
          products,
          warehouseId,
          warehouseName,
        });
        if (cards.length === 0) {
          setCountCardPreviewOpen(false);
          setCountCardMessage(
            skippedWithoutBom.length > 0
              ? `لا يوجد BOM للمنتجات المحددة (${skippedWithoutBom.slice(0, 5).join('، ')}).`
              : 'لا توجد بيانات لكارت الجرد.',
          );
          return;
        }
        if (skippedWithoutBom.length > 0) {
          setCountCardPreviewWarning(
            `تم تخطي ${skippedWithoutBom.length} بدون BOM: ${skippedWithoutBom.slice(0, 5).join('، ')}`,
          );
        }
        setCountCardPreviewData(cards);
      } catch {
        setCountCardPreviewOpen(false);
        setCountCardMessage('تعذر تجهيز كارت الجرد للمعاينة.');
      } finally {
        setCountCardPreviewBusy(false);
      }
    },
    [warehouseId, warehouseName, storeProducts, countCardPreviewBusy],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#assemblable') return;
    const timer = window.setTimeout(() => {
      document.getElementById('assemblable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [loading, assemblableRows.length]);

  const filteredAssemblable = useMemo(() => {
    const q = assemblableSearch.trim().toLowerCase();
    if (!q) return assemblableRows;
    return assemblableRows.filter((row) =>
      [
        row.productName,
        row.productCode,
        row.bottleneck?.materialName,
        row.bottleneck?.materialCode,
        ...row.components.map((c) => c.materialName),
        ...row.components.map((c) => c.materialCode),
      ].some((value) => String(value || '').toLowerCase().includes(q)),
    );
  }, [assemblableRows, assemblableSearch]);

  useEffect(() => {
    setAssemblablePage(1);
    setExpandedProductId(null);
  }, [assemblableSearch, warehouseId]);

  const assemblableTotalPages = Math.max(1, Math.ceil(filteredAssemblable.length / ASSEMBLE_PAGE_SIZE));
  const safeAssemblablePage = Math.min(assemblablePage, assemblableTotalPages);
  const pagedAssemblable = useMemo(
    () =>
      filteredAssemblable.slice(
        (safeAssemblablePage - 1) * ASSEMBLE_PAGE_SIZE,
        safeAssemblablePage * ASSEMBLE_PAGE_SIZE,
      ),
    [filteredAssemblable, safeAssemblablePage],
  );

  const exportAssemblable = () => {
    const rows = filteredAssemblable.flatMap((row) =>
      row.components.map((component) => ({
        المنتج: row.productName,
        'كود المنتج': row.productCode,
        'قابل للتجميع (منتج)': row.maxAssemblable,
        المكون: component.materialName,
        'كود المكون': component.materialCode,
        'كمية/وحدة': Number(component.requiredPerUnit.toFixed(4)),
        'متاح المكون': component.availableQty,
        'حد المكون': component.maxAssemblable,
        'عنق زجاجي': row.bottleneck?.materialId === component.materialId ? 'نعم' : '',
      })),
    );
    exportGenericRows(
      rows,
      'المتاح للتجميع',
      `متاح-تجميع-${warehouseName || 'مخزن'}-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const kpis = useMemo(() => {
    let totalQty = 0;
    let low = 0;
    let out = 0;
    let negative = 0;
    balances.forEach((row) => {
      const qty = Number(row.quantity || 0);
      const min = Number(row.minStock || 0);
      totalQty += qty;
      if (qty < 0) negative += 1;
      else if (qty <= 0 && min > 0) out += 1;
      else if (min > 0 && qty <= min) low += 1;
    });
    const canAssembleProducts = assemblableRows.filter((row) => row.maxAssemblable > 0).length;
    const top = assemblableRows[0];
    return {
      skuCount: balances.length,
      totalQty,
      low,
      out,
      negative,
      alertCount: low + out + negative,
      canAssembleProducts,
      topAssemblable: top?.maxAssemblable || 0,
      topProductCode: top?.productCode || '',
      topProductName: top?.productName || '',
    };
  }, [balances, assemblableRows]);

  const lowPreview = useMemo(
    () =>
      balances
        .filter((row) => {
          const qty = Number(row.quantity || 0);
          const min = Number(row.minStock || 0);
          return min > 0 && qty <= min;
        })
        .slice(0, 8),
    [balances],
  );

  const shortcuts = useMemo((): Shortcut[] => {
    if (!warehouseId) return [];
    const wh = encodeURIComponent(warehouseId);
    return [
      {
        key: 'in',
        label: 'إدخال مخزون',
        description: 'تسجيل وارد للمستلزمات',
        icon: 'add_circle',
        path: `/inventory/movements?warehouseId=${wh}&itemType=raw_material&movementType=IN`,
        permission: 'inventory.transactions.create',
        primary: true,
      },
      {
        key: 'receive',
        label: 'استلام مستلزمات',
        description: 'استلام منتج مفكك أو مكونات مع اعتماد',
        icon: 'inventory',
        path: `/inventory/raw-materials/receive?warehouseId=${wh}`,
        permission: 'inventory.transactions.create',
        primary: true,
      },
      {
        key: 'out',
        label: 'صرف يدوي',
        description: 'خروج مخزني من مخزن المستلزمات',
        icon: 'remove_circle',
        path: `/inventory/movements?warehouseId=${wh}&itemType=raw_material&movementType=OUT`,
        permission: 'inventory.transactions.create',
      },
      {
        key: 'transfer',
        label: 'تحويل',
        description: 'تحويل من/إلى مخزن المستلزمات',
        icon: 'sync_alt',
        path: `/inventory/movements?warehouseId=${wh}&itemType=raw_material&movementType=TRANSFER`,
        permission: 'inventory.transactions.create',
      },
      {
        key: 'issue',
        label: 'صرف إنتاج',
        description: 'أوامر صرف المواد للإنتاج',
        icon: 'fact_check',
        path: `/inventory/production-issues?warehouseId=${wh}`,
        permission: 'inventory.view',
        primary: true,
      },
      {
        key: 'balances',
        label: 'الأرصدة',
        description: 'عرض أرصدة مخزن المستلزمات',
        icon: 'inventory_2',
        path: `/inventory/balances?warehouseId=${wh}`,
        permission: 'inventory.view',
      },
      {
        key: 'txs',
        label: 'الحركات',
        description: 'سجل حركات المخزن',
        icon: 'receipt_long',
        path: `/inventory/transactions?warehouseId=${wh}`,
        permission: 'inventory.view',
      },
      {
        key: 'counts',
        label: 'الجرد',
        description: 'بدء جلسة جرد للمخزن',
        icon: 'checklist',
        path: `/inventory/counts?warehouseId=${wh}`,
        permission: 'inventory.counts.manage',
      },
      {
        key: 'locations',
        label: 'اللوكيشنات',
        description: 'أرفف ورفوف مخزن المستلزمات',
        icon: 'warehouse',
        path: `/inventory/locations?warehouseId=${wh}`,
        permission: 'inventory.view',
      },
      {
        key: 'approvals',
        label: 'اعتماد التحويلات',
        description: 'تحويلات معلّقة تخص المخزن',
        icon: 'verified_user',
        path: `/inventory/transfer-approvals?warehouseId=${wh}`,
        permission: 'inventory.view',
      },
      {
        key: 'import',
        label: 'استيراد بالمكوّن',
        description: 'إدخال سريع بالكود',
        icon: 'upload',
        path: `/inventory/movements?action=import-in-by-code&itemType=raw_material&warehouseId=${wh}`,
        permission: 'inventory.transactions.create',
      },
      {
        key: 'alerts',
        label: 'تنبيهات المخزن',
        description: 'منخفض / نفاد / معلّق',
        icon: 'notifications_active',
        path: '/inventory/raw-materials/alerts',
        permission: 'inventory.view',
        primary: true,
      },
      {
        key: 'quick-transfer',
        label: 'تحويل سريع',
        description: 'تحويل سريع بين المخازن',
        icon: 'bolt',
        path: `/quick-inventory-transfer?warehouseId=${wh}&itemType=raw_material`,
        permission: 'inventory.transactions.create',
      },
    ];
  }, [warehouseId]);

  const visibleShortcuts = shortcuts.filter((s) => !s.permission || can(s.permission));

  if (loadingWarehouse || (loading && configured && balances.length === 0 && transactions.length === 0)) {
    return <PageContentSkeleton variant="dashboard" kpiCount={8} />;
  }

  if (!configured) {
    return (
      <div className="erp-ds-clean space-y-6">
        <PageHeader
          title="تحكم مخزن المستلزمات"
          subtitle="مخزن المستلزمات المحدد في إعدادات توجيه المخازن (المفكك ثم المواد الخام)"
          icon={<Package size={18} />}
        />
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              لم يُحدَّد مخزن المستلزمات بعد. عيّن «مخزن المفكك (مستلزم إنتاج)» أو «مخزن المواد الخام» من إعدادات توجيه المخزون، ثم اضغط «حفظ الصفحة».
            </p>
            <Link to={withTenantPath(tenantSlug, '/settings/production')}>
              <PrimaryButton>فتح إعدادات التوجيه</PrimaryButton>
            </Link>
            <p className="text-xs text-[var(--color-text-muted)]">
              بعد الحفظ ستظهر لوحة التحكم والتنبيهات والاختصارات التشغيلية لهذا المخزن.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean erp-dashboard-theme space-y-6">
      <PageHeader
        title="تحكم مخزن المستلزمات"
        subtitle={`لوحة تشغيل مخزن المستلزمات: ${warehouseName}`}
        icon={<Package size={18} />}
        actions={(
          <div className="flex flex-wrap gap-2 items-center">
            {canSwitchWarehouse && (
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                aria-label="تبديل مخزن المستلزمات"
              >
                {allowedWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.code ? ` (${w.code})` : ''}
                  </option>
                ))}
              </select>
            )}
            <GhostButton onClick={() => void loadData()} disabled={loading}>تحديث</GhostButton>
            <Link to={withTenantPath(tenantSlug, '/inventory/raw-materials/alerts')}>
              <PrimaryButton>
                التنبيهات
                {kpis.alertCount + pendingTransfers + pendingIssues > 0
                  ? ` (${kpis.alertCount + pendingTransfers + pendingIssues})`
                  : ''}
              </PrimaryButton>
            </Link>
          </div>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard label="أصناف في المخزن" value={kpis.skuCount} iconType="metric" color="indigo" loading={loading} />
        <KPICard label="إجمالي الكمية" value={formatNumber(kpis.totalQty)} iconType="metric" color="green" loading={loading} />
        <KPICard
          label="منتجات قابلة للتجميع"
          value={kpis.canAssembleProducts}
          iconType="metric"
          color="green"
          loading={loading}
        />
        <KPICard
          label="أعلى كمية تجميع"
          value={formatNumber(kpis.topAssemblable)}
          iconType="trend"
          color="indigo"
          loading={loading}
        />
        <KPICard label="رصيد منخفض" value={kpis.low} iconType="trend" color="amber" loading={loading} />
        <KPICard label="نفاد" value={kpis.out} iconType="metric" color="red" loading={loading} />
        <KPICard label="تحويلات معلّقة" value={pendingTransfers} iconType="trend" color="amber" loading={loading} />
        <KPICard label="صرف إنتاج معلّق" value={pendingIssues} iconType="metric" color="amber" loading={loading} />
      </div>

      {kpis.topProductName && kpis.topAssemblable > 0 && (
        <p className="text-sm text-[var(--color-text-muted)] -mt-2">
          أعلى قابلية تجميع:{' '}
          <span className="font-medium text-[var(--color-text)]">{kpis.topProductName}</span>
          {kpis.topProductCode ? (
            <span className="font-mono text-xs ms-1">({kpis.topProductCode})</span>
          ) : null}
          {' — '}
          {formatNumber(kpis.topAssemblable)} وحدة
        </p>
      )}

      {kpis.negative > 0 && (
        <p className="text-sm font-medium text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          يوجد {kpis.negative} رصيد سالب في مخزن المستلزمات. راجع شاشة التنبيهات.
        </p>
      )}

      {assemblableError && (
        <p className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          تعذر حساب المتاح للتجميع: {assemblableError}
        </p>
      )}

      {countCardMessage && (
        <p className="text-sm font-medium text-rose-800 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">
          {countCardMessage}
        </p>
      )}

      <Card id="assemblable" className="border-slate-200 shadow-none overflow-hidden scroll-mt-24">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-medium text-slate-800">المتاح للتجميع حسب المنتج</CardTitle>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                أقصى عدد وحدات تامة يمكن تجميعها من أرصدة هذا المخزن حسب BOM (العنق الزجاجي = أضعف مكوّن).
                افتح كارت الجرد لمعاينة المكونات والرصيد قبل الطباعة.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <GhostButton
                onClick={exportAssemblable}
                disabled={loading || filteredAssemblable.length === 0}
              >
                تصدير Excel
              </GhostButton>
              <GhostButton
                onClick={() =>
                  void openCountCardPreview(pagedAssemblable.map((row) => row.productId))
                }
                disabled={loading || countCardPreviewBusy || pagedAssemblable.length === 0 || !warehouseId}
              >
                {countCardPreviewBusy ? 'جاري التحميل…' : 'كروت جرد الصفحة'}
              </GhostButton>
              {warehouseId && (
                <Link to={withTenantPath(tenantSlug, `/inventory/production-issues?warehouseId=${encodeURIComponent(warehouseId)}`)}>
                  <PrimaryButton>صرف إنتاج</PrimaryButton>
                </Link>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-3">
            <SmartFilterBar
              searchValue={assemblableSearch}
              onSearchChange={setAssemblableSearch}
              searchPlaceholder="بحث بالمنتج أو كود المكوّن…"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="erp-table w-full">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th text-start w-10" />
                  <th className="erp-th text-start">المنتج</th>
                  <th className="erp-th text-center">مكوّنات</th>
                  <th className="erp-th text-center">قابل للتجميع</th>
                  <th className="erp-th text-start">العنق الزجاجي</th>
                  <th className="erp-th text-center">متاح المكوّن</th>
                  <th className="erp-th text-center w-16">كارت</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="border-b border-[var(--color-border)]">
                      <td className="px-4 py-3" colSpan={7}>
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : pagedAssemblable.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                      {assemblableRows.length === 0
                        ? 'لا توجد منتجات بـ BOM مرتبطة بأصناف في هذا المخزن.'
                        : 'لا نتائج مطابقة للبحث.'}
                    </td>
                  </tr>
                ) : (
                  pagedAssemblable.map((row) => {
                    const bn = row.bottleneck;
                    const expanded = expandedProductId === row.productId;
                    return (
                      <React.Fragment key={row.productId}>
                        <tr className="border-b border-[var(--color-border)]">
                          <td className="px-2 py-3 text-center">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                              aria-label={expanded ? 'إخفاء المكوّنات' : 'عرض المكوّنات'}
                              onClick={() =>
                                setExpandedProductId((prev) => (prev === row.productId ? null : row.productId))
                              }
                            >
                              <span className="material-icons-round text-[20px]">
                                {expanded ? 'expand_less' : 'expand_more'}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-[var(--color-text)]">{row.productName}</p>
                            <p className="text-xs text-slate-400 font-mono">{row.productCode || '—'}</p>
                          </td>
                          <td className="px-4 py-3 text-center text-sm tabular-nums">{row.componentCount}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-base font-bold tabular-nums text-indigo-700">
                              {formatNumber(row.maxAssemblable)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {bn ? (
                              <>
                                <p className="text-sm text-[var(--color-text)]">{bn.materialName}</p>
                                <p className="text-xs text-slate-400 font-mono">{bn.materialCode || '—'}</p>
                              </>
                            ) : (
                              <span className="text-sm text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-sm tabular-nums text-slate-600">
                            {bn ? formatNumber(bn.availableQty) : '—'}
                          </td>
                          <td className="px-2 py-3 text-center">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                              title="معاينة كارت جرد"
                              disabled={countCardPreviewBusy || !warehouseId}
                              onClick={() => void openCountCardPreview([row.productId])}
                            >
                              {countCardPreviewBusy ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <ClipboardList className="size-4" />
                              )}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-[var(--color-border)] bg-slate-50/80 dark:bg-slate-900/30">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white dark:bg-slate-950">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-slate-50 dark:bg-slate-900">
                                      <th className="px-3 py-2 text-start font-medium">المكوّن</th>
                                      <th className="px-3 py-2 text-center font-medium">مطلوب/وحدة</th>
                                      <th className="px-3 py-2 text-center font-medium">متاح</th>
                                      <th className="px-3 py-2 text-center font-medium">حد التجميع</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.components.map((component) => {
                                      const isBottleneck = bn?.materialId === component.materialId;
                                      return (
                                        <tr
                                          key={`${row.productId}-${component.materialId}`}
                                          className={isBottleneck ? 'bg-amber-50/80 dark:bg-amber-950/20' : ''}
                                        >
                                          <td className="px-3 py-2">
                                            <span className="font-medium">{component.materialName}</span>
                                            {isBottleneck && (
                                              <StatusBadge label="عنق زجاجي" type="warning" className="ms-2" />
                                            )}
                                            <p className="text-xs text-slate-400 font-mono">{component.materialCode || '—'}</p>
                                          </td>
                                          <td className="px-3 py-2 text-center tabular-nums">
                                            {formatNumber(component.requiredPerUnit)}
                                          </td>
                                          <td className="px-3 py-2 text-center tabular-nums">
                                            {formatNumber(component.availableQty)}
                                          </td>
                                          <td className="px-3 py-2 text-center font-bold tabular-nums">
                                            {formatNumber(component.maxAssemblable)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <DataPaginationFooter
            page={safeAssemblablePage}
            totalPages={assemblableTotalPages}
            totalItems={filteredAssemblable.length}
            onPageChange={setAssemblablePage}
            itemLabel="منتج"
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-800">اختصارات التشغيل</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibleShortcuts.map((item) => (
              <Link
                key={item.key}
                to={withTenantPath(tenantSlug, item.path)}
                className={`flex items-start gap-3 rounded-[var(--border-radius-lg)] border px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40 ${
                  item.primary
                    ? 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20'
                    : 'border-[var(--color-border)]'
                }`}
              >
                <span className="material-icons-round text-[22px] text-indigo-600 mt-0.5">{item.icon}</span>
                <span>
                  <span className="block text-sm font-bold text-[var(--color-text)]">{item.label}</span>
                  <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">{item.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="border-slate-200 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-800">آخر حركات المخزن</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-400">جاري التحميل…</p>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-slate-400">لا توجد حركات حتى الآن.</p>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{tx.itemName}</p>
                      <p className="text-xs text-slate-400">{new Date(tx.createdAt).toLocaleString('ar-EG')}</p>
                    </div>
                    <div className="text-left">
                      <StatusBadge
                        label={tx.quantity >= 0 ? `+${formatNumber(tx.quantity)}` : formatNumber(tx.quantity)}
                        type={tx.quantity >= 0 ? 'success' : 'danger'}
                      />
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        {tx.movementType} · {sourceModuleLabel(tx.sourceModule)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-800">أصناف تحت الحد الأدنى</CardTitle>
            <Link to={withTenantPath(tenantSlug, '/inventory/raw-materials/alerts')} className="text-xs font-bold text-indigo-600">
              عرض الكل
            </Link>
          </CardHeader>
          <CardContent>
            {lowPreview.length === 0 ? (
              <p className="text-sm font-medium text-emerald-600">لا توجد أصناف تحت الحد الأدنى.</p>
            ) : (
              <div className="space-y-3">
                {lowPreview.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-[var(--border-radius-lg)] bg-amber-50 dark:bg-amber-900/10 px-3 py-2 border border-amber-100"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{row.itemName}</p>
                      <p className="text-xs text-slate-500">{row.itemCode}</p>
                    </div>
                    <div className="text-left text-sm font-medium text-amber-700 tabular-nums">
                      {formatNumber(row.quantity)} / {formatNumber(row.minStock)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {threshold > 0 && (
              <p className="text-[11px] text-[var(--color-text-muted)] mt-4">
                حد الحركة اليدوية الكبيرة في التنبيهات: {formatNumber(threshold)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <ProductBomCountCardPreviewModal
        open={countCardPreviewOpen}
        cards={countCardPreviewData}
        printSettings={printTemplate}
        loading={countCardPreviewBusy}
        warningText={countCardPreviewWarning}
        onClose={() => {
          setCountCardPreviewOpen(false);
          setCountCardPreviewData([]);
          setCountCardPreviewWarning(null);
        }}
      />
    </div>
  );
};
