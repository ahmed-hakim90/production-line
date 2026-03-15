import React, { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Button, KPIBox, SearchableSelect } from '../components/UI';
import { WorkOrderPrint } from '../components/ProductionReportPrint';
import type { WorkOrderPrintData } from '../components/ProductionReportPrint';
import { useAppStore, useShallowStore } from '../../../store/useAppStore';
import { useManagedPrint } from '@/utils/printManager';
import {
  addDaysToDate,
  calculateWorkOrderExecutionMetrics,
  formatCurrency,
  formatNumber,
  getExecutionDeviationTone,
  getTodayDateString,
} from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { workOrderService } from '../services/workOrderService';
import { scanEventService } from '../services/scanEventService';
import { estimateReportCost, formatCost } from '../../../utils/costCalculations';
import type { WorkOrder, WorkOrderStatus } from '../../../types';
import { qualitySettingsService } from '../../quality/services/qualitySettingsService';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { PageHeader } from '../../../components/PageHeader';
import { toast } from '../../../components/Toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; variant: 'info' | 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'قيد الانتظار', variant: 'info' },
  in_progress: { label: 'قيد التنفيذ', variant: 'warning' },
  completed: { label: 'مكتمل', variant: 'success' },
  cancelled: { label: 'ملغي', variant: 'danger' },
};

const DEFAULT_BREAK_START = '12:00';
const DEFAULT_BREAK_END = '12:30';
const DEFAULT_WORKDAY_END = '16:00';

const EMPTY_FORM = {
  planId: '',
  workOrderType: 'finished_product' as 'finished_product' | 'component_injection',
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
};

export const WorkOrders: React.FC = () => {
  const { openModal } = useGlobalModalManager();
  const navigate = useNavigate();
  const { can } = usePermission();
  const canCreateFinishedWorkOrders = can('workOrders.create');
  const canManageComponentInjectionWorkOrders = can('workOrders.componentInjection.manage');
  const canCreateWorkOrder = canCreateFinishedWorkOrders || canManageComponentInjectionWorkOrders;
  const canChooseWorkOrderType = canCreateFinishedWorkOrders && canManageComponentInjectionWorkOrders;
  const {
    currentEmployee,
    _rawProducts,
    _rawLines,
    _rawEmployees,
    productionPlans,
    laborSettings,
    costCenters,
    costCenterValues,
    costAllocations,
    createWorkOrder,
    updateWorkOrder,
    deleteWorkOrder,
  } = useShallowStore((s) => ({
    currentEmployee: s.currentEmployee,
    _rawProducts: s._rawProducts,
    _rawLines: s._rawLines,
    _rawEmployees: s._rawEmployees,
    productionPlans: s.productionPlans,
    laborSettings: s.laborSettings,
    costCenters: s.costCenters,
    costCenterValues: s.costCenterValues,
    costAllocations: s.costAllocations,
    createWorkOrder: s.createWorkOrder,
    updateWorkOrder: s.updateWorkOrder,
    deleteWorkOrder: s.deleteWorkOrder,
  }));

  const uid = useAppStore((s) => s.uid);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<WorkOrderStatus | 'all'>('all');
  const [filterLine, setFilterLine] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [closingWorkOrder, setClosingWorkOrder] = useState<WorkOrder | null>(null);
  const [closingProduced, setClosingProduced] = useState('');
  const [closingWorkers, setClosingWorkers] = useState(0);
  const [closingWorkHours, setClosingWorkHours] = useState(0);
  const [closingNote, setClosingNote] = useState('');
  const [closingOpenSessions, setClosingOpenSessions] = useState(0);
  const [closingBusy, setClosingBusy] = useState(false);

  const [printData, setPrintData] = useState<WorkOrderPrintData | null>(null);
  const woPrintRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({ contentRef: woPrintRef, printSettings: printTemplate });

  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const highlightRef = useRef<HTMLTableRowElement>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [, setWorkOrdersCursor] = useState<any>(null);
  const [workOrdersHasMore, setWorkOrdersHasMore] = useState(false);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);
  const workOrdersCursorRef = useRef<any>(null);

  useEffect(() => {
    if (!canCreateFinishedWorkOrders && canManageComponentInjectionWorkOrders) {
      setForm((prev) => ({ ...prev, workOrderType: 'component_injection' }));
    }
  }, [canCreateFinishedWorkOrders, canManageComponentInjectionWorkOrders]);

  const loadWorkOrders = useCallback(async (append = false) => {
    setWorkOrdersLoading(true);
    try {
      const res = await workOrderService.listPaged({
        limit: 50,
        cursor: append ? workOrdersCursorRef.current : null,
      });
      setWorkOrders((prev) => append ? [...prev, ...res.items] : res.items);
      setWorkOrdersCursor(res.nextCursor);
      workOrdersCursorRef.current = res.nextCursor ?? null;
      setWorkOrdersHasMore(Boolean(res.hasMore && res.nextCursor));
    } finally {
      setWorkOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkOrders(false);
  }, [loadWorkOrders]);

  const supervisors = useMemo(
    () => _rawEmployees.filter((e) => e.level === 2 && e.isActive),
    [_rawEmployees],
  );

  const productNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of _rawProducts) {
      if (p.id) map.set(p.id, p.name);
    }
    return map;
  }, [_rawProducts]);
  const productAvgDailyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of _rawProducts) {
      if (!p.id) continue;
      map.set(p.id, Math.max(0, Number((p as any).avgDailyProduction || 0)));
    }
    return map;
  }, [_rawProducts]);

  const lineNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of _rawLines) {
      if (l.id) map.set(l.id, l.name);
    }
    return map;
  }, [_rawLines]);

  const employeeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of _rawEmployees) {
      if (e.id) map.set(e.id, e.name);
    }
    return map;
  }, [_rawEmployees]);

  const productName = useCallback((id: string) => productNameMap.get(id) ?? '—', [productNameMap]);
  const lineName = useCallback((id: string) => lineNameMap.get(id) ?? '—', [lineNameMap]);
  const supervisorName = useCallback((id: string) => employeeNameMap.get(id) ?? '—', [employeeNameMap]);
  const shortProductName = useCallback((id: string) => {
    const fullName = productName(id);
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 2) return fullName;
    return `${parts[0]} ${parts[1]}`;
  }, [productName]);

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const loggedInSupervisor = useMemo(() => {
    if (currentEmployee?.id) return currentEmployee;
    return _rawEmployees.find((e) => e.userId === uid) ?? null;
  }, [currentEmployee, _rawEmployees, uid]);

  const scopeToLoggedInSupervisor = useMemo(() => {
    const roleName = String(userRoleName || '').trim();
    const isSupervisorRole = roleName.includes('مشرف');
    return isSupervisorRole && Boolean(loggedInSupervisor?.id);
  }, [userRoleName, loggedInSupervisor]);

  const isOwnedByLoggedInSupervisor = useCallback((wo: WorkOrder) => {
    if (!loggedInSupervisor) return true;
    const woSupervisor = String(wo.supervisorId || '').trim().toLowerCase();
    const supervisorId = String(loggedInSupervisor.id || '').trim().toLowerCase();
    const supervisorName = String(loggedInSupervisor.name || '').trim().toLowerCase();
    const supervisorCode = String(loggedInSupervisor.code || '').trim().toLowerCase();
    const supervisorUserId = String(loggedInSupervisor.userId || '').trim().toLowerCase();
    return (
      woSupervisor === supervisorId ||
      (supervisorName.length > 0 && woSupervisor === supervisorName) ||
      (supervisorCode.length > 0 && woSupervisor === supervisorCode) ||
      (supervisorUserId.length > 0 && woSupervisor === supervisorUserId)
    );
  }, [loggedInSupervisor]);

  const filtered = useMemo(() => {
    const scoped = scopeToLoggedInSupervisor
      ? workOrders.filter(isOwnedByLoggedInSupervisor)
      : workOrders;
    let list = [...scoped];
    if (filterStatus !== 'all') list = list.filter((w) => w.status === filterStatus);
    if (filterLine) list = list.filter((w) => w.lineId === filterLine);
    if (deferredSearchTerm.trim()) {
      const q = deferredSearchTerm.trim().toLowerCase();
      list = list.filter((w) =>
        w.workOrderNumber.toLowerCase().includes(q) ||
        (productName(w.productId)).toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const statusOrder: Record<string, number> = { in_progress: 0, pending: 1, completed: 2, cancelled: 3 };
      return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    });
    return list;
  }, [workOrders, scopeToLoggedInSupervisor, isOwnedByLoggedInSupervisor, filterStatus, filterLine, deferredSearchTerm, productName]);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => {
        setSearchParams({}, { replace: true });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightId, filtered]);

  const kpis = useMemo(() => {
    const scoped = scopeToLoggedInSupervisor
      ? workOrders.filter(isOwnedByLoggedInSupervisor)
      : workOrders;
    const active = scoped.filter((w) => w.status === 'in_progress' || w.status === 'pending');
    const completed = scoped.filter((w) => w.status === 'completed');
    const totalEstimated = active.reduce((s, w) => s + (w.estimatedCost || 0), 0);
    const totalActual = completed.reduce((s, w) => s + (w.actualCost || 0), 0);
    return { active: active.length, completed: completed.length, totalEstimated, totalActual };
  }, [workOrders, scopeToLoggedInSupervisor, isOwnedByLoggedInSupervisor]);

  const openCreate = useCallback(() => {
    openModal(MODAL_KEYS.WORK_ORDERS_CREATE, { source: 'workOrders.page' });
  }, [openModal]);

  const openEdit = useCallback((wo: WorkOrder) => {
    setEditingId(wo.id!);
    setForm({
      planId: wo.planId || '',
      workOrderType: wo.workOrderType === 'component_injection' ? 'component_injection' : 'finished_product',
      productId: wo.productId,
      lineId: wo.lineId,
      supervisorId: wo.supervisorId,
      quantity: wo.quantity,
      maxWorkers: wo.maxWorkers,
      workHours: (wo as any).workHours || 0,
      targetDate: wo.targetDate,
      notes: wo.notes || '',
      breakStartTime: wo.breakStartTime || DEFAULT_BREAK_START,
      breakEndTime: wo.breakEndTime || DEFAULT_BREAK_END,
      workdayEndTime: wo.workdayEndTime || DEFAULT_WORKDAY_END,
    });
    setSaveToast(null);
    setSaveError(null);
    setShowModal(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.productId || !form.lineId || !form.supervisorId || form.quantity <= 0) return;
    if (form.workOrderType === 'component_injection' && !canManageComponentInjectionWorkOrders) {
      setSaveError('غير مصرح بإنشاء أو تعديل أمر شغل مكون الحقن.');
      return;
    }
    setSaving(true);
    setSaveToast(null);
    setSaveError(null);
    try {
      if (editingId) {
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
        await loadWorkOrders(false);
        setSaveToast('تم حفظ تعديلات أمر الشغل بنجاح');
      } else {
        const woNumber = await workOrderService.generateNextNumber();
        const est = estimateReportCost(
          form.maxWorkers, form.workHours, form.quantity,
          laborSettings?.hourlyRate ?? 0,
          (_rawEmployees.find((e) => e.id === form.supervisorId)?.hourlyRate ?? 0),
          form.lineId,
          form.targetDate,
          costCenters, costCenterValues, costAllocations
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
        if (!createdId) {
          throw new Error('تعذر إنشاء أمر الشغل');
        }
        await loadWorkOrders(false);
        setSaveToast('تم إنشاء أمر الشغل بنجاح');
        setForm(EMPTY_FORM);
      }
      setTimeout(() => setSaveToast(null), 3000);
    } catch (error) {
      console.error('Work order save error:', error);
      setSaveError('تعذر حفظ أمر الشغل. تأكد من الاتصال والصلاحيات ثم حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  }, [
    form,
    editingId,
    uid,
    laborSettings,
    _rawEmployees,
    costCenters,
    costCenterValues,
    costAllocations,
    createWorkOrder,
    updateWorkOrder,
    loadWorkOrders,
    canManageComponentInjectionWorkOrders,
  ]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteWorkOrder(id);
    await loadWorkOrders(false);
    setDeleteConfirm(null);
  }, [deleteWorkOrder, loadWorkOrders]);

  const handleStatusChange = useCallback(async (wo: WorkOrder, newStatus: WorkOrderStatus) => {
    if (newStatus !== 'completed') {
      await updateWorkOrder(wo.id!, { status: newStatus });
      await loadWorkOrders(false);
      return;
    }

    const qualityPolicies = await qualitySettingsService.getPolicies();
    if (qualityPolicies.closeRequiresQualityApproval && wo.qualityStatus !== 'approved') {
      toast.warning('لا يمكن إغلاق أمر الشغل قبل اعتماد الجودة.');
      return;
    }

    const scanSummary = await scanEventService.buildWorkOrderSummary(wo.id!);
    if (scanSummary.openSessions.length > 0) {
      const shouldClose = window.confirm(
        `يوجد ${scanSummary.openSessions.length} قطعة قيد التشغيل بدون تسجيل خروج. هل تريد إغلاق أمر الشغل رغم ذلك؟`,
      );
      if (!shouldClose) return;
    }

    await updateWorkOrder(wo.id!, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      actualWorkersCount: scanSummary.summary.activeWorkers,
      actualProducedFromScans: scanSummary.summary.completedUnits,
      scanSummary: scanSummary.summary,
      scanSessionClosedAt: new Date().toISOString(),
    });
    await loadWorkOrders(false);
  }, [updateWorkOrder, loadWorkOrders]);

  const openCompleteModal = useCallback(async (wo: WorkOrder) => {
    const scanSummary = await scanEventService.buildWorkOrderSummary(wo.id!);
    setClosingWorkOrder(wo);
    // Keep manual quantity empty by default.
    // If user leaves it empty, closing logic falls back to latest scan qty.
    setClosingProduced('');
    setClosingWorkers(
      wo.actualWorkersCount ??
      scanSummary.summary.activeWorkers ??
      wo.maxWorkers ??
      0
    );
    setClosingWorkHours(
      wo.actualWorkHours ??
      (wo as any).workHours ??
      0
    );
    setClosingNote(wo.notes ?? '');
    setClosingOpenSessions(scanSummary.openSessions.length);
  }, []);

  const confirmCloseWorkOrder = useCallback(async () => {
    if (!closingWorkOrder) return;
    setClosingBusy(true);
    try {
      const qualityPolicies = await qualitySettingsService.getPolicies();
      if (qualityPolicies.closeRequiresQualityApproval && closingWorkOrder.qualityStatus !== 'approved') {
        toast.warning('لا يمكن إغلاق أمر الشغل قبل اعتماد الجودة.');
        return;
      }
      const scanSummary = await scanEventService.buildWorkOrderSummary(closingWorkOrder.id!);
      if (scanSummary.openSessions.length > 0) {
        toast.warning(`لا يمكن إغلاق أمر الشغل لوجود ${scanSummary.openSessions.length} قطعة قيد التشغيل بدون تسجيل خروج.`);
        return;
      }
      const scannedQty = scanSummary.summary.completedUnits || 0;
      const manualQtyRaw = closingProduced.trim();
      const hasManualQty = manualQtyRaw !== '';
      const parsedManualQty = Number(manualQtyRaw);
      const finalProducedQty = hasManualQty && Number.isFinite(parsedManualQty) && parsedManualQty >= 0
        ? parsedManualQty
        : scannedQty;
      await updateWorkOrder(closingWorkOrder.id!, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        actualWorkersCount: Number(closingWorkers) || 0,
        actualProducedFromScans: finalProducedQty,
        scanSummary: {
          ...scanSummary.summary,
          completedUnits: finalProducedQty,
          activeWorkers: Number(closingWorkers) || 0,
        },
        scanSessionClosedAt: new Date().toISOString(),
        actualWorkHours: Number(closingWorkHours) || 0,
        notes: closingNote,
      });
      await loadWorkOrders(false);
      setClosingWorkOrder(null);
      setClosingNote('');
      setClosingOpenSessions(0);
    } catch (error: any) {
      toast.error(error?.message || 'فشل إغلاق أمر الشغل أو إنشاء تقرير الإنتاج.');
    } finally {
      setClosingBusy(false);
    }
  }, [closingProduced, closingWorkers, closingWorkHours, closingWorkOrder, closingNote, updateWorkOrder, loadWorkOrders]);

  const triggerWOPrint = useCallback(async (wo: WorkOrder) => {
    setPrintData({
      workOrderNumber: wo.workOrderNumber,
      productName: productName(wo.productId),
      lineName: lineName(wo.lineId),
      supervisorName: supervisorName(wo.supervisorId),
      quantity: wo.quantity,
      producedQuantity: wo.producedQuantity,
      maxWorkers: wo.maxWorkers,
      targetDate: wo.targetDate,
      status: wo.status,
      statusLabel: STATUS_CONFIG[wo.status].label,
      estimatedCost: wo.estimatedCost,
      actualCost: wo.actualCost,
      notes: wo.notes,
      showCosts: can('workOrders.viewCost'),
    });
    await new Promise((r) => setTimeout(r, 300));
    handlePrint();
    setTimeout(() => setPrintData(null), 1000);
  }, [productName, lineName, supervisorName, can, handlePrint]);

  const progress = (wo: WorkOrder) => wo.quantity > 0 ? Math.min((wo.producedQuantity / wo.quantity) * 100, 100) : 0;

  const costVariance = (wo: WorkOrder) => {
    if (!wo.estimatedCost || wo.status !== 'completed') return null;
    return ((wo.actualCost - wo.estimatedCost) / wo.estimatedCost) * 100;
  };

  const todayDate = getTodayDateString();

  const getExecutionMetrics = useCallback((wo: WorkOrder) => (
    calculateWorkOrderExecutionMetrics({
      quantity: wo.quantity,
      producedQuantity: wo.producedQuantity ?? 0,
      targetDate: wo.targetDate,
      createdAt: wo.createdAt,
      startDate: (wo as any).startedAt,
      status: wo.status,
      today: todayDate,
      benchmarkDailyRate: productAvgDailyMap.get(wo.productId) || 0,
    })
  ), [todayDate, productAvgDailyMap]);

  const tableRows = useMemo(() => (
    filtered.map((wo) => ({
      wo,
      progress: progress(wo),
      variance: costVariance(wo),
      execution: getExecutionMetrics(wo),
      productShortName: shortProductName(wo.productId),
      lineDisplayName: lineName(wo.lineId),
      supervisorDisplayName: supervisorName(wo.supervisorId),
    }))
  ), [filtered, getExecutionMetrics, lineName, shortProductName, supervisorName]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="أوامر الشغل"
        subtitle="إدارة ومتابعة أوامر التشغيل لخطوط الإنتاج"
        icon="assignment"
        primaryAction={canCreateWorkOrder ? {
          label: 'أمر شغل جديد',
          icon: 'add',
          onClick: openCreate,
          dataModalKey: MODAL_KEYS.WORK_ORDERS_CREATE,
        } : undefined}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')} className={`cursor-pointer rounded-[var(--border-radius-lg)] transition-all ${filterStatus === 'in_progress' ? 'ring-2 ring-blue-400' : ''}`}>
          <KPIBox label="أوامر نشطة" value={kpis.active} icon="pending_actions" color="blue" />
        </div>
        <div onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')} className={`cursor-pointer rounded-[var(--border-radius-lg)] transition-all ${filterStatus === 'completed' ? 'ring-2 ring-emerald-400' : ''}`}>
          <KPIBox label="مكتملة" value={kpis.completed} icon="check_circle" color="green" />
        </div>
        {can('workOrders.viewCost') && (
          <>
            <KPIBox label="التكلفة المقدرة" value={formatCurrency(kpis.totalEstimated)} icon="request_quote" color="amber" />
            <KPIBox label="التكلفة الفعلية" value={formatCurrency(kpis.totalActual)} icon="paid" color="purple" />
          </>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="erp-filter-bar">
        <div className="erp-search-input erp-search-input--table">
          <span className="material-icons-round text-[var(--color-text-muted)]" style={{ fontSize: 15, flexShrink: 0 }}>search</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث برقم أمر الشغل أو المنتج..."
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}>
              <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>
            </button>
          )}
        </div>
        <div className="erp-filter-sep" />
        <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as WorkOrderStatus | 'all')}>
          <SelectTrigger className={`erp-filter-select${filterStatus !== 'all' ? ' active' : ''}`}>
            <SelectValue placeholder="كل الحالات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterLine || 'all'} onValueChange={(value) => setFilterLine(value === 'all' ? '' : value)}>
          <SelectTrigger className={`erp-filter-select${filterLine ? ' active' : ''}`}>
            <SelectValue placeholder="كل الخطوط" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الخطوط</SelectItem>
            {_rawLines.map((l) => (
              <SelectItem key={l.id} value={l.id!}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterStatus !== 'all' || filterLine) && (
          <button className="erp-filter-clear" onClick={() => { setFilterStatus('all'); setFilterLine(''); }}>
            <span className="material-icons-round" style={{ fontSize: 13 }}>close</span>
            مسح
          </button>
        )}
      </div>

      {/* Table */}
      <Card>
        {tableRows.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-icons-round text-5xl text-[var(--color-text-muted)] dark:text-slate-600 mb-3 block">assignment</span>
            <p className="text-sm font-bold text-slate-400">لا توجد أوامر شغل</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="md:hidden space-y-2.5">
              {tableRows.map(({ wo, progress: prog, execution, productShortName, lineDisplayName, supervisorDisplayName }) => (
                <div key={wo.id} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono font-bold text-primary text-xs">#{wo.workOrderNumber}</p>
                      <p className="text-sm font-bold text-[var(--color-text)] mt-1">{productShortName}</p>
                    </div>
                    <Badge variant={STATUS_CONFIG[wo.status].variant}>{STATUS_CONFIG[wo.status].label}</Badge>
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                    <p><span className="font-bold">الخط:</span> {lineDisplayName}</p>
                    <p><span className="font-bold">المشرف:</span> {supervisorDisplayName}</p>
                    <p><span className="font-bold">التاريخ:</span> {wo.targetDate}</p>
                    <p><span className="font-bold">متوسط/يوم:</span> {formatNumber(Number((execution.benchmarkDailyRate || 0).toFixed(1)))} وحدة/يوم</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] p-2">
                      <p className="text-[10px] text-[var(--color-text-muted)] mb-0.5">المطلوب</p>
                      <p className="text-xs font-bold">{formatNumber(wo.quantity)}</p>
                    </div>
                    <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] p-2">
                      <p className="text-[10px] text-[var(--color-text-muted)] mb-0.5">تم إنتاجه</p>
                      <p className="text-xs font-bold text-emerald-600">{formatNumber(wo.producedQuantity)}</p>
                    </div>
                    <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] p-2">
                      <p className="text-[10px] text-[var(--color-text-muted)] mb-0.5">المتبقي</p>
                      <p className="text-xs font-bold text-rose-600">{formatNumber(Math.max(wo.quantity - wo.producedQuantity, 0))}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-[var(--color-text-muted)]">التقدم</span>
                      <span className="text-[var(--color-text)]">{prog.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${prog >= 100 ? 'bg-emerald-500' : prog >= 50 ? 'bg-primary' : 'bg-amber-500'}`} style={{ width: `${prog}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 pt-1">
                    {can('print') && (
                      <button onClick={() => triggerWOPrint(wo)} className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-[#f0f2f5] text-slate-500" title="طباعة">
                        <span className="material-icons-round text-sm">print</span>
                      </button>
                    )}
                    {can('workOrders.view') && (
                      <button onClick={() => navigate(`/work-orders/${wo.id}/scanner`)} className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-primary/10 text-primary" title="فتح شاشة الاسكان">
                        <span className="material-icons-round text-sm">qr_code_scanner</span>
                      </button>
                    )}
                    {can('workOrders.edit') && wo.status === 'pending' && (
                      <button onClick={() => handleStatusChange(wo, 'in_progress')} className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600" title="بدء التنفيذ">
                        <span className="material-icons-round text-sm">play_arrow</span>
                      </button>
                    )}
                    {can('workOrders.edit') && wo.status === 'in_progress' && (
                      <button onClick={() => openCompleteModal(wo)} className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600" title="اكتمل">
                        <span className="material-icons-round text-sm">check_circle</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm" data-no-table-enhance="true">
              <thead className="erp-thead">
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs font-bold">
                  <th className="erp-th">رقم الأمر</th>
                  <th className="erp-th">المنتج</th>
                  <th className="erp-th">الخط</th>
                  <th className="erp-th">المشرف</th>
                  <th className="erp-th">الكمية</th>
                  <th className="erp-th">التقدم</th>
                  <th className="erp-th">الحد الأقصى</th>
                  <th className="erp-th">التاريخ</th>
                  <th className="erp-th">متوسط/يوم</th>
                  <th className="erp-th">انتهاء متوقع</th>
                  <th className="erp-th">انحراف المعدل</th>
                  {can('workOrders.viewCost') && (
                    <>
                      <th className="erp-th">تكلفة مقدرة</th>
                      <th className="erp-th">تكلفة فعلية</th>
                    </>
                  )}
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ wo, progress: prog, variance, execution, productShortName, lineDisplayName, supervisorDisplayName }) => {
                  const referenceDailyRate = Math.max(0, Number(execution.benchmarkDailyRate || 0));
                  const referenceForecastEndDate = wo.status === 'completed'
                    ? 'مكتمل'
                    : execution.remainingQty <= 0
                      ? todayDate
                      : referenceDailyRate > 0
                        ? addDaysToDate(todayDate, Math.ceil(execution.remainingQty / referenceDailyRate))
                        : '—';
                  return (
                    <tr
                      key={wo.id}
                      ref={wo.id === highlightId ? highlightRef : undefined}
                      className={`border-b border-[var(--color-border)] hover:bg-[#f8f9fa]/30 transition-colors duration-1000 ${
                        wo.id === highlightId ? 'bg-primary/10 ring-2 ring-primary/30 ring-inset' : ''
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-primary text-xs">{wo.workOrderNumber}</td>
                      <td className="py-3 px-3 font-bold">{productShortName}</td>
                      <td className="py-3 px-3 text-[var(--color-text-muted)]">{lineDisplayName}</td>
                      <td className="py-3 px-3 text-[var(--color-text-muted)]">{supervisorDisplayName}</td>
                      <td className="py-3 px-3 font-mono">
                        <span className="font-bold">{formatNumber(wo.producedQuantity)}</span>
                        <span className="text-[var(--color-text-muted)]"> / {formatNumber(wo.quantity)}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden min-w-[60px]">
                            <div
                              className={`h-full rounded-full transition-all ${prog >= 100 ? 'bg-emerald-500' : prog >= 50 ? 'bg-primary' : 'bg-amber-500'}`}
                              style={{ width: `${prog}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-[var(--color-text-muted)] w-10 text-left">{prog.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500">{wo.maxWorkers} عامل</td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-500">{wo.targetDate}</td>
                      <td className="py-3 px-3 font-mono text-xs">
                        {formatNumber(Number(referenceDailyRate.toFixed(1)))} وحدة/يوم
                      </td>
                      <td className="py-3 px-3 font-mono text-xs">
                        {wo.status === 'completed' ? (
                          <span className="text-emerald-600">مكتمل</span>
                        ) : (
                          <span className={referenceForecastEndDate !== '—' && referenceForecastEndDate > wo.targetDate ? 'text-rose-600' : 'text-[var(--color-text-muted)]'}>
                            {referenceForecastEndDate}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs font-bold">
                        {wo.status === 'completed' ? (
                          <span className="text-emerald-600">—</span>
                        ) : execution.deviationPct === null ? (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        ) : (
                          <span className={
                            getExecutionDeviationTone(execution.deviationPct) === 'good'
                              ? 'text-emerald-600'
                              : getExecutionDeviationTone(execution.deviationPct) === 'danger'
                                ? 'text-rose-600'
                                : 'text-amber-600'
                          }>
                            {execution.deviationPct > 0 ? '+' : ''}{execution.deviationPct}%
                          </span>
                        )}
                      </td>
                      {can('workOrders.viewCost') && (
                        <>
                          <td className="py-3 px-3 font-mono text-xs">{formatCurrency(wo.estimatedCost)}</td>
                          <td className="py-3 px-3 font-mono text-xs">
                            {wo.status === 'completed' ? (
                              <span className={variance !== null && variance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                {formatCurrency(wo.actualCost)}
                                {variance !== null && (
                                  <span className="text-[10px] mr-1">({variance > 0 ? '+' : ''}{variance.toFixed(1)}%)</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-[var(--color-text-muted)]">{formatCurrency(wo.actualCost)}</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="py-3 px-3">
                        <Badge variant={STATUS_CONFIG[wo.status].variant}>{STATUS_CONFIG[wo.status].label}</Badge>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          {can('print') && (
                            <button onClick={() => triggerWOPrint(wo)} className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-[#f0f2f5] text-slate-500" title="طباعة">
                              <span className="material-icons-round text-sm">print</span>
                            </button>
                          )}
                          {can('workOrders.view') && (
                            <button
                              onClick={() => navigate(`/work-orders/${wo.id}/scanner`)}
                              className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-primary/10 text-primary"
                              title="فتح شاشة الاسكان"
                            >
                              <span className="material-icons-round text-sm">qr_code_scanner</span>
                            </button>
                          )}
                          {can('workOrders.edit') && wo.status === 'pending' && (
                            <>
                              <button onClick={() => handleStatusChange(wo, 'in_progress')} className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600" title="بدء التنفيذ">
                                <span className="material-icons-round text-sm">play_arrow</span>
                              </button>
                              <button onClick={() => openEdit(wo)} className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600" title="تعديل">
                                <span className="material-icons-round text-sm">edit</span>
                              </button>
                            </>
                          )}
                          {can('workOrders.edit') && wo.status === 'in_progress' && (
                            <button onClick={() => openCompleteModal(wo)} className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600" title="اكتمل">
                              <span className="material-icons-round text-sm">check_circle</span>
                            </button>
                          )}
                          {can('workOrders.edit') && (wo.status === 'pending' || wo.status === 'in_progress') && (
                            <button onClick={() => handleStatusChange(wo, 'cancelled')} className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500" title="إلغاء">
                              <span className="material-icons-round text-sm">cancel</span>
                            </button>
                          )}
                          {can('workOrders.delete') && wo.status !== 'in_progress' && (
                            <button onClick={() => setDeleteConfirm(wo.id!)} className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500" title="حذف">
                              <span className="material-icons-round text-sm">delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </Card>
      <div className="flex items-center justify-center">
        <Button
          variant="secondary"
          onClick={() => void loadWorkOrders(true)}
          disabled={!workOrdersHasMore || workOrdersLoading}
        >
          {workOrdersLoading ? 'جاري التحميل...' : (workOrdersHasMore ? 'تحميل المزيد' : 'تم تحميل كل أوامر الشغل')}
        </Button>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !saving && (setShowModal(false), setSaveError(null), setSaveToast(null))}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-lg border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-bold">{editingId ? 'تعديل أمر شغل' : 'أمر شغل جديد'}</h3>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {saveToast && (
                <div className="erp-alert erp-alert-success">
                  <span className="material-icons-round text-emerald-500 text-base">check_circle</span>
                  <p className="text-sm font-bold text-emerald-700 flex-1">{saveToast}</p>
                  <button onClick={() => setSaveToast(null)} className="text-emerald-400 hover:text-emerald-600 transition-colors">
                    <span className="material-icons-round text-base">close</span>
                  </button>
                </div>
              )}

              {saveError && (
                <div className="erp-alert erp-alert-error">
                  <span className="material-icons-round text-rose-500 text-base">error</span>
                  <p className="text-sm font-bold text-rose-700 flex-1">{saveError}</p>
                  <button onClick={() => setSaveError(null)} className="text-rose-400 hover:text-rose-600 transition-colors">
                    <span className="material-icons-round text-base">close</span>
                  </button>
                </div>
              )}

              {/* Plan (optional) */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">خطة الإنتاج (اختياري)</label>
                <Select value={form.planId || 'none'} onValueChange={(value) => {
                  const selectedPlanId = value === 'none' ? '' : value;
                  const plan = productionPlans.find((p) => p.id === selectedPlanId);
                  setForm((f) => ({
                    ...f,
                    planId: selectedPlanId,
                    workOrderType: plan?.planType === 'component_injection' ? 'component_injection' : f.workOrderType,
                    productId: plan?.productId || f.productId,
                  }));
                }}>
                  <SelectTrigger className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-medium">
                    <SelectValue placeholder="بدون خطة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون خطة</SelectItem>
                    {productionPlans.filter((p) => p.status === 'planned' || p.status === 'in_progress').map((p) => (
                      <SelectItem key={p.id} value={p.id!}>
                        {shortProductName(p.productId)} — {formatNumber(p.plannedQuantity)} وحدة
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {canChooseWorkOrderType && (
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">نوع أمر الشغل</label>
                  <Select
                    value={form.workOrderType}
                    onValueChange={(value) => setForm((f) => ({
                      ...f,
                      workOrderType: value === 'component_injection' ? 'component_injection' : 'finished_product',
                    }))}
                  >
                    <SelectTrigger className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="finished_product">أمر شغل منتج نهائي</SelectItem>
                      <SelectItem value="component_injection">أمر شغل مكون حقن</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Product */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">المنتج *</label>
                <SearchableSelect
                  options={_rawProducts.map((p) => ({
                    value: p.id!,
                    label: `${p.name} (${p.code})`,
                  }))}
                  value={form.productId}
                  onChange={(value) => setForm((f) => ({ ...f, productId: value }))}
                  placeholder="ابحث واختر المنتج"
                />
              </div>

              {/* Cost Estimate Preview (same as Reports) */}
              {can('workOrders.viewCost') && form.maxWorkers > 0 && form.workHours > 0 && form.quantity > 0 && form.lineId && (
                (() => {
                  const est = estimateReportCost(
                    form.maxWorkers, form.workHours, form.quantity,
                    laborSettings?.hourlyRate ?? 0,
                    (_rawEmployees.find((e) => e.id === form.supervisorId)?.hourlyRate ?? 0),
                    form.lineId,
                    form.targetDate,
                    costCenters, costCenterValues, costAllocations
                  );
                  return (
                    <div className="bg-primary/5 border border-primary/10 rounded-[var(--border-radius-lg)] p-4 flex flex-wrap items-center gap-4 sm:gap-6">
                      <div className="flex items-center gap-2">
                        <span className="material-icons-round text-primary text-lg">price_check</span>
                        <span className="text-xs font-bold text-slate-500">تكلفة تقديرية:</span>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-6 text-xs font-bold">
                        <span className="text-[var(--color-text-muted)]">عمالة: <span className="text-[var(--color-text)]">{formatCost(est.laborCost)} ج.م</span></span>
                        <span className="text-[var(--color-text-muted)]">غير مباشرة: <span className="text-[var(--color-text)]">{formatCost(est.indirectCost)} ج.م</span></span>
                        <span className="text-primary font-black">الوحدة: {formatCost(est.costPerUnit)} ج.م</span>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Line */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">خط الإنتاج *</label>
                <Select value={form.lineId || 'none'} onValueChange={(value) => setForm((f) => ({ ...f, lineId: value === 'none' ? '' : value }))}>
                  <SelectTrigger className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-medium">
                    <SelectValue placeholder="اختر الخط" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">اختر الخط</SelectItem>
                    {_rawLines.map((l) => (
                      <SelectItem key={l.id} value={l.id!}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Supervisor */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">المشرف *</label>
                <Select value={form.supervisorId || 'none'} onValueChange={(value) => setForm((f) => ({ ...f, supervisorId: value === 'none' ? '' : value }))}>
                  <SelectTrigger className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-medium">
                    <SelectValue placeholder="اختر المشرف" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">اختر المشرف</SelectItem>
                    {supervisors.map((s) => (
                      <SelectItem key={s.id} value={s.id!}>{s.name} {s.code ? `(${s.code})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Quantity */}
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">الكمية *</label>
                  <input type="number" min={1} value={form.quantity || ''} onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold" />
                </div>

                {/* Max Workers */}
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">عدد العمالة *</label>
                  <input type="number" min={1} value={form.maxWorkers || ''} onChange={(e) => setForm((f) => ({ ...f, maxWorkers: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold" />
                </div>

                {/* Work Hours */}
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">ساعات العمل *</label>
                  <input type="number" min={0} step={0.5} value={form.workHours || ''} onChange={(e) => setForm((f) => ({ ...f, workHours: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold" />
                </div>
              </div>

              {/* Target Date */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">تاريخ التسليم المستهدف</label>
                <input type="date" value={form.targetDate} onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">بداية البريك اليومي</label>
                  <input
                    type="time"
                    value={form.breakStartTime}
                    onChange={(e) => setForm((f) => ({ ...f, breakStartTime: e.target.value || DEFAULT_BREAK_START }))}
                    className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">نهاية البريك اليومي</label>
                  <input
                    type="time"
                    value={form.breakEndTime}
                    onChange={(e) => setForm((f) => ({ ...f, breakEndTime: e.target.value || DEFAULT_BREAK_END }))}
                    className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">نهاية الوردية اليومية</label>
                  <input
                    type="time"
                    value={form.workdayEndTime}
                    onChange={(e) => setForm((f) => ({ ...f, workdayEndTime: e.target.value || DEFAULT_WORKDAY_END }))}
                    className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
                  />
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                هذه أوقات يومية متكررة (للاسكان وحساب السيكل) وليست تاريخ انتهاء أمر الشغل نفسه.
              </p>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">ملاحظات</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-between">
              <Button variant="outline" onClick={() => { setShowModal(false); setSaveError(null); setSaveToast(null); }} disabled={saving}>إلغاء</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving || !form.productId || !form.lineId || !form.supervisorId || form.quantity <= 0}>
                {saving ? <span className="material-icons-round animate-spin text-sm">refresh</span> : null}
                {editingId ? 'حفظ التعديلات' : 'إنشاء أمر الشغل'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden print component */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <WorkOrderPrint ref={woPrintRef} data={printData} printSettings={printTemplate} />
      </div>

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <span className="material-icons-round text-5xl text-rose-500 mb-3 block">warning</span>
            <h3 className="text-lg font-bold mb-2">حذف أمر الشغل</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">هل أنت متأكد من حذف أمر الشغل؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
              <Button variant="danger" onClick={() => handleDelete(deleteConfirm)}>حذف</Button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Production Modal */}
      {closingWorkOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !closingBusy && setClosingWorkOrder(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-lg border border-[var(--color-border)] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">إغلاق أمر الشغل</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              {closingWorkOrder.workOrderNumber} — {shortProductName(closingWorkOrder.productId)}
            </p>

            {closingOpenSessions > 0 && (
              <div className="mb-4 p-3 rounded-[var(--border-radius-lg)] border border-amber-200 bg-amber-50 text-amber-700 text-sm font-bold">
                يوجد {closingOpenSessions} قطعة ما زالت قيد التشغيل بدون تسجيل خروج.
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">الإنتاج الفعلي</label>
                <input
                  type="number"
                  min={0}
                  value={closingProduced}
                  onChange={(e) => setClosingProduced(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
                  placeholder={`${closingWorkOrder.actualProducedFromScans ?? closingWorkOrder.scanSummary?.completedUnits ?? closingWorkOrder.producedQuantity ?? 0}`}
                />
                <p className="text-[11px] text-[var(--color-text-muted)] mt-1">لو تركتها فارغة سيتم اعتماد آخر كمية من الاسكان.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">العمالة الفعلية</label>
                <input
                  type="number"
                  min={0}
                  value={closingWorkers}
                  onChange={(e) => setClosingWorkers(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">ساعات العمل الفعلية</label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={closingWorkHours}
                  onChange={(e) => setClosingWorkHours(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">ملحوظة الإغلاق</label>
              <textarea
                rows={3}
                value={closingNote}
                onChange={(e) => setClosingNote(e.target.value)}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold resize-none"
                placeholder="أضف ملحوظة للتتبع (اختياري)"
              />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setClosingWorkOrder(null)} disabled={closingBusy}>إلغاء</Button>
              <Button variant="primary" onClick={confirmCloseWorkOrder} disabled={closingBusy || closingWorkHours <= 0}>
                {closingBusy && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                تأكيد إغلاق الإنتاج
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
