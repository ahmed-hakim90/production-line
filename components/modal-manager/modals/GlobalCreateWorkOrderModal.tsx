import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button, SearchableSelect } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { estimateReportCost } from '../../../utils/costCalculations';
import { formatNumber, getTodayDateString } from '../../../utils/calculations';
import { workOrderService } from '../../../modules/production/services/workOrderService';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { useTranslation } from 'react-i18next';

const DEFAULT_BREAK_START = '12:00';
const DEFAULT_BREAK_END = '12:30';
const DEFAULT_WORKDAY_END = '16:00';

type WorkOrderFormState = {
  planId: string;
  workOrderType: 'finished_product' | 'component_injection';
  productId: string;
  lineId: string;
  supervisorId: string;
  quantity: number;
  maxWorkers: number;
  workHours: number;
  targetDate: string;
  notes: string;
  breakStartTime: string;
  breakEndTime: string;
  workdayEndTime: string;
};

const emptyForm = (): WorkOrderFormState => ({
  planId: '',
  workOrderType: 'finished_product',
  productId: '',
  lineId: '',
  supervisorId: '',
  quantity: 0,
  maxWorkers: 0,
  workHours: 0,
  targetDate: getTodayDateString(),
  notes: '',
  breakStartTime: DEFAULT_BREAK_START,
  breakEndTime: DEFAULT_BREAK_END,
  workdayEndTime: DEFAULT_WORKDAY_END,
});

export const GlobalCreateWorkOrderModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.WORK_ORDERS_CREATE);
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const createWorkOrder = useAppStore((s) => s.createWorkOrder);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const plans = useAppStore((s) => s.productionPlans);
  const products = useAppStore((s) => s._rawProducts);
  const lines = useAppStore((s) => s._rawLines);
  const employees = useAppStore((s) => s._rawEmployees);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const [form, setForm] = useState<WorkOrderFormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canCreateFinishedWorkOrders = can('workOrders.create');
  const canManageComponentInjectionWorkOrders = can('workOrders.componentInjection.manage');
  const canChooseWorkOrderType = canCreateFinishedWorkOrders && canManageComponentInjectionWorkOrders;

  const supervisors = useMemo(
    () => employees.filter((e) => e.level === 2 && e.isActive),
    [employees],
  );

  const productNameById = useMemo(
    () => new Map(products.map((p) => [p.id!, p.name])),
    [products],
  );

  const activePlans = useMemo(
    () => plans.filter((p) => p.status === 'planned' || p.status === 'in_progress'),
    [plans],
  );

  const planOptions = useMemo(
    () => [
      { value: '', label: t('modalManager.createWorkOrder.noPlan') },
      ...activePlans.map((p) => ({
        value: p.id!,
        label: `${productNameById.get(p.productId) || t('modalManager.createWorkOrder.unknownProduct')} — ${t('modalManager.createWorkOrder.remaining')}: ${formatNumber(Math.max((p.plannedQuantity || 0) - (p.producedQuantity || 0), 0))}${p.plannedEndDate ? ` - ${p.plannedEndDate}` : ''}`,
      })),
    ],
    [activePlans, productNameById, t],
  );

  const selectedPlan = useMemo(
    () => activePlans.find((p) => p.id === form.planId) ?? null,
    [activePlans, form.planId],
  );

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

    const mode = payload && typeof payload.mode === 'string' ? payload.mode : '';
    const workOrderId =
      payload && typeof payload.workOrderId === 'string' ? payload.workOrderId.trim() : '';

    if (mode !== 'edit' || !workOrderId) {
      setEditingId(null);
      setLoadingEdit(false);
      const base = emptyForm();
      setForm(
        !canCreateFinishedWorkOrders && canManageComponentInjectionWorkOrders
          ? { ...base, workOrderType: 'component_injection' }
          : base,
      );
      setError(null);
      setMessage(null);
      return;
    }

    setEditingId(workOrderId);
    let cancelled = false;
    setLoadingEdit(true);
    setError(null);
    setMessage(null);

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
        targetDate: wo.targetDate,
        notes: wo.notes || '',
        breakStartTime: wo.breakStartTime || DEFAULT_BREAK_START,
        breakEndTime: wo.breakEndTime || DEFAULT_BREAK_END,
        workdayEndTime: wo.workdayEndTime || DEFAULT_WORKDAY_END,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, payload, canCreateFinishedWorkOrders, canManageComponentInjectionWorkOrders]);

  const openForEdit =
    isOpen &&
    payload &&
    payload.mode === 'edit' &&
    typeof payload.workOrderId === 'string' &&
    payload.workOrderId.trim().length > 0;

  const isEditMode = Boolean(editingId);

  if (!isOpen) return null;

  const canUseModal =
    canCreateFinishedWorkOrders ||
    canManageComponentInjectionWorkOrders ||
    (openForEdit && can('workOrders.edit'));
  if (!canUseModal) return null;

  const handleClose = () => {
    if (saving) return;
    setMessage(null);
    setError(null);
    close();
  };

  const handleSave = async () => {
    if (!form.productId || !form.lineId || !form.supervisorId || form.quantity <= 0) return;
    if (form.workOrderType === 'component_injection' && !canManageComponentInjectionWorkOrders) {
      setError(isEditMode ? t('modalManager.createWorkOrder.permissionEditInjectionDenied') : t('modalManager.createWorkOrder.permissionCreateInjectionDenied'));
      return;
    }
    if (isEditMode && !can('workOrders.edit')) {
      setError(t('modalManager.createWorkOrder.permissionEditDenied'));
      return;
    }
    setSaving(true);
    setMessage(null);
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
          targetDate: form.targetDate,
          notes: form.notes,
          breakStartTime: form.breakStartTime || DEFAULT_BREAK_START,
          breakEndTime: form.breakEndTime || DEFAULT_BREAK_END,
          workdayEndTime: form.workdayEndTime || DEFAULT_WORKDAY_END,
          ...(form.planId ? { planId: form.planId } : {}),
        });
        setMessage(t('modalManager.createWorkOrder.editSuccess'));
      } else {
        const woNumber = await workOrderService.generateNextNumber();
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
          targetDate: form.targetDate,
          estimatedCost: est.totalCost,
          actualCost: 0,
          status: 'pending',
          notes: form.notes,
          breakStartTime: form.breakStartTime || DEFAULT_BREAK_START,
          breakEndTime: form.breakEndTime || DEFAULT_BREAK_END,
          workdayEndTime: form.workdayEndTime || DEFAULT_WORKDAY_END,
          createdBy: uid || '',
        });
        if (!createdId) throw new Error('Failed create');
        setMessage(t('modalManager.createWorkOrder.createSuccess'));
        setForm(emptyForm());
      }
    } catch {
      setError(isEditMode ? t('modalManager.createWorkOrder.editError') : t('modalManager.createWorkOrder.createError'));
    } finally {
      setSaving(false);
    }
  };

  const showEditChrome = openForEdit || isEditMode;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onClick={handleClose}>
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-lg border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="text-base sm:text-lg font-bold">{showEditChrome ? t('modalManager.createWorkOrder.editTitle') : t('modalManager.createWorkOrder.createTitle')}</h3>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 relative">
          {loadingEdit && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--border-radius-lg)] bg-[var(--color-card)]/80 backdrop-blur-[2px]">
              <Loader2 size={28} className="animate-spin text-primary" aria-hidden />
              <span className="sr-only">{t('modalManager.createWorkOrder.loadingOrderData')}</span>
            </div>
          )}
          {message && (
            <div className="erp-alert erp-alert-success">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <p className="text-sm font-bold text-emerald-700 flex-1">{message}</p>
            </div>
          )}
          {error && (
            <div className="erp-alert erp-alert-error">
              <AlertCircle size={16} className="text-rose-500" />
              <p className="text-sm font-bold text-rose-700 flex-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.productionPlanOptional')}</label>
            <SearchableSelect
              options={planOptions}
              value={form.planId}
              onChange={(value) => {
                const plan = plans.find((p) => p.id === value);
                setForm((f) => ({
                  ...f,
                  planId: value,
                  workOrderType: plan?.planType === 'component_injection' ? 'component_injection' : f.workOrderType,
                  productId: plan?.productId || f.productId,
                  lineId: plan?.lineId || f.lineId,
                }));
              }}
              placeholder={t('modalManager.createWorkOrder.searchProductOrNoPlan')}
            />
            {selectedPlan && (
              <div className="mt-2 rounded-[var(--border-radius-base)] border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                {t('modalManager.createWorkOrder.remainingInPlan')}: {formatNumber(selectedPlanRemaining)} {t('modalManager.createWorkOrder.units')}
                <span className="text-blue-500"> ({t('modalManager.createWorkOrder.ofPlanned', { value: formatNumber(selectedPlan.plannedQuantity || 0) })})</span>
                <span className="mx-1 text-blue-400">—</span>
                {productNameById.get(selectedPlan.productId) || t('modalManager.createWorkOrder.unknownProduct')}
                <span className="mx-1 text-blue-400">/</span>
                {lines.find((l) => l.id === selectedPlan.lineId)?.name || t('modalManager.createWorkOrder.unknownLine')}
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
                }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              >
                <option value="finished_product">{t('modalManager.createWorkOrder.typeFinishedProduct')}</option>
                <option value="component_injection">{t('modalManager.createWorkOrder.typeComponentInjection')}</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.productRequired')}</label>
            <SearchableSelect
              options={products.map((p) => ({ value: p.id!, label: `${p.name} (${p.code})` }))}
              value={form.productId}
              onChange={(value) => setForm((f) => ({ ...f, productId: value }))}
              placeholder={t('modalManager.createWorkOrder.searchAndSelectProduct')}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.productionLineRequired')}</label>
            <select
              value={form.lineId}
              onChange={(e) => setForm((f) => ({ ...f, lineId: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
            >
              <option value="">{t('modalManager.createWorkOrder.selectLine')}</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id!}>{l.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">{t('modalManager.createWorkOrder.supervisorRequired')}</label>
            <select
              value={form.supervisorId}
              onChange={(e) => setForm((f) => ({ ...f, supervisorId: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
            >
              <option value="">{t('modalManager.createWorkOrder.selectSupervisor')}</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id!}>{s.name}</option>
              ))}
            </select>
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
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-between">
          <Button variant="outline" onClick={handleClose} disabled={saving || loadingEdit}>{t('ui.cancel')}</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={
              saving ||
              loadingEdit ||
              !form.productId ||
              !form.lineId ||
              !form.supervisorId ||
              form.quantity <= 0
            }
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {showEditChrome ? t('modalManager.createWorkOrder.saveChanges') : t('modalManager.createWorkOrder.createOrder')}
          </Button>
        </div>
      </div>
    </div>
  );
};

