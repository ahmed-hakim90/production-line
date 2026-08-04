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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import {
  REPAIR_JOB_STATUS_LABELS,
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairJob,
  type RepairSparePart,
  type RepairSparePartStock,
} from '../types';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { sparePartsService } from '../services/sparePartsService';
import { repairBranchService } from '../services/repairBranchService';
import { repairJobService } from '../services/repairJobService';
import { useLowStockAlert } from '../hooks/useLowStockAlert';
import { LowStockAlert } from '../components/LowStockAlert';
import { RepairReplenishmentRequestsPanel } from '../components/RepairReplenishmentRequestsPanel';
import {
  loadAllCatalogMaterials,
  loadProductComponents,
  type CatalogComponent,
} from '../../catalog/lib/productComponents';
import { planSparePartCatalogLinks } from '../utils/sparePartCatalogBackfill';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairSettings } from '../config/repairSettings';
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
  const [assignedBranchIds, setAssignedBranchIds] = useState<string[]>([]);
  const [branchJobs, setBranchJobs] = useState<RepairJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const userBranchIds = useMemo(
    () => Array.from(new Set([...resolveUserRepairBranchIds(user), ...assignedBranchIds])),
    [user, assignedBranchIds],
  );

  useEffect(() => {
    if (canManageAllBranches || !user?.id) {
      setAssignedBranchIds([]);
      return;
    }
    void repairBranchService.list().then((rows) => {
      const uid = String(user.id || '').trim();
      const eid = String(currentEmployee?.id || '').trim();
      const ids = rows
        .filter((branch) => {
          const t = branch.technicianIds || [];
          return (uid && t.includes(uid)) || (eid && t.includes(eid));
        })
        .map((branch) => branch.id || '')
        .filter(Boolean);
      setAssignedBranchIds(ids);
    });
  }, [canManageAllBranches, user?.id, currentEmployee?.id]);
  const branchId = selectedBranchId;
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [stock, setStock] = useState<RepairSparePartStock[]>([]);
  const products = useAppStore((s) => s._rawProducts);
  const [catalogComponents, setCatalogComponents] = useState<CatalogComponent[]>([]);
  const [bomComponents, setBomComponents] = useState<CatalogComponent[]>([]);
  const [form, setForm] = useState({
    sourceMode: 'all_materials' as 'product_bom' | 'all_materials',
    productId: '',
    materialId: '',
    unit: 'قطعة',
    minStock: String(repairSettings.defaults.defaultMinStock),
    defaultSalePrice: '',
  });
  useEffect(() => {
    setForm((prev) => ({ ...prev, minStock: String(repairSettings.defaults.defaultMinStock) }));
  }, [repairSettings.defaults.defaultMinStock]);

  const [isCreatePartModalOpen, setIsCreatePartModalOpen] = useState(false);
  const [linkingCatalog, setLinkingCatalog] = useState(false);
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
    void loadAllCatalogMaterials()
      .then(setCatalogComponents)
      .catch(() => setCatalogComponents([]));
  }, []);
  useEffect(() => {
    const productId = String(form.productId || '').trim();
    if (form.sourceMode !== 'product_bom' || !productId) {
      setBomComponents([]);
      return;
    }
    let cancelled = false;
    void loadProductComponents(productId)
      .then((rows) => {
        if (!cancelled) setBomComponents(rows);
      })
      .catch(() => {
        if (!cancelled) setBomComponents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.productId, form.sourceMode]);
  useEffect(() => {
    void repairBranchService.list().then((rows) => {
      setBranches(rows);
      if (!selectedBranchId && rows.length > 0) {
        const firstAllowed = canManageAllBranches
          ? rows[0]
          : rows.find((row) => row.id && userBranchIds.includes(String(row.id)));
        if (firstAllowed?.id) {
          setSelectedBranchId(String(firstAllowed.id));
        }
      }
    });
  }, [canManageAllBranches, selectedBranchId, userBranchIds]);
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

  const getNextSparePartCode = () => {
    const maxSerial = parts.reduce((max, part) => {
      const match = String(part.code || '').trim().toUpperCase().match(/^SP-(\d{3})$/);
      if (!match) return max;
      const current = Number(match[1] || 0);
      return Number.isFinite(current) ? Math.max(max, current) : max;
    }, 0);
    return `SP-${String(maxSerial + 1).padStart(3, '0')}`;
  };

  const selectableComponents = useMemo(() => {
    if (form.sourceMode === 'all_materials') return catalogComponents;
    return bomComponents;
  }, [bomComponents, catalogComponents, form.sourceMode]);

  const applyComponentSelection = (materialId: string) => {
    const selected = selectableComponents.find((row) => row.materialId === materialId);
    setForm((prev) => ({
      ...prev,
      materialId,
      unit: selected?.unitLabel || prev.unit || 'قطعة',
    }));
  };

  const createPart = async () => {
    if (!branchId) return;
    const selectedMaterial = selectableComponents.find(
      (material) => material.materialId === form.materialId,
    );
    if (!selectedMaterial) {
      toast.error('اختر مكونًا من الماستر داتا أولًا.');
      return;
    }
    const partName = String(selectedMaterial.materialName || '').trim();
    const materialId = String(selectedMaterial.materialId || '').trim();
    const partCode = getNextSparePartCode();
    const existing = parts.find((part) => {
      const linkedId = String(part.materialId || part.rawMaterialId || '').trim();
      if (materialId && linkedId && linkedId === materialId) return true;
      return String(part.name || '').trim().toLowerCase() === partName.toLowerCase();
    });
    if (existing) {
      toast.error('هذا المكون مضاف بالفعل كقطعة غيار.');
      return;
    }
    try {
      const sale = Number(form.defaultSalePrice || 0);
      await sparePartsService.createPart({
        branchId,
        name: partName,
        code: partCode,
        category: selectedMaterial.categoryName || 'مكونات منتج',
        unit: form.unit || selectedMaterial.unitLabel || 'قطعة',
        minStock: Number(form.minStock || 0),
        materialId,
        ...(form.sourceMode === 'product_bom' && form.productId
          ? { sourceProductId: form.productId }
          : {}),
        ...(selectedMaterial.itemType === 'legacy_raw' ? { rawMaterialId: materialId } : {}),
        ...(canManagePricing && Number.isFinite(sale) && sale > 0 ? { defaultSalePrice: sale } : {}),
      });
      toast.success('تمت إضافة القطعة.');
      setForm((prev) => ({
        ...prev,
        materialId: '',
        unit: 'قطعة',
        minStock: String(repairSettings.defaults.defaultMinStock),
        defaultSalePrice: '',
      }));
      setIsCreatePartModalOpen(false);
      await load({ force: true });
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إضافة القطعة.');
    }
  };

  const increaseStock = async (part: RepairSparePart) => {
    if (!canManageParts) {
      toast.error('ليس لديك صلاحية تعديل المخزون.');
      return;
    }
    if (!part.id || !branchId || !activeWarehouseId) return;
    const qty = Math.max(1, Number(increaseQty || 1));
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
    }
  };
  const decreaseStock = async (part: RepairSparePart) => {
    if (!canManageParts) {
      toast.error('ليس لديك صلاحية تعديل المخزون.');
      return;
    }
    if (!part.id || !branchId || !activeWarehouseId) return;
    const qty = Math.max(1, Number(increaseQty || 1));
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
        catalogComponents.length > 0 ? catalogComponents : await loadAllCatalogMaterials();
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
    <div className="space-y-4" dir={dir}>
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold">مخزون قطع الغيار</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  إدارة أصناف الفرع مرتبطة بماستر داتا المنتجات والمكونات المشتركة في المشروع.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(canManageAllBranches || branchOptions.length > 1) && (
                  <div className="w-[220px]">
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
                  <Button variant="outline">لوحة الصيانة</Button>
                </Link>
                {can('repairSpareIssues.view') && (
                  <Link to={withTenantPath(tenantSlug, '/repair/spare-issues')}>
                    <Button variant="outline">سندات الصرف</Button>
                  </Link>
                )}
                {canViewReplenishment && (
                  <Link to={withTenantPath(tenantSlug, '/repair/parts-replenishment')}>
                    <Button variant="outline">متابعة التموين</Button>
                  </Link>
                )}
                {canCreateReplenishment && (
                  <Button
                    type="button"
                    onClick={() => setReplenishModalOpen(true)}
                    disabled={!activeWarehouseId}
                  >
                    طلب تموين
                  </Button>
                )}
                {canManagePricing && (
                  <Link to={withTenantPath(tenantSlug, '/repair/parts-pricing')}>
                    <Button variant="secondary">تسعير القطع</Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">عدد الأصناف</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{stats.totalItems}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">إجمالي الكمية بالمخزون</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{stats.totalStock}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">أصناف منخفضة المخزون</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${stats.lowStockCount > 0 ? 'text-amber-600' : ''}`}>{stats.lowStockCount}</p>
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
      {canManageParts && (
        <div className="flex justify-end gap-2 flex-wrap">
          {unlinkedPartsCount > 0 && (
            <Button
              variant="outline"
              disabled={linkingCatalog || !branchId}
              onClick={() => void linkUnlinkedPartsToCatalog()}
            >
              {linkingCatalog ? 'جاري الربط...' : `ربط بالماستر داتا (${unlinkedPartsCount})`}
            </Button>
          )}
          <Dialog open={isCreatePartModalOpen} onOpenChange={setIsCreatePartModalOpen}>
            <DialogTrigger asChild>
              <Button>إضافة صنف جديد</Button>
            </DialogTrigger>
            <DialogContent dir={dir} className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>إضافة صنف جديد</DialogTitle>
                <DialogDescription>
                  القطع تُختار من كتالوج المكونات المشتركة للمشروع. إدارة الماستر داتا تتم من موديول التصنيع بواسطة المسؤولين فقط.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                <div className="xl:col-span-2">
                  <Label>مصدر المكون</Label>
                  <Select
                    value={form.sourceMode}
                    onValueChange={(value) =>
                      setForm((p) => ({
                        ...p,
                        sourceMode: value as 'product_bom' | 'all_materials',
                        materialId: '',
                        productId: value === 'all_materials' ? '' : p.productId,
                      }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product_bom">مكونات منتج (BOM)</SelectItem>
                      <SelectItem value="all_materials">كل المواد التصنيعية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.sourceMode === 'product_bom' && (
                  <div className="xl:col-span-2">
                    <Label>المنتج</Label>
                    <Select
                      value={form.productId}
                      onValueChange={(value) => setForm((p) => ({ ...p, productId: value, materialId: '' }))}
                    >
                      <SelectTrigger><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                      <SelectContent>
                        {products.filter((p) => p.id).map((product) => (
                          <SelectItem key={product.id} value={String(product.id)}>
                            {product.name} {product.model ? `- ${product.model}` : ''} {product.code ? `(${product.code})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="xl:col-span-2">
                  <Label>المكون</Label>
                  <Select
                    value={form.materialId}
                    onValueChange={applyComponentSelection}
                    disabled={form.sourceMode === 'product_bom' && !form.productId}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          form.sourceMode === 'product_bom' && !form.productId
                            ? 'اختر المنتج أولًا'
                            : selectableComponents.length === 0
                              ? 'لا توجد مكونات'
                              : 'اختر مكونًا'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableComponents.map((material) => (
                        <SelectItem key={material.materialId} value={material.materialId}>
                          {material.materialName}
                          {material.materialCode ? ` (${material.materialCode})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>الوحدة</Label><Input value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} /></div>
                <div><Label>الحد الأدنى</Label><Input type="number" value={form.minStock} onChange={(e) => setForm((p) => ({ ...p, minStock: e.target.value }))} /></div>
                {canManagePricing && (
                  <div>
                    <Label>سعر الاستخدام / البيع</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.defaultSalePrice}
                      onChange={(e) => setForm((p) => ({ ...p, defaultSalePrice: e.target.value }))}
                      placeholder="اختياري"
                    />
                  </div>
                )}
                <div className="xl:col-span-6 flex justify-end">
                  <Button onClick={createPart}>إضافة الصنف</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">الزيادة السريعة</Label>
                <Input type="number" min={1} value={increaseQty} onChange={(e) => setIncreaseQty(e.target.value)} className="h-[34px] w-[100px]" />
              </div>
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
        <CardHeader>
          <CardTitle>جدول المخزون</CardTitle>
          <CardDescription>يمكنك تحديث الرصيد بسرعة باستخدام زر الزيادة.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">القطعة</th>
                  <th className="p-2 text-right">الكود</th>
                  {viewMode === 'dense' && <th className="p-2 text-right">التصنيف</th>}
                  {viewMode === 'dense' && <th className="p-2 text-right">الوحدة</th>}
                  {viewMode === 'dense' && <th className="p-2 text-right">الكتالوج</th>}
                  <th className="p-2 text-right">الرصيد</th>
                  <th className="p-2 text-right">الحد الأدنى</th>
                  {viewMode === 'dense' && <th className="p-2 text-right">سعر الاستخدام</th>}
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
                  return (
                    <tr key={part.id} className="border-t">
                      <td className="p-2">{part.name}</td>
                      <td className="p-2">{part.code}</td>
                      {viewMode === 'dense' && <td className="p-2">{part.category || '—'}</td>}
                      {viewMode === 'dense' && <td className="p-2">{part.unit || '—'}</td>}
                      {viewMode === 'dense' && (
                        <td className="p-2">
                          <Badge variant={isLinked ? 'secondary' : 'outline'}>
                            {isLinked ? 'مرتبط' : 'غير مرتبط'}
                          </Badge>
                        </td>
                      )}
                      <td className="p-2 font-mono">{qty}</td>
                      <td className="p-2 font-mono">{part.minStock}</td>
                      {viewMode === 'dense' && (
                        <td className="p-2 font-mono">
                          {Number(part.defaultSalePrice) > 0 ? Number(part.defaultSalePrice).toFixed(2) : '—'}
                        </td>
                      )}
                      <td className="p-2">
                        <Badge variant={isLow ? 'destructive' : 'secondary'}>{isLow ? 'منخفض' : 'جيد'}</Badge>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {canManagePricing && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setPartPricingEdit(part);
                                setPricingForm({
                                  defaultSalePrice: String(part.defaultSalePrice ?? ''),
                                });
                              }}
                            >
                              تعديل السعر
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            iconName="add"
                            tone="submit"
                            onClick={() => increaseStock(part)}
                            disabled={!canManageParts}
                          >
                            +{Math.max(1, Number(increaseQty || 1))}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            iconName="remove"
                            tone="undo"
                            onClick={() => decreaseStock(part)}
                            disabled={!canManageParts}
                          >
                            -{Math.max(1, Number(increaseQty || 1))}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => setPartPendingDelete(part)} disabled={!canManageParts}>
                            حذف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleParts.length === 0 && (
                  <tr>
                    <td className="p-3 text-center text-muted-foreground" colSpan={viewMode === 'dense' ? 9 : 6}>
                      لا توجد قطع مطابقة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Dialog open={Boolean(partPricingEdit)} onOpenChange={(open) => !open && setPartPricingEdit(null)}>
        <DialogContent dir={dir} className="max-w-md">
          <DialogHeader>
            <DialogTitle>سعر الاستخدام / البيع</DialogTitle>
            <DialogDescription>
              سعر واحد للقطعة في مركز الصيانة. تكلفة الشراء لا تظهر ولا تُعدَّل من هنا.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {canManagePricing && (
              <div>
                <Label>سعر الاستخدام / البيع</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pricingForm.defaultSalePrice}
                  onChange={(e) => setPricingForm({ defaultSalePrice: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartPricingEdit(null)}>إلغاء</Button>
            <Button onClick={() => void savePartPricing()} disabled={!canManagePricing}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(partPendingDelete)} onOpenChange={(open) => !open && setPartPendingDelete(null)}>
        <DialogContent dir={dir} className="max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد حذف قطعة الغيار</DialogTitle>
            <DialogDescription>
              هل تريد حذف قطعة الغيار "{partPendingDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartPendingDelete(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={removePart}>حذف نهائي</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              <div className="rounded border overflow-x-auto">
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
                          {REPAIR_JOB_STATUS_LABELS[job.status] || job.status}
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

      <RepairReplenishmentRequestsPanel
        toWarehouseId={activeBranch?.warehouseId}
        parts={parts}
      />
      <LowStockAlert open={lowStock.isOpen} onOpenChange={(open) => { if (!open) lowStock.dismiss(); }} entries={lowStock.lowStockEntries} />
    </div>
  );
};

export default SparePartsInventory;
