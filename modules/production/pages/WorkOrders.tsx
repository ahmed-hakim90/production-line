import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { Card, Badge, Button, KPIBox } from '../components/UI';
import { WorkOrderPrint } from '../components/ProductionReportPrint';
import type { WorkOrderPrintData } from '../components/ProductionReportPrint';
import { useAppStore, useShallowStore } from '../../../store/useAppStore';
import { formatCurrency, formatNumber, getTodayDateString } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { workOrderService } from '../../../services/workOrderService';
import { scanEventService } from '../../../services/scanEventService';
import { estimateReportCost, formatCost } from '../../../utils/costCalculations';
import type { WorkOrder, WorkOrderStatus } from '../../../types';
import { qualitySettingsService } from '../../quality/services/qualitySettingsService';

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
  const navigate = useNavigate();
  const { can } = usePermission();
  const {
    workOrders,
    currentEmployee,
    _rawProducts,
    _rawLines,
    _rawEmployees,
    productionPlans,
    laborSettings,
    costCenters,
    costCenterValues,
    costAllocations,
    fetchWorkOrders,
    createWorkOrder,
    updateWorkOrder,
    deleteWorkOrder,
  } = useShallowStore((s) => ({
    workOrders: s.workOrders,
    currentEmployee: s.currentEmployee,
    _rawProducts: s._rawProducts,
    _rawLines: s._rawLines,
    _rawEmployees: s._rawEmployees,
    productionPlans: s.productionPlans,
    laborSettings: s.laborSettings,
    costCenters: s.costCenters,
    costCenterValues: s.costCenterValues,
    costAllocations: s.costAllocations,
    fetchWorkOrders: s.fetchWorkOrders,
    createWorkOrder: s.createWorkOrder,
    updateWorkOrder: s.updateWorkOrder,
    deleteWorkOrder: s.deleteWorkOrder,
  }));

  const uid = useAppStore((s) => s.uid);
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
  const handlePrint = useReactToPrint({ contentRef: woPrintRef });

  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const highlightRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => { fetchWorkOrders(); }, []);

  const supervisors = useMemo(
    () => _rawEmployees.filter((e) => e.level === 2 && e.isActive),
    [_rawEmployees],
  );

  const productName = useCallback((id: string) => _rawProducts.find((p) => p.id === id)?.name ?? '—', [_rawProducts]);
  const lineName = useCallback((id: string) => _rawLines.find((l) => l.id === id)?.name ?? '—', [_rawLines]);
  const supervisorName = useCallback((id: string) => _rawEmployees.find((e) => e.id === id)?.name ?? '—', [_rawEmployees]);
  const shortProductName = useCallback((id: string) => {
    const fullName = productName(id);
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 2) return fullName;
    return `${parts[0]} ${parts[1]}`;
  }, [productName]);

  const filtered = useMemo(() => {
    const scoped = currentEmployee?.level === 2
      ? workOrders.filter((w) => w.supervisorId === currentEmployee.id)
      : workOrders;
    let list = [...scoped];
    if (filterStatus !== 'all') list = list.filter((w) => w.status === filterStatus);
    if (filterLine) list = list.filter((w) => w.lineId === filterLine);
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
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
  }, [workOrders, currentEmployee, filterStatus, filterLine, searchTerm]);

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
    const scoped = currentEmployee?.level === 2
      ? workOrders.filter((w) => w.supervisorId === currentEmployee.id)
      : workOrders;
    const active = scoped.filter((w) => w.status === 'in_progress' || w.status === 'pending');
    const completed = scoped.filter((w) => w.status === 'completed');
    const totalEstimated = active.reduce((s, w) => s + (w.estimatedCost || 0), 0);
    const totalActual = completed.reduce((s, w) => s + (w.actualCost || 0), 0);
    return { active: active.length, completed: completed.length, totalEstimated, totalActual };
  }, [workOrders, currentEmployee]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveToast(null);
    setSaveError(null);
    setShowModal(true);
  }, []);

  const openEdit = useCallback((wo: WorkOrder) => {
    setEditingId(wo.id!);
    setForm({
      planId: wo.planId || '',
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
    setSaving(true);
    setSaveToast(null);
    setSaveError(null);
    try {
      if (editingId) {
        await updateWorkOrder(editingId, {
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
        setSaveToast('تم حفظ تعديلات أمر الشغل بنجاح');
      } else {
        const woNumber = await workOrderService.generateNextNumber();
        const est = estimateReportCost(
          form.maxWorkers, form.workHours, form.quantity,
          laborSettings?.hourlyRate ?? 0,
          (_rawEmployees.find((e) => e.id === form.supervisorId)?.hourlyRate ?? 0),
          form.lineId,
          costCenters, costCenterValues, costAllocations
        );
        const createdId = await createWorkOrder({
          workOrderNumber: woNumber,
          ...(form.planId ? { planId: form.planId } : {}),
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
  ]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteWorkOrder(id);
    setDeleteConfirm(null);
  }, [deleteWorkOrder]);

  const handleStatusChange = useCallback(async (wo: WorkOrder, newStatus: WorkOrderStatus) => {
    if (newStatus !== 'completed') {
      await updateWorkOrder(wo.id!, { status: newStatus });
      return;
    }

    const qualityPolicies = await qualitySettingsService.getPolicies();
    if (qualityPolicies.closeRequiresQualityApproval && wo.qualityStatus !== 'approved') {
      window.alert('لا يمكن إغلاق أمر الشغل قبل اعتماد الجودة.');
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
  }, [updateWorkOrder]);

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
        window.alert('لا يمكن إغلاق أمر الشغل قبل اعتماد الجودة.');
        return;
      }
      const scanSummary = await scanEventService.buildWorkOrderSummary(closingWorkOrder.id!);
      if (scanSummary.openSessions.length > 0) {
        window.alert(`لا يمكن إغلاق أمر الشغل لوجود ${scanSummary.openSessions.length} قطعة قيد التشغيل بدون تسجيل خروج.`);
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
      setClosingWorkOrder(null);
      setClosingNote('');
      setClosingOpenSessions(0);
    } catch (error: any) {
      window.alert(error?.message || 'فشل إغلاق أمر الشغل أو إنشاء تقرير الإنتاج.');
    } finally {
      setClosingBusy(false);
    }
  }, [closingProduced, closingWorkers, closingWorkHours, closingWorkOrder, closingNote, updateWorkOrder]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">أوامر الشغل</h2>
          <p className="text-sm text-slate-500 font-medium">إدارة ومتابعة أوامر التشغيل لخطوط الإنتاج</p>
        </div>
        {can('workOrders.create') && (
          <Button variant="primary" onClick={openCreate}>
            <span className="material-icons-round text-sm">add</span>
            أمر شغل جديد
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')} className={`cursor-pointer rounded-xl transition-all ${filterStatus === 'in_progress' ? 'ring-2 ring-blue-400' : ''}`}>
          <KPIBox label="أوامر نشطة" value={kpis.active} icon="pending_actions" color="blue" />
        </div>
        <div onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')} className={`cursor-pointer rounded-xl transition-all ${filterStatus === 'completed' ? 'ring-2 ring-emerald-400' : ''}`}>
          <KPIBox label="مكتملة" value={kpis.completed} icon="check_circle" color="green" />
        </div>
        {can('workOrders.viewCost') && (
          <>
            <KPIBox label="التكلفة المقدرة" value={formatCurrency(kpis.totalEstimated)} icon="request_quote" color="amber" />
            <KPIBox label="التكلفة الفعلية" value={formatCurrency(kpis.totalActual)} icon="paid" color="purple" />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">search</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث برقم أمر الشغل أو المنتج..."
            className="pl-3 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold w-64 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold"
        >
          <option value="all">كل الحالات</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterLine}
          onChange={(e) => setFilterLine(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold"
        >
          <option value="">كل الخطوط</option>
          {_rawLines.map((l) => (
            <option key={l.id} value={l.id!}>{l.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <Card>
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600 mb-3 block">assignment</span>
            <p className="text-sm font-bold text-slate-400">لا توجد أوامر شغل</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
                  <th className="text-right py-3 px-3">رقم الأمر</th>
                  <th className="text-right py-3 px-3">المنتج</th>
                  <th className="text-right py-3 px-3">الخط</th>
                  <th className="text-right py-3 px-3">المشرف</th>
                  <th className="text-right py-3 px-3">الكمية</th>
                  <th className="text-right py-3 px-3">التقدم</th>
                  <th className="text-right py-3 px-3">الحد الأقصى</th>
                  <th className="text-right py-3 px-3">التاريخ</th>
                  {can('workOrders.viewCost') && (
                    <>
                      <th className="text-right py-3 px-3">تكلفة مقدرة</th>
                      <th className="text-right py-3 px-3">تكلفة فعلية</th>
                    </>
                  )}
                  <th className="text-right py-3 px-3">الحالة</th>
                  <th className="text-right py-3 px-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((wo) => {
                  const prog = progress(wo);
                  const variance = costVariance(wo);
                  return (
                    <tr
                      key={wo.id}
                      ref={wo.id === highlightId ? highlightRef : undefined}
                      className={`border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors duration-1000 ${
                        wo.id === highlightId ? 'bg-primary/10 ring-2 ring-primary/30 ring-inset' : ''
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-primary text-xs">{wo.workOrderNumber}</td>
                      <td className="py-3 px-3 font-bold">{shortProductName(wo.productId)}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{lineName(wo.lineId)}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{supervisorName(wo.supervisorId)}</td>
                      <td className="py-3 px-3 font-mono">
                        <span className="font-bold">{formatNumber(wo.producedQuantity)}</span>
                        <span className="text-slate-400"> / {formatNumber(wo.quantity)}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden min-w-[60px]">
                            <div
                              className={`h-full rounded-full transition-all ${prog >= 100 ? 'bg-emerald-500' : prog >= 50 ? 'bg-primary' : 'bg-amber-500'}`}
                              style={{ width: `${prog}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-500 w-10 text-left">{prog.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500">{wo.maxWorkers} عامل</td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-500">{wo.targetDate}</td>
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
                              <span className="text-slate-400">{formatCurrency(wo.actualCost)}</span>
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
                            <button onClick={() => triggerWOPrint(wo)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" title="طباعة">
                              <span className="material-icons-round text-sm">print</span>
                            </button>
                          )}
                          {can('workOrders.view') && (
                            <button
                              onClick={() => navigate(`/work-orders/${wo.id}/scanner`)}
                              className="p-1.5 rounded-lg hover:bg-primary/10 text-primary"
                              title="فتح شاشة الاسكان"
                            >
                              <span className="material-icons-round text-sm">qr_code_scanner</span>
                            </button>
                          )}
                          {can('workOrders.edit') && wo.status === 'pending' && (
                            <>
                              <button onClick={() => handleStatusChange(wo, 'in_progress')} className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600" title="بدء التنفيذ">
                                <span className="material-icons-round text-sm">play_arrow</span>
                              </button>
                              <button onClick={() => openEdit(wo)} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600" title="تعديل">
                                <span className="material-icons-round text-sm">edit</span>
                              </button>
                            </>
                          )}
                          {can('workOrders.edit') && wo.status === 'in_progress' && (
                            <button onClick={() => openCompleteModal(wo)} className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600" title="اكتمل">
                              <span className="material-icons-round text-sm">check_circle</span>
                            </button>
                          )}
                          {can('workOrders.edit') && (wo.status === 'pending' || wo.status === 'in_progress') && (
                            <button onClick={() => handleStatusChange(wo, 'cancelled')} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500" title="إلغاء">
                              <span className="material-icons-round text-sm">cancel</span>
                            </button>
                          )}
                          {can('workOrders.delete') && wo.status !== 'in_progress' && (
                            <button onClick={() => setDeleteConfirm(wo.id!)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500" title="حذف">
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
        )}
      </Card>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !saving && (setShowModal(false), setSaveError(null), setSaveToast(null))}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold">{editingId ? 'تعديل أمر شغل' : 'أمر شغل جديد'}</h3>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {saveToast && (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
                  <span className="material-icons-round text-emerald-500 text-base">check_circle</span>
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex-1">{saveToast}</p>
                  <button onClick={() => setSaveToast(null)} className="text-emerald-400 hover:text-emerald-600 transition-colors">
                    <span className="material-icons-round text-base">close</span>
                  </button>
                </div>
              )}

              {saveError && (
                <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-3">
                  <span className="material-icons-round text-rose-500 text-base">error</span>
                  <p className="text-sm font-bold text-rose-700 dark:text-rose-300 flex-1">{saveError}</p>
                  <button onClick={() => setSaveError(null)} className="text-rose-400 hover:text-rose-600 transition-colors">
                    <span className="material-icons-round text-base">close</span>
                  </button>
                </div>
              )}

              {/* Plan (optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">خطة الإنتاج (اختياري)</label>
                <select value={form.planId} onChange={(e) => {
                  const plan = productionPlans.find((p) => p.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    planId: e.target.value,
                    productId: plan?.productId || f.productId,
                  }));
                }} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold">
                  <option value="">بدون خطة</option>
                  {productionPlans.filter((p) => p.status === 'planned' || p.status === 'in_progress').map((p) => (
                    <option key={p.id} value={p.id!}>
                      {shortProductName(p.productId)} — {formatNumber(p.plannedQuantity)} وحدة
                    </option>
                  ))}
                </select>
              </div>

              {/* Product */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">المنتج *</label>
                <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold">
                  <option value="">اختر المنتج</option>
                  {_rawProducts.map((p) => (
                    <option key={p.id} value={p.id!}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </div>

              {/* Cost Estimate Preview (same as Reports) */}
              {can('workOrders.viewCost') && form.maxWorkers > 0 && form.workHours > 0 && form.quantity > 0 && form.lineId && (
                (() => {
                  const est = estimateReportCost(
                    form.maxWorkers, form.workHours, form.quantity,
                    laborSettings?.hourlyRate ?? 0,
                    (_rawEmployees.find((e) => e.id === form.supervisorId)?.hourlyRate ?? 0),
                    form.lineId,
                    costCenters, costCenterValues, costAllocations
                  );
                  return (
                    <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex flex-wrap items-center gap-4 sm:gap-6">
                      <div className="flex items-center gap-2">
                        <span className="material-icons-round text-primary text-lg">price_check</span>
                        <span className="text-xs font-bold text-slate-500">تكلفة تقديرية:</span>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-6 text-xs font-bold">
                        <span className="text-slate-600 dark:text-slate-400">عمالة: <span className="text-slate-800 dark:text-white">{formatCost(est.laborCost)} ج.م</span></span>
                        <span className="text-slate-600 dark:text-slate-400">غير مباشرة: <span className="text-slate-800 dark:text-white">{formatCost(est.indirectCost)} ج.م</span></span>
                        <span className="text-primary font-black">الوحدة: {formatCost(est.costPerUnit)} ج.م</span>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Line */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">خط الإنتاج *</label>
                <select value={form.lineId} onChange={(e) => setForm((f) => ({ ...f, lineId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold">
                  <option value="">اختر الخط</option>
                  {_rawLines.map((l) => (
                    <option key={l.id} value={l.id!}>{l.name}</option>
                  ))}
                </select>
              </div>

              {/* Supervisor */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">المشرف *</label>
                <select value={form.supervisorId} onChange={(e) => setForm((f) => ({ ...f, supervisorId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold">
                  <option value="">اختر المشرف</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id!}>{s.name} {s.code ? `(${s.code})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Quantity */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">الكمية *</label>
                  <input type="number" min={1} value={form.quantity || ''} onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold" />
                </div>

                {/* Max Workers */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">عدد العمالة *</label>
                  <input type="number" min={1} value={form.maxWorkers || ''} onChange={(e) => setForm((f) => ({ ...f, maxWorkers: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold" />
                </div>

                {/* Work Hours */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ساعات العمل *</label>
                  <input type="number" min={0} step={0.5} value={form.workHours || ''} onChange={(e) => setForm((f) => ({ ...f, workHours: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold" />
                </div>
              </div>

              {/* Target Date */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ التسليم المستهدف</label>
                <input type="date" value={form.targetDate} onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">بداية البريك</label>
                  <input
                    type="time"
                    value={form.breakStartTime}
                    onChange={(e) => setForm((f) => ({ ...f, breakStartTime: e.target.value || DEFAULT_BREAK_START }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">نهاية البريك</label>
                  <input
                    type="time"
                    value={form.breakEndTime}
                    onChange={(e) => setForm((f) => ({ ...f, breakEndTime: e.target.value || DEFAULT_BREAK_END }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">نهاية العمل</label>
                  <input
                    type="time"
                    value={form.workdayEndTime}
                    onChange={(e) => setForm((f) => ({ ...f, workdayEndTime: e.target.value || DEFAULT_WORKDAY_END }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-between">
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <span className="material-icons-round text-5xl text-rose-500 mb-3 block">warning</span>
            <h3 className="text-lg font-bold mb-2">حذف أمر الشغل</h3>
            <p className="text-sm text-slate-500 mb-6">هل أنت متأكد من حذف أمر الشغل؟ لا يمكن التراجع عن هذا الإجراء.</p>
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">إغلاق أمر الشغل</h3>
            <p className="text-sm text-slate-500 mb-4">
              {closingWorkOrder.workOrderNumber} — {shortProductName(closingWorkOrder.productId)}
            </p>

            {closingOpenSessions > 0 && (
              <div className="mb-4 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm font-bold">
                يوجد {closingOpenSessions} قطعة ما زالت قيد التشغيل بدون تسجيل خروج.
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">الإنتاج الفعلي</label>
                <input
                  type="number"
                  min={0}
                  value={closingProduced}
                  onChange={(e) => setClosingProduced(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
                  placeholder={`${closingWorkOrder.actualProducedFromScans ?? closingWorkOrder.scanSummary?.completedUnits ?? closingWorkOrder.producedQuantity ?? 0}`}
                />
                <p className="text-[11px] text-slate-400 mt-1">لو تركتها فارغة سيتم اعتماد آخر كمية من الاسكان.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">العمالة الفعلية</label>
                <input
                  type="number"
                  min={0}
                  value={closingWorkers}
                  onChange={(e) => setClosingWorkers(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ساعات العمل الفعلية</label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={closingWorkHours}
                  onChange={(e) => setClosingWorkHours(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-500 mb-1">ملحوظة الإغلاق</label>
              <textarea
                rows={3}
                value={closingNote}
                onChange={(e) => setClosingNote(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold resize-none"
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
