import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { Button, SearchableSelect } from '../../../modules/production/components/UI';
import { VoucherItemCombobox } from '@/modules/inventory/components/VoucherItemCombobox';
import { buildCodeVoucherPicker } from '@/modules/inventory/lib/materialVoucherPicker';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { estimateReportCost } from '../../../utils/costCalculations';
import { formatNumber, getTodayDateString } from '../../../utils/calculations';
import { workOrderService } from '../../../modules/production/services/workOrderService';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import { useTranslation } from 'react-i18next';
import {
  WORK_ORDER_CREATE_PATHS,
  WORK_ORDER_OPERATION_KEYS,
  WORK_ORDER_UPDATE_PATHS,
  isOperationPathEnabled,
} from '../../../modules/system/lib/operationPathSettings';
import { filterProductionProducts } from '../../../modules/production/utils/isProductionProduct';
import {
  defaultRequiresProductionIssueFromCompany,
  resolveRequiresProductionIssueOnReport,
} from '../../../modules/production/lib/requiresProductionIssue';
import { resolveInventoryRoutingV1 } from '@/modules/inventory/services/inventoryRoutingService';
import {
  loadInjectionComponentOptions,
  type InjectionComponentOption,
} from '../../../modules/production/utils/injectionComponentOptions';
import { DEFAULT_PLAN_SETTINGS } from '../../../utils/dashboardConfig';
import { ProductionLineStatus } from '../../../types';
import { PLAN_STATUS_SORT_RANK } from '../../../modules/production/utils/productionPlanReports';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';

const LINKABLE_PLAN_STATUSES = new Set(['planned', 'in_progress', 'paused']);
const PLAN_STATUS_LABEL: Record<string, string> = {
  in_progress: 'شغال',
  planned: 'مش شغال',
  paused: 'متوقف',
};

const DEFAULT_BREAK_START = '12:00';
const DEFAULT_BREAK_END = '12:30';
const DEFAULT_WORKDAY_END = '16:00';

const durationDaysBetweenInclusive = (startDate: string, endDate: string): number => {
  if (!startDate || !endDate) return 1;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 1;
  return Math.floor(diffMs / 86_400_000) + 1;
};

type WorkOrderFormState = {
  planId: string;
  workOrderType: 'finished_product' | 'component_injection';
  productId: string;
  lineId: string;
  supervisorId: string;
  quantity: number;
  maxWorkers: number;
  workHours: number;
  startDate: string;
  durationDays: number;
  targetDate: string;
  notes: string;
  breakStartTime: string;
  breakEndTime: string;
  workdayEndTime: string;
  requiresProductionIssue: boolean;
};

const emptyForm = (requiresProductionIssue = true): WorkOrderFormState => ({
  planId: '',
  workOrderType: 'finished_product',
  productId: '',
  lineId: '',
  supervisorId: '',
  quantity: 0,
  maxWorkers: 0,
  workHours: 0,
  startDate: getTodayDateString(),
  durationDays: 1,
  targetDate: getTodayDateString(),
  notes: '',
  breakStartTime: DEFAULT_BREAK_START,
  breakEndTime: DEFAULT_BREAK_END,
  workdayEndTime: DEFAULT_WORKDAY_END,
  requiresProductionIssue,
});

export const GlobalCreateWorkOrderModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.WORK_ORDERS_CREATE);
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const createWorkOrder = useAppStore((s) => s.createWorkOrder);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const fetchProductionPlans = useAppStore((s) => s.fetchProductionPlans);
  const plans = useAppStore((s) => s.productionPlans);
  const products = useAppStore((s) => s._rawProducts);
  const lines = useAppStore((s) => s._rawLines);
  const employees = useAppStore((s) => s._rawEmployees);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const lineStatuses = useAppStore((s) => s.lineStatuses);
  const injectionCategoryKeywords = systemSettings.planSettings?.injectionRawMaterialCategoryKeywords
    ?? DEFAULT_PLAN_SETTINGS.injectionRawMaterialCategoryKeywords;
  const companyRequiresProductionIssue = defaultRequiresProductionIssueFromCompany(
    resolveInventoryRoutingV1(systemSettings).requireIssuedProductionIssueOnReport,
  );
  const inheritRequiresFromPlan = (plan: typeof plans[number] | null | undefined): boolean =>
    resolveRequiresProductionIssueOnReport({
      companyRequire: companyRequiresProductionIssue,
      planRequiresProductionIssue: plan?.requiresProductionIssue,
    });
  const [form, setForm] = useState<WorkOrderFormState>(() => emptyForm(true));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [injectionComponents, setInjectionComponents] = useState<InjectionComponentOption[]>([]);
  const canCreateFinishedWorkOrders = can('workOrders.create');
  const canManageComponentInjectionWorkOrders = can('workOrders.componentInjection.manage');
  const canChooseWorkOrderType = canCreateFinishedWorkOrders && canManageComponentInjectionWorkOrders;

  useEffect(() => {
    let mounted = true;
    loadInjectionComponentOptions(injectionCategoryKeywords)
      .then((rows) => {
        if (mounted) setInjectionComponents(rows);
      })
      .catch(() => {
        if (mounted) setInjectionComponents([]);
      });
    return () => {
      mounted = false;
    };
  }, [injectionCategoryKeywords]);

  const supervisors = useMemo(
    () => employees.filter((e) => e.level === 2 && e.isActive),
    [employees],
  );

  const productNameById = useMemo(() => {
    const map = new Map(products.map((p) => [p.id!, p.name]));
    injectionComponents.forEach((m) => {
      if (m.id && !map.has(m.id)) map.set(m.id, m.name);
    });
    return map;
  }, [products, injectionComponents]);

  const selectableProductOptions = useMemo(() => {
    if (form.workOrderType === 'component_injection') {
      return injectionComponents.map((m) => ({
        value: m.id,
        label: m.code ? `${m.name} (${m.code})` : m.name,
        name: m.name,
        code: m.code,
        barcode: m.barcode,
        stockItemType: 'material' as const,
      }));
    }
    return filterProductionProducts(products)
      .filter((p) => Boolean(p.id))
      .map((p) => ({
        value: p.id!,
        label: `${p.name} (${p.code})`,
        name: p.name,
        code: p.code,
        barcode: p.barcode,
        stockItemType: 'finished_good' as const,
      }));
  }, [form.workOrderType, injectionComponents, products]);

  const selectableProductPicker = useMemo(
    () => buildCodeVoucherPicker(selectableProductOptions),
    [selectableProductOptions],
  );

  const injectionLineIds = useMemo(() => {
    const ids = new Set<string>();
    lines.forEach((line) => {
      if (line.id && line.status === ProductionLineStatus.INJECTION) ids.add(line.id);
    });
    lineStatuses.forEach((status) => {
      if (status.isInjectionLine && status.lineId) ids.add(status.lineId);
    });
    return ids;
  }, [lines, lineStatuses]);

  const selectableLines = useMemo(() => {
    if (form.workOrderType !== 'component_injection') return lines;
    return lines.filter((line) => line.id && injectionLineIds.has(line.id));
  }, [form.workOrderType, lines, injectionLineIds]);

  const lineOptions = useMemo(
    () => selectableLines
      .filter((line) => Boolean(line.id))
      .map((line) => ({
        value: line.id!,
        label: line.name,
        keywords: line.code || '',
        scanKeys: line.code ? [line.code] : undefined,
      })),
    [selectableLines],
  );

  const supervisorOptions = useMemo(
    () => supervisors
      .filter((supervisor) => Boolean(supervisor.id))
      .map((supervisor) => ({
        value: supervisor.id!,
        label: supervisor.name,
        keywords: [supervisor.code, supervisor.phone].filter(Boolean).join(' '),
        scanKeys: supervisor.code ? [supervisor.code] : undefined,
      })),
    [supervisors],
  );

  useEffect(() => {
    if (!form.productId) return;
    if (selectableProductOptions.some((opt) => opt.value === form.productId)) return;
    setForm((f) => ({ ...f, productId: '' }));
  }, [form.productId, selectableProductOptions]);

  useEffect(() => {
    if (!form.lineId) return;
    if (selectableLines.some((line) => line.id === form.lineId)) return;
    setForm((f) => ({ ...f, lineId: '' }));
  }, [form.lineId, selectableLines]);

  const activePlans = useMemo(
    () => plans
      .filter((p) => {
        if (!LINKABLE_PLAN_STATUSES.has(p.status)) return false;
        const planIsInjection = p.planType === 'component_injection';
        if (planIsInjection) return canManageComponentInjectionWorkOrders;
        return canCreateFinishedWorkOrders;
      })
      .sort((a, b) => {
        const statusDiff = (PLAN_STATUS_SORT_RANK[a.status] ?? 99) - (PLAN_STATUS_SORT_RANK[b.status] ?? 99);
        if (statusDiff !== 0) return statusDiff;
        return String(b.plannedStartDate || b.startDate || '').localeCompare(String(a.plannedStartDate || a.startDate || ''));
      }),
    [plans, canCreateFinishedWorkOrders, canManageComponentInjectionWorkOrders],
  );

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === form.planId) ?? null,
    [plans, form.planId],
  );

  const planOptions = useMemo(
    () => {
      const optionPlans = [...activePlans];
      if (selectedPlan?.id && !optionPlans.some((p) => p.id === selectedPlan.id)) {
        const selectedAllowed = selectedPlan.planType === 'component_injection'
          ? canManageComponentInjectionWorkOrders
          : canCreateFinishedWorkOrders;
        if (selectedAllowed) optionPlans.unshift(selectedPlan);
      }

      return [
        { value: '', label: t('modalManager.createWorkOrder.noPlan') },
        ...optionPlans.map((p) => {
          const typeLabel = p.planType === 'component_injection' ? 'حقن' : 'منتج';
          const statusLabel = PLAN_STATUS_LABEL[p.status] || p.status;
          const name = productNameById.get(p.productId) || t('modalManager.createWorkOrder.unknownProduct');
          const remaining = formatNumber(Math.max((p.plannedQuantity || 0) - (p.producedQuantity || 0), 0));
          return {
            value: p.id!,
            label: `[${typeLabel} · ${statusLabel}] ${name} — ${t('modalManager.createWorkOrder.remaining')}: ${remaining}${p.plannedEndDate ? ` - ${p.plannedEndDate}` : ''}`,
          };
        }),
      ];
    },
    [
      activePlans,
      productNameById,
      selectedPlan,
      canCreateFinishedWorkOrders,
      canManageComponentInjectionWorkOrders,
      t,
    ],
  );

  useEffect(() => {
    if (!form.planId || !selectedPlan) return;
    const planIsInjection = selectedPlan.planType === 'component_injection';
    const allowed = planIsInjection
      ? canManageComponentInjectionWorkOrders
      : canCreateFinishedWorkOrders;
    if (allowed) return;
    setForm((f) => ({ ...f, planId: '' }));
  }, [form.planId, selectedPlan, canCreateFinishedWorkOrders, canManageComponentInjectionWorkOrders]);

  const selectedPlanRemaining = useMemo(
    () => (
      selectedPlan
        ? Math.max((selectedPlan.plannedQuantity || 0) - (selectedPlan.producedQuantity || 0), 0)
        : 0
    ),
    [selectedPlan],
  );

  useEffect(() => {
    if (!isOpen) {
      setEditingId(null);
      setLoadingEdit(false);
      return;
    }

    void fetchProductionPlans({ maxAgeMs: 30_000 }).catch(() => undefined);

    const mode = payload && typeof payload.mode === 'string' ? payload.mode : '';
    const workOrderId =
      payload && typeof payload.workOrderId === 'string' ? payload.workOrderId.trim() : '';

    if (mode !== 'edit' || !workOrderId) {
      setEditingId(null);
      setLoadingEdit(false);
      const base = emptyForm(companyRequiresProductionIssue);
      const payloadPlanId = payload && typeof payload.planId === 'string' ? payload.planId.trim() : '';
      const payloadProductId = payload && typeof payload.productId === 'string' ? payload.productId.trim() : '';
      const selectedPayloadPlan = payloadPlanId ? plans.find((p) => p.id === payloadPlanId) : null;
      const planStartDate = selectedPayloadPlan?.plannedStartDate || selectedPayloadPlan?.startDate || base.startDate;
      const planTargetDate = selectedPayloadPlan?.plannedEndDate || base.targetDate;
      const planRemaining = selectedPayloadPlan
        ? Math.max((selectedPayloadPlan.plannedQuantity || 0) - (selectedPayloadPlan.producedQuantity || 0), 0)
        : 0;
      const inferredTypeFromPlan = selectedPayloadPlan?.planType === 'component_injection'
        ? 'component_injection' as const
        : base.workOrderType;
      const defaultType = !canCreateFinishedWorkOrders && canManageComponentInjectionWorkOrders
        ? 'component_injection' as const
        : inferredTypeFromPlan;
      const prefilled = {
        ...base,
        planId: selectedPayloadPlan?.id || payloadPlanId,
        workOrderType: defaultType,
        productId: selectedPayloadPlan?.productId || payloadProductId,
        lineId: selectedPayloadPlan?.lineId || '',
        quantity: planRemaining,
        startDate: planStartDate,
        targetDate: planTargetDate,
        durationDays: durationDaysBetweenInclusive(planStartDate, planTargetDate),
        requiresProductionIssue: inheritRequiresFromPlan(selectedPayloadPlan),
      };
      setForm(prefilled);
      setError(null);
      return;
    }

    setEditingId(workOrderId);
    let cancelled = false;
    setLoadingEdit(true);
    setError(null);

    void workOrderService.getById(workOrderId).then((wo) => {
      if (cancelled) return;
      setLoadingEdit(false);
      if (!wo) {
        setError(t('modalManager.createWorkOrder.loadError'));
        return;
      }
      setForm({
        planId: wo.planId || '',
        workOrderType: wo.workOrderType === 'component_injection' ? 'component_injection' : 'finished_product',
        productId: wo.productId,
        lineId: wo.lineId,
        supervisorId: wo.supervisorId,
        quantity: wo.quantity,
        maxWorkers: wo.maxWorkers,
        workHours: Number((wo as { workHours?: number }).workHours || 0),
        startDate: wo.startDate || wo.targetDate || getTodayDateString(),
        durationDays: durationDaysBetweenInclusive(wo.startDate || wo.targetDate, wo.targetDate),
        targetDate: wo.targetDate,
        notes: wo.notes || '',
        breakStartTime: wo.breakStartTime || DEFAULT_BREAK_START,
        breakEndTime: wo.breakEndTime || DEFAULT_BREAK_END,
        workdayEndTime: wo.workdayEndTime || DEFAULT_WORKDAY_END,
        requiresProductionIssue: typeof wo.requiresProductionIssue === 'boolean'
          ? wo.requiresProductionIssue
          : inheritRequiresFromPlan(plans.find((p) => p.id === wo.planId) ?? null),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, payload, plans, canCreateFinishedWorkOrders, canManageComponentInjectionWorkOrders, fetchProductionPlans, t]);

  const openForEdit =
    isOpen &&
    payload &&
    payload.mode === 'edit' &&
    typeof payload.workOrderId === 'string' &&
    payload.workOrderId.trim().length > 0;

  const isEditMode = Boolean(editingId);
  const createEntryPath = payload?.source === 'workOrders.queryParams'
    ? WORK_ORDER_CREATE_PATHS.productionPlan
    : WORK_ORDER_CREATE_PATHS.workOrdersPage;
  const editOperation = openForEdit || isEditMode;
  const operationPathEnabled = isOperationPathEnabled(
    systemSettings,
    editOperation ? WORK_ORDER_OPERATION_KEYS.update : WORK_ORDER_OPERATION_KEYS.create,
    editOperation ? WORK_ORDER_UPDATE_PATHS.workOrderModal : createEntryPath,
  );

  if (!isOpen) return null;
  if (!operationPathEnabled) return null;

  const canUseModal =
    canCreateFinishedWorkOrders ||
    canManageComponentInjectionWorkOrders ||
    (openForEdit && can('workOrders.edit'));
  if (!canUseModal) return null;

  const missingRequiredFields = [
    !form.productId ? (form.workOrderType === 'component_injection' ? 'مكون الحقن' : 'المنتج') : '',
    !form.lineId ? 'خط الإنتاج' : '',
    !form.supervisorId ? 'المشرف' : '',
    form.quantity <= 0 ? 'الكمية' : '',
    !form.startDate ? 'تاريخ البداية' : '',
    !form.targetDate ? 'تاريخ النهاية' : '',
  ].filter(Boolean);

  const handleClose = () => {
    if (saving) return;
    setError(null);
    close();
  };

  const handleSave = async () => {
    if (missingRequiredFields.length > 0) {
      setError(`لا يمكن إنشاء أمر الشغل قبل استكمال: ${missingRequiredFields.join('، ')}`);
      return;
    }
    if (form.workOrderType === 'component_injection' && !canManageComponentInjectionWorkOrders) {
      setError(isEditMode ? t('modalManager.createWorkOrder.permissionEditInjectionDenied') : t('modalManager.createWorkOrder.permissionCreateInjectionDenied'));
      return;
    }
    if (isEditMode && !can('workOrders.edit')) {
      setError(t('modalManager.createWorkOrder.permissionEditDenied'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEditMode && editingId) {
        await updateWorkOrder(editingId, {
          workOrderType: form.workOrderType,
          productId: form.productId,
          lineId: form.lineId,
          supervisorId: form.supervisorId,
          quantity: form.quantity,
          maxWorkers: form.maxWorkers,
          workHours: form.workHours,
          startDate: form.startDate,
          targetDate: form.targetDate,
          estimatedDurationDays: form.durationDays,
          notes: form.notes,
          breakStartTime: form.breakStartTime || DEFAULT_BREAK_START,
          breakEndTime: form.breakEndTime || DEFAULT_BREAK_END,
          workdayEndTime: form.workdayEndTime || DEFAULT_WORKDAY_END,
          ...(form.planId ? { planId: form.planId } : {}),
          requiresProductionIssue: form.requiresProductionIssue,
        }, { path: WORK_ORDER_UPDATE_PATHS.workOrderModal });
        showAppToast('success', t('modalManager.createWorkOrder.editSuccess'));
        setForm(emptyForm(companyRequiresProductionIssue));
        setSaving(false);
        close();
        return;
      }
      const woNumber = '';
      const est = estimateReportCost(
        form.maxWorkers,
        form.workHours,
        form.quantity,
        laborSettings?.hourlyRate ?? 0,
        employees.find((e) => e.id === form.supervisorId)?.hourlyRate ?? 0,
        form.lineId,
        form.targetDate,
        costCenters,
        costCenterValues,
        costAllocations,
      );
      const createdId = await createWorkOrder({
        workOrderNumber: woNumber,
        ...(form.planId ? { planId: form.planId } : {}),
        workOrderType: form.workOrderType,
        productId: form.productId,
        lineId: form.lineId,
        supervisorId: form.supervisorId,
        quantity: form.quantity,
        producedQuantity: 0,
        maxWorkers: form.maxWorkers,
        workHours: form.workHours,
        startDate: form.startDate,
        targetDate: form.targetDate,
        estimatedDurationDays: form.durationDays,
        estimatedCost: est.totalCost,
        actualCost: 0,
        status: 'pending',
        notes: form.notes,
        breakStartTime: form.breakStartTime || DEFAULT_BREAK_START,
        breakEndTime: form.breakEndTime || DEFAULT_BREAK_END,
        workdayEndTime: form.workdayEndTime || DEFAULT_WORKDAY_END,
        requiresProductionIssue: form.requiresProductionIssue,
        createdBy: uid || '',
      }, { path: createEntryPath });
      if (!createdId) throw new Error('Failed create');
      showAppToast('success', t('modalManager.createWorkOrder.createSuccess'));
      setForm(emptyForm(companyRequiresProductionIssue));
      setSaving(false);
      close();
    } catch {
      showAppToast('error', isEditMode ? t('modalManager.createWorkOrder.editError') : t('modalManager.createWorkOrder.createError'));
      setError(isEditMode ? t('modalManager.createWorkOrder.editError') : t('modalManager.createWorkOrder.createError'));
      setSaving(false);
    }
  };

  const showEditChrome = openForEdit || isEditMode;

  return (
    <ManagedModalPortal>
    <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={handleClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:w-[95vw] sm:rounded-[var(--border-radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-5">
          <h3 className="min-w-0 truncate text-base font-bold sm:text-lg">{showEditChrome ? t('modalManager.createWorkOrder.editTitle') : t('modalManager.createWorkOrder.createTitle')}</h3>
          <button onClick={handleClose} className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]" aria-label={t('ui.close')}>
            <X size={20} />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {loadingEdit && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--border-radius-lg)] bg-[var(--color-card)]/80 backdrop-blur-[2px]">
              <Loader2 size={28} className="animate-spin text-primary" aria-hidden />
              <span className="sr-only">{t('modalManager.createWorkOrder.loadingOrderData')}</span>
            </div>
          )}
          {error && (
            <div className="erp-alert erp-alert-error">
              <AlertCircle size={16} className="text-[rgb(var(--color-danger))]" />
              <p className="text-sm font-bold text-[rgb(var(--color-danger))] flex-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">ربط بخطة إنتاج (اختياري)</label>
            <SearchableSelect
              options={planOptions}
              value={form.planId}
              onChange={(value) => {
                const plan = plans.find((p) => p.id === value);
                const planStartDate = plan?.plannedStartDate || plan?.startDate || form.startDate;
                const planTargetDate = plan?.plannedEndDate || form.targetDate;
                const remaining = plan
                  ? Math.max((plan.plannedQuantity || 0) - (plan.producedQuantity || 0), 0)
                  : form.quantity;
                setForm((f) => ({
                  ...f,
                  planId: value,
                  workOrderType: !plan
                    ? f.workOrderType
                    : plan.planType === 'component_injection'
                      ? 'component_injection'
                      : 'finished_product',
                  productId: plan?.productId || (value ? '' : f.productId),
                  lineId: plan?.lineId || (value ? '' : f.lineId),
                  quantity: remaining,
                  startDate: planStartDate,
                  targetDate: planTargetDate,
                  durationDays: durationDaysBetweenInclusive(planStartDate, planTargetDate),
                  requiresProductionIssue: plan
                    ? inheritRequiresFromPlan(plan)
                    : companyRequiresProductionIssue,
                }));
              }}
              placeholder="اختر خطة أو اتركه بدون خطة"
              className="bg-[var(--color-card)]"
            />
            {activePlans.length === 0 && (
              <p className="mt-2 text-[11px] font-bold text-[var(--color-text-muted)]">
                لا توجد خطط متاحة للربط. تظهر هنا الخطط بحالة شغال أو مش شغال أو متوقف حسب صلاحياتك.
              </p>
            )}
            {selectedPlan && (
              <div className="mt-2 rounded-[var(--border-radius-base)] border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.1)] px-3 py-2 text-xs font-bold text-[rgb(var(--color-primary))] space-y-1">
                <p>
                  {t('modalManager.createWorkOrder.remainingInPlan')}: {formatNumber(selectedPlanRemaining)} {t('modalManager.createWorkOrder.units')}
                  <span className="text-[rgb(var(--color-primary))]"> ({t('modalManager.createWorkOrder.ofPlanned', { value: formatNumber(selectedPlan.plannedQuantity || 0) })})</span>
                  <span className="mx-1 text-[rgb(var(--color-primary))]">—</span>
                  {productNameById.get(selectedPlan.productId) || t('modalManager.createWorkOrder.unknownProduct')}
                  {selectedPlan.lineId ? (
                    <>
                      <span className="mx-1 text-[rgb(var(--color-primary))]">/</span>
                      {lines.find((l) => l.id === selectedPlan.lineId)?.name || t('modalManager.createWorkOrder.unknownLine')}
                    </>
                  ) : (
                    <span className="text-[var(--color-text-muted)]"> — اختر خط الإنتاج لأمر الشغل</span>
                  )}
                </p>
                <p className={selectedPlan.acceptsProductionFromReports === false ? 'text-[rgb(var(--color-warning))]' : 'text-[rgb(var(--color-primary))]'}>
                  {selectedPlan.acceptsProductionFromReports === false
                    ? 'هذه الخطة لا تستقبل إنتاج أوامر الشغل؛ سيتم تتبع كمية أمر الشغل منفصلة عن تقدم الخطة.'
                    : 'أمر الشغل مرتبط بالخطة، وتقاريره تُحسب على تقدم الخطة.'}
                </p>
              </div>
            )}
          </div>

          {canChooseWorkOrderType && (
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.workOrderType')}</label>
              <select
                value={form.workOrderType}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  workOrderType: e.target.value === 'component_injection' ? 'component_injection' : 'finished_product',
                  productId: '',
                  lineId: '',
                  planId: '',
                }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              >
                <option value="finished_product">{t('modalManager.createWorkOrder.typeFinishedProduct')}</option>
                <option value="component_injection">{t('modalManager.createWorkOrder.typeComponentInjection')}</option>
              </select>
            </div>
          )}

          {!selectedPlan && (
            <>
              <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-bold text-[var(--color-text-muted)]">
                {form.workOrderType === 'component_injection'
                  ? 'بيانات أمر شغل بدون خطة: اختر مكون الحقن وخط الحقن يدوياً.'
                  : 'بيانات أمر شغل بدون خطة: اختر المنتج وخط الإنتاج يدوياً.'}
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                  {form.workOrderType === 'component_injection'
                    ? 'مكون الحقن *'
                    : t('modalManager.createWorkOrder.productRequired')}
                </label>
                <VoucherItemCombobox
                  options={selectableProductPicker.options}
                  catalog={selectableProductPicker.catalog}
                  value={form.productId}
                  onChange={(value) => setForm((f) => ({ ...f, productId: value }))}
                  placeholder={
                    form.workOrderType === 'component_injection'
                      ? 'ابحث أو امسح كود مكون الحقن'
                      : t('modalManager.createWorkOrder.searchAndSelectProduct')
                  }
                  className="bg-[var(--color-card)]"
                />
              </div>
            </>
          )}

          {(!selectedPlan || !selectedPlan.lineId) && (
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.productionLineRequired')}</label>
                <SearchableSelect
                  options={lineOptions}
                  value={form.lineId}
                  onChange={(value) => setForm((f) => ({ ...f, lineId: value }))}
                  placeholder={t('modalManager.createWorkOrder.selectLine')}
                  className="bg-[var(--color-card)]"
                />
              </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.supervisorRequired')}</label>
            <SearchableSelect
              options={supervisorOptions}
              value={form.supervisorId}
              onChange={(value) => setForm((f) => ({ ...f, supervisorId: value }))}
              placeholder={t('modalManager.createWorkOrder.selectSupervisor')}
              className="bg-[var(--color-card)]"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.quantityRequired')}</label>
              <input
                type="number"
                min={1}
                value={form.quantity || ''}
                onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.workersCountRequired')}</label>
              <input
                type="number"
                min={1}
                value={form.maxWorkers || ''}
                onChange={(e) => setForm((f) => ({ ...f, maxWorkers: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.workHoursRequired')}</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.workHours || ''}
                onChange={(e) => setForm((f) => ({ ...f, workHours: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">تاريخ بداية الأمر</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => {
                  const startDate = e.target.value || getTodayDateString();
                  const targetDate = form.targetDate && form.targetDate >= startDate ? form.targetDate : startDate;
                  setForm((f) => ({
                    ...f,
                    startDate,
                    targetDate,
                    durationDays: durationDaysBetweenInclusive(startDate, targetDate),
                  }));
                }}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">تاريخ نهاية الأمر</label>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => {
                  const targetDate = e.target.value || form.startDate;
                  setForm((f) => ({
                    ...f,
                    targetDate,
                    durationDays: durationDaysBetweenInclusive(f.startDate, targetDate),
                  }));
                }}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] sm:col-span-2">
              مدة الأمر المحسوبة: <span className="font-bold text-[var(--color-text)]">{formatNumber(form.durationDays || 1)}</span> يوم
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.dailyBreakStart')}</label>
              <input
                type="time"
                value={form.breakStartTime}
                onChange={(e) => setForm((f) => ({ ...f, breakStartTime: e.target.value || DEFAULT_BREAK_START }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.dailyBreakEnd')}</label>
              <input
                type="time"
                value={form.breakEndTime}
                onChange={(e) => setForm((f) => ({ ...f, breakEndTime: e.target.value || DEFAULT_BREAK_END }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.dailyShiftEnd')}</label>
              <input
                type="time"
                value={form.workdayEndTime}
                onChange={(e) => setForm((f) => ({ ...f, workdayEndTime: e.target.value || DEFAULT_WORKDAY_END }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            {t('modalManager.createWorkOrder.dailyTimeHint')}
          </p>
          <label className="flex items-start gap-3 rounded-[var(--border-radius-lg)] border border-primary/15 bg-primary/5 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requiresProductionIssue}
              onChange={(e) => setForm((f) => ({ ...f, requiresProductionIssue: e.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-primary focus:ring-primary/30"
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-black text-[var(--color-text)]">تحتاج صرف إنتاج؟</span>
              <span className="block text-[11px] font-semibold leading-relaxed text-[var(--color-text-muted)]">
                عند اختيار خطة يُنسخ الخيار منها تلقائياً. يمكن تعديله لأمر الشغل.
              </span>
            </span>
          </label>
          {missingRequiredFields.length > 0 && (
            <div className="rounded-[var(--border-radius-base)] border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] px-3 py-2 text-xs font-bold text-[rgb(var(--color-warning))]">
              لاستكمال الإنشاء أدخل: {missingRequiredFields.join('، ')}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-between gap-2 border-t border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={handleClose} disabled={saving || loadingEdit} iconName="close" tone="neutral">{t('ui.cancel')}</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={
              saving ||
              loadingEdit
            }
            title={missingRequiredFields.length > 0 ? `استكمل: ${missingRequiredFields.join('، ')}` : undefined}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {showEditChrome ? t('modalManager.createWorkOrder.saveChanges') : t('modalManager.createWorkOrder.createOrder')}
          </Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
