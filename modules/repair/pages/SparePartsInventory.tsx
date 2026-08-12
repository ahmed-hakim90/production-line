import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { withTenantPath } from '@/lib/tenantPaths';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { RepairOpsPageShell } from '../components/RepairOpsPageShell';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { printAfterPaint, useManagedPrint } from '../../../utils/printManager';
import { toast } from '../../../components/Toast';
import {
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairSparePart,
  type RepairSparePartStock,
} from '../types';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { resolveAccessibleRepairBranchIds } from '../lib/repairBranchAccess';
import {
  buildSparePartLocationLabelMap,
  resolveSparePartLocationLabel,
} from '../lib/sparePartLocationLabel';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import { repairStockLevelChipType } from '../lib/repairSemanticStatus';
import { sparePartsService } from '../services/sparePartsService';
import { repairBranchService } from '../services/repairBranchService';
import { useLowStockAlert } from '../hooks/useLowStockAlert';
import { LowStockAlert } from '../components/LowStockAlert';
import { CreateRepairReplenishmentModal } from '../components/CreateRepairReplenishmentModal';
import { CreateRepairSparePartModal } from '../components/CreateRepairSparePartModal';
import { SparePartsInventoryCountPrint } from '../components/SparePartsInventoryCountPrint';
import { PrintOffscreenHost } from '@/src/components/erp/PrintOffscreenHost';
import { toUserSafeFirestoreError } from '../lib/repairFirestoreErrors';
import {
  loadSparePartsCatalogMaterials,
  type CatalogComponent,
} from '../../catalog/lib/productComponents';
import { planSparePartCatalogLinks } from '../utils/sparePartCatalogBackfill';
import { resolveRepairSalePrice } from '../utils/sparePartPricing';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairSettings } from '../config/repairSettings';
import { materialService } from '../../manufacturing/services/materialService';
import { defaultItemLocationService } from '../../inventory/services/defaultItemLocationService';
import { stockService } from '../../inventory/services/stockService';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

export const SparePartsInventory: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile: user,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [user, userRoleName, systemSettings, userPermissions],
  );
  const canManageAllBranches = repairCtx.canViewAllBranches;
  const canViewParts = can('repair.parts.view');
  const canManageParts = can('repair.parts.manage');
  /** Free-hand +/- / delete — not for typical center managers. */
  const canManualStockActions = can('repair.parts.stockAdjust');
  /** Mirror inventory SoT into center catalog — allowed for center managers too. */
  const canSyncCatalog = canManageParts || canManualStockActions;
  const canManagePricing = can('repair.pricing.manage');
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const printTemplate = systemSettings?.printTemplate;
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrintCountSheet = useManagedPrint({
    contentRef: printRef,
    printSettings: printTemplate,
    documentTitle: 'ورقة جرد قطع غيار',
  });
  const canViewReplenishment =
    can('sparePartsReplenishment.view')
    || can('sparePartsReplenishment.create')
    || can('sparePartsReplenishment.receive');
  const canCreateReplenishment = can('sparePartsReplenishment.create');
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const userBranchIds = useMemo(
    () =>
      resolveAccessibleRepairBranchIds({
        user,
        branches,
        currentEmployeeId: currentEmployee?.id,
        canViewAllBranches: canManageAllBranches,
      }),
    [user, branches, currentEmployee?.id, canManageAllBranches],
  );
  const branchId = selectedBranchId;
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [stock, setStock] = useState<RepairSparePartStock[]>([]);
  const [materialSaleById, setMaterialSaleById] = useState<Map<string, {
    consumer: number;
    trader: number;
  }>>(new Map());
  const [catalogComponents, setCatalogComponents] = useState<CatalogComponent[]>([]);
  const [isCreatePartModalOpen, setIsCreatePartModalOpen] = useState(false);
  const [linkingCatalog, setLinkingCatalog] = useState(false);
  const [deletingPartId, setDeletingPartId] = useState<string | null>(null);
  const [adjustingPartId, setAdjustingPartId] = useState<string | null>(null);
  const [replenishModalOpen, setReplenishModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [increaseQty, setIncreaseQty] = useState('1');
  const [viewMode, setViewMode] = useState<'simple' | 'dense'>('dense');
  const [syncingFromBalances, setSyncingFromBalances] = useState(false);
  const [locationByItemId, setLocationByItemId] = useState<Map<string, string>>(() => new Map());
  const autoSyncedKeyRef = useRef<string>('');
  const lowStock = useLowStockAlert(branchId);
  const activeBranch = useMemo(
    () => branches.find((branch) => branch.id === branchId) || null,
    [branchId, branches],
  );
  const activeWarehouseId = String(activeBranch?.warehouseId || '').trim();
  const activeWarehouseCode = String(activeBranch?.warehouseCode || '').trim();
  const activeWarehouseName = activeBranch?.name
    ? `مخزن ${activeBranch.name}`
    : activeWarehouseCode || activeWarehouseId;

  const sparePartsCacheKey = branchId && activeWarehouseId
    ? `repair:spareParts:${branchId}:${activeWarehouseId}`
    : null;

  const load = async (opts?: { force?: boolean }): Promise<{ parts: RepairSparePart[]; stock: RepairSparePartStock[] }> => {
    if (!branchId || !activeWarehouseId || !sparePartsCacheKey) {
      setParts([]);
      setStock([]);
      return { parts: [], stock: [] };
    }
    if (opts?.force) invalidatePageDataCache(sparePartsCacheKey);
    const cached = peekPageDataCache<{ parts: RepairSparePart[]; stock: RepairSparePartStock[] }>(sparePartsCacheKey);
    if (cached) {
      setParts(cached.parts);
      setStock(cached.stock);
    }
    try {
      const { data } = await fetchCachedPageData(
        sparePartsCacheKey,
        async () => {
          const [p, s] = await Promise.all([
            sparePartsService.listParts(branchId),
            sparePartsService.listStock(branchId, activeWarehouseId),
          ]);
          return { parts: p, stock: s };
        },
        { force: opts?.force === true, maxAgeMs: 45_000 },
      );
      setParts(data.parts);
      setStock(data.stock);
      return data;
    } catch (error: unknown) {
      setParts([]);
      setStock([]);
      toast.error(toUserSafeFirestoreError(error, 'تعذر تحميل مخزون قطع الغيار.'));
      return { parts: [], stock: [] };
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await load();
      if (cancelled || !canSyncCatalog || !branchId || !activeWarehouseId) return;
      if (data.parts.length > 0) return;
      const key = `${branchId}:${activeWarehouseId}`;
      if (autoSyncedKeyRef.current === key) return;
      autoSyncedKeyRef.current = key;
      setSyncingFromBalances(true);
      try {
        const result = await sparePartsService.syncBranchCatalogFromWarehouseBalances({
          branchId,
          warehouseId: activeWarehouseId,
          warehouseName: activeBranch?.name ? `مخزن ${activeBranch.name}` : activeWarehouseCode,
          createdBy: userDisplayName || userEmail || user?.displayName || user?.email || 'system',
        });
        if (cancelled) return;
        await load({ force: true });
        if (result.synced > 0 || result.createdParts > 0) {
          toast.success(
            `تمت مزامنة أرصدة المخزن: ${result.createdParts} صنف · ${result.synced} رصيد`,
          );
        }
      } catch {
        // Empty catalog may simply mean no inventory balances yet — keep silent on auto path.
      } finally {
        if (!cancelled) setSyncingFromBalances(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, activeWarehouseId, canSyncCatalog]);

  useEffect(() => {
    void loadSparePartsCatalogMaterials()
      .then(setCatalogComponents)
      .catch(() => setCatalogComponents([]));
    void materialService.getAll()
      .then((rows) => {
        const map = new Map<string, { consumer: number; trader: number }>();
        for (const row of rows) {
          const id = String(row.id || '').trim();
          if (!id) continue;
          map.set(id, {
            consumer: Number(row.defaultSalePrice || 0),
            trader: Number(row.traderSalePrice || 0),
          });
        }
        setMaterialSaleById(map);
      })
      .catch(() => setMaterialSaleById(new Map()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!activeWarehouseId) {
      setLocationByItemId(new Map());
      return;
    }
    void (async () => {
      try {
        const [defaults, balances] = await Promise.all([
          defaultItemLocationService.getAll(activeWarehouseId),
          stockService.getLocationBalances({ warehouseId: activeWarehouseId }),
        ]);
        if (cancelled) return;
        setLocationByItemId(
          buildSparePartLocationLabelMap({
            defaults,
            balances,
          }),
        );
      } catch {
        if (!cancelled) setLocationByItemId(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeWarehouseId]);

  useEffect(() => {
    void repairBranchService.list()
      .then((rows) => {
        setBranches(rows);
        if (!selectedBranchId && rows.length > 0) {
          const allowedIds = resolveAccessibleRepairBranchIds({
            user,
            branches: rows,
            currentEmployeeId: currentEmployee?.id,
            canViewAllBranches: canManageAllBranches,
          });
          const firstAllowed = canManageAllBranches
            ? rows[0]
            : rows.find((row) => row.id && allowedIds.includes(String(row.id)));
          if (firstAllowed?.id) {
            setSelectedBranchId(String(firstAllowed.id));
          }
        }
      })
      .catch((error: unknown) => {
        setBranches([]);
        toast.error(toUserSafeFirestoreError(error, 'تعذر تحميل فروع الصيانة.'));
      });
  }, [canManageAllBranches, selectedBranchId, user, currentEmployee?.id]);
  useEffect(() => {
    if (canManageAllBranches) return;
    const currentAllowed = userBranchIds.includes(selectedBranchId);
    if (currentAllowed) return;
    setSelectedBranchId(userBranchIds[0] || '');
  }, [canManageAllBranches, selectedBranchId, userBranchIds]);
  const branchOptions = useMemo(
    () => (canManageAllBranches ? branches : branches.filter((row) => row.id && userBranchIds.includes(String(row.id)))),
    [branches, canManageAllBranches, userBranchIds],
  );

  const stockMap = useMemo(
    () => new Map(stock.map((s) => [s.partId, Number(s.quantity || 0)])),
    [stock],
  );
  const visibleParts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((part) => `${part.name} ${part.code} ${part.category}`.toLowerCase().includes(q));
  }, [parts, search]);
  const printRows = useMemo(
    () =>
      visibleParts.map((part) => ({
        part,
        quantity: Number(stockMap.get(part.id || '') || 0),
      })),
    [visibleParts, stockMap],
  );
  const stats = useMemo(() => {
    const totalItems = parts.length;
    const totalStock = parts.reduce((sum, part) => sum + Number(stockMap.get(part.id || '') || 0), 0);
    const lowStockCount = parts.filter((part) => Number(stockMap.get(part.id || '') || 0) <= Number(part.minStock || 0)).length;
    return { totalItems, totalStock, lowStockCount };
  }, [parts, stockMap]);

  const increaseStock = async (part: RepairSparePart) => {
    if (!canManualStockActions) {
      toast.error('تعديل الرصيد اليدوي غير متاح لمسؤول المركز. استخدم التموين أو الجرد المعتمد.');
      return;
    }
    if (!part.id || !branchId || !activeWarehouseId || adjustingPartId) return;
    const qty = Math.max(1, Number(increaseQty || 1));
    setAdjustingPartId(part.id);
    try {
      await sparePartsService.adjustStock({
        branchId,
        warehouseId: activeWarehouseId,
        warehouseName: activeBranch?.name ? `مخزن ${activeBranch.name}` : activeWarehouseCode,
        partId: part.id,
        partName: part.name,
        quantity: qty,
        type: 'IN',
        createdBy: user?.displayName || user?.email || 'system',
        notes: 'جرد يدوي',
      });
      await load({ force: true });
      toast.success('تم تسجيل زيادة الجرد.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إضافة الكمية.');
    } finally {
      setAdjustingPartId(null);
    }
  };
  const decreaseStock = async (part: RepairSparePart) => {
    if (!canManualStockActions) {
      toast.error('تعديل الرصيد اليدوي غير متاح لمسؤول المركز. استخدم التموين أو الجرد المعتمد.');
      return;
    }
    if (!part.id || !branchId || !activeWarehouseId || adjustingPartId) return;
    const qty = Math.max(1, Number(increaseQty || 1));
    setAdjustingPartId(part.id);
    try {
      await sparePartsService.adjustStock({
        branchId,
        warehouseId: activeWarehouseId,
        warehouseName: activeBranch?.name ? `مخزن ${activeBranch.name}` : activeWarehouseCode,
        partId: part.id,
        partName: part.name,
        quantity: qty,
        type: 'OUT',
        createdBy: user?.displayName || user?.email || 'system',
        notes: 'جرد يدوي',
      });
      await load({ force: true });
      toast.success('تم تسجيل نقص الجرد.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر سحب الكمية.');
    } finally {
      setAdjustingPartId(null);
    }
  };

  const syncFromWarehouseBalances = async () => {
    if (!canSyncCatalog) {
      toast.error('مزامنة الأرصدة غير متاحة لهذا الحساب.');
      return;
    }
    if (!branchId || !activeWarehouseId || syncingFromBalances) return;
    setSyncingFromBalances(true);
    try {
      const result = await sparePartsService.syncBranchCatalogFromWarehouseBalances({
        branchId,
        warehouseId: activeWarehouseId,
        warehouseName: activeBranch?.name ? `مخزن ${activeBranch.name}` : activeWarehouseCode,
        createdBy: userDisplayName || userEmail || user?.displayName || user?.email || 'system',
      });
      await load({ force: true });
      if (result.synced === 0 && result.createdParts === 0) {
        toast.error(
          result.failed > 0
            ? 'تعذر مزامنة الأرصدة. تأكد أن أصناف الجرد مربوطة بماستر المواد.'
            : 'لا توجد أرصدة مكونات في مخزن المركز للمزامنة.',
        );
        return;
      }
      toast.success(
        `تمت المزامنة: ${result.createdParts} صنف جديد · ${result.synced} رصيد`
        + (result.failed > 0 ? ` · ${result.failed} تعذّر` : ''),
      );
    } catch (error: unknown) {
      toast.error(toUserSafeFirestoreError(error, 'تعذر مزامنة كتالوج المركز من أرصدة المخزن.'));
    } finally {
      setSyncingFromBalances(false);
    }
  };

  const deletePart = async (part: RepairSparePart) => {
    if (!canManualStockActions) {
      toast.error('حذف أصناف المخزون غير متاح لمسؤول المركز.');
      return;
    }
    if (!part.id || !branchId || deletingPartId) return;
    const qty = Number(stockMap.get(part.id) || 0);
    const ok = window.confirm(
      qty > 0
        ? `الصنف «${part.name}» (${part.code || part.id}) عليه رصيد ${qty}. سيتم حذف الصنف ومسح الرصيد نهائيًا (مناسب لأصناف التجربة أو الربط الخاطئ). هل أنت متأكد؟`
        : `سيتم حذف الصنف «${part.name}» (${part.code || part.id}) من مخزون الفرع نهائيًا. هل أنت متأكد؟`,
    );
    if (!ok) return;
    setDeletingPartId(part.id);
    try {
      await sparePartsService.removePart(part.id, branchId, { force: true });
      toast.success('تم حذف الصنف.');
      await load({ force: true });
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حذف الصنف.');
    } finally {
      setDeletingPartId(null);
    }
  };

  const unlinkedPartsCount = useMemo(
    () =>
      parts.filter(
        (part) =>
          !String(part.materialId || '').trim() && !String(part.rawMaterialId || '').trim(),
      ).length,
    [parts],
  );

  const linkUnlinkedPartsToCatalog = async () => {
    if (!canManageParts || linkingCatalog) return;
    setLinkingCatalog(true);
    try {
      const components =
        catalogComponents.length > 0 ? catalogComponents : await loadSparePartsCatalogMaterials();
      if (catalogComponents.length === 0) setCatalogComponents(components);
      const plans = planSparePartCatalogLinks(parts, components);
      if (plans.length === 0) {
        toast.error(
          unlinkedPartsCount > 0
            ? 'لا توجد مطابقات واضحة بالاسم في ماستر داتا المواد.'
            : 'كل القطع مرتبطة بالفعل بالماستر داتا.',
        );
        return;
      }
      const linked = await sparePartsService.linkPartsToCatalog(
        plans.map((plan) => ({
          partId: plan.partId,
          materialId: plan.materialId,
          itemType: plan.itemType,
        })),
      );
      toast.success(`تم ربط ${linked} قطعة بماستر داتا المواد.`);
      await load({ force: true });
    } catch (e: any) {
      toast.error(e?.message || 'تعذر ربط القطع بالماستر داتا.');
    } finally {
      setLinkingCatalog(false);
    }
  };

  return (
    <RepairOpsPageShell
      eyebrow="مخزون قطع الغيار"
      dir={dir}
      hero={[
        { key: 'items', label: 'عدد الأصناف', value: stats.totalItems },
        { key: 'stock', label: 'إجمالي الكمية', value: stats.totalStock },
        {
          key: 'low',
          label: 'منخفضة المخزون',
          value: stats.lowStockCount,
          toneClassName: stats.lowStockCount > 0 ? 'ops-dash-kpi-card--tone-rose' : undefined,
        },
      ]}
      onRefresh={() => { void load({ force: true }); }}
      actions={(
        <div className="flex w-full max-w-full flex-wrap items-center gap-2 sm:w-auto">
          {(canManageAllBranches || branchOptions.length > 1) && (
            <div className="w-full sm:w-[220px]">
              <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  {branchOptions.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id || ''}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Link to={withTenantPath(tenantSlug, '/repair')}>
            <Button variant="outline" size="sm">لوحة الصيانة</Button>
          </Link>
          {activeWarehouseId ? (
            <Link
              to={withTenantPath(
                tenantSlug,
                `/repair/warehouses/${encodeURIComponent(activeWarehouseId)}`,
              )}
            >
              <Button variant="outline" size="sm">مساحة مخزن المركز</Button>
            </Link>
          ) : null}
          {can('repairSpareIssues.view') && (
            <Link to={withTenantPath(tenantSlug, '/repair/spare-issues')}>
              <Button variant="outline" size="sm">سندات الصرف</Button>
            </Link>
          )}
          {canViewReplenishment && (
            <Link to={withTenantPath(tenantSlug, '/repair/parts-replenishment')}>
              <Button variant="outline" size="sm">متابعة التموين</Button>
            </Link>
          )}
          {canCreateReplenishment && (
            <Button
              type="button"
              size="sm"
              onClick={() => setReplenishModalOpen(true)}
              disabled={!activeWarehouseId}
            >
              طلب تموين
            </Button>
          )}
          {canSyncCatalog && activeWarehouseId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void syncFromWarehouseBalances()}
              disabled={syncingFromBalances}
            >
              {syncingFromBalances ? 'جاري المزامنة…' : 'مزامنة من أرصدة المخزن'}
            </Button>
          ) : null}
          {canManagePricing && (
            <Link to={withTenantPath(tenantSlug, '/manufacturing/materials')}>
              <Button variant="secondary" size="sm">تسعير القطع (الماستر)</Button>
            </Link>
          )}
        </div>
      )}
    >
      {!branchId && (
        <div className="rounded border border-[rgb(var(--color-warning)/0.35)] bg-[rgb(var(--color-warning)/0.1)] p-3 text-[rgb(var(--color-warning))] text-sm">
          {canManageAllBranches
            ? 'اختر فرعًا أولًا لإدارة المخزون.'
            : 'لا يوجد فرع صيانة مرتبط بالمستخدم الحالي.'}
        </div>
      )}
      {branchId && !activeWarehouseId && (
        <div className="rounded border border-[rgb(var(--color-warning)/0.35)] bg-[rgb(var(--color-warning)/0.1)] p-3 text-[rgb(var(--color-warning))] text-sm">
          هذا الفرع لا يملك مخزنًا مرتبطًا بعد. أنشئ فرعًا جديدًا أو اربط مخزنًا يدويًا للفرع الحالي.
        </div>
      )}
      <OpsDashPanel
        title="جدول المخزون"
        accent="repair"
        bodyClassName="p-0"
        action={
          (canViewParts || canManageParts) ? (
            <div className="flex items-center gap-2 flex-wrap">
              {(canViewParts || canManageParts) ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!branchId || !activeWarehouseId || printRows.length === 0}
                  onClick={() => printAfterPaint(() => { void handlePrintCountSheet(); })}
                >
                  طباعة الجرد
                </Button>
              ) : null}
              {canManageParts && unlinkedPartsCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={linkingCatalog || !branchId}
                  onClick={() => void linkUnlinkedPartsToCatalog()}
                >
                  {linkingCatalog ? 'جاري الربط...' : `ربط بالماستر داتا (${unlinkedPartsCount})`}
                </Button>
              )}
              {canManageParts ? (
                <>
                  <Button
                    size="sm"
                    disabled={!branchId || !activeWarehouseId}
                    onClick={() => setIsCreatePartModalOpen(true)}
                  >
                    إضافة صنف
                  </Button>
                  <CreateRepairSparePartModal
                    open={isCreatePartModalOpen}
                    onOpenChange={setIsCreatePartModalOpen}
                    branchId={branchId}
                    existingParts={parts}
                    defaultMinStock={repairSettings.defaults.defaultMinStock}
                    onCreated={() => { void load({ force: true }); }}
                  />
                </>
              ) : null}
            </div>
          ) : undefined
        }
      >
        <SmartFilterBar
          pageId="spare-parts-inventory"
          searchPlaceholder="ابحث بالاسم أو الكود أو التصنيف..."
          searchValue={search}
          onSearchChange={setSearch}
          extra={
            <>
              {canManualStockActions && (
                <div className="flex items-center gap-2">
                  <Label className="whitespace-nowrap">كمية الجرد</Label>
                  <Input
                    type="number"
                    min={1}
                    value={increaseQty}
                    onChange={(e) => setIncreaseQty(e.target.value)}
                    className="h-[34px] w-[100px]"
                    title="تُستخدم مع أزرار الزيادة والنقص في الجدول"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button variant={viewMode === 'simple' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('simple')} className="h-[34px]">مبسط</Button>
                <Button variant={viewMode === 'dense' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('dense')} className="h-[34px]">كثيف البيانات</Button>
              </div>
            </>
          }
          className="mb-0 border-0 rounded-none"
        />
          <div className="erp-table-wrap overflow-x-auto border-t">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">القطعة</th>
                  <th className="p-2 text-right">الكود</th>
                  <th className="p-2 text-right">الموقع</th>
                  <th className="p-2 text-right">الرصيد</th>
                  <th className="p-2 text-right">الحد الأدنى</th>
                  {viewMode === 'dense' && <th className="hidden p-2 text-right lg:table-cell">مستهلك</th>}
                  {viewMode === 'dense' && <th className="hidden p-2 text-right lg:table-cell">تاجر</th>}
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {visibleParts.map((part) => {
                  const qty = stockMap.get(part.id || '') || 0;
                  const isLow = qty <= Number(part.minStock || 0);
                  const materialId = String(part.materialId || part.rawMaterialId || '').trim();
                  const prices = materialId ? materialSaleById.get(materialId) : undefined;
                  const consumerPrice = resolveRepairSalePrice({
                    materialSalePrice: prices?.consumer,
                    partSalePrice: part.defaultSalePrice,
                  });
                  const traderPrice = resolveRepairSalePrice({
                    customerType: 'trader',
                    materialSalePrice: prices?.consumer,
                    materialTraderSalePrice: prices?.trader,
                    partSalePrice: part.defaultSalePrice,
                  });
                  return (
                    <tr key={part.id} className="border-t">
                      <td className="p-2">{part.name}</td>
                      <td className="p-2">{part.code}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {resolveSparePartLocationLabel({
                          materialId: part.materialId,
                          rawMaterialId: part.rawMaterialId,
                          locationByItemId,
                        })}
                      </td>
                      <td className="p-2 font-mono tabular-nums">{qty}</td>
                      <td className="p-2 font-mono tabular-nums">{part.minStock}</td>
                      {viewMode === 'dense' && (
                        <td className="hidden p-2 font-mono tabular-nums lg:table-cell">
                          {consumerPrice > 0 ? consumerPrice.toFixed(2) : '—'}
                        </td>
                      )}
                      {viewMode === 'dense' && (
                        <td className="hidden p-2 font-mono tabular-nums lg:table-cell">
                          {traderPrice > 0 ? traderPrice.toFixed(2) : '—'}
                        </td>
                      )}
                      <td className="p-2">
                        <ErpStatusBadge
                          label={isLow ? 'منخفض' : 'جيد'}
                          type={repairStockLevelChipType(isLow)}
                        />
                      </td>
                      <td className="p-2">
                        {canManualStockActions ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              iconName="add"
                              tone="submit"
                              onClick={() => void increaseStock(part)}
                              disabled={Boolean(adjustingPartId) || Boolean(deletingPartId)}
                              title="زيادة الرصيد (جرد يدوي)"
                            >
                              +{Math.max(1, Number(increaseQty || 1))}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              iconName="remove"
                              tone="undo"
                              onClick={() => void decreaseStock(part)}
                              disabled={Boolean(adjustingPartId) || Boolean(deletingPartId) || qty <= 0}
                              title="نقص الرصيد (جرد يدوي)"
                            >
                              -{Math.max(1, Number(increaseQty || 1))}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              iconName="delete"
                              tone="delete"
                              onClick={() => void deletePart(part)}
                              disabled={Boolean(deletingPartId) || Boolean(adjustingPartId)}
                              title="حذف الصنف من مخزون الفرع (حتى لو كان تجربة أو مربوطًا بالغلط)"
                            >
                              {deletingPartId === part.id ? '…' : 'حذف'}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">عرض فقط</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibleParts.length === 0 && (
                  <tr>
                    <td
                      className="p-3 text-center text-muted-foreground"
                      colSpan={viewMode === 'dense' ? 9 : 7}
                    >
                      {parts.length === 0 ? (
                        <div className="space-y-2 py-2">
                          <p>لا توجد قطع في كتالوج هذا المركز.</p>
                          <p className="text-xs">
                            لو اعتمدت جرد أول المدة للمخزن: اضغط «مزامنة من أرصدة المخزن» لنقل الأصناف والأرصدة إلى الجدول.
                          </p>
                          {canSyncCatalog && activeWarehouseId ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void syncFromWarehouseBalances()}
                              disabled={syncingFromBalances}
                            >
                              {syncingFromBalances ? 'جاري المزامنة…' : 'مزامنة من أرصدة المخزن'}
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        'لا توجد قطع مطابقة للبحث.'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </OpsDashPanel>

      <CreateRepairReplenishmentModal
        open={replenishModalOpen}
        onOpenChange={setReplenishModalOpen}
        toWarehouseId={activeWarehouseId}
        parts={parts}
        onCreated={() => void load({ force: true })}
      />
      <LowStockAlert open={lowStock.isOpen} onOpenChange={(open) => { if (!open) lowStock.dismiss(); }} entries={lowStock.lowStockEntries} />
      <PrintOffscreenHost>
        <SparePartsInventoryCountPrint
          ref={printRef}
          rows={printRows}
          branchName={activeBranch?.name || ''}
          warehouseName={activeWarehouseName}
          locationByItemId={locationByItemId}
          printSettings={printTemplate}
        />
      </PrintOffscreenHost>
    </RepairOpsPageShell>
  );
};

export default SparePartsInventory;
