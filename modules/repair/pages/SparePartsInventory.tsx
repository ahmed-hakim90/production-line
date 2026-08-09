import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { PageHeader } from '@/components/PageHeader';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import {
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairJob,
  type RepairSparePart,
  type RepairSparePartStock,
} from '../types';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { resolveAccessibleRepairBranchIds } from '../lib/repairBranchAccess';
import { StatusBadge } from '../components/StatusBadge';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import { repairStockLevelChipType } from '../lib/repairSemanticStatus';
import { sparePartsService } from '../services/sparePartsService';
import { repairBranchService } from '../services/repairBranchService';
import { repairJobService } from '../services/repairJobService';
import { useLowStockAlert } from '../hooks/useLowStockAlert';
import { LowStockAlert } from '../components/LowStockAlert';
import { CreateRepairReplenishmentModal } from '../components/CreateRepairReplenishmentModal';
import { CreateRepairSparePartModal } from '../components/CreateRepairSparePartModal';
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
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

const CLOSED_JOB_STATUSES = new Set(['delivered', 'cancelled', 'unrepairable']);

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
  const canManageParts = can('repair.parts.manage');
  const canManagePricing = can('repair.pricing.manage');
  const canViewReplenishment =
    can('sparePartsReplenishment.view')
    || can('sparePartsReplenishment.create')
    || can('sparePartsReplenishment.receive');
  const canCreateReplenishment = can('sparePartsReplenishment.create');
  const canViewJobs = can('repair.view');
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [branchJobs, setBranchJobs] = useState<RepairJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
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
    cost: number;
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
  const lowStock = useLowStockAlert(branchId);
  const activeBranch = useMemo(
    () => branches.find((branch) => branch.id === branchId) || null,
    [branchId, branches],
  );
  const activeWarehouseId = String(activeBranch?.warehouseId || '').trim();
  const activeWarehouseCode = String(activeBranch?.warehouseCode || '').trim();

  const sparePartsCacheKey = branchId && activeWarehouseId
    ? `repair:spareParts:${branchId}:${activeWarehouseId}`
    : null;

  const load = async (opts?: { force?: boolean }) => {
    if (!branchId || !activeWarehouseId || !sparePartsCacheKey) {
      setParts([]);
      setStock([]);
      return;
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
    } catch (error: unknown) {
      setParts([]);
      setStock([]);
      toast.error(toUserSafeFirestoreError(error, 'تعذر تحميل مخزون قطع الغيار.'));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, activeWarehouseId]);

  useEffect(() => {
    if (!canViewJobs || !branchId) {
      setBranchJobs([]);
      return;
    }
    let cancelled = false;
    setJobsLoading(true);
    void repairJobService
      .listByBranch(branchId)
      .then((rows) => {
        if (cancelled) return;
        setBranchJobs(
          rows
            .filter((job) => !CLOSED_JOB_STATUSES.has(String(job.status || '')))
            .slice(0, 25),
        );
      })
      .catch(() => {
        if (!cancelled) setBranchJobs([]);
      })
      .finally(() => {
        if (!cancelled) setJobsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, canViewJobs]);

  useEffect(() => {
    void loadSparePartsCatalogMaterials()
      .then(setCatalogComponents)
      .catch(() => setCatalogComponents([]));
    void materialService.getAll()
      .then((rows) => {
        const map = new Map<string, { consumer: number; trader: number; cost: number }>();
        for (const row of rows) {
          const id = String(row.id || '').trim();
          if (!id) continue;
          map.set(id, {
            consumer: Number(row.defaultSalePrice || 0),
            trader: Number(row.traderSalePrice || 0),
            // Purchase cost stays off the wire for non-pricing roles.
            cost: canManagePricing ? Number(row.purchaseCost || 0) : 0,
          });
        }
        setMaterialSaleById(map);
      })
      .catch(() => setMaterialSaleById(new Map()));
  }, [canManagePricing]);
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
  const stats = useMemo(() => {
    const totalItems = parts.length;
    const totalStock = parts.reduce((sum, part) => sum + Number(stockMap.get(part.id || '') || 0), 0);
    const lowStockCount = parts.filter((part) => Number(stockMap.get(part.id || '') || 0) <= Number(part.minStock || 0)).length;
    return { totalItems, totalStock, lowStockCount };
  }, [parts, stockMap]);

  const increaseStock = async (part: RepairSparePart) => {
    if (!canManageParts) {
      toast.error('ليس لديك صلاحية تعديل المخزون.');
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
    if (!canManageParts) {
      toast.error('ليس لديك صلاحية تعديل المخزون.');
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

  const deletePart = async (part: RepairSparePart) => {
    if (!canManageParts) {
      toast.error('ليس لديك صلاحية حذف القطعة.');
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
    <div className="erp-ds-clean space-y-4 px-1 sm:space-y-5 sm:px-0" dir={dir}>
      <PageHeader
        title="مخزون قطع الغيار"
        subtitle="إدارة أصناف الفرع مرتبطة بماستر داتا المنتجات والمكونات المشتركة في المشروع."
        icon="inventory_2"
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
            {canManagePricing && (
              <Link to={withTenantPath(tenantSlug, '/manufacturing/materials')}>
                <Button variant="secondary" size="sm">تسعير القطع (الماستر)</Button>
              </Link>
            )}
          </div>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">عدد الأصناف</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold sm:text-3xl">{stats.totalItems}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">إجمالي الكمية بالمخزون</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold sm:text-3xl">{stats.totalStock}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">أصناف منخفضة المخزون</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold sm:text-3xl ${stats.lowStockCount > 0 ? 'text-amber-600' : ''}`}>{stats.lowStockCount}</p>
          </CardContent>
        </Card>
      </div>

      {!branchId && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
          {canManageAllBranches
            ? 'اختر فرعًا أولًا لإدارة المخزون.'
            : 'لا يوجد فرع صيانة مرتبط بالمستخدم الحالي.'}
        </div>
      )}
      {branchId && !activeWarehouseId && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
          هذا الفرع لا يملك مخزنًا مرتبطًا بعد. أنشئ فرعًا جديدًا أو اربط مخزنًا يدويًا للفرع الحالي.
        </div>
      )}
      <Card>
        <SmartFilterBar
          pageId="spare-parts-inventory"
          searchPlaceholder="ابحث بالاسم أو الكود أو التصنيف..."
          searchValue={search}
          onSearchChange={setSearch}
          extra={
            <>
              {canManageParts && (
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
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 flex-wrap">
          <div>
            <CardTitle>جدول المخزون</CardTitle>
            <CardDescription>
              {canManageParts
                ? 'للإدارة: إضافة صنف، زيادة/نقص الجرد، وحذف الصنف عند رصيد صفر. الرصيد ينقص مع الصرف ويزيد باستلام التموين.'
                : 'عرض الأرصدة فقط. الرصيد ينقص مع صرف الطلبات ويزيد عند استلام التموين من المركزي.'}
            </CardDescription>
          </div>
          {canManageParts && (
            <div className="flex items-center gap-2 flex-wrap">
              {unlinkedPartsCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={linkingCatalog || !branchId}
                  onClick={() => void linkUnlinkedPartsToCatalog()}
                >
                  {linkingCatalog ? 'جاري الربط...' : `ربط بالماستر داتا (${unlinkedPartsCount})`}
                </Button>
              )}
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
                onCreated={() => load({ force: true })}
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="-mx-1 overflow-x-auto rounded border sm:mx-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">القطعة</th>
                  <th className="p-2 text-right">الكود</th>
                  {viewMode === 'dense' && <th className="hidden p-2 text-right md:table-cell">التصنيف</th>}
                  {viewMode === 'dense' && <th className="hidden p-2 text-right md:table-cell">الوحدة</th>}
                  {viewMode === 'dense' && <th className="hidden p-2 text-right lg:table-cell">الكتالوج</th>}
                  <th className="p-2 text-right">الرصيد</th>
                  <th className="p-2 text-right">الحد الأدنى</th>
                  {viewMode === 'dense' && <th className="hidden p-2 text-right lg:table-cell">مستهلك</th>}
                  {viewMode === 'dense' && <th className="hidden p-2 text-right lg:table-cell">تاجر</th>}
                  {viewMode === 'dense' && canManagePricing && <th className="hidden p-2 text-right xl:table-cell">تكلفة</th>}
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {visibleParts.map((part) => {
                  const qty = stockMap.get(part.id || '') || 0;
                  const isLow = qty <= Number(part.minStock || 0);
                  const isLinked = Boolean(
                    String(part.materialId || '').trim() || String(part.rawMaterialId || '').trim(),
                  );
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
                  const costPrice = canManagePricing ? Number(prices?.cost || 0) : 0;
                  return (
                    <tr key={part.id} className="border-t">
                      <td className="p-2">{part.name}</td>
                      <td className="p-2">{part.code}</td>
                      {viewMode === 'dense' && <td className="hidden p-2 md:table-cell">{part.category || '—'}</td>}
                      {viewMode === 'dense' && <td className="hidden p-2 md:table-cell">{part.unit || '—'}</td>}
                      {viewMode === 'dense' && (
                        <td className="hidden p-2 lg:table-cell">
                          <Badge variant={isLinked ? 'secondary' : 'outline'}>
                            {isLinked ? 'مرتبط' : 'غير مرتبط'}
                          </Badge>
                        </td>
                      )}
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
                      {viewMode === 'dense' && canManagePricing && (
                        <td className="hidden p-2 font-mono tabular-nums xl:table-cell">
                          {costPrice > 0 ? costPrice.toFixed(2) : '—'}
                        </td>
                      )}
                      <td className="p-2">
                        <ErpStatusBadge
                          label={isLow ? 'منخفض' : 'جيد'}
                          type={repairStockLevelChipType(isLow)}
                        />
                      </td>
                      <td className="p-2">
                        {canManageParts ? (
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
                      colSpan={
                        viewMode === 'dense'
                          ? (canManagePricing ? 12 : 11)
                          : 6
                      }
                    >
                      لا توجد قطع مطابقة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {canViewJobs && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">طلبات الصيانة للفرع</CardTitle>
              <CardDescription>
                الأوامر المفتوحة على فرع المخزن الحالي — افتح الأمر للصرف من داخل الصيانة.
              </CardDescription>
            </div>
            <Link to={withTenantPath(tenantSlug, '/repair/jobs')}>
              <Button variant="outline" size="sm">كل الطلبات</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {!branchId ? (
              <p className="text-sm text-muted-foreground">اختر فرعًا لعرض الطلبات.</p>
            ) : jobsLoading ? (
              <p className="text-sm text-muted-foreground">جاري التحميل…</p>
            ) : branchJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد طلبات صيانة مفتوحة لهذا الفرع.</p>
            ) : (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-right">الطلب</th>
                      <th className="p-2 text-right">الحالة</th>
                      <th className="p-2 text-right">العميل</th>
                      <th className="p-2 text-right">الجهاز</th>
                      <th className="p-2 text-right">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchJobs.map((job) => (
                      <tr key={job.id} className="border-t">
                        <td className="p-2 font-medium">
                          {job.receiptNo || job.id}
                        </td>
                        <td className="p-2">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="p-2">{job.customerName || '—'}</td>
                        <td className="p-2">
                          {[job.productName || job.deviceType, job.deviceBrand, job.deviceModel]
                            .filter(Boolean)
                            .join(' — ') || '—'}
                        </td>
                        <td className="p-2">
                          <Link to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}>
                            <Button variant="outline" size="sm">فتح</Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <CreateRepairReplenishmentModal
        open={replenishModalOpen}
        onOpenChange={setReplenishModalOpen}
        toWarehouseId={activeWarehouseId}
        parts={parts}
        onCreated={() => void load({ force: true })}
      />
      <LowStockAlert open={lowStock.isOpen} onOpenChange={(open) => { if (!open) lowStock.dismiss(); }} entries={lowStock.lowStockEntries} />
    </div>
  );
};

export default SparePartsInventory;
