import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import type { TableIconActionTone } from '@/src/components/erp/TableIconAction';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
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
import { WarehouseItemSearchPanel } from '../components/WarehouseItemSearchPanel';

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
    error: controlLoadError,
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
      // Balances are required for KPIs. Transfers / issues / recent txs are badges and
      // a side panel — a permission or index failure there must not blank the board.
      const [balsResult, txsResult, pendingResult, issuesResult] = await Promise.allSettled([
        stockService.getBalances(warehouseId),
        stockService.getTransactionsPaged({ warehouseId, limit: 8 }),
        transferApprovalService.getPendingForWarehouse(warehouseId),
        productionIssueService.listOpenForSourceWarehouse(warehouseId),
      ]);
      if (balsResult.status === 'rejected') {
        throw balsResult.reason;
      }
      const pending = pendingResult.status === 'fulfilled' ? pendingResult.value : [];
      const issues = issuesResult.status === 'fulfilled' ? issuesResult.value : [];
      return {
        balances: balsResult.value,
        transactions: txsResult.status === 'fulfilled' ? txsResult.value.items : [],
        pendingTransfers: pending.length,
        pendingIssues: issues.length,
        assemblableRows: [],
        assemblableError: null,
      };
    },
    { maxAgeMs: 45_000, enabled: Boolean(warehouseId) },
  );

  const balances = controlData?.balances ?? [];
  const transactions = controlData?.transactions ?? [];
  const pendingTransfers = controlData?.pendingTransfers ?? 0;
  const pendingIssues = controlData?.pendingIssues ?? 0;

  const [assemblableRows, setAssemblableRows] = useState<AssemblableCapacityRow[]>([]);
  const [assemblableError, setAssemblableError] = useState<string | null>(null);
  const [assemblableLoading, setAssemblableLoading] = useState(false);

  useEffect(() => {
    if (!warehouseId || !controlData) {
      setAssemblableRows([]);
      setAssemblableError(null);
      setAssemblableLoading(false);
      return;
    }
    let cancelled = false;
    setAssemblableLoading(true);
    setAssemblableError(null);
    void assemblableCapacityService
      .getForWarehouse(warehouseId, { balances: controlData.balances })
      .then((rows) => {
        if (cancelled) return;
        setAssemblableRows(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setAssemblableRows([]);
        setAssemblableError('تعذر حساب المتاح للتجميع. يمكنك متابعة باقي عمليات المخزن.');
      })
      .finally(() => {
        if (!cancelled) setAssemblableLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId, controlData]);

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

  const warehouseHero = useMemo(
    () => [
      { key: 'sku', label: 'أصناف في المخزن', value: kpis.skuCount },
      { key: 'qty', label: 'إجمالي الكمية', value: formatNumber(kpis.totalQty) },
      { key: 'alerts', label: 'تنبيهات الرصيد', value: kpis.alertCount, toneClassName: kpis.alertCount > 0 ? 'ops-dash-kpi-card--tone-amber' : undefined },
      { key: 'pending', label: 'معلّقات', value: pendingTransfers + pendingIssues },
    ],
    [kpis, pendingTransfers, pendingIssues],
  );

  if (loadingWarehouse) {
    return <PageContentSkeleton variant="dashboard" kpiCount={4} />;
  }

  if (!configured) {
    return (
      <ModuleOpsPageShell
        eyebrow="تحكم مخزن المستلزمات"
        rangeLabel="مخزن المستلزمات المحدد في إعدادات توجيه المخازن (المفكك ثم المواد الخام)"
      >
        <OpsDashPanel accent="inventory">
          <div className="py-10 text-center space-y-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              لم يُحدَّد مخزن المستلزمات بعد. عيّن «مخزن المفكك (مستلزم إنتاج)» أو «مخزن المواد الخام» من إعدادات توجيه المخزون، ثم اضغط «حفظ الصفحة».
            </p>
            <Link to={withTenantPath(tenantSlug, '/settings/production')}>
              <PrimaryButton iconName="settings" tone="print">فتح إعدادات التوجيه</PrimaryButton>
            </Link>
            <p className="text-xs text-[var(--color-text-muted)]">
              بعد الحفظ ستظهر لوحة التشغيل اليومية لهذا المخزن.
            </p>
          </div>
        </OpsDashPanel>
      </ModuleOpsPageShell>
    );
  }

  if (loading && balances.length === 0 && transactions.length === 0 && !controlLoadError) {
    return <PageContentSkeleton variant="dashboard" kpiCount={4} />;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="تحكم مخزن المستلزمات"
      rangeLabel={`تشغيل يومي بسيط: ${warehouseName}`}
      hero={controlLoadError && balances.length === 0 ? undefined : warehouseHero}
      onRefresh={() => void loadData()}
      refreshing={loading}
      actions={(
        <div className="flex flex-wrap gap-2 items-center">
          {canSwitchWarehouse && (
            <select
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-semibold text-[var(--color-text)]"
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
    >
      {controlLoadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)] px-4 py-3">
          <p className="text-sm font-medium text-[rgb(var(--color-danger))]">
            تعذر تحميل بيانات مخزن المستلزمات. يمكنك متابعة خطوات التشغيل ثم إعادة المحاولة.
          </p>
          <GhostButton iconName="refresh" onClick={() => void loadData()}>
            إعادة المحاولة
          </GhostButton>
        </div>
      )}

      {kpis.negative > 0 && (
        <p className="text-sm font-medium text-[rgb(var(--color-danger))] bg-[rgb(var(--color-danger)/0.1)] border border-[rgb(var(--color-danger)/0.25)] rounded-lg px-4 py-3">
          يوجد {kpis.negative} رصيد سالب في مخزن المستلزمات. راجع شاشة التنبيهات.
        </p>
      )}

      {countCardMessage && (
        <p className="text-sm font-medium text-[rgb(var(--color-danger))] bg-[rgb(var(--color-danger)/0.1)] border border-[rgb(var(--color-danger)/0.25)] rounded-lg px-4 py-3">
          {countCardMessage}
        </p>
      )}

      {warehouseId ? (
        <WarehouseItemSearchPanel
          pageId={`raw-material-control-items:${warehouseId}`}
          warehouseId={warehouseId}
          balances={balances}
          loading={loading && balances.length === 0}
        />
      ) : null}

      <OpsDashPanel
        title="خطوات التشغيل اليومية"
        accent="inventory"
        action={(
          <p className="text-xs text-[var(--color-text-muted)]">
            أرصدة → استلام → صرف أو تحويل → جرد ومطابقة → مراجعة الحركات
          </p>
        )}
      >
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
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary)/0.1)] text-xs font-bold text-[rgb(var(--color-primary))]">
                      {card.step}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="material-icons-round text-[18px] text-[rgb(var(--color-primary))]">{card.icon}</span>
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
      </OpsDashPanel>

      {visibleTools.length > 0 && (
        <OpsDashPanel
          title="أدوات إضافية"
          accent="inventory"
          action={(
            <button
              type="button"
              className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]"
              onClick={() => setToolsOpen((open) => !open)}
              aria-expanded={toolsOpen}
            >
              {toolsOpen ? 'إخفاء' : 'عرض'}
              <span className="material-icons-round text-[18px]">
                {toolsOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>
          )}
        >
          {toolsOpen ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {visibleTools.map((item) => (
                  <Link
                    key={item.key}
                    to={withTenantPath(tenantSlug, item.path)}
                    className="flex items-start gap-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-4 py-3 transition-colors hover:bg-[var(--color-surface-hover)] dark:hover:bg-[var(--color-surface-hover)]"
                  >
                    <span className="material-icons-round text-[22px] text-[rgb(var(--color-primary))] mt-0.5">{item.icon}</span>
                    <span>
                      <span className="block text-sm font-bold text-[var(--color-text)]">{item.label}</span>
                      <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">{item.description}</span>
                    </span>
                  </Link>
                ))}
              </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">تنبيهات، لوكيشنات، واستيراد سريع بالكود</p>
          )}
        </OpsDashPanel>
      )}

      <div id="assemblable" className="scroll-mt-24">
      <OpsDashPanel
        title="المتاح للتجميع حسب المنتج"
        accent="inventory"
        bodyClassName="p-0"
        action={(
          <button
            type="button"
            className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]"
            onClick={() => setAssemblableOpen((open) => !open)}
            aria-expanded={assemblableOpen}
          >
            {assemblableOpen ? 'إخفاء' : 'عرض'}
            <span className="material-icons-round text-[18px]">
              {assemblableOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        )}
      >
        {assemblableOpen && (
            <>
            {assemblableLoading && !assemblableError && assemblableRows.length === 0 && (
              <p className="mx-4 mb-3 text-sm text-[var(--color-text-muted)]">جاري حساب المتاح للتجميع…</p>
            )}
            {assemblableError && (
              <p className="mx-4 mb-3 text-sm font-medium text-[rgb(var(--color-warning))] bg-[rgb(var(--color-warning)/0.1)] border border-[rgb(var(--color-warning)/0.25)] rounded-lg px-4 py-3">
                {assemblableError}
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
                          <div className="h-4 w-full animate-pulse rounded bg-[var(--color-surface-hover)]" />
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
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
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
                              <p className="text-xs text-[var(--color-text-muted)] font-mono">{row.productCode || '—'}</p>
                            </td>
                            <td className="px-4 py-3 text-center text-sm tabular-nums">{row.componentCount}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-base font-bold tabular-nums text-[rgb(var(--color-primary))]">
                                {formatNumber(row.maxAssemblable)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {bn ? (
                                <>
                                  <p className="text-sm text-[var(--color-text)]">{bn.materialName}</p>
                                  <p className="text-xs text-[var(--color-text-muted)] font-mono">{bn.materialCode || '—'}</p>
                                </>
                              ) : (
                                <span className="text-sm text-[var(--color-text-muted)]">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center text-sm tabular-nums text-[var(--color-text-muted)]">
                              {bn ? formatNumber(bn.availableQty) : '—'}
                            </td>
                            <td className="px-2 py-3 text-center">
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary)/0.1)] disabled:opacity-40"
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
                            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] dark:bg-[var(--color-surface-hover)]">
                              <td colSpan={7} className="px-4 py-3">
                                <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] dark:bg-[var(--color-card)]">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b bg-[var(--color-bg)] dark:bg-[var(--color-card)]">
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
                                            className={isBottleneck ? 'bg-[rgb(var(--color-warning)/0.1)]/80 dark:bg-[rgb(var(--color-warning)/0.2)]' : ''}
                                          >
                                            <td className="px-3 py-2">
                                              <span className="font-medium">{component.materialName}</span>
                                              {isBottleneck && (
                                                <StatusBadge label="عنق زجاجي" type="warning" className="ms-2" />
                                              )}
                                              <p className="text-xs text-[var(--color-text-muted)] font-mono">{component.materialCode || '—'}</p>
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
            </>
        )}
      </OpsDashPanel>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <OpsDashPanel title="آخر حركات المخزن" accent="inventory">
            {loading ? (
              <p className="text-sm text-[var(--color-text-muted)]">جاري التحميل…</p>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">لا توجد حركات حتى الآن.</p>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{tx.itemName}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{new Date(tx.createdAt).toLocaleString('ar-EG')}</p>
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
        </OpsDashPanel>

        <OpsDashPanel
          title="أصناف تحت الحد الأدنى"
          accent="inventory"
          action={(
            <Link to={withTenantPath(tenantSlug, '/inventory/raw-materials/alerts')} className="text-xs font-bold text-[rgb(var(--color-primary))]">
              عرض الكل
            </Link>
          )}
        >
            {lowPreview.length === 0 ? (
              <p className="text-sm font-medium text-[rgb(var(--color-success))]">لا توجد أصناف تحت الحد الأدنى.</p>
            ) : (
              <div className="space-y-3">
                {lowPreview.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-[var(--border-radius-lg)] bg-[rgb(var(--color-warning)/0.1)] dark:bg-[rgb(var(--color-warning)/0.15)] px-3 py-2 border border-[rgb(var(--color-warning)/0.25)]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{row.itemName}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{row.itemCode}</p>
                    </div>
                    <div className="text-left text-sm font-medium text-[rgb(var(--color-warning))] tabular-nums">
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
        </OpsDashPanel>
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
    </ModuleOpsPageShell>
  );
};
