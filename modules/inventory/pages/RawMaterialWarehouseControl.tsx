import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { KPICard } from '@/src/components/erp/KPICard';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import type { TableIconActionTone } from '@/src/components/erp/TableIconAction';
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
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';

const ASSEMBLE_PAGE_SIZE = 20;
const RM_CONTROL_CACHE_PREFIX = 'inventory:raw-material-control';

type RawMaterialControlPageData = {
  balances: StockItemBalance[];
  transactions: StockTransaction[];
  pendingTransfers: number;
  pendingIssues: number;
  assemblableRows: AssemblableCapacityRow[];
  assemblableError: string | null;
};

type OpLink = {
  label: string;
  path: string;
  permission?: Parameters<ReturnType<typeof usePermission>['can']>[0];
  badge?: number;
  primary?: boolean;
  iconName: string;
  tone: TableIconActionTone;
};

type OpCard = {
  key: string;
  step: number;
  label: string;
  description: string;
  icon: string;
  permission?: Parameters<ReturnType<typeof usePermission>['can']>[0];
  links: OpLink[];
};

type ToolLink = {
  key: string;
  label: string;
  description: string;
  icon: string;
  path: string;
  permission?: Parameters<ReturnType<typeof usePermission>['can']>[0];
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

  const [assemblableSearch, setAssemblableSearch] = useState('');
  const [assemblablePage, setAssemblablePage] = useState(1);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [assemblableOpen, setAssemblableOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [countCardPreviewOpen, setCountCardPreviewOpen] = useState(false);
  const [countCardPreviewData, setCountCardPreviewData] = useState<ProductBomCountCard[]>([]);
  const [countCardPreviewBusy, setCountCardPreviewBusy] = useState(false);
  const [countCardPreviewWarning, setCountCardPreviewWarning] = useState<string | null>(null);
  const [countCardMessage, setCountCardMessage] = useState<string | null>(null);

  const controlCacheKey = warehouseId ? `${RM_CONTROL_CACHE_PREFIX}:${warehouseId}` : null;

  const {
    data: controlData,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<RawMaterialControlPageData>(
    controlCacheKey,
    async () => {
      if (!warehouseId) {
        return {
          balances: [],
          transactions: [],
          pendingTransfers: 0,
          pendingIssues: 0,
          assemblableRows: [],
          assemblableError: null,
        };
      }
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
      return {
        balances: bals,
        transactions: txs.slice(0, 8),
        pendingTransfers: pending.filter(
          (row) => row.fromWarehouseId === warehouseId || row.toWarehouseId === warehouseId,
        ).length,
        pendingIssues: issues.filter(
          (row) =>
            row.sourceWarehouseId === warehouseId &&
            (row.status === 'draft' || row.status === 'submitted' || row.status === 'requested'),
        ).length,
        assemblableRows: assemblableResult.rows,
        assemblableError: assemblableResult.ok
          ? null
          : ('error' in assemblableResult ? assemblableResult.error : 'تعذر حساب التجميع'),
      };
    },
    { maxAgeMs: 45_000 },
  );

  const balances = controlData?.balances ?? [];
  const transactions = controlData?.transactions ?? [];
  const pendingTransfers = controlData?.pendingTransfers ?? 0;
  const pendingIssues = controlData?.pendingIssues ?? 0;
  const assemblableRows = controlData?.assemblableRows ?? [];
  const assemblableError = controlData?.assemblableError ?? null;

  const loadData = useCallback(async () => {
    if (!controlCacheKey) return;
    invalidatePageDataCache(controlCacheKey);
    await reloadCached(true);
  }, [controlCacheKey, reloadCached]);

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
          products = (await productService.getAll()) as unknown as Product[];
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
    setAssemblableOpen(true);
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

  const opCards = useMemo((): OpCard[] => {
    if (!warehouseId) return [];
    const wh = encodeURIComponent(warehouseId);
    return [
      {
        key: 'balances',
        step: 1,
        label: 'الأرصدة',
        description: 'عرض أرصدة مكونات مخزن المستلزمات',
        icon: 'inventory_2',
        permission: 'inventory.view',
        links: [
          {
            label: 'فتح الأرصدة',
            path: `/inventory/balances?warehouseId=${wh}&itemType=raw_material`,
            permission: 'inventory.view',
            primary: true,
            iconName: 'visibility',
            tone: 'view',
          },
        ],
      },
      {
        key: 'receive',
        step: 2,
        label: 'استلام مكونات',
        description: 'استلام مستلزمات أو إدخال وارد للمكونات',
        icon: 'inventory',
        permission: 'inventory.transactions.create',
        links: [
          {
            label: 'استلام مستلزمات',
            path: `/inventory/raw-materials/receive?warehouseId=${wh}`,
            permission: 'inventory.transactions.create',
            primary: true,
            iconName: 'inventory_2',
            tone: 'share',
          },
          {
            label: 'إدخال يدوي',
            path: `/inventory/movements?warehouseId=${wh}&itemType=raw_material&movementType=IN`,
            permission: 'inventory.transactions.create',
            iconName: 'add',
            tone: 'submit',
          },
        ],
      },
      {
        key: 'issue',
        step: 3,
        label: 'صرف',
        description: 'اعتماد طلبات الإنتاج أو إنشاء صرف من المخزن',
        icon: 'fact_check',
        permission: 'inventory.view',
        links: [
          {
            label: 'اعتماد طلبات الإنتاج',
            path: `/inventory/production-issues?tab=requests&warehouseId=${wh}`,
            permission: 'productionIssue.approve',
            primary: true,
            badge: pendingIssues,
            iconName: 'fact_check',
            tone: 'approve',
          },
          {
            label: 'صرف إنتاج (مستودع)',
            path: `/inventory/production-issues?tab=all&warehouseId=${wh}`,
            permission: 'inventory.view',
            iconName: 'precision_manufacturing',
            tone: 'edit',
          },
          {
            label: 'صرف يدوي',
            path: `/inventory/movements?warehouseId=${wh}&itemType=raw_material&movementType=OUT`,
            permission: 'inventory.transactions.create',
            iconName: 'swap_horiz',
            tone: 'execute',
          },
        ],
      },
      {
        key: 'transfer',
        step: 4,
        label: 'تحويل',
        description: 'تحويل مكونات من/إلى مخزن المستلزمات',
        icon: 'sync_alt',
        permission: 'inventory.transactions.create',
        links: [
          {
            label: 'تحويل',
            path: `/inventory/movements?warehouseId=${wh}&itemType=raw_material&movementType=TRANSFER`,
            permission: 'inventory.transactions.create',
            primary: true,
            iconName: 'sync_alt',
            tone: 'export',
          },
          {
            label: 'تحويل سريع',
            path: `/quick-inventory-transfer?warehouseId=${wh}&itemType=raw_material`,
            permission: 'inventory.transactions.create',
            iconName: 'sync_alt',
            tone: 'export',
          },
          {
            label: 'اعتماد التحويلات',
            path: `/inventory/transfer-approvals?warehouseId=${wh}`,
            permission: 'inventory.view',
            badge: pendingTransfers,
            iconName: 'fact_check',
            tone: 'approve',
          },
        ],
      },
      {
        key: 'counts',
        step: 5,
        label: 'جرد ومطابقة',
        description: 'عدّ الكميات الفعلية ← طابق مع النظام ← اعتمد الفروقات',
        icon: 'checklist',
        permission: 'inventory.counts.manage',
        links: [
          {
            label: 'بدء الجرد والمطابقة',
            path: `/inventory/counts?warehouseId=${wh}&from=supplies`,
            permission: 'inventory.counts.manage',
            primary: true,
            iconName: 'checklist',
            tone: 'save',
          },
        ],
      },
      {
        key: 'txs',
        step: 6,
        label: 'الحركات',
        description: 'سجل حركات الصرف والاستلام والتحويل',
        icon: 'receipt_long',
        permission: 'inventory.view',
        links: [
          {
            label: 'فتح الحركات',
            path: `/inventory/transactions?warehouseId=${wh}&itemType=raw_material`,
            permission: 'inventory.view',
            primary: true,
            iconName: 'swap_horiz',
            tone: 'execute',
          },
        ],
      },
    ];
  }, [warehouseId, pendingIssues, pendingTransfers]);

  const toolLinks = useMemo((): ToolLink[] => {
    if (!warehouseId) return [];
    const wh = encodeURIComponent(warehouseId);
    return [
      {
        key: 'alerts',
        label: 'تنبيهات المخزن',
        description: 'منخفض / نفاد / معلّق',
        icon: 'notifications_active',
        path: '/inventory/raw-materials/alerts',
        permission: 'inventory.view',
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
        key: 'import',
        label: 'استيراد بالمكوّن',
        description: 'إدخال سريع بالكود',
        icon: 'upload',
        path: `/inventory/movements?action=import-in-by-code&itemType=raw_material&warehouseId=${wh}`,
        permission: 'inventory.transactions.create',
      },
      {
        key: 'department-consumables',
        label: 'مستهلكات الأقسام',
        description: 'صرف نهائي للأقسام وتقرير شهري',
        icon: 'shopping_bag',
        path: '/inventory/department-consumables',
        permission: 'departmentConsumables.view',
      },
    ];
  }, [warehouseId]);

  const visibleOpCards = opCards.filter((card) => !card.permission || can(card.permission));
  const visibleTools = toolLinks.filter((t) => !t.permission || can(t.permission));

  if (loadingWarehouse || (loading && configured && balances.length === 0 && transactions.length === 0)) {
    return <PageContentSkeleton variant="dashboard" kpiCount={4} />;
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
              <PrimaryButton iconName="settings" tone="print">فتح إعدادات التوجيه</PrimaryButton>
            </Link>
            <p className="text-xs text-[var(--color-text-muted)]">
              بعد الحفظ ستظهر لوحة التشغيل اليومية لهذا المخزن.
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
        subtitle={`تشغيل يومي بسيط: ${warehouseName}`}
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
            <GhostButton iconName="refresh" tone="neutral" onClick={() => void loadData()} disabled={loading}>تحديث</GhostButton>
            <Link to={withTenantPath(tenantSlug, '/inventory/raw-materials/alerts')}>
              <PrimaryButton iconName="warning_amber" tone="undo">
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
        <KPICard label="تنبيهات الرصيد" value={kpis.alertCount} iconType="trend" color="amber" loading={loading} />
        <KPICard
          label="معلّقات"
          value={pendingTransfers + pendingIssues}
          iconType="metric"
          color="amber"
          loading={loading}
        />
      </div>

      {kpis.negative > 0 && (
        <p className="text-sm font-medium text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          يوجد {kpis.negative} رصيد سالب في مخزن المستلزمات. راجع شاشة التنبيهات.
        </p>
      )}

      {countCardMessage && (
        <p className="text-sm font-medium text-rose-800 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">
          {countCardMessage}
        </p>
      )}

      <Card className="border-slate-200 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-800">خطوات التشغيل اليومية</CardTitle>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            أرصدة → استلام → صرف أو تحويل → جرد ومطابقة → مراجعة الحركات
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibleOpCards.map((card) => {
              const links = card.links.filter((link) => !link.permission || can(link.permission));
              if (links.length === 0) return null;
              return (
                <div
                  key={card.key}
                  className="flex flex-col gap-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                      {card.step}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="material-icons-round text-[18px] text-indigo-600">{card.icon}</span>
                        <p className="text-sm font-bold text-[var(--color-text)]">{card.label}</p>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">{card.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {links.map((link) => (
                      <Link key={link.path} to={withTenantPath(tenantSlug, link.path)}>
                        {link.primary ? (
                          <PrimaryButton
                            iconName={link.iconName}
                            tone={link.tone}
                            className="!text-xs !px-3 !py-1.5"
                          >
                            {link.label}
                            {link.badge && link.badge > 0 ? ` (${link.badge})` : ''}
                          </PrimaryButton>
                        ) : (
                          <GhostButton
                            iconName={link.iconName}
                            tone={link.tone}
                            className="!text-xs !px-3 !py-1.5"
                          >
                            {link.label}
                            {link.badge && link.badge > 0 ? ` (${link.badge})` : ''}
                          </GhostButton>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {visibleTools.length > 0 && (
        <Card className="border-slate-200 shadow-none">
          <CardHeader className="pb-2">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-start"
              onClick={() => setToolsOpen((open) => !open)}
              aria-expanded={toolsOpen}
            >
              <div>
                <CardTitle className="text-sm font-medium text-slate-800">أدوات إضافية</CardTitle>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  تنبيهات، لوكيشنات، واستيراد سريع بالكود
                </p>
              </div>
              <span className="material-icons-round text-[22px] text-slate-500">
                {toolsOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>
          </CardHeader>
          {toolsOpen && (
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {visibleTools.map((item) => (
                  <Link
                    key={item.key}
                    to={withTenantPath(tenantSlug, item.path)}
                    className="flex items-start gap-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40"
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
          )}
        </Card>
      )}

      <Card id="assemblable" className="border-slate-200 shadow-none overflow-hidden scroll-mt-24">
        <CardHeader className="pb-2">
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 text-start"
            onClick={() => setAssemblableOpen((open) => !open)}
            aria-expanded={assemblableOpen}
          >
            <div>
              <CardTitle className="text-sm font-medium text-slate-800">المتاح للتجميع حسب المنتج</CardTitle>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                قسم ثانوي: أقصى وحدات تامة من أرصدة هذا المخزن حسب BOM
                {kpis.canAssembleProducts > 0
                  ? ` — ${kpis.canAssembleProducts} منتج قابل للتجميع`
                  : ''}
                {kpis.topProductName && kpis.topAssemblable > 0
                  ? ` · أعلى: ${kpis.topProductName} (${formatNumber(kpis.topAssemblable)})`
                  : ''}
              </p>
            </div>
            <span className="material-icons-round text-[22px] text-slate-500 mt-0.5">
              {assemblableOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </CardHeader>
        {assemblableOpen && (
          <CardContent className="p-0">
            {assemblableError && (
              <p className="mx-4 mb-3 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                تعذر حساب المتاح للتجميع: {assemblableError}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3">
              <SmartFilterBar
      pageId="raw-material-warehouse-control"
                searchValue={assemblableSearch}
                onSearchChange={setAssemblableSearch}
                searchPlaceholder="بحث بالمنتج أو كود المكوّن…"
              />
              <div className="flex flex-wrap gap-2">
                <GhostButton
                  iconName="download"
                  tone="export"
                  onClick={exportAssemblable}
                  disabled={loading || filteredAssemblable.length === 0}
                >
                  تصدير Excel
                </GhostButton>
                <GhostButton
                  iconName="checklist"
                  tone="save"
                  onClick={() =>
                    void openCountCardPreview(pagedAssemblable.map((row) => row.productId))
                  }
                  disabled={loading || countCardPreviewBusy || pagedAssemblable.length === 0 || !warehouseId}
                >
                  {countCardPreviewBusy ? 'جاري التحميل…' : 'كروت جرد الصفحة'}
                </GhostButton>
                {warehouseId && (
                  <Link to={withTenantPath(tenantSlug, `/inventory/production-issues?warehouseId=${encodeURIComponent(warehouseId)}`)}>
                    <PrimaryButton iconName="precision_manufacturing" tone="edit">صرف إنتاج</PrimaryButton>
                  </Link>
                )}
              </div>
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
        )}
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
