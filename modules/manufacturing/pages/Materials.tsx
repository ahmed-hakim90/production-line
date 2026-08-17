import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { MaterialCategoryTreeSelect } from '../components/MaterialCategoryTreeSelect';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsMoreActionsMenu } from '@/modules/dashboards/components/OpsMoreActionsMenu';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ManagedModalPortal } from '@/components/modal-manager/ManagedModalPortal';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { usePermission } from '@/utils/permissions';
import { useResourcePermission } from '@/utils/useResourcePermission';
import { useQueryClient } from '@tanstack/react-query';
import { manufacturingQueryKeys, useMaterialMutations } from '../hooks/useMaterials';
import { useCursorPagination } from '@/hooks/useCursorPagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { normalizeFirestoreSearch } from '@/lib/firestoreSearch';
import {
  MATERIAL_TYPE_LABELS,
  MATERIAL_UNIT_LABELS,
  conversionRateFromWeightPerPiece,
  isWeightMaterialUnit,
  materialPurchaseCostPerBaseUnit,
  type Material,
  type MaterialType,
  type MaterialUnit,
  weightPerPieceFromConversionRate,
} from '../types';
import { isMaterialAvailableForSpareParts } from '../utils/isMaterialAvailableForSpareParts';
import {
  isMaterialSpareVisible,
  matchingMaterialIds,
  materialMatchesListFilters,
  mergePageSelection,
  pageSelectionState,
  toggleIdSelection,
  type MaterialListFilters,
  type MaterialManufacturedFilter,
  type MaterialSpareFilter,
  type MaterialStatusFilter,
} from '../lib/materialListFilters';
import { manufacturingMigrationService } from '../services/manufacturingMigrationService';
import {
  parseCatalogMaterialGap,
  type CatalogMaterialGap,
} from '@/modules/catalog/lib/catalogDrilldown';
import {
  BOM_UPSERT_PATHS,
  MANUFACTURING_OPERATION_KEYS,
  MATERIAL_CREATE_PATHS,
  MATERIAL_UPDATE_PATHS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';
import { formatMigrationError } from '../lib/migrationErrors';
import { isDuplicateEntityCodeError, materialService } from '../services/materialService';
import { materialCategoryService } from '../services/materialCategoryService';
import { MATERIAL_CATEGORY_CODE_REQUIRED } from '../lib/materialCode';
import { formatCategoryBreadcrumb } from '@/modules/catalog/lib/categoryTree';
import { useAppStore } from '@/store/useAppStore';
import { roleService } from '@/modules/system/services/roleService';
import { getExportImportPageControl } from '@/utils/exportImportControls';
import { exportManufacturingMaterials } from '@/utils/exportExcel';
import { downloadMaterialsTemplate } from '@/utils/downloadTemplates';
import {
  orderMaterialImportRowsForSave,
  parseMaterialsExcel,
  toMaterialCreateData,
  toMaterialUpdateData,
  type MaterialImportResult,
} from '@/utils/importMaterials';
import { decideMaterialImportSave } from '@/utils/importSaveDecision';
import { useJobsStore, isBackgroundJobCancelled } from '@/components/background-jobs/useJobsStore';
import { ArrowDown, ArrowUp, ChevronsUpDown, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  MaterialSparePartsPricingPanel,
  buildSparePartsPricingUpdate,
} from '../components/MaterialSparePartsPricingPanel';
import { materialShowsSparePartsPricing } from '../lib/materialSparePartsPricing';
import { repairPartsPricingService } from '../../repair/services/repairPartsPricingService';
import { normalizeRepairSalePrice } from '../../repair/utils/sparePartPricing';

const BULK_SPARE_UPDATE_CHUNK = 8;
const IMPORT_PREVIEW_LIMIT = 80;

const arNum = (n: number) =>
  n.toLocaleString('ar-EG', {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

type SortKey = 'code' | 'name' | 'type' | 'purchaseCost' | 'wastePercent';
type StatusFilter = MaterialStatusFilter;
type ManufacturedFilter = MaterialManufacturedFilter;
type MaterialsPageSize = 20 | 50;
type MaterialSource = 'internal' | 'external';

const EMPTY_FORM = {
  code: '',
  name: '',
  categoryId: null as string | null,
  type: 'raw_material' as MaterialType,
  baseUnit: 'piece' as MaterialUnit,
  purchaseUnit: '',
  conversionRate: 1,
  purchaseCost: 0,
  defaultSalePrice: 0,
  traderSalePrice: 0,
  wastePercent: 0,
  isManufacturedInternally: false,
  availableForSpareParts: false,
  isActive: true,
};

const TYPE_BADGE: Record<MaterialType, 'info' | 'warning' | 'muted' | 'success'> = {
  raw_material: 'info',
  semi_finished: 'warning',
  consumable: 'muted',
  packaging: 'success',
};

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/70" />;
  return dir === 'asc' ? (
    <ArrowUp className="h-3.5 w-3.5 text-primary" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 text-primary" />
  );
}

export const Materials: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const materialsPerms = useResourcePermission('materials');
  const location = useLocation();
  const canView = materialsPerms.canView;
  const canManage = materialsPerms.canManage || materialsPerms.canAction('manage');
  const canManagePricing = can('repair.pricing.manage');
  const userRoleId = useAppStore((s) => s.userRoleId);
  const applyRole = useAppStore((s) => s._applyRole);
  const fetchRoles = useAppStore((s) => s.fetchRoles);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const rawProducts = useAppStore((s) => s._rawProducts);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);
  const setPanelHidden = useJobsStore((s) => s.setPanelHidden);
  const setPanelMinimized = useJobsStore((s) => s.setPanelMinimized);
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'manufacturingMaterials'),
    [exportImportSettings],
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;
  const canImportFromPage = can('import') && pageControl.importEnabled && canManage;
  const materialCreatePageEnabled = isOperationPathEnabled(
    systemSettings,
    MANUFACTURING_OPERATION_KEYS.materialCreate,
    MATERIAL_CREATE_PATHS.materialsPage,
  );
  const materialUpdatePageEnabled = isOperationPathEnabled(
    systemSettings,
    MANUFACTURING_OPERATION_KEYS.materialUpdate,
    MATERIAL_UPDATE_PATHS.materialsPage,
  );
  const materialImportCreateEnabled = isOperationPathEnabled(
    systemSettings,
    MANUFACTURING_OPERATION_KEYS.materialCreate,
    MATERIAL_CREATE_PATHS.materialsImport,
  );
  const materialImportUpdateEnabled = isOperationPathEnabled(
    systemSettings,
    MANUFACTURING_OPERATION_KEYS.materialUpdate,
    MATERIAL_UPDATE_PATHS.materialsImport,
  );
  const manufacturingMigrationEnabled = isOperationPathEnabled(
    systemSettings,
    MANUFACTURING_OPERATION_KEYS.materialCreate,
    MATERIAL_CREATE_PATHS.migration,
  ) && isOperationPathEnabled(
    systemSettings,
    MANUFACTURING_OPERATION_KEYS.materialUpdate,
    MATERIAL_UPDATE_PATHS.migration,
  ) && isOperationPathEnabled(
    systemSettings,
    MANUFACTURING_OPERATION_KEYS.bomUpsert,
    BOM_UPSERT_PATHS.migration,
  );
  const queryClient = useQueryClient();
  const { create, update, remove } = useMaterialMutations();
  const importInputRef = useRef<HTMLInputElement>(null);
  const importSessionRef = useRef(0);
  const categoryCodeRequestRef = useRef(0);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<MaterialType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [manufacturedFilter, setManufacturedFilter] = useState<ManufacturedFilter>('all');
  const [gapFilter, setGapFilter] = useState<CatalogMaterialGap | ''>('');
  const [spareFilter, setSpareFilter] = useState<MaterialSpareFilter>('all');
  const [pageSize, setPageSize] = useState<MaterialsPageSize>(20);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectingAllMatching, setSelectingAllMatching] = useState(false);
  const [bulkSpareSaving, setBulkSpareSaving] = useState(false);
  const [catalogRows, setCatalogRows] = useState<Material[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [clientPage, setClientPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [materialSource, setMaterialSource] = useState<MaterialSource | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [weightPerPiece, setWeightPerPiece] = useState(0);
  const [migrating, setMigrating] = useState(false);
  const [disablingSpareVisibility, setDisablingSpareVisibility] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<MaterialImportResult | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  /** When true, existing codes are left as-is; only missing materials are created. */
  const [importSkipUpdates, setImportSkipUpdates] = useState(true);
  const [importExistingMaterials, setImportExistingMaterials] = useState<Material[]>([]);
  const debouncedSearch = useDebouncedValue(search, 350);
  const usesCatalog = catalogRows !== null;
  const needsCatalog = spareFilter !== 'all' || Boolean(gapFilter);
  const materialPager = useCursorPagination<Material, NonNullable<Awaited<ReturnType<typeof materialService.listPaged>>['nextCursor']>>({
    enabled: !usesCatalog,
    queryKey: JSON.stringify({
      search: normalizeFirestoreSearch(debouncedSearch),
      typeFilter,
      statusFilter,
      manufacturedFilter,
      pageSize,
    }),
    loadPage: (cursor) => materialService.listPaged({
      pageSize,
      cursor,
      search: debouncedSearch,
      type: typeFilter === 'all' ? undefined : typeFilter,
      isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
      isManufacturedInternally: manufacturedFilter === 'all' ? undefined : manufacturedFilter === 'internal',
    }),
  });
  const rows = materialPager.items;
  const refetch = materialPager.refresh;
  const sourceRows = catalogRows ?? rows;
  const isLoading = catalogLoading || (!usesCatalog && materialPager.loading);
  const effectivePurchaseUnit = form.purchaseUnit || form.baseUnit;
  const usesWeightPerPiece =
    form.baseUnit === 'piece' && isWeightMaterialUnit(effectivePurchaseUnit);
  const effectiveConversionRate = usesWeightPerPiece
    ? conversionRateFromWeightPerPiece(weightPerPiece)
    : Number(form.conversionRate);
  const estimatedBaseUnitCost = materialPurchaseCostPerBaseUnit({
    purchaseCost: form.purchaseCost,
    conversionRate: effectiveConversionRate,
  });

  const listFilters = useMemo<MaterialListFilters>(() => ({
    search,
    typeFilter,
    statusFilter,
    manufacturedFilter,
    gapFilter,
    spareFilter,
  }), [search, typeFilter, statusFilter, manufacturedFilter, gapFilter, spareFilter]);

  const filtered = useMemo(
    () => sourceRows.filter((row) => materialMatchesListFilters(row, listFilters)),
    [sourceRows, listFilters],
  );

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'code' || sortKey === 'name') {
        cmp = String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), 'ar', {
          numeric: true,
          sensitivity: 'base',
        });
      } else if (sortKey === 'type') {
        cmp = MATERIAL_TYPE_LABELS[a.type].localeCompare(MATERIAL_TYPE_LABELS[b.type], 'ar');
      } else if (sortKey === 'purchaseCost' || sortKey === 'wastePercent') {
        cmp = Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const catalogTotalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safeClientPage = Math.min(clientPage, catalogTotalPages);
  const paged = usesCatalog
    ? sorted.slice((safeClientPage - 1) * pageSize, safeClientPage * pageSize)
    : sorted;
  const matchingIds = useMemo(
    () => matchingMaterialIds(sorted, listFilters),
    [sorted, listFilters],
  );
  const pageIds = useMemo(
    () => paged.map((row) => row.id).filter((id): id is string => Boolean(id)),
    [paged],
  );
  const pageSelection = pageSelectionState(pageIds, selectedIds);
  const allPageSelected = pageSelection === 'all';
  const somePageSelected = pageSelection === 'some';
  const moreMatchingThanPage = matchingIds.length > pageIds.length;
  const bulkBusy = disablingSpareVisibility || bulkSpareSaving || selectingAllMatching || migrating || catalogLoading;

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const all = await materialService.getAll();
      setCatalogRows(all);
      return all;
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const refreshVisibleList = useCallback(async () => {
    if (catalogRows) {
      await loadCatalog();
      return;
    }
    await refetch();
  }, [catalogRows, loadCatalog, refetch]);

  useEffect(() => {
    if (!needsCatalog || catalogRows) return;
    void loadCatalog();
  }, [needsCatalog, catalogRows, loadCatalog]);

  useEffect(() => {
    setSelectedIds(new Set());
    setClientPage(1);
  }, [typeFilter, statusFilter, manufacturedFilter, gapFilter, spareFilter, debouncedSearch]);

  useEffect(() => {
    setClientPage(1);
  }, [pageSize]);

  const toggleSelectAllPage = () => {
    setSelectedIds((prev) => mergePageSelection(prev, pageIds, !allPageSelected));
  };

  const toggleRowSelection = (id: string) => {
    setSelectedIds((prev) => toggleIdSelection(prev, id));
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setMaterialSource(null);
    setSelectedCategoryId(null);
    setGeneratedCode('');
    setCodeLoading(false);
    setWeightPerPiece(0);
    setShowForm(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') !== 'create') return;
    if (!canManage) return;
    openCreate();
    navigate('/manufacturing/materials', { replace: true });
  }, [location.search, canManage, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const type = String(params.get('type') || '').trim();
    if (type && type in MATERIAL_TYPE_LABELS) {
      setTypeFilter(type as MaterialType);
    }
    const gap = parseCatalogMaterialGap(params.get('gap'));
    if (gap) setGapFilter(gap);
  }, [location.search]);

  const openEdit = (row: Material) => {
    setEditing(row);
    setMaterialSource(row.isManufacturedInternally ? 'internal' : 'external');
    setSelectedCategoryId(row.categoryId ?? null);
    setForm({
      code: row.code,
      name: row.name,
      categoryId: row.categoryId ?? null,
      type: row.type,
      baseUnit: row.baseUnit,
      purchaseUnit: row.purchaseUnit ?? '',
      conversionRate: Number(row.conversionRate ?? 1),
      purchaseCost: Number(row.purchaseCost ?? 0),
      defaultSalePrice: normalizeRepairSalePrice(row.defaultSalePrice),
      traderSalePrice: normalizeRepairSalePrice(row.traderSalePrice),
      wastePercent: Number(row.wastePercent ?? 0),
      isManufacturedInternally: Boolean(row.isManufacturedInternally),
      availableForSpareParts: row.availableForSpareParts === true,
      isActive: row.isActive !== false,
    });
    setGeneratedCode(row.code);
    setCodeLoading(false);
    setWeightPerPiece(
      row.baseUnit === 'piece' && isWeightMaterialUnit(row.purchaseUnit || row.baseUnit)
        ? weightPerPieceFromConversionRate(row.conversionRate)
        : 0,
    );
    setShowForm(true);
  };

  const handleMaterialSourceChange = (source: MaterialSource) => {
    setMaterialSource(source);
    setForm((current) => ({
      ...current,
      isManufacturedInternally: source === 'internal',
      type: source === 'internal' && current.type === 'raw_material'
        ? 'semi_finished'
        : current.type,
      purchaseUnit: source === 'internal' ? '' : (current.purchaseUnit || current.baseUnit),
      conversionRate: source === 'internal' ? 1 : current.conversionRate,
      purchaseCost: source === 'internal' ? 0 : current.purchaseCost,
      wastePercent: source === 'internal' ? 0 : current.wastePercent,
    }));
    if (source === 'internal') setWeightPerPiece(0);
  };

  const handleFormCategoryChange = async (categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
    setForm((current) => ({ ...current, categoryId }));
    if (editing || !categoryId) {
      setGeneratedCode(editing?.code || '');
      setCodeLoading(false);
      return;
    }

    const requestId = categoryCodeRequestRef.current + 1;
    categoryCodeRequestRef.current = requestId;
    setGeneratedCode('');
    setCodeLoading(true);
    try {
      const nextCode = await materialService.peekNextCode(categoryId);
      if (categoryCodeRequestRef.current !== requestId) return;
      setGeneratedCode(nextCode);
      if (!nextCode) {
        toast.error('الفئة المختارة لا تحتوي كوداً. أضف كود الفئة أولاً.');
      }
    } catch {
      if (categoryCodeRequestRef.current === requestId) {
        toast.error('تعذر تجهيز كود المادة. حاول مرة أخرى.');
      }
    } finally {
      if (categoryCodeRequestRef.current === requestId) setCodeLoading(false);
    }
  };

  const handlePurchaseUnitChange = (nextUnit: MaterialUnit) => {
    const previousUnit = effectivePurchaseUnit;
    if (form.baseUnit === 'piece' && isWeightMaterialUnit(previousUnit)) {
      if (previousUnit === 'kg' && nextUnit === 'gram') {
        setWeightPerPiece((current) => current * 1000);
      } else if (previousUnit === 'gram' && nextUnit === 'kg') {
        setWeightPerPiece((current) => current / 1000);
      }
    }
    setForm((current) => ({ ...current, purchaseUnit: nextUnit }));
  };

  const handleSave = async () => {
    if (editing ? !materialUpdatePageEnabled : !materialCreatePageEnabled) {
      toast.error('هذا المسار متوقف من إعدادات النظام.');
      return;
    }
    if (!canManage) return;
    if (!materialSource) {
      toast.error('حدد أولاً هل المادة شراء خارجي أم تُصنع داخلياً.');
      return;
    }
    const normalizedName = form.name.trim();
    if (!normalizedName) {
      toast.error('اسم المادة مطلوب.');
      return;
    }
    if (!editing && !selectedCategoryId) {
      toast.error('اختر فئة المادة لتوليد الكود تلقائياً.');
      return;
    }
    if (!editing && !generatedCode) {
      toast.error('تعذر توليد الكود من الفئة المختارة.');
      return;
    }
    const isInternallyManufactured = materialSource === 'internal';
    if (!isInternallyManufactured && usesWeightPerPiece && weightPerPiece <= 0) {
      toast.error(`وزن القطعة بالـ${MATERIAL_UNIT_LABELS[effectivePurchaseUnit as MaterialUnit]} يجب أن يكون أكبر من صفر.`);
      return;
    }
    if (!isInternallyManufactured && !usesWeightPerPiece && Number(form.conversionRate) <= 0) {
      toast.error('معامل التحويل يجب أن يكون أكبر من صفر.');
      return;
    }
    if (!isInternallyManufactured && (Number(form.purchaseCost) < 0 || Number(form.wastePercent) < 0)) {
      toast.error('التكلفة ونسبة الهالك لا يمكن أن تكونا أقل من صفر.');
      return;
    }
    if (
      canManagePricing
      && (Number(form.defaultSalePrice) < 0 || Number(form.traderSalePrice) < 0)
    ) {
      toast.error('أسعار البيع لا يمكن أن تكون أقل من صفر.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        categoryId: selectedCategoryId,
        code: editing ? form.code.trim() : '',
        name: normalizedName,
        isManufacturedInternally: isInternallyManufactured,
        purchaseUnit: isInternallyManufactured ? undefined : effectivePurchaseUnit,
        conversionRate: isInternallyManufactured ? 1 : effectiveConversionRate,
        purchaseCost: isInternallyManufactured ? 0 : Number(form.purchaseCost),
        wastePercent: isInternallyManufactured ? 0 : Number(form.wastePercent),
      };
      // Sale prices are never written via client material CRUD — callable only.
      delete (payload as { defaultSalePrice?: number }).defaultSalePrice;
      delete (payload as { traderSalePrice?: number }).traderSalePrice;

      let savedId = editing?.id || '';
      if (editing?.id) {
        await update.mutateAsync({
          id: editing.id,
          data: payload,
          path: MATERIAL_UPDATE_PATHS.materialsPage,
        });
      } else {
        savedId = await create.mutateAsync({
          data: payload,
          path: MATERIAL_CREATE_PATHS.materialsPage,
        });
      }

      const codeForPricing = editing
        ? form.code.trim()
        : (generatedCode || form.code.trim());
      const pricingTarget = {
        id: savedId || editing?.id,
        type: form.type,
        code: codeForPricing,
        isActive: form.isActive,
        availableForSpareParts: form.availableForSpareParts,
        defaultSalePrice: editing?.defaultSalePrice,
        traderSalePrice: editing?.traderSalePrice,
        purchaseCost: editing?.purchaseCost ?? payload.purchaseCost,
      } as Material;

      if (
        canManagePricing
        && savedId
        && materialShowsSparePartsPricing(pricingTarget)
      ) {
        const pricingUpdate = buildSparePartsPricingUpdate({
          material: {
            ...pricingTarget,
            id: savedId,
            code: codeForPricing,
            purchaseCost: Number(payload.purchaseCost),
          },
          consumer: Number(form.defaultSalePrice),
          trader: Number(form.traderSalePrice),
          cost: Number(payload.purchaseCost),
        });
        if (pricingUpdate) {
          await repairPartsPricingService.update([pricingUpdate]);
        }
      }

      await refreshVisibleList();
      setShowForm(false);
      toast.success(editing ? 'تم تحديث المادة.' : 'تمت إضافة المادة.');
    } catch (e) {
      console.error('[materials] save failed', {
        type: e instanceof Error ? e.name : 'unknown',
        code: String((e as { code?: unknown })?.code || ''),
      });
      if (isDuplicateEntityCodeError(e)) {
        toast.error('الكود مستخدم بالفعل. أعد اختيار الفئة لتحديث الكود المقترح.');
      } else if (e instanceof Error && e.message === MATERIAL_CATEGORY_CODE_REQUIRED) {
        toast.error('الفئة المختارة لا تحتوي كوداً صالحاً.');
      } else {
        toast.error('تعذر حفظ المادة. راجع البيانات وحاول مرة أخرى.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: Material) => {
    if (!canManage || !row.id) return;
    if (!window.confirm(`حذف المادة "${row.name}"؟`)) return;
    try {
      await remove.mutateAsync(row.id);
      await refreshVisibleList();
      toast.success('تم حذف المادة.');
    } catch {
      toast.error('تعذر حذف المادة.');
    }
  };

  const handleMigrate = async () => {
    if (!canManage || !manufacturingMigrationEnabled) return;
    if (!window.confirm('ترحيل المواد الخام وربط المنتجات إلى النظام الجديد؟')) return;
    setMigrating(true);
    try {
      const result = await manufacturingMigrationService.migrateTenant();
      await fetchRoles();
      if (userRoleId) {
        const freshRole = await roleService.getById(userRoleId);
        if (freshRole) applyRole(freshRole);
      }
      const permNote =
        result.permissionsPatched > 0
          ? ' تم تحديث صلاحيات الأدوار — أعد تحميل الصفحة إن لم تظهر القوائم الجديدة.'
          : '';
      toast.success(
        `تم الترحيل: ${result.materialsCreated} مادة جديدة، ${result.materialsSkipped} موجودة مسبقاً، ${result.bomsCreated} BOM، ${result.bomItemsCreated} سطر BOM، ${result.stockItemsUpdated} رصيد مخزون.${permNote}`,
      );
      await refreshVisibleList();
    } catch (e) {
      toast.error(formatMigrationError(e));
    } finally {
      setMigrating(false);
    }
  };

  const toastSpareVisibilityResult = (
    available: boolean,
    updatedCount: number,
    failedCount: number,
  ) => {
    const actionLabel = available ? 'تفعيل' : 'إيقاف';
    if (updatedCount === 0 && failedCount > 0) {
      toast.error(`تعذر ${actionLabel} ظهور المواد في قطع الغيار.`);
      return;
    }
    if (failedCount > 0) {
      toast.error(`تم ${actionLabel} ${updatedCount} مادة، وفشل ${failedCount}.`);
      return;
    }
    if (updatedCount === 0) {
      toast.success(available ? 'لا توجد مواد لإظهارها في قطع الغيار.' : 'لا توجد مواد مفعّلة لقطع الغيار.');
      return;
    }
    toast.success(
      available
        ? `تم تفعيل ${updatedCount} مادة في قطع الغيار.`
        : `تم إيقاف ${updatedCount} مادة من قطع الغيار.`,
    );
  };

  const applySparePartsVisibility = async (ids: string[], available: boolean) => {
    const useJob = ids.length >= 20;
    const jobId = useJob
      ? addJob({
          fileName: available ? 'تفعيل قطع الغيار' : 'إيقاف قطع الغيار',
          jobType: 'Materials Spare Visibility',
          totalRows: ids.length,
          startedBy: userDisplayName || 'Current User',
        })
      : null;
    if (jobId) {
      setPanelHidden(false);
      setPanelMinimized(false);
      startJob(jobId, available ? 'جاري التفعيل في قطع الغيار...' : 'جاري الإيقاف من قطع الغيار...');
    }
    let updatedCount = 0;
    let failedCount = 0;
    let cancelled = false;
    const succeeded = new Set<string>();
    for (let i = 0; i < ids.length; i += BULK_SPARE_UPDATE_CHUNK) {
      if (jobId && isBackgroundJobCancelled(jobId)) {
        cancelled = true;
        failJob(jobId, 'Cancelled by user', 'Cancelled');
        break;
      }
      const chunk = ids.slice(i, i + BULK_SPARE_UPDATE_CHUNK);
      const results = await Promise.allSettled(
        chunk.map((id) => materialService.update(
          id,
          { availableForSpareParts: available },
          { path: MATERIAL_UPDATE_PATHS.materialsPage },
        )),
      );
      results.forEach((result, index) => {
        const id = chunk[index];
        if (result.status === 'fulfilled' && id) {
          updatedCount += 1;
          succeeded.add(id);
        } else {
          failedCount += 1;
        }
      });
      if (jobId) {
        setJobProgress(jobId, {
          processedRows: updatedCount + failedCount,
          totalRows: ids.length,
          statusText: `تم ${updatedCount + failedCount} من ${ids.length}`,
        });
      }
    }
    const idSet = succeeded;
    setCatalogRows((prev) => {
      if (!prev) return prev;
      return prev.map((row) => (
        row.id && idSet.has(row.id)
          ? { ...row, availableForSpareParts: available }
          : row
      ));
    });
    await queryClient.invalidateQueries({ queryKey: manufacturingQueryKeys.materials });
    if (!usesCatalog) await refetch();
    if (jobId && !cancelled) {
      completeJob(jobId, {
        addedRows: updatedCount,
        failedRows: failedCount,
        statusText: available
          ? `تم تفعيل ${updatedCount} مادة`
          : `تم إيقاف ${updatedCount} مادة`,
      });
    }
    return { updatedCount, failedCount, cancelled };
  };

  /**
   * One-shot cleanup: old catalog defaulted spare visibility ON, so manufacturing
   * components flooded central spare vouchers. Operator re-enables real spare parts after.
   */
  const handleDisableSpareVisibilityForAll = async () => {
    if (!canManage) return;
    if (
      !window.confirm(
        'سيتم إيقاف «تظهر في قطع الغيار» لكل المواد المفعّلة حاليًا.\n\nبعدها فعّل يدويًا قطع الغيار الحقيقية فقط من تعديل المادة (أو استيراد نعم).\nمكونات التصنيع تختفي من إذن المركزي.\n\nمتابعة؟',
      )
    ) {
      return;
    }
    setDisablingSpareVisibility(true);
    try {
      const all = await materialService.getAll();
      const targets = all
        .filter((row) => row.id && isMaterialAvailableForSpareParts(row))
        .map((row) => row.id as string);
      const { updatedCount, failedCount } = await applySparePartsVisibility(targets, false);
      toastSpareVisibilityResult(false, updatedCount, failedCount);
      setSelectedIds(new Set());
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تنفيذ التصحيح.');
    } finally {
      setDisablingSpareVisibility(false);
    }
  };

  const handleSelectAllMatchingFilters = async () => {
    if (!canManage || selectingAllMatching) return;
    setSelectingAllMatching(true);
    try {
      const all = catalogRows ?? await loadCatalog();
      const ids = matchingMaterialIds(all, listFilters);
      if (ids.length === 0) {
        toast.success('لا توجد مواد مطابقة للفلاتر الحالية.');
        return;
      }
      setSelectedIds(new Set(ids));
      toast.success(`تم تحديد ${ids.length} مادة مطابقة للفلاتر عبر كل الصفحات.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديد المواد المطابقة.');
    } finally {
      setSelectingAllMatching(false);
    }
  };

  const handleBulkSpareVisibility = async (available: boolean) => {
    if (!canManage || bulkSpareSaving || selectedIds.size === 0) return;
    const count = selectedIds.size;
    const confirmed = window.confirm(
      available
        ? `تفعيل ظهور ${count} مادة محددة في قطع الغيار / الصيانة؟`
        : `إيقاف ظهور ${count} مادة محددة من قطع الغيار؟\nالمواد التصنيعية لن تظهر في إذن المركزي بعد ذلك.`,
    );
    if (!confirmed) return;
    setBulkSpareSaving(true);
    try {
      const { updatedCount, failedCount, cancelled } = await applySparePartsVisibility(
        [...selectedIds],
        available,
      );
      if (cancelled) {
        toast.error('تم إلغاء التحديث.');
        return;
      }
      toastSpareVisibilityResult(available, updatedCount, failedCount);
      if (failedCount === 0) setSelectedIds(new Set());
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث ظهور قطع الغيار.');
    } finally {
      setBulkSpareSaving(false);
    }
  };

  const productCodeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of rawProducts) {
      if (p.id && p.code) map.set(p.id, p.code);
    }
    return map;
  }, [rawProducts]);

  const handleExportExcel = async () => {
    if (!canExportFromPage) return;
    const exportRows = await materialService.getAll();
    if (exportRows.length === 0) return;
    exportManufacturingMaterials(
      exportRows.map((r) => ({
        code: r.code,
        name: r.name,
        categoryName: r.categoryName || '',
        type: MATERIAL_TYPE_LABELS[r.type],
        baseUnit: MATERIAL_UNIT_LABELS[r.baseUnit],
        purchaseUnit: (() => {
          const pu = String(r.purchaseUnit || '').trim();
          if (!pu) return MATERIAL_UNIT_LABELS[r.baseUnit];
          return MATERIAL_UNIT_LABELS[pu as MaterialUnit] || pu;
        })(),
        conversionRate: Number(r.conversionRate ?? 1) || 1,
        purchaseCost: Number(r.purchaseCost ?? 0),
        wastePercent: Number(r.wastePercent ?? 0),
        minStock: Number(r.minStock ?? 0),
        isManufacturedInternally: Boolean(r.isManufacturedInternally),
        manufacturedProductCode: r.manufacturedProductId
          ? productCodeById.get(r.manufacturedProductId) || ''
          : '',
        availableForSpareParts: r.availableForSpareParts === true,
        isActive: r.isActive !== false,
      })),
    );
  };

  const resetImportModalState = () => {
    importSessionRef.current += 1;
    setImportResult(null);
    setImportParsing(false);
    setImportFileName('');
    setImportSkipUpdates(true);
    setImportExistingMaterials([]);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const openImportModal = () => {
    if (!canImportFromPage || importSaving) return;
    resetImportModalState();
    setShowImportModal(true);
  };

  const closeImportModal = () => {
    if (importSaving) return;
    resetImportModalState();
    setShowImportModal(false);
  };

  const handleImportFile = async (file: File) => {
    if (!canImportFromPage) return;
    const session = ++importSessionRef.current;
    setImportParsing(true);
    setImportResult(null);
    setImportFileName(file.name);
    setShowImportModal(true);
    try {
      const [categories, existingMaterials] = await Promise.all([
        materialCategoryService.getAll(),
        materialService.getAll(),
      ]);
      if (importSessionRef.current !== session) return;
      setImportExistingMaterials(existingMaterials);
      const categoryOpts = categories
        .filter((c) => c.id)
        .map((c) => ({
          id: c.id!,
          name: c.name,
          breadcrumb: formatCategoryBreadcrumb(categories, c.id) || c.name,
        }));
      const result = await parseMaterialsExcel(file, existingMaterials, {
        categories: categoryOpts,
        products: rawProducts
          .filter((p) => p.id && p.code)
          .map((p) => ({ id: p.id!, code: p.code })),
      });
      if (importSessionRef.current !== session) return;
      setImportResult(result);
    } catch (e) {
      if (importSessionRef.current !== session) return;
      setImportResult({
        rows: [],
        totalRows: 0,
        validCount: 0,
        errorCount: 0,
        newCount: 0,
        updateCount: 0,
        fileErrors: [e instanceof Error ? e.message : 'تعذر قراءة الملف'],
      });
    } finally {
      if (importSessionRef.current === session) {
        setImportParsing(false);
      }
    }
  };

  const handleConfirmImport = async () => {
    if (!canImportFromPage || !importResult) return;
    const validRows = importResult.rows.filter((r) => r.errors.length === 0);
    if (!validRows.length) return;
    if (validRows.some((row) => row.action === 'create') && !materialImportCreateEnabled) {
      toast.error('مسار إنشاء المواد بالاستيراد متوقف من إعدادات النظام.');
      return;
    }
    if (
      !importSkipUpdates &&
      validRows.some((row) => decideMaterialImportSave(row) === 'update') &&
      !materialImportUpdateEnabled
    ) {
      toast.error('مسار تحديث المواد بالاستيراد متوقف من إعدادات النظام.');
      return;
    }

    let orderedRows;
    try {
      orderedRows = orderMaterialImportRowsForSave(validRows, importExistingMaterials);
    } catch {
      toast.error('تعذر ترتيب تحديثات الأكواد. راجع أخطاء الملف وأعد المحاولة.');
      return;
    }

    const materialsSnapshot = [...importExistingMaterials];
    const skipUpdates = importSkipUpdates;
    // Skip rows are counted up front — job progress only tracks writes (create/update).
    const writeRows = orderedRows.filter(
      (row) => decideMaterialImportSave(row, { skipUpdates }) !== 'skip',
    );
    const skippedUpFront = orderedRows.length - writeRows.length;
    const fileLabel = importFileName || 'materials.xlsx';
    const jobId = addJob({
      fileName: fileLabel,
      jobType: 'Materials Import',
      totalRows: writeRows.length,
      startedBy: userDisplayName || 'Current User',
    });

    setImportSaving(true);
    setPanelHidden(false);
    setPanelMinimized(false);
    startJob(
      jobId,
      skipUpdates
        ? `إنشاء الجديد فقط (${writeRows.length}) — تخطي ${skippedUpFront} موجود`
        : 'جاري الحفظ...',
    );
    setShowImportModal(false);
    setImportResult(null);
    setImportFileName('');

    let created = 0;
    let updated = 0;
    let skipped = skippedUpFront;
    let failed = 0;
    let done = 0;

    for (const row of writeRows) {
      if (isBackgroundJobCancelled(jobId)) {
        failJob(jobId, 'Cancelled by user', 'Cancelled');
        toast.error(
          `تم الإلغاء بعد: ${created} جديد، ${updated} تحديث، ${skipped} تخطي${failed ? `، ${failed} فشل` : ''}.`,
        );
        await refreshVisibleList();
        setImportSaving(false);
        return;
      }
      try {
        const decision = decideMaterialImportSave(row, { skipUpdates });
        if (decision === 'update' && row.matchedId) {
          const existing = materialsSnapshot.find((m) => m.id === row.matchedId);
          if (!existing) {
            failed += 1;
          } else {
            await update.mutateAsync({
              id: row.matchedId,
              data: toMaterialUpdateData(row, existing),
              path: MATERIAL_UPDATE_PATHS.materialsImport,
            });
            updated += 1;
          }
        } else if (decision === 'create') {
          await create.mutateAsync({
            data: toMaterialCreateData(row),
            path: MATERIAL_CREATE_PATHS.materialsImport,
          });
          created += 1;
        } else {
          skipped += 1;
        }
      } catch {
        failed += 1;
      }
      done += 1;
      setJobProgress(jobId, {
        processedRows: done,
        totalRows: writeRows.length,
        statusText: skipUpdates
          ? `إنشاء جديد ${done}/${writeRows.length}`
          : 'جاري الحفظ...',
        status: 'processing',
      });
    }

    const addedRows = created + updated;
    if (addedRows === 0 && failed > 0 && skipped === 0) {
      failJob(jobId, 'All rows failed during save', 'Failed');
      toast.error('فشل استيراد المواد.');
    } else {
      completeJob(jobId, {
        addedRows,
        failedRows: failed,
        skippedRows: skipped,
        statusText: `اكتمل: ${created} جديد، ${updated} تحديث، ${skipped} تخطي${failed ? `، ${failed} فشل` : ''}`,
      });
      toast.success(
        `تم الاستيراد: ${created} جديد، ${updated} تحديث، ${skipped} تخطي${failed ? `، ${failed} فشل` : ''}.`,
      );
    }
    await refreshVisibleList();
    setImportSaving(false);
  };

  if (!canView) {
    return <p className="p-8 text-center text-muted-foreground">لا توجد صلاحية لعرض المواد</p>;
  }

  const showPricingCols = canManagePricing;
  const colCount = 10 + (showPricingCols ? 2 : 0) + (canManage ? 2 : 0);
  const formPricingCode = editing ? form.code : generatedCode;
  const showFormPricingFields = canManagePricing && materialShowsSparePartsPricing({
    type: form.type,
    code: formPricingCode,
    isActive: form.isActive,
    availableForSpareParts: form.availableForSpareParts,
  });

  return (
    <ModuleOpsPageShell
      eyebrow="المواد التصنيعية"
      rangeLabel="الخطوة 1 من الاستيراد — ثم المنتجات — ثم المكونات. تسعير قطع الغيار (المكونات) من هنا"
      actions={(
        <>
          {canManage ? (
            <Button type="button" size="sm" onClick={openCreate}>
              إضافة مادة
            </Button>
          ) : null}
          <OpsMoreActionsMenu
            items={[
              {
                label: 'تصدير بيانات المواد (للاستيراد)',
                icon: 'download',
                group: 'تصدير',
                hidden: !(canExportFromPage && sorted.length > 0),
                onClick: () => { void handleExportExcel(); },
              },
              {
                label: 'تحميل قالب بيانات المواد',
                icon: 'file_download',
                group: 'استيراد',
                hidden: !canImportFromPage,
                onClick: () => downloadMaterialsTemplate(),
              },
              {
                label: 'رفع/تحديث بيانات المواد',
                icon: 'upload',
                group: 'استيراد',
                hidden: !canImportFromPage,
                disabled: importSaving,
                onClick: () => openImportModal(),
              },
              {
                label: disablingSpareVisibility ? 'جاري الإيقاف...' : 'إيقاف الكل من قطع الغيار',
                icon: 'warning',
                group: 'صيانة',
                hidden: !canManage,
                disabled: bulkBusy,
                onClick: () => { void handleDisableSpareVisibilityForAll(); },
              },
              {
                label: migrating ? 'جاري الترحيل...' : 'ترحيل من النظام القديم',
                icon: 'refresh',
                group: 'صيانة',
                hidden: !canManage,
                disabled: bulkBusy,
                onClick: () => { void handleMigrate(); },
              },
            ]}
          />
        </>
      )}
    >

      {canManagePricing ? (
        <OpsDashPanel title="تسعير قطع الغيار (ماستر المكونات)" accent="plans">
          <p className="mb-3 text-xs text-muted-foreground">
            سعر المستهلك والجملة والتكلفة تُحفظ على المكوّن فقط — لا تسعير من شاشات الصيانة.
          </p>
          <MaterialSparePartsPricingPanel
            materials={sourceRows}
            canManagePricing={canManagePricing}
            onUpdated={() => { void refreshVisibleList(); }}
          />
        </OpsDashPanel>
      ) : null}

      <OpsDashPanel title="كتالوج المواد" accent="production" bodyClassName="p-0">
        <SmartFilterBar
      pageId="materials-list"
          searchPlaceholder="بحث بالاسم أو الكود أو الفئة"
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'type',
              placeholder: 'كل الأنواع',
              options: (Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((t) => ({
                value: t,
                label: MATERIAL_TYPE_LABELS[t],
              })),
            },
            {
              key: 'status',
              placeholder: 'كل الحالات',
              options: [
                { value: 'active', label: 'نشط' },
                { value: 'inactive', label: 'موقوف' },
              ],
            },
            {
              key: 'manufactured',
              placeholder: 'كل التصنيع',
              options: [
                { value: 'internal', label: 'يُصنع داخلياً' },
                { value: 'external', label: 'شراء خارجي' },
              ],
            },
            {
              key: 'gap',
              placeholder: 'فجوة الماستر',
              options: [
                { value: 'no_category', label: 'بلا فئة' },
                { value: 'no_cost', label: 'بلا تكلفة شراء' },
              ],
            },
            {
              key: 'spare',
              placeholder: 'قطع الغيار',
              options: [
                { value: 'visible', label: 'تظهر في قطع الغيار' },
                { value: 'hidden', label: 'لا تظهر في قطع الغيار' },
              ],
            },
          ]}
          quickFilterValues={{
            type: typeFilter,
            status: statusFilter,
            manufactured: manufacturedFilter,
            gap: gapFilter || 'all',
            spare: spareFilter,
          }}
          onQuickFilterChange={(key, value) => {
            if (key === 'type') setTypeFilter(value as MaterialType | 'all');
            if (key === 'status') setStatusFilter(value as StatusFilter);
            if (key === 'manufactured') setManufacturedFilter(value as ManufacturedFilter);
            if (key === 'gap') setGapFilter(value === 'all' ? '' : (value as CatalogMaterialGap));
            if (key === 'spare') setSpareFilter(value === 'all' ? 'all' : (value as MaterialSpareFilter));
          }}
          className="mb-0 border-0 rounded-none"
        />

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/20 bg-primary/5 px-4 py-3">
            <span className="text-sm font-bold text-primary">
              {selectedIds.size > 0
                ? `${selectedIds.size} مادة محددة — التحديد يبقى عند تغيير الصفحة`
                : 'حدّد مواد من أكثر من صفحة ثم أوقف ظهورها في قطع الغيار'}
            </span>
            {allPageSelected && moreMatchingThanPage ? (
              <span className="text-xs text-muted-foreground">
                تم تحديد مواد هذه الصفحة فقط ({pageIds.length}).
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={allPageSelected && moreMatchingThanPage ? 'default' : 'outline'}
              disabled={bulkBusy}
              onClick={() => void handleSelectAllMatchingFilters()}
            >
              {selectingAllMatching
                ? 'جاري التحديد...'
                : usesCatalog
                  ? `تحديد كل المطابق (${matchingIds.length})`
                  : 'تحديد كل المطابق للفلاتر (كل الصفحات)'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkBusy || selectedIds.size === 0}
              onClick={() => void handleBulkSpareVisibility(false)}
            >
              {bulkSpareSaving ? 'جاري التحديث...' : 'إيقاف المحدد من قطع الغيار'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkBusy || selectedIds.size === 0}
              onClick={() => void handleBulkSpareVisibility(true)}
            >
              تفعيل المحدد في قطع الغيار
            </Button>
            {selectedIds.size > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={bulkBusy}
                onClick={() => setSelectedIds(new Set())}
              >
                إلغاء التحديد
              </Button>
            ) : null}
          </div>
        )}

        <div className="erp-mobile-card-list p-2">
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={`mat-m-sk-${i}`} className="h-28 w-full rounded-xl" />
            ))}
          {!isLoading && sorted.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              لا توجد مواد مطابقة للبحث أو الفلاتر.
            </p>
          )}
          {!isLoading &&
            paged.map((row) => {
              const active = row.isActive !== false;
              return (
                <div
                  key={`m-${row.id}`}
                  className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm ${
                    row.id && selectedIds.has(row.id) ? 'ring-1 ring-primary/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      {canManage && row.id ? (
                        <input
                          type="checkbox"
                          className="mt-1 cursor-pointer"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleRowSelection(row.id!)}
                          aria-label={`تحديد ${row.name}`}
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="font-mono text-xs tabular-nums text-[var(--color-text-muted)]">
                          {row.code}
                        </p>
                        <p className="truncate text-sm font-bold text-[var(--color-text)]">{row.name}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          {row.categoryName || '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge label={MATERIAL_TYPE_LABELS[row.type]} type={TYPE_BADGE[row.type]} />
                      <StatusBadge
                        label={isMaterialSpareVisible(row) ? 'تظهر في قطع الغيار' : 'مخفية من قطع الغيار'}
                        type={isMaterialSpareVisible(row) ? 'success' : 'muted'}
                      />
                      <StatusBadge label={active ? 'نشط' : 'موقوف'} type={active ? 'success' : 'danger'} />
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-1 gap-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-[10px] text-[var(--color-text-muted)]">تكلفة الشراء</dt>
                      <dd className="font-semibold tabular-nums">
                        {arNum(Number(row.purchaseCost ?? 0))}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.type === 'semi_finished' && row.id && (
                      <Button
                        type="button"
                        variant="outline"
                        className="!px-2 !py-1 text-xs"
                        onClick={() => navigate(`/manufacturing/materials/${row.id}`)}
                      >
                        عرض قائمة المواد (BOM)
                      </Button>
                    )}
                    {canManage && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="me-1 h-3.5 w-3.5" />
                          تعديل
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="!px-2 !py-1 text-xs text-destructive"
                          onClick={() => void handleDelete(row)}
                        >
                          <Trash2 className="me-1 h-3.5 w-3.5" />
                          حذف
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        <div className="erp-desktop-table erp-table-wrap overflow-x-auto erp-table-scroll">
          <table className="erp-table w-full min-w-[1080px] border-collapse text-right">
            <thead className="erp-thead">
              <tr>
                {canManage && (
                  <th className="erp-th w-10 text-center">
                    <input
                      type="checkbox"
                      className="cursor-pointer"
                      checked={allPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = somePageSelected;
                      }}
                      onChange={toggleSelectAllPage}
                      aria-label="تحديد صفوف هذه الصفحة"
                      title="تحديد صفوف هذه الصفحة — التحديد يبقى عند تغيير الصفحة"
                    />
                  </th>
                )}
                {(
                  [
                    { key: 'code' as const, label: 'الكود', sortable: true },
                    { key: 'name' as const, label: 'المادة', sortable: true },
                    { key: null, label: 'الفئة', sortable: false },
                    { key: 'type' as const, label: 'النوع', sortable: true },
                    { key: null, label: 'الوحدة', sortable: false },
                    { key: 'purchaseCost' as const, label: 'تكلفة الشراء', sortable: true },
                    ...(showPricingCols
                      ? [
                          { key: null, label: 'سعر المستهلك', sortable: false },
                          { key: null, label: 'سعر الجملة', sortable: false },
                        ] as const
                      : []),
                    { key: 'wastePercent' as const, label: 'هالك %', sortable: true },
                    { key: null, label: 'التصنيع', sortable: false },
                    { key: null, label: 'قطع الغيار', sortable: false },
                    { key: null, label: 'الحالة', sortable: false },
                  ] as const
                ).map((col) => (
                  <th key={col.label} className="erp-th">
                    {col.sortable && col.key ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium"
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
                {canManage && <th className="erp-th text-center">إجراء</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`mat-skel-${i}`}>
                    <td className="px-4 py-3" colSpan={colCount}>
                      <Skeleton className="h-5 w-full rounded-md" />
                    </td>
                  </tr>
                ))}

              {!isLoading && sorted.length === 0 && (
                <tr>
                  <td className="px-4 py-12 text-center text-muted-foreground" colSpan={colCount}>
                    لا توجد مواد مطابقة للبحث أو الفلاتر.
                  </td>
                </tr>
              )}

              {!isLoading &&
                paged.map((row) => {
                  const active = row.isActive !== false;
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-[var(--color-bg)]/70/40${row.id && selectedIds.has(row.id) ? ' bg-primary/5' : ''}`}
                    >
                      {canManage && (
                        <td className="px-4 py-3 text-center">
                          {row.id ? (
                            <input
                              type="checkbox"
                              className="cursor-pointer"
                              checked={selectedIds.has(row.id)}
                              onChange={() => toggleRowSelection(row.id!)}
                              aria-label={`تحديد ${row.name}`}
                            />
                          ) : null}
                        </td>
                      )}
                      <td className="px-4 py-3 font-mono text-sm tabular-nums">{row.code}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-[var(--color-text)]">{row.name}</p>
                        {row.type === 'semi_finished' && row.id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="mt-0.5"
                            onClick={() => navigate(`/manufacturing/materials/${row.id}`)}
                          >
                            عرض قائمة المواد (BOM)
                          </Button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {row.categoryName || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={MATERIAL_TYPE_LABELS[row.type]} type={TYPE_BADGE[row.type]} />
                      </td>
                      <td className="px-4 py-3 text-sm">{MATERIAL_UNIT_LABELS[row.baseUnit]}</td>
                      <td className="px-4 py-3 text-sm tabular-nums font-semibold">
                        {arNum(Number(row.purchaseCost ?? 0))}
                      </td>
                      {showPricingCols ? (
                        <>
                          <td className="px-4 py-3 text-sm tabular-nums">
                            {materialShowsSparePartsPricing(row)
                              ? arNum(normalizeRepairSalePrice(row.defaultSalePrice))
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm tabular-nums">
                            {materialShowsSparePartsPricing(row)
                              ? arNum(normalizeRepairSalePrice(row.traderSalePrice))
                              : '—'}
                          </td>
                        </>
                      ) : null}
                      <td className="px-4 py-3 text-sm tabular-nums text-center">
                        {arNum(Number(row.wastePercent ?? 0))}
                      </td>
                      <td className="px-4 py-3">
                        {row.isManufacturedInternally ? (
                          <StatusBadge label="داخلي" type="warning" />
                        ) : (
                          <StatusBadge label="شراء" type="muted" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={isMaterialSpareVisible(row) ? 'تظهر' : 'مخفية'}
                          type={isMaterialSpareVisible(row) ? 'success' : 'muted'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={active ? 'نشط' : 'موقوف'} type={active ? 'success' : 'danger'} />
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="تعديل"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="حذف"
                              onClick={() => void handleDelete(row)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {!isLoading && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-4">
            <div className="flex items-center gap-1 py-2">
              <span className="text-xs text-muted-foreground">صفوف الصفحة</span>
              {([20, 50] as const).map((size) => (
                <Button
                  key={size}
                  type="button"
                  size="sm"
                  variant={pageSize === size ? 'default' : 'outline'}
                  className="h-8 px-2.5"
                  disabled={catalogLoading || materialPager.loading}
                  onClick={() => setPageSize(size)}
                >
                  {size}
                </Button>
              ))}
            </div>
            {usesCatalog ? (
              <DataPaginationFooter
                page={safeClientPage}
                totalPages={catalogTotalPages}
                totalItems={sorted.length}
                onPageChange={setClientPage}
                loading={catalogLoading}
                itemLabel="مادة"
                className="min-w-0 flex-1 border-0 bg-transparent px-0"
              />
            ) : (
              <DataPaginationFooter
                page={materialPager.page}
                itemCount={sorted.length}
                hasPrevious={materialPager.hasPrevious}
                hasNext={materialPager.hasNext}
                onPrevious={materialPager.previous}
                onNext={() => { void materialPager.next(); }}
                loading={materialPager.loading}
                itemLabel="مادة"
                className="min-w-0 flex-1 border-0 bg-transparent px-0"
              />
            )}
          </div>
        )}
      </OpsDashPanel>

      <Dialog
        open={showForm && canManage}
        onOpenChange={(open) => {
          if (!open && !saving) {
            categoryCodeRequestRef.current += 1;
            setShowForm(false);
          }
        }}
      >
        <DialogContent dir="rtl" className="max-w-2xl p-0">
          <DialogHeader className="border-b px-5 py-4 text-right sm:text-right">
            <DialogTitle>{editing ? 'تعديل مادة' : 'إضافة مادة تصنيعية'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'حدد مصدر المادة ثم حدّث البيانات المطلوبة لهذا المصدر فقط.'
                : 'ابدأ بتحديد هل المادة شراء خارجي أم تُصنع داخلياً، ثم أكمل الحقول المطلوبة فقط.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-5 pb-1">
            <section className="space-y-3" aria-labelledby="material-source-heading">
              <div>
                <h4 id="material-source-heading" className="text-sm font-semibold">
                  مصدر المادة *
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  يحدد اختيارك الحقول المطلوبة وطريقة احتساب التكلفة.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={materialSource === 'external'}
                  onClick={() => handleMaterialSourceChange('external')}
                  className={`rounded-lg border p-4 text-right transition-colors ${
                    materialSource === 'external'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className="block text-sm font-semibold">شراء خارجي</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    تُشترى من مورد، لذلك تحتاج وحدة شراء ومعامل تحويل وتكلفة.
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={materialSource === 'internal'}
                  onClick={() => handleMaterialSourceChange('internal')}
                  className={`rounded-lg border p-4 text-right transition-colors ${
                    materialSource === 'internal'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className="block text-sm font-semibold">تُصنع داخلياً</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    تكلفتها تأتي من قائمة المواد BOM، ولن نطلب بيانات شراء.
                  </span>
                </button>
              </div>
            </section>

            {materialSource ? (
              <>
            <section className="space-y-3" aria-labelledby="material-identity-heading">
              <h4 id="material-identity-heading" className="text-sm font-semibold">
                تعريف المادة
              </h4>
              <div className="space-y-1.5">
                <Label>فئة المادة {!editing && '*'}</Label>
                <MaterialCategoryTreeSelect
                  value={selectedCategoryId}
                  onChange={(id) => void handleFormCategoryChange(id)}
                />
                <p className="text-xs text-muted-foreground">
                  تحدد الفئة بادئة الكود وتسلسله، مثل INJ-0001.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="material-code">
                    {editing ? 'كود المادة *' : 'كود المادة (تلقائي)'}
                  </Label>
                  <Input
                    id="material-code"
                    dir="ltr"
                    value={editing ? form.code : generatedCode}
                    readOnly={!editing}
                    disabled={codeLoading}
                    placeholder={codeLoading ? '...' : '—'}
                    onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))}
                    className={!editing ? 'font-mono bg-muted/60' : 'font-mono'}
                  />
                  {!editing && (
                    <p className="text-xs text-muted-foreground">
                      الكود الظاهر معاينة؛ يتم حجز الرقم النهائي بأمان عند الحفظ.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="material-name">اسم المادة *</Label>
                  <Input
                    id="material-name"
                    autoFocus
                    placeholder="مثال: فلانوس نيلون V7 سم حقن"
                    value={form.name}
                    onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t pt-4" aria-labelledby="material-units-heading">
              <h4 id="material-units-heading" className="text-sm font-semibold">
                التصنيف والوحدات
              </h4>
              <div className={`grid gap-3 ${materialSource === 'external' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <div className="space-y-1.5">
                  <Label htmlFor="material-type">نوع المادة *</Label>
                  <select
                    id="material-type"
                    className="h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
                    value={form.type}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        type: e.target.value as MaterialType,
                      }))
                    }
                  >
                    {(Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((type) => (
                      <option key={type} value={type}>
                        {MATERIAL_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="material-base-unit">الوحدة الأساسية *</Label>
                  <select
                    id="material-base-unit"
                    className="h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
                    value={form.baseUnit}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        baseUnit: e.target.value as MaterialUnit,
                      }))
                    }
                  >
                    {(Object.keys(MATERIAL_UNIT_LABELS) as MaterialUnit[]).map((unit) => (
                      <option key={unit} value={unit}>
                        {MATERIAL_UNIT_LABELS[unit]}
                      </option>
                    ))}
                  </select>
                </div>
                {materialSource === 'external' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="material-purchase-unit">وحدة الشراء</Label>
                    <select
                      id="material-purchase-unit"
                      className="h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
                      value={form.purchaseUnit || form.baseUnit}
                      onChange={(e) => handlePurchaseUnitChange(e.target.value as MaterialUnit)}
                    >
                      {(Object.keys(MATERIAL_UNIT_LABELS) as MaterialUnit[]).map((unit) => (
                        <option key={unit} value={unit}>
                          {MATERIAL_UNIT_LABELS[unit]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {materialSource === 'internal' && (
                <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  بعد الحفظ، افتح «قائمة المواد (BOM)» لتعريف الخامات والكميات اللازمة لإنتاج وحدة واحدة.
                </p>
              )}
            </section>

            {materialSource === 'external' && (
            <section className="space-y-3 border-t pt-4" aria-labelledby="material-cost-heading">
              <h4 id="material-cost-heading" className="text-sm font-semibold">
                الشراء والتكلفة
              </h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="material-purchase-cost">تكلفة وحدة الشراء</Label>
                  <Input
                    id="material-purchase-cost"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.purchaseCost}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        purchaseCost: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                {showFormPricingFields ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="material-consumer-price">سعر المستهلك</Label>
                      <Input
                        id="material-consumer-price"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={form.defaultSalePrice}
                        onChange={(e) =>
                          setForm((current) => ({
                            ...current,
                            defaultSalePrice: Number(e.target.value),
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="material-trader-price">سعر الجملة</Label>
                      <Input
                        id="material-trader-price"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={form.traderSalePrice}
                        onChange={(e) =>
                          setForm((current) => ({
                            ...current,
                            traderSalePrice: Number(e.target.value),
                          }))
                        }
                      />
                    </div>
                  </>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="material-conversion-rate">
                    {usesWeightPerPiece
                      ? `وزن القطعة (${MATERIAL_UNIT_LABELS[effectivePurchaseUnit as MaterialUnit]}) *`
                      : 'معامل التحويل *'}
                  </Label>
                  <Input
                    id="material-conversion-rate"
                    type="number"
                    inputMode="decimal"
                    min="0.0001"
                    step="any"
                    showZero
                    value={usesWeightPerPiece ? weightPerPiece : form.conversionRate}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (usesWeightPerPiece) {
                        setWeightPerPiece(value);
                      } else {
                        setForm((current) => ({ ...current, conversionRate: value }));
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {usesWeightPerPiece
                      ? `أدخل وزن القطعة مباشرة، مثال: 0.170 ${MATERIAL_UNIT_LABELS[effectivePurchaseUnit as MaterialUnit]}.`
                      : 'عدد الوحدات الأساسية داخل وحدة الشراء.'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="material-waste-percent">نسبة الهالك %</Label>
                  <Input
                    id="material-waste-percent"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={form.wastePercent}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        wastePercent: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              {usesWeightPerPiece && weightPerPiece > 0 && Number(form.purchaseCost) >= 0 && (
                <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
                  تكلفة القطعة التقديرية:{' '}
                  <strong className="tabular-nums">{arNum(estimatedBaseUnitCost)}</strong>
                </p>
              )}
            </section>
            )}

            <div className="space-y-3 border-t pt-4">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="material-available-for-spare-parts"
                  checked={form.availableForSpareParts === true}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      availableForSpareParts: checked === true,
                    }))
                  }
                />
                <div className="space-y-1">
                  <Label htmlFor="material-available-for-spare-parts">تظهر في قطع الغيار / الصيانة</Label>
                  <p className="text-xs text-muted-foreground">
                    افتراضيًا مغلقة للمواد الجديدة. فعّلها فقط لقطع الغيار الحقيقية (يُفرض من السيرفر).
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="material-active"
                  checked={form.isActive}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, isActive: checked === true }))
                  }
                />
                <div className="space-y-1">
                  <Label htmlFor="material-active">المادة نشطة</Label>
                  <p className="text-xs text-muted-foreground">المواد الموقوفة لا تظهر في الاختيارات التشغيلية.</p>
                </div>
              </div>
            </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                اختر مصدر المادة أولاً لإظهار الحقول المناسبة فقط.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t px-5 py-4 sm:space-x-0">
            <Button
              type="button"
              disabled={saving || codeLoading || !materialSource}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                'حفظ المادة'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setShowForm(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showImportModal && (
        <ManagedModalPortal>
        <div
          className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="materials-import-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-card shadow-lg">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 id="materials-import-title" className="text-lg font-bold">رفع/تحديث بيانات المواد</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ماستر المواد فقط — الربط بالمنتجات من شاشة المنتجات ← مكونات
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={importSaving}
                onClick={closeImportModal}
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleImportFile(file);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={importSaving || importParsing}
                  onClick={() => downloadMaterialsTemplate()}
                >
                  تحميل القالب
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={importSaving || importParsing}
                  onClick={() => importInputRef.current?.click()}
                >
                  {importFileName ? 'اختيار ملف آخر' : 'اختيار الملف'}
                </Button>
                {importFileName ? (
                  <span className="text-xs text-muted-foreground">{importFileName}</span>
                ) : null}
              </div>

              {!importParsing && !importResult ? (
                <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center">
                  <p className="text-sm font-medium">حمّل القالب أو اختر ملف Excel لمعاينة الصفوف قبل الحفظ.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    الصيغة: .xlsx / .xls — عمود «كود المادة» للمطابقة فقط ولا يُغيَّر عبر الاستيراد.
                  </p>
                </div>
              ) : null}

              {importParsing && (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  جاري قراءة الملف...
                </div>
              )}

              {!importParsing && importResult && importResult.totalRows === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {(importResult.fileErrors || []).join(' — ') || 'لا توجد صفوف صالحة في الملف.'}
                </p>
              )}

              {!importParsing && importResult && importResult.totalRows > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span>
                      الإجمالي: <strong>{importResult.totalRows}</strong>
                    </span>
                    {importResult.newCount > 0 && (
                      <span className="text-[rgb(var(--color-success))]">جديد: {importResult.newCount}</span>
                    )}
                    {importResult.updateCount > 0 && (
                      <span className={importSkipUpdates ? 'text-muted-foreground' : 'text-[rgb(var(--color-primary))]'}>
                        {importSkipUpdates
                          ? `تخطي تحديث: ${importResult.updateCount}`
                          : `تحديث: ${importResult.updateCount}`}
                      </span>
                    )}
                    {importResult.errorCount > 0 && (
                      <span className="text-destructive">أخطاء: {importResult.errorCount}</span>
                    )}
                  </div>
                  <label className="flex items-start gap-2 rounded border px-3 py-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={importSkipUpdates}
                      onChange={(e) => setImportSkipUpdates(e.target.checked)}
                      disabled={importSaving}
                    />
                    <span>
                      <span className="font-medium">تخطي التحديث — إنشاء الجديد فقط</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        المواد الموجودة بكودها تُترك كما هي، ويتسجّل فقط ما ليس في النظام.
                      </span>
                    </span>
                  </label>
                  {importResult.fileErrors && importResult.fileErrors.length > 0 && (
                    <ul className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {importResult.fileErrors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  )}
                  <div className="erp-table-wrap overflow-x-auto rounded border">
                    <table className="w-full min-w-[640px] text-right text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-2 py-2">صف</th>
                          <th className="px-2 py-2">إجراء</th>
                          <th className="px-2 py-2">الكود</th>
                          <th className="px-2 py-2">الاسم</th>
                          <th className="px-2 py-2">تغييرات / أخطاء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {importResult.rows.slice(0, IMPORT_PREVIEW_LIMIT).map((row) => (
                          <tr key={row.rowIndex} className={row.errors.length ? 'bg-destructive/5' : ''}>
                            <td className="px-2 py-1.5 tabular-nums">{row.rowIndex}</td>
                            <td className="px-2 py-1.5">
                              {row.action === 'create'
                                ? 'جديد'
                                : importSkipUpdates
                                  ? 'تخطي'
                                  : 'تحديث'}
                            </td>
                            <td className="px-2 py-1.5 font-mono">{row.code || '—'}</td>
                            <td className="px-2 py-1.5">{row.name || '—'}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {row.errors.length
                                ? row.errors.join('؛ ')
                                : row.changes?.length
                                  ? row.changes.join('، ')
                                  : 'بدون تغيير'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importResult.rows.length > IMPORT_PREVIEW_LIMIT ? (
                    <p className="text-[11px] text-muted-foreground">
                      عرض أول {IMPORT_PREVIEW_LIMIT} صف للمعاينة — عند الحفظ تُطبَّق كل الصفوف الصالحة.
                    </p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground">
                    عمود «كود المادة» للمطابقة فقط ولا يُغيَّر عبر الاستيراد. الأعمدة الفاضية لا تمس القيم الأصلية.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                disabled={importSaving}
                onClick={closeImportModal}
              >
                إلغاء
              </Button>
              {importResult && importResult.validCount > 0 && (
                <Button type="button" disabled={importSaving} onClick={() => void handleConfirmImport()}>
                  {importSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : importSkipUpdates ? (
                    `حفظ ${importResult.newCount} جديد${
                      importResult.updateCount > 0 ? ` (تخطي ${importResult.updateCount})` : ''
                    }`
                  ) : (
                    `حفظ ${
                      importResult.newCount > 0 && importResult.updateCount > 0
                        ? `${importResult.newCount} جديد + ${importResult.updateCount} تحديث`
                        : importResult.updateCount > 0
                          ? `تحديث ${importResult.updateCount}`
                          : `${importResult.newCount} جديد`
                    }`
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}
    </ModuleOpsPageShell>
  );
};
