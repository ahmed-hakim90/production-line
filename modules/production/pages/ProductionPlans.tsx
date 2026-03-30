import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Card, Badge, Button, KPIBox, LoadingSkeleton } from '../components/UI';
import { useAppStore, useShallowStore } from '../../../store/useAppStore';
import {
  formatNumber,
  formatCurrency,
  calculateAvgAssemblyTime,
  calculateDailyCapacity,
  calculateEstimatedDays,
  calculatePlanProgress,
  calculateProgressRatio,
  calculateTimeRatio,
  calculateSmartStatus,
  calculateForecastFinishDate,
  calculateRemainingDays,
  addDaysToDate,
  getTodayDateString,
} from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { reportService } from '@/modules/production/services/reportService';
import { productionPlanService } from '../services/productionPlanService';
import { exportProductionPlans } from '../../../utils/exportExcel';
import type { ProductionPlan, ProductionReport, PlanPriority, PlanStatus, SmartStatus } from '../../../types';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { PageHeader } from '../../../components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, SlidersHorizontal, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

// â”€â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_CONFIG: Record<PlanStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'neutral' | 'danger' }> = {
  planned: { label: 'مخطط', variant: 'info' },
  in_progress: { label: 'قيد التنفيذ', variant: 'warning' },
  completed: { label: 'مكتمل', variant: 'success' },
  paused: { label: 'متوقف', variant: 'neutral' },
  cancelled: { label: 'ملغي', variant: 'danger' },
};

const SMART_STATUS_CONFIG: Record<SmartStatus, { label: string; color: string }> = {
  on_track: { label: 'في المسار', color: 'text-emerald-600' },
  at_risk: { label: 'معرض للخطر', color: 'text-amber-600' },
  delayed: { label: 'متأخر', color: 'text-orange-600' },
  critical: { label: 'حرج', color: 'text-rose-600' },
  completed: { label: 'مكتمل', color: 'text-emerald-600' },
};

const PRIORITY_CONFIG: Record<PlanPriority, { label: string; color: string; bg: string }> = {
  low: { label: 'منخفضة', color: 'text-slate-500', bg: 'bg-[#f0f2f5]' },
  medium: { label: 'متوسطة', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  high: { label: 'عالية', color: 'text-amber-600', bg: 'bg-amber-50' },
  urgent: { label: 'عاجلة', color: 'text-rose-600', bg: 'bg-rose-50' },
};

type ViewMode = 'table' | 'kanban' | 'timeline';
type PlanSortField = '' | 'product' | 'line' | 'priority' | 'plannedQuantity' | 'progress' | 'startDate';
type SortDirection = 'asc' | 'desc';
type DateQuickFilter = 'all' | 'today' | 'this_month' | 'custom';
type GroupByField = 'none' | 'line' | 'product' | 'status' | 'priority';
type EnrichedPlan = ProductionPlan & {
  storedStatus: PlanStatus;
  effectiveStatus: PlanStatus;
  reportCount: number;
  produced: number;
  progressRatio: number;
  timeRatio: number;
  smartStatus: SmartStatus;
  forecastFinishDate: string;
  remainingDays: number;
  remaining: number;
};
type PlanGroupSection = {
  key: string;
  label: string;
  plans: EnrichedPlan[];
};

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const ProductionPlans: React.FC = () => {
  const { openModal } = useGlobalModalManager();
  const [searchParams] = useSearchParams();
  const navigate = useTenantNavigate();

  const {
    products, _rawLines, _rawProducts, productionPlans, planReports,
    todayReports, lineProductConfigs, loading, uid, systemSettings,
    laborSettings, costCenters, costCenterValues, costAllocations,
  } = useShallowStore((s) => ({
    products: s.products,
    _rawLines: s._rawLines,
    _rawProducts: s._rawProducts,
    productionPlans: s.productionPlans,
    planReports: s.planReports,
    todayReports: s.todayReports,
    lineProductConfigs: s.lineProductConfigs,
    loading: s.loading,
    uid: s.uid,
    systemSettings: s.systemSettings,
    laborSettings: s.laborSettings,
    costCenters: s.costCenters,
    costCenterValues: s.costCenterValues,
    costAllocations: s.costAllocations,
  }));

  const createProductionPlan = useAppStore((s) => s.createProductionPlan);
  const updateProductionPlan = useAppStore((s) => s.updateProductionPlan);
  const deleteProductionPlan = useAppStore((s) => s.deleteProductionPlan);
  const fetchProductionPlans = useAppStore((s) => s.fetchProductionPlans);
  const { can } = usePermission();

  const canManageComponentInjectionPlans = can('plans.componentInjection.manage');
  const canCreate = can('plans.create') || canManageComponentInjectionPlans;
  const canEdit = can('plans.edit');
  const canAddFollowUp = canEdit || canCreate;
  const canViewCosts = can('costs.view');
  const canExport = can('export');
  const canImport = can('import');
  const planSettings = systemSettings.planSettings ?? { allowMultipleActivePlans: true, allowReportWithoutPlan: true, allowOverProduction: true };

  // â”€â”€ View / Filter state â”€â”€
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterLine, setFilterLine] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [dateQuick, setDateQuick] = useState<DateQuickFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupByField>('none');
  const [sortField, setSortField] = useState<PlanSortField>('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [activeDrawerPlanId, setActiveDrawerPlanId] = useState<string | null>(null);

  // â”€â”€ Form state â”€â”€
  const [formProductId, setFormProductId] = useState(searchParams.get('productId') || '');
  const [formProductInput, setFormProductInput] = useState('');
  const [formLineId, setFormLineId] = useState('');
  const [formQuantity, setFormQuantity] = useState<number>(Number(searchParams.get('quantity')) || 0);
  const [formStartDate, setFormStartDate] = useState(() => getTodayDateString());
  const [formPriority, setFormPriority] = useState<PlanPriority>('medium');
  const [formPlanType, setFormPlanType] = useState<'finished_product' | 'component_injection'>('finished_product');
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(!!searchParams.get('productId'));

  useEffect(() => {
    if (!can('plans.create') && canManageComponentInjectionPlans) {
      setFormPlanType('component_injection');
    }
  }, [can, canManageComponentInjectionPlans]);

  // â”€â”€ Capacity warning â”€â”€
  const [capacityWarning, setCapacityWarning] = useState<{ show: boolean; load: number; capacity: number }>({ show: false, load: 0, capacity: 0 });

  // â”€â”€ Edit modal â”€â”€
  const [editPlan, setEditPlan] = useState<ProductionPlan | null>(null);
  const [editForm, setEditForm] = useState({ plannedQuantity: 0, startDate: '', lineId: '', priority: 'medium' as PlanPriority });
  const [editSaving, setEditSaving] = useState(false);

  // â”€â”€ Status modal â”€â”€
  const [statusPlan, setStatusPlan] = useState<ProductionPlan | null>(null);
  const [newStatus, setNewStatus] = useState<PlanStatus>('planned');
  const [statusSaving, setStatusSaving] = useState(false);

  // â”€â”€ Delete confirm â”€â”€
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // â”€â”€ Bulk date shift â”€â”€
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // â”€â”€ Reports for calculations â”€â”€
  const [productReports, setProductReports] = useState<ProductionReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  useEffect(() => {
    if (!formProductId) { setProductReports([]); return; }
    let cancelled = false;
    setReportsLoading(true);
    reportService.getByProduct(formProductId).then((reports) => {
      if (!cancelled) { setProductReports(reports); setReportsLoading(false); }
    }).catch(() => { if (!cancelled) setReportsLoading(false); });
    return () => { cancelled = true; };
  }, [formProductId]);

  const getProductOptionLabel = (product: { name?: string; code?: string }) => (
    product.code ? `${product.code} - ${product.name}` : (product.name ?? '')
  );

  useEffect(() => {
    if (!formProductId) {
      if (formProductInput) setFormProductInput('');
      return;
    }
    const selected = products.find((p) => p.id === formProductId);
    if (!selected) return;
    const label = getProductOptionLabel(selected);
    if (formProductInput !== label) setFormProductInput(label);
  }, [formProductId, products]);

  // â”€â”€ Dynamic calculations â”€â”€
  const calculations = useMemo(() => {
    if (!formProductId || formQuantity <= 0) return null;

    const line = formLineId ? _rawLines.find((l) => l.id === formLineId) : null;
    const selectedProduct = products.find((p) => p.id === formProductId);

    const lineProductReports = formLineId
      ? productReports.filter((r) => r.lineId === formLineId)
      : [];
    const reportsForCalc = lineProductReports.length > 0 ? lineProductReports : productReports;

    const config = formLineId
      ? lineProductConfigs.find((c) => c.productId === formProductId && c.lineId === formLineId)
      : undefined;
    const avgTime = calculateAvgAssemblyTime(reportsForCalc);
    const effectiveTime = config?.standardAssemblyTime ?? (avgTime > 0 ? avgTime : 0);
    const dailyCapacity = line && effectiveTime > 0
      ? calculateDailyCapacity(line.maxWorkers, line.dailyWorkingHours, effectiveTime)
      : 0;

    const productAvgDailyProduction = Number(selectedProduct?.avgDailyProduction || 0);
    const usesProductAverage = productAvgDailyProduction > 0;
    const effectiveDailyRate = usesProductAverage ? productAvgDailyProduction : dailyCapacity;
    const estimatedDays = calculateEstimatedDays(formQuantity, effectiveDailyRate);
    const avgDailyTarget = effectiveDailyRate > 0 ? Math.ceil(effectiveDailyRate) : 0;
    const plannedEndDate = estimatedDays > 0 ? addDaysToDate(formStartDate, estimatedDays) : '';

    const hourlyRate = laborSettings?.hourlyRate ?? 0;
    const laborCostPerUnit = effectiveTime > 0 ? (hourlyRate * effectiveTime) / 60 : 0;
    const estimatedCost = laborCostPerUnit * formQuantity;

    return {
      avgAssemblyTime: effectiveTime,
      dailyCapacity,
      productAvgDailyProduction,
      usesProductAverage,
      effectiveDailyRate,
      estimatedDays,
      estimatedCost,
      plannedEndDate,
      avgDailyTarget,
    };
  }, [formProductId, formLineId, formQuantity, formStartDate, productReports, _rawLines, lineProductConfigs, laborSettings, products]);

  const formProductOptions = useMemo(() => {
    const q = formProductInput.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const name = (p.name ?? '').toLowerCase();
      const code = (p.code ?? '').toLowerCase();
      const label = getProductOptionLabel(p).toLowerCase();
      return name.includes(q) || code.includes(q) || label.includes(q);
    });
  }, [products, formProductInput]);

  // â”€â”€ Enriched plans with computed metrics â”€â”€
  const enrichedPlans = useMemo<EnrichedPlan[]>(() => {
    return productionPlans.map((plan) => {
      const key = `${plan.lineId}_${plan.productId}`;
      const reportCount = planReports[key]?.length ?? 0;
      const produced = plan.producedQuantity ?? 0;
      const hasExecutionSignal = produced > 0 || reportCount > 0;
      const effectiveStatus: PlanStatus =
        plan.status === 'in_progress' && !hasExecutionSignal
          ? 'planned'
          : plan.status;
      const progressRatio = calculateProgressRatio(produced, plan.plannedQuantity);
      const timeRatio = plan.plannedEndDate ? calculateTimeRatio(plan.plannedStartDate || plan.startDate, plan.plannedEndDate) : 0;
      const smartStatus = hasExecutionSignal
        ? calculateSmartStatus(progressRatio, timeRatio, effectiveStatus)
        : 'on_track';
      const forecastFinishDate = plan.plannedEndDate
        ? calculateForecastFinishDate(plan.plannedStartDate || plan.startDate, produced, plan.plannedQuantity, plan.avgDailyTarget || 0)
        : '—';
      const remainingDays = plan.plannedEndDate ? calculateRemainingDays(plan.plannedEndDate) : 0;
      const remaining = Math.max(plan.plannedQuantity - produced, 0);

      return {
        ...plan,
        storedStatus: plan.status,
        effectiveStatus,
        reportCount,
        produced,
        progressRatio,
        timeRatio,
        smartStatus,
        forecastFinishDate,
        remainingDays,
        remaining,
      };
    });
  }, [productionPlans, planReports]);

  // â”€â”€ Filtered plans â”€â”€
  const filteredPlans = useMemo(() => {
    return enrichedPlans.filter((p) => {
      const searchQuery = filterSearch.trim().toLowerCase();
      if (searchQuery) {
        const productName = (_rawProducts.find((prod) => prod.id === p.productId)?.name ?? '').toLowerCase();
        const productCode = (_rawProducts.find((prod) => prod.id === p.productId)?.code ?? '').toLowerCase();
        const lineName = (_rawLines.find((line) => line.id === p.lineId)?.name ?? '').toLowerCase();
        if (!productName.includes(searchQuery) && !productCode.includes(searchQuery) && !lineName.includes(searchQuery)) {
          return false;
        }
      }
      if (filterStatus && p.effectiveStatus !== filterStatus) return false;
      if (filterLine && p.lineId !== filterLine) return false;
      if (filterProduct && p.productId !== filterProduct) return false;
      if (filterPriority && p.priority !== filterPriority) return false;
      if (filterDateFrom && (p.plannedStartDate || p.startDate) < filterDateFrom) return false;
      if (filterDateTo && (p.plannedStartDate || p.startDate) > filterDateTo) return false;
      return true;
    });
  }, [enrichedPlans, filterSearch, filterStatus, filterLine, filterProduct, filterPriority, filterDateFrom, filterDateTo, _rawProducts, _rawLines]);

  const sortedPlans = useMemo(() => {
    if (!sortField) return filteredPlans;

    const priorityRank: Record<PlanPriority, number> = {
      low: 1,
      medium: 2,
      high: 3,
      urgent: 4,
    };

    const sorted = [...filteredPlans].sort((a, b) => {
      let left: string | number = 0;
      let right: string | number = 0;

      switch (sortField) {
        case 'product':
          left = (_rawProducts.find((p) => p.id === a.productId)?.name ?? '').toLowerCase();
          right = (_rawProducts.find((p) => p.id === b.productId)?.name ?? '').toLowerCase();
          break;
        case 'line':
          left = (_rawLines.find((l) => l.id === a.lineId)?.name ?? '').toLowerCase();
          right = (_rawLines.find((l) => l.id === b.lineId)?.name ?? '').toLowerCase();
          break;
        case 'priority':
          left = priorityRank[a.priority || 'medium'];
          right = priorityRank[b.priority || 'medium'];
          break;
        case 'plannedQuantity':
          left = a.plannedQuantity || 0;
          right = b.plannedQuantity || 0;
          break;
        case 'progress':
          left = a.progressRatio || 0;
          right = b.progressRatio || 0;
          break;
        case 'startDate':
          left = a.plannedStartDate || a.startDate || '';
          right = b.plannedStartDate || b.startDate || '';
          break;
        default:
          left = 0;
          right = 0;
      }

      if (typeof left === 'string' && typeof right === 'string') {
        return left.localeCompare(right, 'ar');
      }
      return Number(left) - Number(right);
    });

    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [filteredPlans, sortField, sortDirection, _rawProducts, _rawLines]);

  const groupedPlanSections = useMemo<PlanGroupSection[]>(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: 'الكل', plans: sortedPlans }];
    }

    const groupedMap = new Map<string, PlanGroupSection>();

    sortedPlans.forEach((plan) => {
      let key = 'unknown';
      let label = 'غير محدد';

      if (groupBy === 'line') {
        key = plan.lineId || 'unknown-line';
        label = _rawLines.find((line) => line.id === plan.lineId)?.name || 'خط غير معروف';
      } else if (groupBy === 'product') {
        key = plan.productId || 'unknown-product';
        label = _rawProducts.find((product) => product.id === plan.productId)?.name || 'منتج غير معروف';
      } else if (groupBy === 'status') {
        key = plan.effectiveStatus;
        label = STATUS_CONFIG[plan.effectiveStatus].label;
      } else if (groupBy === 'priority') {
        const priority = plan.priority || 'medium';
        key = priority;
        label = PRIORITY_CONFIG[priority].label;
      }

      if (!groupedMap.has(key)) {
        groupedMap.set(key, { key, label, plans: [] });
      }

      groupedMap.get(key)!.plans.push(plan);
    });

    return Array.from(groupedMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }, [groupBy, sortedPlans, _rawLines, _rawProducts]);

  const activeDrawerPlan = useMemo(
    () => enrichedPlans.find((plan) => plan.id === activeDrawerPlanId) || null,
    [enrichedPlans, activeDrawerPlanId],
  );

  useEffect(() => {
    setSelectedPlanIds((prev) => {
      const visibleIds = new Set(sortedPlans.map((p) => p.id).filter((id): id is string => Boolean(id)));
      return prev.filter((id) => visibleIds.has(id));
    });
  }, [sortedPlans]);

  const selectedPlans = useMemo(
    () => sortedPlans.filter((plan) => plan.id && selectedPlanIds.includes(plan.id)),
    [sortedPlans, selectedPlanIds],
  );

  const allVisibleSelected = useMemo(() => {
    if (sortedPlans.length === 0) return false;
    return sortedPlans.every((plan) => plan.id && selectedPlanIds.includes(plan.id));
  }, [sortedPlans, selectedPlanIds]);

  const resolvePlanDurationDays = (plan: ProductionPlan): number => {
    const estimated = Number(plan.estimatedDurationDays || 0);
    if (estimated > 0) return Math.ceil(estimated);

    const start = plan.plannedStartDate || plan.startDate;
    const end = plan.plannedEndDate;
    if (!start || !end) return 0;
    const diffMs = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
    if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
    return Math.ceil(diffMs / 86_400_000);
  };

  const togglePlanSelection = (planId: string) => {
    setSelectedPlanIds((prev) =>
      prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId],
    );
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedPlanIds([]);
      return;
    }
    const ids = sortedPlans.map((plan) => plan.id).filter((id): id is string => Boolean(id));
    setSelectedPlanIds(ids);
  };

  // â”€â”€ KPIs â”€â”€
  const kpis = useMemo(() => {
    const active = enrichedPlans.filter((p) => p.effectiveStatus === 'in_progress' || p.effectiveStatus === 'planned');
    const delayed = enrichedPlans.filter((p) => p.smartStatus === 'delayed' || p.smartStatus === 'critical');
    const totalRemaining = active.reduce((s, p) => s + p.remaining, 0);
    const avgCompletion = active.length > 0
      ? Number((active.reduce((s, p) => s + Math.min(p.progressRatio, 100), 0) / active.length).toFixed(1))
      : 0;
    return { activeCount: active.length, delayedCount: delayed.length, totalRemaining, avgCompletion };
  }, [enrichedPlans]);

  // â”€â”€ Handlers â”€â”€

  const handleCreate = async () => {
    if (!formProductId || !formLineId || formQuantity <= 0 || !uid || !calculations) return;

    if (!planSettings.allowMultipleActivePlans) {
      const existing = await productionPlanService.getActiveByLine(formLineId);
      if (existing.length > 0) {
        setCapacityWarning({ show: false, load: 0, capacity: 0 });
        alert('لا يمكن إنشاء خطة جديدة — يوجد خطة نشطة بالفعل على هذا الخط');
        return;
      }
    }

    const existingPlans = await productionPlanService.getActiveByLine(formLineId);
    const currentLoad = existingPlans.reduce((s, p) => s + (p.avgDailyTarget || 0), 0);
    const newTarget = calculations.avgDailyTarget;
    if (calculations.dailyCapacity > 0 && (currentLoad + newTarget) > calculations.dailyCapacity) {
      setCapacityWarning({ show: true, load: currentLoad + newTarget, capacity: calculations.dailyCapacity });
      return;
    }

    await saveNewPlan();
  };

  const saveNewPlan = async () => {
    if (!formProductId || !formLineId || formQuantity <= 0 || !uid || !calculations) return;
    setSaving(true);
    await createProductionPlan({
      productId: formProductId,
      lineId: formLineId,
      planType: formPlanType,
      plannedQuantity: formQuantity,
      producedQuantity: 0,
      startDate: formStartDate,
      plannedStartDate: formStartDate,
      plannedEndDate: calculations.plannedEndDate,
      estimatedDurationDays: calculations.estimatedDays,
      avgDailyTarget: calculations.avgDailyTarget,
      priority: formPriority,
      estimatedCost: calculations.estimatedCost,
      actualCost: 0,
      status: 'planned',
      createdBy: uid,
    });
    setFormProductId('');
    setFormProductInput('');
    setFormLineId('');
    setFormQuantity(0);
    setFormPriority('medium');
    setFormPlanType('finished_product');
    setSaving(false);
    setFormOpen(false);
    setCapacityWarning({ show: false, load: 0, capacity: 0 });
  };

  const handleEdit = async () => {
    if (!editPlan?.id) return;
    const durationDays = resolvePlanDurationDays(editPlan);
    setEditSaving(true);
    await updateProductionPlan(editPlan.id, {
      plannedQuantity: editForm.plannedQuantity,
      startDate: editForm.startDate,
      plannedStartDate: editForm.startDate,
      plannedEndDate: durationDays > 0 ? addDaysToDate(editForm.startDate, durationDays) : editPlan.plannedEndDate,
      lineId: editForm.lineId,
      priority: editForm.priority,
    });
    setEditSaving(false);
    setEditPlan(null);
  };

  const handleBulkDateShift = async () => {
    if (!bulkStartDate || selectedPlans.length === 0) return;
    setBulkSaving(true);
    try {
      await Promise.all(
        selectedPlans.map((plan) => {
          if (!plan.id) return Promise.resolve();
          const durationDays = resolvePlanDurationDays(plan);
          return productionPlanService.update(plan.id, {
            startDate: bulkStartDate,
            plannedStartDate: bulkStartDate,
            plannedEndDate: durationDays > 0 ? addDaysToDate(bulkStartDate, durationDays) : plan.plannedEndDate,
          });
        }),
      );
      await fetchProductionPlans();
      setSelectedPlanIds([]);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleStatusChange = async () => {
    if (!statusPlan?.id) return;
    setStatusSaving(true);
    await updateProductionPlan(statusPlan.id, { status: newStatus });
    setStatusSaving(false);
    setStatusPlan(null);
  };

  const handleDelete = async () => {
    if (!deletePlanId) return;
    setDeleting(true);
    await deleteProductionPlan(deletePlanId);
    setDeleting(false);
    setDeletePlanId(null);
  };

  const hasActiveFilters = filterSearch || filterStatus || filterLine || filterProduct || filterPriority || filterDateFrom || filterDateTo || groupBy !== 'none';

  const applyDateQuickFilter = (quick: DateQuickFilter) => {
    setDateQuick(quick);
    if (quick === 'all') {
      setFilterDateFrom('');
      setFilterDateTo('');
      return;
    }
    if (quick === 'today') {
      const today = getTodayDateString();
      setFilterDateFrom(today);
      setFilterDateTo(today);
      return;
    }
    if (quick === 'this_month') {
      const d = new Date();
      const first = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const last = `${d.getFullYear()}-${String(d.getMonth() + 2).padStart(2, '0')}-00`;
      setFilterDateFrom(first);
      setFilterDateTo(last);
    }
  };

  const handleApplyFilters = () => {
    // Keep this action explicit for users who expect "تطبيق".
    setFilterSearch((prev) => prev.trim());
  };

  const handleExportPlans = () => {
    exportProductionPlans(sortedPlans as ProductionPlan[], {
      getProductName: (id) => _rawProducts.find((p) => p.id === id)?.name ?? '—',
      getProductCode: (id) => _rawProducts.find((p) => p.id === id)?.code ?? '—',
      getLineName: (id) => _rawLines.find((l) => l.id === id)?.name ?? '—',
    });
  };

  const getCurrentRunningAction = (plan: EnrichedPlan): string => {
    if (plan.effectiveStatus === 'in_progress') return 'التنفيذ شغال حالياً على الخطة';
    if (plan.effectiveStatus === 'planned') return 'جاهزة للتشغيل (يمكن بدء أمر شغل)';
    if (plan.effectiveStatus === 'paused') return 'التشغيل متوقف مؤقتاً ويحتاج استئناف';
    if (plan.effectiveStatus === 'completed') return 'الخطة مكتملة، لا يوجد أكشن تشغيلي مفتوح';
    return 'الخطة ملغاة، تم إيقاف كل الأكشنات';
  };

  const openPlanDrawer = (planId?: string) => {
    if (!planId) return;
    setActiveDrawerPlanId(planId);
  };

  if (loading) {
    return (
      <div className="erp-ds-clean space-y-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">خطط الإنتاج</h2>
        <LoadingSkeleton type="table" rows={6} />
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-6 sm:space-y-8">
      {/* Header */}
      <PageHeader
        title="خطط الإنتاج"
        subtitle="إدارة وتتبع خطط الإنتاج الرسمية"
        icon="event_note"
        primaryAction={canCreate ? {
          label: formOpen ? 'إغلاق' : 'خطة جديدة',
          icon: formOpen ? 'close' : 'add',
          onClick: () => setFormOpen(!formOpen),
        } : undefined}
        extra={
          <div className="flex items-center bg-[#f0f2f5] rounded-[var(--border-radius-base)] p-0.5 overflow-x-auto">
            {([['table', 'view_list'], ['kanban', 'view_kanban'], ['timeline', 'timeline']] as [ViewMode, string][]).map(([mode, icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`p-2 rounded-[var(--border-radius-sm)] transition-all ${viewMode === mode ? 'bg-white text-primary' : 'text-slate-400 hover:text-slate-600'}`}
                title={mode === 'table' ? 'جدول' : mode === 'kanban' ? 'كانبان' : 'جدول زمني'}
              >
                <span className="material-icons-round text-lg">{icon}</span>
              </button>
            ))}
          </div>
        }
        moreActions={[
          {
            label: 'تصدير الخطط',
            icon: 'download',
            group: 'تصدير',
            hidden: !canExport || filteredPlans.length === 0,
            onClick: handleExportPlans,
          },
          {
            label: 'استيراد الخطط',
            icon: 'upload',
            group: 'استيراد',
            hidden: !canImport || !canCreate,
            onClick: () => openModal(MODAL_KEYS.PRODUCTION_PLANS_IMPORT),
          },
        ]}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIBox label="خطط نشطة" value={kpis.activeCount} icon="event_available" colorClass="bg-blue-100 text-blue-600" />
        <KPIBox label="خطط متأخرة" value={kpis.delayedCount} icon="warning" colorClass="bg-rose-100 text-rose-600" />
        <KPIBox label="الكمية المتبقية" value={formatNumber(kpis.totalRemaining)} icon="inventory_2" colorClass="bg-amber-100 text-amber-600" />
        <KPIBox label="متوسط الإنجاز" value={kpis.avgCompletion} icon="speed" unit="%" colorClass="bg-emerald-100 text-emerald-600" />
      </div>

      {/* Create Form */}
      {canCreate && formOpen && (
        <Card className="border-primary/20 shadow-primary/5">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center">
              <span className="material-icons-round text-primary">add_task</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--color-text)]">إنشاء خطة إنتاج جديدة</h3>
              <p className="text-xs text-[var(--color-text-muted)] font-medium">حدد المنتج والخط والكمية لحساب التقديرات تلقائياً</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">المنتج *</label>
              <div className="relative">
                <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-lg pointer-events-none">search</span>
                <input
                  type="text"
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 pr-10 outline-none font-medium transition-all"
                  value={formProductInput}
                  list="production-plan-product-options"
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormProductInput(value);
                    const normalized = value.trim().toLowerCase();
                    if (!normalized) {
                      setFormProductId('');
                      return;
                    }
                    const matched = products.find((p) => {
                      const name = (p.name ?? '').toLowerCase();
                      const code = (p.code ?? '').toLowerCase();
                      const label = getProductOptionLabel(p).toLowerCase();
                      return normalized === label || normalized === name || normalized === code;
                    });
                    setFormProductId(matched?.id ?? '');
                  }}
                  placeholder="ابحث باسم المنتج أو الكود..."
                />
                <datalist id="production-plan-product-options">
                  {formProductOptions.map((p) => (
                    <option key={p.id} value={getProductOptionLabel(p)} />
                  ))}
                </datalist>
              </div>
              {formProductInput && !formProductId && formProductOptions.length > 0 && (
                <p className="text-xs text-blue-600 font-medium">اختر المنتج من الاقتراحات لإتمام الاختيار</p>
              )}
              {formProductInput && formProductOptions.length === 0 && (
                <p className="text-xs text-amber-600 font-medium">لا توجد نتائج مطابقة</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">خط الإنتاج *</label>
              <Select value={formLineId || 'none'} onValueChange={(value) => setFormLineId(value === 'none' ? '' : value)}>
                <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 font-medium">
                  <SelectValue placeholder="اختر الخط..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">اختر الخط...</SelectItem>
                  {_rawLines.map((l) => (<SelectItem key={l.id} value={l.id!}>{l.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">الكمية المخططة *</label>
              <input type="number" min={1} className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all" value={formQuantity || ''} onChange={(e) => setFormQuantity(Number(e.target.value))} placeholder="مثال: 1000" />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">تاريخ البدء *</label>
              <input type="date" className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">الأولوية</label>
              <Select value={formPriority} onValueChange={(value) => setFormPriority(value as PlanPriority)}>
                <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PRIORITY_CONFIG) as [PlanPriority, typeof PRIORITY_CONFIG[PlanPriority]][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">نوع الخطة</label>
              <Select
                value={formPlanType}
                onValueChange={(value) => setFormPlanType(value === 'component_injection' ? 'component_injection' : 'finished_product')}
              >
                <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {can('plans.create') && (
                    <SelectItem value="finished_product">خطة منتج نهائي</SelectItem>
                  )}
                  {canManageComponentInjectionPlans && (
                    <SelectItem value="component_injection">خطة مكون حقن</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {calculations?.plannedEndDate && (
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">تاريخ الانتهاء المتوقع</label>
                <input type="date" className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium bg-[#f8f9fa]/50 text-slate-500" value={calculations.plannedEndDate} readOnly />
              </div>
            )}
          </div>

          {/* Live calculations */}
          <div className="mt-6 p-5 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            {reportsLoading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
                <span className="material-icons-round animate-spin text-lg">refresh</span>
                <span className="text-sm font-bold">جاري حساب التقديرات...</span>
              </div>
            ) : calculations ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-[var(--color-card)] rounded-[var(--border-radius-base)] border border-[var(--color-border)]">
                  <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">متوسط وقت التجميع</p>
                  <p className="text-lg font-bold text-primary">
                    {calculations.avgAssemblyTime > 0 ? `${calculations.avgAssemblyTime} د/و` : '—'}
                  </p>
                </div>
                <div className="text-center p-3 bg-[var(--color-card)] rounded-[var(--border-radius-base)] border border-[var(--color-border)]">
                  <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">متوسط الإنتاج اليومي</p>
                  <p className="text-lg font-bold text-blue-600">
                    {calculations.effectiveDailyRate > 0 ? `${formatNumber(calculations.effectiveDailyRate)} وحدة` : '—'}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    {calculations.usesProductAverage ? 'من سجل المنتج' : 'احتساب من طاقة الخط'}
                  </p>
                </div>
                <div className="text-center p-3 bg-[var(--color-card)] rounded-[var(--border-radius-base)] border border-[var(--color-border)]">
                  <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">الأيام المقدرة</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {calculations.estimatedDays > 0 ? `${calculations.estimatedDays} يوم` : '—'}
                  </p>
                </div>
                {canViewCosts && (
                  <div className="text-center p-3 bg-[var(--color-card)] rounded-[var(--border-radius-base)] border border-[var(--color-border)]">
                    <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">التكلفة المقدرة</p>
                    <p className="text-lg font-bold text-violet-600">
                      {calculations.estimatedCost > 0 ? formatCurrency(calculations.estimatedCost) : '—'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-[var(--color-text-muted)] py-3">
                <span className="material-icons-round text-2xl mb-1 block opacity-40">calculate</span>
                <p className="text-xs font-bold">اختر المنتج والخط وأدخل الكمية لعرض التقديرات</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button variant="primary" onClick={handleCreate} disabled={saving || !formProductId || !formLineId || formQuantity <= 0}>
              {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              <span className="material-icons-round text-sm">add_task</span>
              إنشاء خطة
            </Button>
          </div>
        </Card>
      )}

      {/* Capacity Warning Modal */}
      {capacityWarning.show && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCapacityWarning({ show: false, load: 0, capacity: 0 })}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
                <span className="material-icons-round text-amber-500 text-2xl">warning</span>
              </div>
              <h3 className="text-lg font-bold">تحذير: تجاوز طاقة الخط</h3>
              <p className="text-sm text-slate-500">
                الحمل الإجمالي ({formatNumber(capacityWarning.load)} وحدة/يوم) يتجاوز طاقة الخط ({formatNumber(capacityWarning.capacity)} وحدة/يوم).
              </p>
              <p className="text-xs text-slate-400">هل تريد المتابعة رغم ذلك؟</p>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setCapacityWarning({ show: false, load: 0, capacity: 0 })}>إلغاء</Button>
              <Button variant="primary" onClick={() => { setCapacityWarning({ show: false, load: 0, capacity: 0 }); saveNewPlan(); }}>متابعة</Button>
            </div>
          </div>
        </div>
      )}

      <SmartFilterBar
        searchPlaceholder="ابحث بالخط أو المنتج أو الكود..."
        searchValue={filterSearch}
        onSearchChange={setFilterSearch}
        periods={[
          { label: 'الكل', value: 'all' },
          { label: 'هذا الشهر', value: 'this_month' },
          { label: 'اليوم', value: 'today' },
        ]}
        activePeriod={dateQuick}
        onPeriodChange={(value) => applyDateQuickFilter(value as DateQuickFilter)}
        quickFilters={[
          {
            key: 'status',
            placeholder: 'كل الحالات',
            options: (Object.entries(STATUS_CONFIG) as [PlanStatus, typeof STATUS_CONFIG[PlanStatus]][]).map(([key, config]) => ({
              value: key,
              label: config.label,
            })),
            width: 'w-[140px]',
          },
        ]}
        quickFilterValues={{ status: filterStatus || 'all' }}
        onQuickFilterChange={(_, value) => setFilterStatus(value === 'all' ? '' : value)}
        advancedFilters={[
          {
            key: 'line',
            label: 'الخط',
            placeholder: 'كل الخطوط',
            options: _rawLines.map((line) => ({ value: line.id || '', label: line.name })),
            width: 'w-[150px]',
          },
          {
            key: 'product',
            label: 'المنتج',
            placeholder: 'كل المنتجات',
            options: _rawProducts.map((product) => ({ value: product.id || '', label: product.name })),
            width: 'w-[150px]',
          },
          {
            key: 'priority',
            label: 'الأولوية',
            placeholder: 'كل الأولويات',
            options: (Object.entries(PRIORITY_CONFIG) as [PlanPriority, typeof PRIORITY_CONFIG[PlanPriority]][]).map(([key, config]) => ({
              value: key,
              label: config.label,
            })),
            width: 'w-[140px]',
          },
          {
            key: 'groupBy',
            label: 'تجميع على',
            placeholder: 'بدون تجميع',
            options: [
              { value: 'line', label: 'الخط' },
              { value: 'product', label: 'المنتج' },
              { value: 'status', label: 'الحالة' },
              { value: 'priority', label: 'الأولوية' },
            ],
          },
          {
            key: 'sortBy',
            label: 'ترتيب حسب',
            placeholder: 'بدون ترتيب',
            options: [
              { value: 'product', label: 'المنتج' },
              { value: 'line', label: 'الخط' },
              { value: 'priority', label: 'الأولوية' },
              { value: 'plannedQuantity', label: 'الكمية' },
              { value: 'progress', label: 'التقدم' },
              { value: 'startDate', label: 'تاريخ البد،' },
            ],
          },
          {
            key: 'sortDirection',
            label: 'اتجاه الترتيب',
            placeholder: 'تنازلي',
            options: [
              { value: 'asc', label: 'تصاعدي' },
              { value: 'desc', label: 'تنازلي' },
            ],
            width: 'w-[130px]',
          },
          { key: 'dateFrom', label: 'من تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
          { key: 'dateTo', label: 'إلى تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
        ]}
        advancedFilterValues={{
          line: filterLine || 'all',
          product: filterProduct || 'all',
          priority: filterPriority || 'all',
          groupBy: groupBy === 'none' ? 'all' : groupBy,
          sortBy: sortField || 'all',
          sortDirection: sortDirection,
          dateFrom: filterDateFrom,
          dateTo: filterDateTo,
        }}
        onAdvancedFilterChange={(key, value) => {
          if (key === 'line') setFilterLine(value === 'all' ? '' : value);
          if (key === 'product') setFilterProduct(value === 'all' ? '' : value);
          if (key === 'priority') setFilterPriority(value === 'all' ? '' : value);
          if (key === 'groupBy') setGroupBy(value === 'all' ? 'none' : (value as GroupByField));
          if (key === 'sortBy') setSortField(value === 'all' ? '' : (value as PlanSortField));
          if (key === 'sortDirection') setSortDirection(value as SortDirection);
          if (key === 'dateFrom') {
            setDateQuick('custom');
            setFilterDateFrom(value);
          }
          if (key === 'dateTo') {
            setDateQuick('custom');
            setFilterDateTo(value);
          }
        }}
        onApply={handleApplyFilters}
        applyLabel="تطبيق"
      />

      {/* Content Area */}
      {viewMode === 'table' && <TableView groups={groupedPlanSections} />}
      {viewMode === 'kanban' && <KanbanView plans={sortedPlans} />}
      {viewMode === 'timeline' && <TimelineView plans={sortedPlans} />}

      {/* Plan Drawer */}
      <div className={`fixed inset-0 z-50 transition-opacity ${activeDrawerPlan ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/35" onClick={() => setActiveDrawerPlanId(null)} />
        <aside className={`absolute top-0 right-0 h-full w-full max-w-xl bg-[var(--color-card)] border-l border-[var(--color-border)] shadow-2xl transition-transform duration-300 ${activeDrawerPlan ? 'translate-x-0' : 'translate-x-full'}`}>
          {activeDrawerPlan && (
            <div className="h-full flex flex-col">
              <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-[var(--color-text)]">تفاصيل الخطة</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {_rawProducts.find((p) => p.id === activeDrawerPlan.productId)?.name ?? '—'} • {_rawLines.find((l) => l.id === activeDrawerPlan.lineId)?.name ?? '—'}
                  </p>
                </div>
                <button onClick={() => setActiveDrawerPlanId(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                  <span className="material-icons-round">close</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">الحالة</p>
                    <div className="mt-1"><Badge variant={STATUS_CONFIG[activeDrawerPlan.effectiveStatus].variant as any}>{STATUS_CONFIG[activeDrawerPlan.effectiveStatus].label}</Badge></div>
                  </div>
                  <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">الأولوية</p>
                    <p className={`mt-1 text-sm font-bold ${PRIORITY_CONFIG[activeDrawerPlan.priority || 'medium'].color}`}>
                      {PRIORITY_CONFIG[activeDrawerPlan.priority || 'medium'].label}
                    </p>
                  </div>
                  <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">الكمية</p>
                    <p className="mt-1 text-sm font-bold text-[var(--color-text)]">
                      {formatNumber(activeDrawerPlan.produced)} / {formatNumber(activeDrawerPlan.plannedQuantity)}
                    </p>
                  </div>
                  <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">المتبقي</p>
                    <p className="mt-1 text-sm font-bold text-[var(--color-text)]">{formatNumber(activeDrawerPlan.remaining)} وحدة</p>
                  </div>
                </div>

                <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--color-text-muted)]">التقدم</span>
                    <span className="font-bold text-primary">{Math.min(activeDrawerPlan.progressRatio, 100)}%</span>
                  </div>
                  <div className="h-2 bg-[#f0f2f5] rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(activeDrawerPlan.progressRatio, 100)}%` }} />
                  </div>
                  <p className={`text-xs font-bold ${SMART_STATUS_CONFIG[activeDrawerPlan.smartStatus].color}`}>
                    الحالة الذكية: {SMART_STATUS_CONFIG[activeDrawerPlan.smartStatus].label}
                  </p>
                </div>

                <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 space-y-2 text-sm">
                  <p><span className="font-bold text-[var(--color-text-muted)]">تاريخ البدء:</span> {activeDrawerPlan.plannedStartDate || activeDrawerPlan.startDate}</p>
                  <p><span className="font-bold text-[var(--color-text-muted)]">تاريخ الانتهاء المخطط:</span> {activeDrawerPlan.plannedEndDate || '—'}</p>
                  <p><span className="font-bold text-[var(--color-text-muted)]">الإنهاء المتوقع:</span> {activeDrawerPlan.forecastFinishDate || '—'}</p>
                  <p><span className="font-bold text-[var(--color-text-muted)]">الأيام المتبقية:</span> {activeDrawerPlan.effectiveStatus === 'completed' ? '0' : Math.max(activeDrawerPlan.remainingDays, 0)}</p>
                </div>

                <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 text-sm">
                  <p className="text-xs text-[var(--color-text-muted)] mb-1">الأكشن الشغال حالياً</p>
                  <p className="font-bold text-[var(--color-text)]">{getCurrentRunningAction(activeDrawerPlan)}</p>
                </div>

                {canViewCosts && (
                  <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 space-y-1 text-sm">
                    <p><span className="font-bold text-[var(--color-text-muted)]">تكلفة تقديرية:</span> {formatCurrency(activeDrawerPlan.estimatedCost || 0)}</p>
                    <p><span className="font-bold text-[var(--color-text-muted)]">تكلفة فعلية:</span> {formatCurrency(activeDrawerPlan.actualCost || 0)}</p>
                  </div>
                )}
              </div>

              <div className="px-5 py-4 border-t border-[var(--color-border)] flex flex-wrap items-center justify-end gap-2">
                {canEdit && (
                  <>
                    <Button variant="outline" onClick={() => { setEditPlan(activeDrawerPlan); setEditForm({ plannedQuantity: activeDrawerPlan.plannedQuantity, startDate: activeDrawerPlan.plannedStartDate || activeDrawerPlan.startDate, lineId: activeDrawerPlan.lineId, priority: activeDrawerPlan.priority || 'medium' }); setActiveDrawerPlanId(null); }}>
                      تعديل
                    </Button>
                    <Button variant="outline" onClick={() => { setStatusPlan(activeDrawerPlan); setNewStatus(activeDrawerPlan.effectiveStatus); setActiveDrawerPlanId(null); }}>
                      تغيير الحالة
                    </Button>
                  </>
                )}
                {(can('workOrders.create') || (activeDrawerPlan.planType === 'component_injection' && can('workOrders.componentInjection.manage'))) && (activeDrawerPlan.effectiveStatus === 'planned' || activeDrawerPlan.effectiveStatus === 'in_progress') && (
                  <Button variant="outline" onClick={() => { navigate(`/work-orders?planId=${activeDrawerPlan.id}&productId=${activeDrawerPlan.productId}`); setActiveDrawerPlanId(null); }}>
                    أمر شغل
                  </Button>
                )}
                {canAddFollowUp && activeDrawerPlan.id && (
                  <button
                    type="button"
                    data-modal-key={MODAL_KEYS.PRODUCTION_PLAN_FOLLOW_UP_CREATE}
                    onClick={() => {
                      openModal(MODAL_KEYS.PRODUCTION_PLAN_FOLLOW_UP_CREATE, {
                        planId: activeDrawerPlan.id!,
                        productId: activeDrawerPlan.productId,
                        lineId: activeDrawerPlan.lineId,
                      });
                      setActiveDrawerPlanId(null);
                    }}
                    className="px-4 py-2.5 text-sm rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/10 font-bold transition-colors"
                  >
                    متابعة نقص
                  </button>
                )}
                {can('roles.manage') && activeDrawerPlan.id && (
                  <button onClick={() => { setDeletePlanId(activeDrawerPlan.id!); setActiveDrawerPlanId(null); }} className="px-4 py-2.5 text-sm rounded-[var(--border-radius-base)] bg-rose-500 text-white hover:bg-rose-600 font-bold transition-colors">
                    حذف
                  </button>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Edit Modal */}
      {editPlan && canEdit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditPlan(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-lg font-bold">تعديل الخطة</h3>
              <button onClick={() => setEditPlan(null)} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors"><span className="material-icons-round">close</span></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">خط الإنتاج</label>
                <Select value={editForm.lineId} onValueChange={(value) => setEditForm({ ...editForm, lineId: value })}>
                  <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {_rawLines.map((l) => (<SelectItem key={l.id} value={l.id!}>{l.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">الكمية المخططة</label>
                <input type="number" min={1} className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all" value={editForm.plannedQuantity || ''} onChange={(e) => setEditForm({ ...editForm, plannedQuantity: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">تاريخ البدء</label>
                <input type="date" className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">الأولوية</label>
                <Select value={editForm.priority} onValueChange={(value) => setEditForm({ ...editForm, priority: value as PlanPriority })}>
                  <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PRIORITY_CONFIG) as [PlanPriority, typeof PRIORITY_CONFIG[PlanPriority]][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setEditPlan(null)}>إلغاء</Button>
              <Button variant="primary" onClick={handleEdit} disabled={editSaving || editForm.plannedQuantity <= 0}>
                {editSaving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                حفظ التعديلات
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      {statusPlan && canEdit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setStatusPlan(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-lg font-bold">تغيير حالة الخطة</h3>
              <button onClick={() => setStatusPlan(null)} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors"><span className="material-icons-round">close</span></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="page-subtitle">
                المنتج: <span className="font-bold text-[var(--color-text)]">{_rawProducts.find((p) => p.id === statusPlan.productId)?.name}</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(STATUS_CONFIG) as [PlanStatus, typeof STATUS_CONFIG[PlanStatus]][]).map(([key, config]) => (
                  <button key={key} onClick={() => setNewStatus(key)} className={`p-3 rounded-[var(--border-radius-lg)] border-2 text-sm font-bold transition-all ${newStatus === key ? 'border-primary bg-primary/5 text-primary' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border)]'}`}>
                    {config.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setStatusPlan(null)}>إلغاء</Button>
              <Button variant="primary" onClick={handleStatusChange} disabled={statusSaving || newStatus === statusPlan.status}>
                {statusSaving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                تحديث الحالة
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deletePlanId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeletePlanId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto">
                <span className="material-icons-round text-rose-500 text-2xl">delete_forever</span>
              </div>
              <h3 className="text-lg font-bold">حذف الخطة</h3>
              <p className="text-sm text-slate-500">هل أنت متأكد من حذف هذه الخطة؟ لا يمكن التراجع عن هذا الإجراء.</p>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeletePlanId(null)}>إلغاء</Button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold transition-all flex items-center justify-center gap-2 text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20">
                {deleting && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">delete</span>
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // â”€â”€â”€ Table View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function TableView({ groups }: { groups: PlanGroupSection[] }) {
    const totalPlans = groups.reduce((sum, group) => sum + group.plans.length, 0);
    const hasActionColumn = canEdit || can('roles.manage');
    const columnCount = (canEdit ? 1 : 0) + 8 + (canViewCosts ? 1 : 0) + (hasActionColumn ? 1 : 0);

    return (
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] border border-[var(--color-border)] overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
              <span className="material-icons-round text-blue-600">list_alt</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text)]">جميع الخطط</h3>
              <p className="text-[11px] text-[var(--color-text-muted)] font-medium">
                {totalPlans} خطة {hasActiveFilters ? '(مصفاة)' : ''}
                {groupBy !== 'none' ? ` • ${groups.length} مجموعة` : ''}
              </p>
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[var(--color-text-muted)] whitespace-nowrap">
                محدد: {selectedPlanIds.length}
              </span>
              <input
                type="date"
                className="border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-xs font-medium outline-none focus:border-primary focus:ring-primary/20"
                value={bulkStartDate}
                onChange={(e) => setBulkStartDate(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={handleBulkDateShift}
                disabled={bulkSaving || selectedPlanIds.length === 0 || !bulkStartDate}
              >
                {bulkSaving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">event_repeat</span>
                ترحيل التاريخ للمحدد
              </Button>
            </div>
          )}
        </div>

        {totalPlans === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-icons-round text-5xl mb-3 block opacity-30">event_note</span>
            <p className="font-bold text-base">{hasActiveFilters ? 'لا توجد خطط تطابق التصفية' : 'لا توجد خطط إنتاج بعد'}</p>
            <p className="text-sm mt-1">{hasActiveFilters ? 'جرب تغيير معايير التصفية' : 'ابدأ بإنشاء خطة جديدة لتتبع الإنتاج'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="md:hidden space-y-3 px-3 pb-3">
              {groups.map((group) => (
                <div key={group.key} className="space-y-2.5">
                  {groupBy !== 'none' && (
                    <div className="px-1 text-[11px] font-bold text-[var(--color-text-muted)]">
                      {group.label} ({group.plans.length})
                    </div>
                  )}
                  {group.plans.map((plan) => {
                    const product = _rawProducts.find((p) => p.id === plan.productId);
                    const line = _rawLines.find((l) => l.id === plan.lineId);
                    const statusInfo = STATUS_CONFIG[plan.effectiveStatus];
                    const priorityInfo = PRIORITY_CONFIG[plan.priority || 'medium'];
                    const smartInfo = SMART_STATUS_CONFIG[plan.smartStatus];

                    return (
                      <div
                        key={plan.id}
                        className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-2.5 cursor-pointer hover:bg-[#f8f9fa]/40 transition-colors"
                        onClick={() => openPlanDrawer(plan.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-primary">{product?.name ?? '—'}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{line?.name ?? '—'}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${priorityInfo.bg} ${priorityInfo.color}`}>{priorityInfo.label}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] p-2">
                            <p className="text-[var(--color-text-muted)] mb-0.5">الحالة</p>
                            <p className="font-bold text-[var(--color-text)]">{statusInfo.label}</p>
                          </div>
                          <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] p-2">
                            <p className="text-[var(--color-text-muted)] mb-0.5">التقدم</p>
                            <p className="font-bold text-primary">{Math.min(plan.progressRatio, 100)}%</p>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-[var(--color-text-muted)]">التنفيذ</span>
                            <span className={smartInfo.color}>{smartInfo.label}</span>
                          </div>
                          <div className="h-2 bg-[#f0f2f5] rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(plan.progressRatio, 100)}%` }} />
                          </div>
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                          <p><span className="font-bold">الكمية:</span> {formatNumber(plan.produced)} / {formatNumber(plan.plannedQuantity)}</p>
                          <p><span className="font-bold">الفترة:</span> {plan.plannedStartDate || plan.startDate} - {plan.plannedEndDate || '—'}</p>
                          {canViewCosts && <p><span className="font-bold">التكلفة:</span> {formatCurrency(plan.estimatedCost || 0)}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPlanDrawer(plan.id);
                          }}
                          className="w-full inline-flex items-center justify-center gap-2 text-xs font-bold rounded-[var(--border-radius-base)] border border-[var(--color-border)] px-3 py-2 text-primary hover:bg-primary/5 transition-colors"
                        >
                          <span className="material-icons-round text-sm">dock_to_right</span>
                          تفاصيل الخطة
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-[#f8f9fa]/50 border-b border-[var(--color-border)]">
                    {canEdit && (
                      <th className="erp-th text-center w-10">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAllVisible}
                          aria-label="تحديد كل الخطط المرئية"
                        />
                      </th>
                    )}
                    <th className="erp-th">المنتج</th>
                    <th className="erp-th">الخط</th>
                    <th className="erp-th text-center">الأولوية</th>
                    <th className="erp-th text-center">الكمية</th>
                    <th className="erp-th text-center">الفترة</th>
                    <th className="erp-th text-center">الحالة</th>
                    <th className="erp-th text-center">التقدم</th>
                    <th className="erp-th text-center">الحالة الذكية</th>
                    {canViewCosts && <th className="erp-th text-center">التكلفة</th>}
                    {hasActionColumn && <th className="erp-th text-center">إجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {groups.map((group) => (
                    <React.Fragment key={group.key}>
                      {groupBy !== 'none' && (
                        <tr className="bg-[#f8f9fa]/70">
                          <td className="px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)]" colSpan={columnCount}>
                            {group.label} ({group.plans.length})
                          </td>
                        </tr>
                      )}
                      {group.plans.map((plan) => {
                        const product = _rawProducts.find((p) => p.id === plan.productId);
                        const line = _rawLines.find((l) => l.id === plan.lineId);
                        const statusInfo = STATUS_CONFIG[plan.effectiveStatus];
                        const priorityInfo = PRIORITY_CONFIG[plan.priority || 'medium'];
                        const smartInfo = SMART_STATUS_CONFIG[plan.smartStatus];

                        return (
                          <tr
                            key={plan.id}
                            className="hover:bg-[#f8f9fa]/50 transition-colors cursor-pointer"
                            onClick={() => openPlanDrawer(plan.id)}
                          >
                            {canEdit && (
                              <td className="px-4 py-3.5 text-center">
                                {plan.id && (
                                  <input
                                    type="checkbox"
                                    checked={selectedPlanIds.includes(plan.id)}
                                    onChange={() => togglePlanSelection(plan.id!)}
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label="تحديد الخطة"
                                  />
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/products/${plan.productId}`);
                                }}
                                className="text-sm font-bold text-primary hover:underline text-right"
                              >
                                {product?.name ?? '—'}
                              </button>
                              <p className="text-[11px] text-[var(--color-text-muted)] font-medium">{product?.code}</p>
                            </td>
                            <td className="px-4 py-3.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/lines/${plan.lineId}`);
                                }}
                                className="text-sm font-bold text-primary hover:underline text-right"
                              >
                                {line?.name ?? '—'}
                              </button>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${priorityInfo.bg} ${priorityInfo.color}`}>
                                {priorityInfo.label}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <p className="text-sm font-bold text-[var(--color-text)]">{formatNumber(plan.plannedQuantity)}</p>
                              <p className="text-[10px] text-slate-400">متبقي: {formatNumber(plan.remaining)}</p>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <p className="text-xs font-medium text-slate-500">{plan.plannedStartDate || plan.startDate}</p>
                              {plan.plannedEndDate && <p className="text-[10px] text-slate-400">â†’ {plan.plannedEndDate}</p>}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <Badge variant={statusInfo.variant as any}>{statusInfo.label}</Badge>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <div className="flex flex-col items-center gap-1.5">
                                <span className={`text-sm font-bold ${plan.progressRatio >= 100 ? 'text-emerald-600' : plan.progressRatio >= 50 ? 'text-blue-600' : 'text-amber-600'}`}>
                                  {Math.min(plan.progressRatio, 100)}%
                                </span>
                                <div className="w-20 h-1.5 bg-[#f0f2f5] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${plan.progressRatio >= 100 ? 'bg-emerald-500' : plan.progressRatio >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                                    style={{ width: `${Math.min(plan.progressRatio, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-[var(--color-text-muted)] font-medium">{formatNumber(plan.produced)} / {formatNumber(plan.plannedQuantity)}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className={`text-xs font-bold ${smartInfo.color}`}>{smartInfo.label}</span>
                              {plan.remainingDays > 0 && plan.effectiveStatus !== 'completed' && (
                                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{plan.remainingDays} يوم متبقي</p>
                              )}
                            </td>
                            {canViewCosts && (
                              <td className="px-4 py-3.5 text-center">
                                <p className="text-xs font-bold text-slate-600">{formatCurrency(plan.actualCost || 0)}</p>
                                {(plan.estimatedCost ?? 0) > 0 && (
                                  <p className="text-[10px] text-slate-400">من {formatCurrency(plan.estimatedCost)}</p>
                                )}
                              </td>
                            )}
                            {hasActionColumn && (
                              <td className="px-4 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  {canEdit && (
                                    <>
                                      <button
                                        onClick={() => { setEditPlan(plan); setEditForm({ plannedQuantity: plan.plannedQuantity, startDate: plan.plannedStartDate || plan.startDate, lineId: plan.lineId, priority: plan.priority || 'medium' }); }}
                                        className="p-1.5 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/5 rounded-[var(--border-radius-base)] transition-all" title="تعديل">
                                        <span className="material-icons-round text-sm">edit</span>
                                      </button>
                                      <button onClick={() => { setStatusPlan(plan); setNewStatus(plan.effectiveStatus); }} className="p-1.5 text-[var(--color-text-muted)] hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/10 rounded-[var(--border-radius-base)] transition-all" title="تغيير الحالة">
                                        <span className="material-icons-round text-sm">swap_horiz</span>
                                      </button>
                                    </>
                                  )}
                                  {(can('workOrders.create') || (plan.planType === 'component_injection' && can('workOrders.componentInjection.manage'))) && (plan.effectiveStatus === 'planned' || plan.effectiveStatus === 'in_progress') && (
                                    <button onClick={() => navigate(`/work-orders?planId=${plan.id}&productId=${plan.productId}`)} className="p-1.5 text-[var(--color-text-muted)] hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-[var(--border-radius-base)] transition-all" title="إنشاء أمر شغل">
                                      <span className="material-icons-round text-sm">assignment</span>
                                    </button>
                                  )}
                                  {canAddFollowUp && plan.id && (
                                    <button
                                      type="button"
                                      data-modal-key={MODAL_KEYS.PRODUCTION_PLAN_FOLLOW_UP_CREATE}
                                      onClick={() => openModal(MODAL_KEYS.PRODUCTION_PLAN_FOLLOW_UP_CREATE, {
                                        planId: plan.id,
                                        productId: plan.productId,
                                        lineId: plan.lineId,
                                      })}
                                      className="p-1.5 text-[var(--color-text-muted)] hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/10 rounded-[var(--border-radius-base)] transition-all"
                                      title="إضافة متابعة نقص"
                                    >
                                      <span className="material-icons-round text-sm">report_problem</span>
                                    </button>
                                  )}
                                  {can('roles.manage') && (
                                    <button onClick={() => setDeletePlanId(plan.id!)} className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-[var(--border-radius-base)] transition-all" title="حذف">
                                      <span className="material-icons-round text-sm">delete</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // â”€â”€â”€ Kanban View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function KanbanView({ plans }: { plans: typeof enrichedPlans }) {
    const columns: PlanStatus[] = ['planned', 'in_progress', 'completed', 'paused', 'cancelled'];

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {columns.map((status) => {
          const colPlans = plans.filter((p) => p.effectiveStatus === status);
          const cfg = STATUS_CONFIG[status];
          return (
            <div key={status} className="bg-[#f8f9fa]/50 rounded-[var(--border-radius-lg)] p-3 min-h-[200px]">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <Badge variant={cfg.variant as any}>{cfg.label}</Badge>
                  <span className="text-xs font-bold text-slate-400">{colPlans.length}</span>
                </div>
              </div>
              <div className="space-y-3">
                {colPlans.map((plan) => {
                  const product = _rawProducts.find((p) => p.id === plan.productId);
                  const line = _rawLines.find((l) => l.id === plan.lineId);
                  const priorityInfo = PRIORITY_CONFIG[plan.priority || 'medium'];
                  const smartInfo = SMART_STATUS_CONFIG[plan.smartStatus];

                  return (
                    <div
                      key={plan.id}
                      className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => openPlanDrawer(plan.id)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-bold text-[var(--color-text)] leading-tight">{product?.name ?? '—'}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityInfo.bg} ${priorityInfo.color}`}>{priorityInfo.label}</span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] font-medium mb-3">{line?.name ?? '—'}</p>

                      <div className="mb-2">
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-[var(--color-text-muted)] font-medium">{formatNumber(plan.produced)} / {formatNumber(plan.plannedQuantity)}</span>
                          <span className={`font-bold ${plan.progressRatio >= 100 ? 'text-emerald-600' : 'text-blue-600'}`}>{Math.min(plan.progressRatio, 100)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-[#f0f2f5] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${plan.progressRatio >= 100 ? 'bg-emerald-500' : plan.progressRatio >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(plan.progressRatio, 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px]">
                        <span className={`font-bold ${smartInfo.color}`}>{smartInfo.label}</span>
                        <span className="text-[var(--color-text-muted)]">{plan.plannedStartDate || plan.startDate}</span>
                      </div>
                    </div>
                  );
                })}
                {colPlans.length === 0 && (
                  <div className="text-center py-8 text-[var(--color-text-muted)] dark:text-slate-600">
                    <span className="material-icons-round text-2xl block mb-1">inbox</span>
                    <p className="text-xs font-medium">فارغ</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // â”€â”€â”€ Timeline View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function TimelineView({ plans }: { plans: typeof enrichedPlans }) {
    const activePlans = plans.filter((p) => p.plannedStartDate || p.startDate);
    if (activePlans.length === 0) {
      return (
        <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] border border-[var(--color-border)] p-12 text-center text-slate-400">
          <span className="material-icons-round text-5xl mb-3 block opacity-30">timeline</span>
          <p className="font-bold">لا توجد خطط لعرضها على الجدول الزمني</p>
        </div>
      );
    }

    const allDates = activePlans.flatMap((p) => [p.plannedStartDate || p.startDate, p.plannedEndDate || p.plannedStartDate || p.startDate]);
    const today = getTodayDateString();
    allDates.push(today);
    const minDate = allDates.reduce((a, b) => a < b ? a : b);
    const maxDate = allDates.reduce((a, b) => a > b ? a : b);
    const totalDays = Math.max(Math.round((new Date(maxDate).getTime() - new Date(minDate).getTime()) / 86_400_000), 1);
    const todayOffset = Math.round((new Date(today).getTime() - new Date(minDate).getTime()) / 86_400_000);
    const todayPercent = (todayOffset / totalDays) * 100;

    const getBarStyle = (start: string, end: string) => {
      const startOffset = Math.round((new Date(start).getTime() - new Date(minDate).getTime()) / 86_400_000);
      const duration = Math.max(Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000), 1);
      return { right: `${(startOffset / totalDays) * 100}%`, width: `${(duration / totalDays) * 100}%` };
    };

    const smartStatusColors: Record<SmartStatus, string> = {
      on_track: 'bg-emerald-500',
      at_risk: 'bg-amber-500',
      delayed: 'bg-orange-500',
      critical: 'bg-rose-500',
      completed: 'bg-emerald-400',
    };

    return (
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] border border-[var(--color-border)] overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--color-border)] flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-50 dark:bg-violet-900/20 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
            <span className="material-icons-round text-violet-600 dark:text-violet-400">timeline</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">الجدول الزمني</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] font-medium">{minDate} — {maxDate}</p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {activePlans.map((plan) => {
            const product = _rawProducts.find((p) => p.id === plan.productId);
            const line = _rawLines.find((l) => l.id === plan.lineId);
            const start = plan.plannedStartDate || plan.startDate;
            const end = plan.plannedEndDate || addDaysToDate(start, plan.estimatedDurationDays || 7);
            const barStyle = getBarStyle(start, end);
            const smartColor = smartStatusColors[plan.smartStatus];

            return (
              <div key={plan.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="w-full sm:w-36 shrink-0 text-right">
                  <p className="text-xs font-bold text-[var(--color-text)] truncate">{product?.name ?? '—'}</p>
                  <p className="text-[10px] text-slate-400">{line?.name ?? '—'}</p>
                </div>
                <div className="flex-1 relative h-8 bg-[#f8f9fa] rounded-[var(--border-radius-base)] overflow-hidden">
                  {/* Today marker */}
                  <div className="absolute top-0 bottom-0 w-px bg-rose-400 z-10" style={{ right: `${todayPercent}%` }} />
                  {/* Plan bar */}
                  <div
                    className={`absolute top-1 bottom-1 rounded-[var(--border-radius-sm)] ${smartColor} opacity-80 flex items-center justify-center`}
                    style={{ right: barStyle.right, width: barStyle.width, minWidth: '20px' }}
                    title={`${start} â†’ ${end} | ${Math.min(plan.progressRatio, 100)}%`}
                  >
                    {parseFloat(barStyle.width) > 8 && (
                      <span className="text-[10px] font-bold text-white drop-shadow-sm">{Math.min(plan.progressRatio, 100)}%</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 pb-4 flex flex-wrap items-center gap-3 sm:gap-4 text-[10px] text-[var(--color-text-muted)] font-medium">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400"></span> اليوم</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> في المسار</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> معرض للخطر</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> متأخر</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> حرج</span>
        </div>
      </div>
    );
  }
};



