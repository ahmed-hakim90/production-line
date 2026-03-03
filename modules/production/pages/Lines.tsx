
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { formatNumber, getTodayDateString, calculatePlanProgress, calculateSmartStatus, calculateTimeRatio, calculateProgressRatio } from '../../../utils/calculations';
import { formatCost, buildLineAllocatedCostSummary, getCurrentMonth } from '../../../utils/costCalculations';
import { ProductionLineStatus, FirestoreProductionLine, WorkOrder, ProductionPlan, ProductionReport } from '../../../types';
import type { LineWorkerAssignment } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { PageHeader } from '../../../components/PageHeader';


const statusOptions: { value: ProductionLineStatus; label: string }[] = [
  { value: ProductionLineStatus.ACTIVE, label: 'يعمل' },
  { value: ProductionLineStatus.MAINTENANCE, label: 'صيانة' },
  { value: ProductionLineStatus.IDLE, label: 'متوقف' },
  { value: ProductionLineStatus.WARNING, label: 'تنبيه' },
];

const emptyForm: Omit<FirestoreProductionLine, 'id'> = {
  name: '',
  code: '',
  dailyWorkingHours: 8,
  maxWorkers: 20,
  status: ProductionLineStatus.IDLE,
};

export const Lines: React.FC = () => {
  const { openModal } = useGlobalModalManager();
  const productionLines = useAppStore((s) => s.productionLines);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const lineStatuses = useAppStore((s) => s.lineStatuses);
  const createLine = useAppStore((s) => s.createLine);
  const updateLine = useAppStore((s) => s.updateLine);
  const deleteLine = useAppStore((s) => s.deleteLine);
  const createLineStatus = useAppStore((s) => s.createLineStatus);
  const updateLineStatus = useAppStore((s) => s.updateLineStatus);
  const workOrders = useAppStore((s) => s.workOrders);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const todayReports = useAppStore((s) => s.todayReports);
  const productionReports = useAppStore((s) => s.productionReports);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);

  const { can } = usePermission();
  const navigate = useNavigate();

  const [todayAssignments, setTodayAssignments] = useState<LineWorkerAssignment[]>([]);

  useEffect(() => {
    lineAssignmentService.getByDate(getTodayDateString()).then(setTodayAssignments).catch(() => {});
  }, []);

  const getTodayWorkersCount = (lineId: string) =>
    todayAssignments.filter((a) => a.lineId === lineId).length;

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ── Set Target Modal ──
  const [targetModal, setTargetModal] = useState<{ lineId: string; lineName: string } | null>(null);
  const [targetForm, setTargetForm] = useState({ currentProductId: '', targetTodayQty: 0 });
  const [targetSaving, setTargetSaving] = useState(false);

  const normalizeLineCode = (value: string) => value.trim().toUpperCase();
  const normalizeArabicDigits = (value: string) =>
    value.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const buildCodeFromLineName = (name: string) => {
    const normalizedName = normalizeArabicDigits(name);
    const numberMatches = normalizedName.match(/\d+/g);
    if (!numberMatches?.length) return '';
    const lineNumber = Number(numberMatches[numberMatches.length - 1]);
    if (!Number.isFinite(lineNumber)) return '';
    return `LINE-${String(lineNumber).padStart(2, '0')}`;
  };
  const suggestedCode = useMemo(
    () => buildCodeFromLineName(form.name ?? ''),
    [form.name]
  );

  const openTargetModal = (lineId: string, lineName: string) => {
    const existing = lineStatuses.find((s) => s.lineId === lineId);
    setTargetForm({
      currentProductId: existing?.currentProductId ?? '',
      targetTodayQty: existing?.targetTodayQty ?? 0,
    });
    setTargetModal({ lineId, lineName });
  };

  const handleSaveTarget = async () => {
    if (!targetModal) return;
    setTargetSaving(true);
    const existing = lineStatuses.find((s) => s.lineId === targetModal.lineId);
    if (existing?.id) {
      await updateLineStatus(existing.id, {
        currentProductId: targetForm.currentProductId,
        targetTodayQty: targetForm.targetTodayQty,
      });
    } else {
      await createLineStatus({
        lineId: targetModal.lineId,
        currentProductId: targetForm.currentProductId,
        targetTodayQty: targetForm.targetTodayQty,
      });
    }
    setTargetSaving(false);
    setTargetModal(null);
  };

  const getVariant = (status: ProductionLineStatus) => {
    switch (status) {
      case ProductionLineStatus.ACTIVE: return 'success' as const;
      case ProductionLineStatus.WARNING: return 'warning' as const;
      case ProductionLineStatus.MAINTENANCE: return 'neutral' as const;
      default: return 'neutral' as const;
    }
  };

  const getStatusLabel = (status: ProductionLineStatus) => {
    switch (status) {
      case ProductionLineStatus.ACTIVE: return 'يعمل حالياً';
      case ProductionLineStatus.WARNING: return 'تنبيه';
      case ProductionLineStatus.MAINTENANCE: return 'صيانة';
      case ProductionLineStatus.IDLE: return 'جاهز للتشغيل';
      default: return 'غير معروف';
    }
  };

  const openCreate = () => {
    openModal(MODAL_KEYS.LINES_CREATE, { source: 'lines.page' });
  };

  const openEdit = (id: string) => {
    const raw = _rawLines.find((l) => l.id === id);
    if (!raw) return;
    setEditId(id);
    setForm({
      name: raw.name,
      code: raw.code ?? buildCodeFromLineName(raw.name),
      dailyWorkingHours: raw.dailyWorkingHours,
      maxWorkers: raw.maxWorkers,
      status: raw.status,
    });
    setSaveMsg(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    const normalizedCode = normalizeLineCode((form.code ?? '').trim() || buildCodeFromLineName(form.name ?? ''));
    if (!form.name || !normalizedCode) {
      setSaveMsg({ type: 'error', text: 'اسم الخط مطلوب. أضف كود الخط أو اكتب رقمًا داخل اسم الخط (مثال: خط إنتاج 7).' });
      return;
    }

    const isDuplicateCode = _rawLines.some(
      (line) =>
        line.id !== editId &&
        normalizeLineCode(line.code ?? '') === normalizedCode
    );
    if (isDuplicateCode) {
      setSaveMsg({ type: 'error', text: 'كود الخط مستخدم بالفعل. استخدم كودًا مختلفًا.' });
      return;
    }

    const payload: Omit<FirestoreProductionLine, 'id'> = {
      ...form,
      code: normalizedCode,
    };

    setSaving(true);
    setSaveMsg(null);
    try {
      if (editId) {
        await updateLine(editId, payload);
        setSaveMsg({ type: 'success', text: 'تم حفظ تعديلات الخط بنجاح' });
      } else {
        await createLine(payload);
        setSaveMsg({ type: 'success', text: 'تم إضافة خط الإنتاج بنجاح' });
        setForm(emptyForm);
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'تعذر حفظ بيانات الخط. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteLine(id);
    setDeleteConfirmId(null);
  };

  const sortedLines = useMemo(() => {
    return [...productionLines].sort((a, b) => {
      const codeCompare = (a.code || '').localeCompare((b.code || ''), 'en', {
        numeric: true,
        sensitivity: 'base',
      });
      if (codeCompare !== 0) return codeCompare;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [productionLines]);

  const latestReportByLine = useMemo(() => {
    const getReportTime = (r: ProductionReport): number => {
      const createdAt = r.createdAt as any;
      if (createdAt?.toDate) return createdAt.toDate().getTime();
      if (createdAt?.seconds) return createdAt.seconds * 1000;
      if (createdAt) {
        const createdAtMs = new Date(createdAt).getTime();
        if (!Number.isNaN(createdAtMs)) return createdAtMs;
      }
      const dateMs = new Date(r.date).getTime();
      return Number.isNaN(dateMs) ? 0 : dateMs;
    };

    const merged = [...todayReports, ...productionReports];
    const unique = new Map<string, ProductionReport>();
    merged.forEach((r) => {
      const key = r.id ?? `${r.lineId}_${r.productId}_${r.employeeId}_${r.date}_${r.quantityProduced}_${r.workHours}`;
      if (!unique.has(key)) unique.set(key, r);
    });

    const byLine = new Map<string, ProductionReport>();
    unique.forEach((report) => {
      const current = byLine.get(report.lineId);
      if (!current || getReportTime(report) > getReportTime(current)) {
        byLine.set(report.lineId, report);
      }
    });
    return byLine;
  }, [todayReports, productionReports]);

  const currentCostMonth = useMemo(() => getCurrentMonth(), []);
  const lineAllocatedCosts = useMemo(() => {
    const result = new Map<string, ReturnType<typeof buildLineAllocatedCostSummary>>();
    productionLines.forEach((line) => {
      result.set(
        line.id,
        buildLineAllocatedCostSummary(
          line.id,
          currentCostMonth,
          costCenters,
          costCenterValues,
          costAllocations,
        ),
      );
    });
    return result;
  }, [productionLines, currentCostMonth, costCenters, costCenterValues, costAllocations]);

  const todaySupervisorCostByLine = useMemo(() => {
    const maxHoursByLineSupervisor = new Map<string, number>();

    todayReports.forEach((report) => {
      if (!report.employeeId) return;
      const key = `${report.lineId}__${report.employeeId}`;
      const current = maxHoursByLineSupervisor.get(key) || 0;
      maxHoursByLineSupervisor.set(key, Math.max(current, report.workHours || 0));
    });

    const result = new Map<string, number>();
    maxHoursByLineSupervisor.forEach((maxHours, key) => {
      const [lineId, employeeId] = key.split('__');
      const hourlyRate = Math.max(
        0,
        _rawEmployees.find((e) => e.id === employeeId)?.hourlyRate || 0
      );
      const cost = maxHours * hourlyRate;
      result.set(lineId, (result.get(lineId) || 0) + cost);
    });

    return result;
  }, [todayReports, _rawEmployees]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="خطوط الإنتاج"
        subtitle="إدارة ومراقبة جميع خطوط الإنتاج في المصنع"
        icon="linear_scale"
        primaryAction={can('lines.create') ? {
          label: 'إضافة خط إنتاج',
          icon: 'add',
          onClick: openCreate,
          dataModalKey: MODAL_KEYS.LINES_CREATE,
        } : undefined}
      />

      {/* Active Production Plans Summary */}
      {(() => {
        const activePlans = productionPlans.filter((p) => p.status === 'planned' || p.status === 'in_progress');
        if (activePlans.length === 0) return null;
        const totalPlanned = activePlans.reduce((s, p) => s + p.plannedQuantity, 0);
        const totalProduced = activePlans.reduce((s, p) => s + p.producedQuantity, 0);
        const overallProgress = totalPlanned > 0 ? Math.round((totalProduced / totalPlanned) * 100) : 0;

        const getPriorityConfig = (priority: ProductionPlan['priority']) => {
          switch (priority) {
            case 'urgent': return { label: 'عاجل', color: 'text-rose-600 bg-rose-50' };
            case 'high': return { label: 'مرتفع', color: 'text-amber-600 bg-amber-50' };
            case 'medium': return { label: 'متوسط', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' };
            default: return { label: 'منخفض', color: 'text-slate-500 bg-[#f8f9fa]' };
          }
        };

        const getSmartStatusConfig = (plan: ProductionPlan) => {
          const progressRatio = calculateProgressRatio(plan.producedQuantity, plan.plannedQuantity);
          const timeRatio = calculateTimeRatio(plan.plannedStartDate, plan.plannedEndDate);
          const smart = calculateSmartStatus(progressRatio, timeRatio, plan.status);
          switch (smart) {
            case 'on_track': return { label: 'على المسار', icon: 'check_circle', color: 'text-emerald-600' };
            case 'at_risk': return { label: 'معرض للخطر', icon: 'warning', color: 'text-amber-500' };
            case 'delayed': return { label: 'متأخر', icon: 'schedule', color: 'text-orange-500' };
            case 'critical': return { label: 'حرج', icon: 'error', color: 'text-rose-500' };
            case 'completed': return { label: 'مكتمل', icon: 'task_alt', color: 'text-emerald-600' };
            default: return { label: '—', icon: 'help', color: 'text-slate-400' };
          }
        };

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-blue-500">event_note</span>
                <h3 className="text-base font-bold text-[var(--color-text)]">خطط الإنتاج النشطة</h3>
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{activePlans.length}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-bold">الإجمالي: {formatNumber(totalProduced)} / {formatNumber(totalPlanned)}</span>
                <span className={`font-black ${overallProgress >= 80 ? 'text-emerald-600' : overallProgress >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>{overallProgress}%</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {activePlans.map((plan) => {
                const product = _rawProducts.find((p) => p.id === plan.productId);
                const lineName = productionLines.find((l) => l.id === plan.lineId)?.name ?? '—';
                const progress = calculatePlanProgress(plan.producedQuantity, plan.plannedQuantity);
                const remaining = plan.plannedQuantity - plan.producedQuantity;
                const priorityConf = getPriorityConfig(plan.priority);
                const smartStatus = getSmartStatusConfig(plan);

                return (
                  <div
                    key={plan.id}
                    onClick={() => navigate('/production-plans')}
                    className={`rounded-[var(--border-radius-xl)] border p-5 space-y-4 transition-all cursor-pointer hover:ring-2 hover:ring-blue-200 dark:hover:ring-blue-800 ${plan.status === 'in_progress' ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/40' : 'bg-[#f8f9fa]/50 border-[var(--color-border)]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-icons-round text-blue-500 text-lg">event_note</span>
                        <span className="text-sm font-bold text-blue-700">خطة إنتاج</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityConf.color}`}>{priorityConf.label}</span>
                        <Badge variant={plan.status === 'in_progress' ? 'warning' : 'neutral'}>
                          {plan.status === 'in_progress' ? 'قيد التنفيذ' : 'مخطط'}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-[var(--color-text-muted)] text-base">inventory_2</span>
                      <p className="text-base font-bold text-[var(--color-text)] truncate">{product?.name ?? '—'}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`material-icons-round text-base ${smartStatus.color}`}>{smartStatus.icon}</span>
                        <span className={`text-sm font-bold ${smartStatus.color}`}>{smartStatus.label}</span>
                      </div>
                      {can('costs.view') && plan.estimatedCost > 0 && (
                        <div className="flex items-center gap-1.5 bg-[var(--color-card)] rounded-[var(--border-radius-base)] px-3 py-1">
                          <span className="material-icons-round text-emerald-500 text-sm">payments</span>
                          <span className="text-sm font-bold text-emerald-600">{formatCost(plan.estimatedCost)}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">المخطط</p>
                        <p className="text-lg font-bold text-[var(--color-text)]">{formatNumber(plan.plannedQuantity)}</p>
                      </div>
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">تم إنتاجه</p>
                        <p className="text-lg font-bold text-emerald-600">{formatNumber(plan.producedQuantity)}</p>
                      </div>
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">المتبقي</p>
                        <p className="text-lg font-bold text-rose-500">{formatNumber(remaining)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-[var(--color-text-muted)]">التقدم</span>
                        <span className={progress >= 80 ? 'text-emerald-600' : progress >= 50 ? 'text-amber-600' : 'text-slate-500'}>{progress}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-[var(--color-card)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 text-xs text-[var(--color-text-muted)] pt-1">
                      <div className="flex items-center gap-1">
                        <span className="material-icons-round text-sm">precision_manufacturing</span>
                        <span className="font-bold">{lineName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="material-icons-round text-sm">today</span>
                        <span className="font-bold">{plan.plannedStartDate}</span>
                      </div>
                      <div className="flex items-center gap-1 mr-auto">
                        <span className="material-icons-round text-sm">event</span>
                        <span className="font-bold">{plan.plannedEndDate}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Active Work Orders Summary */}
      {(() => {
        const activeWOs = workOrders.filter((w) => w.status === 'pending' || w.status === 'in_progress');
        if (activeWOs.length === 0) return null;
        const totalQty = activeWOs.reduce((s, w) => s + w.quantity, 0);
        const totalProduced = activeWOs.reduce((s, w) => s + (w.producedQuantity ?? 0), 0);
        const totalRemaining = totalQty - totalProduced;
        const overallProgress = totalQty > 0 ? Math.round((totalProduced / totalQty) * 100) : 0;

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-amber-500">assignment</span>
                <h3 className="text-base font-bold text-[var(--color-text)]">أوامر الشغل النشطة</h3>
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{activeWOs.length}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-bold">الإجمالي: {formatNumber(totalProduced)} / {formatNumber(totalQty)}</span>
                <span className={`font-black ${overallProgress >= 80 ? 'text-emerald-600' : overallProgress >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>{overallProgress}%</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeWOs.map((wo) => {
                const product = _rawProducts.find((p) => p.id === wo.productId);
                const lineName = productionLines.find((l) => l.id === wo.lineId)?.name ?? '—';
                const supervisor = _rawEmployees.find((e) => e.id === wo.supervisorId);
                const progress = wo.quantity > 0 ? Math.round(((wo.producedQuantity ?? 0) / wo.quantity) * 100) : 0;
                const remaining = wo.quantity - (wo.producedQuantity ?? 0);
                const estCostPerUnit = wo.quantity > 0 ? wo.estimatedCost / wo.quantity : 0;

                return (
                  <div key={wo.id} onClick={() => navigate('/work-orders')} className={`rounded-[var(--border-radius-xl)] border p-5 space-y-4 transition-all cursor-pointer hover:ring-2 hover:ring-amber-200 dark:hover:ring-amber-800 ${wo.status === 'in_progress' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200/40' : 'bg-[#f8f9fa]/50 border-[var(--color-border)]'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-icons-round text-amber-500 text-lg">assignment</span>
                        <span className="text-sm font-bold text-amber-700">أمر شغل #{wo.workOrderNumber}</span>
                      </div>
                      <Badge variant={wo.status === 'in_progress' ? 'warning' : 'neutral'}>
                        {wo.status === 'in_progress' ? 'قيد التنفيذ' : 'في الانتظار'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-[var(--color-text-muted)] text-base">inventory_2</span>
                      <p className="text-base font-bold text-[var(--color-text)] truncate">{product?.name ?? '—'}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="material-icons-round text-indigo-400 text-base">person</span>
                        <span className="text-sm font-bold text-[var(--color-text-muted)]">{supervisor?.name ?? '—'}</span>
                      </div>
                      {can('costs.view') && estCostPerUnit > 0 && (
                        <div className="flex items-center gap-1.5 bg-[var(--color-card)] rounded-[var(--border-radius-base)] px-3 py-1">
                          <span className="material-icons-round text-emerald-500 text-sm">payments</span>
                          <span className="text-[10px] text-slate-400">التكلفة المتوقعة</span>
                          <span className="text-sm font-bold text-emerald-600">{formatCost(estCostPerUnit)}</span>
                          <span className="text-[10px] text-slate-400">/قطعة</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">المطلوب</p>
                        <p className="text-lg font-bold text-[var(--color-text)]">{formatNumber(wo.quantity)}</p>
                      </div>
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">تم إنتاجه</p>
                        <p className="text-lg font-bold text-emerald-600">{formatNumber(wo.producedQuantity ?? 0)}</p>
                      </div>
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">المتبقي</p>
                        <p className="text-lg font-bold text-rose-500">{formatNumber(remaining)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-[var(--color-text-muted)]">التقدم</span>
                        <span className={progress >= 80 ? 'text-emerald-600' : progress >= 50 ? 'text-amber-600' : 'text-slate-500'}>{progress}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-[var(--color-card)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 text-xs text-[var(--color-text-muted)] pt-1">
                      <div className="flex items-center gap-1">
                        <span className="material-icons-round text-sm">precision_manufacturing</span>
                        <span className="font-bold">{lineName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="material-icons-round text-sm">groups</span>
                        <span className="font-bold">{wo.maxWorkers} عامل</span>
                      </div>
                      <div className="flex items-center gap-1 mr-auto">
                        <span className="material-icons-round text-sm">event</span>
                        <span className="font-bold">{wo.targetDate}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Lines Grid */}
      {productionLines.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-5xl mb-3 block opacity-30">precision_manufacturing</span>
            <p className="font-bold text-lg">لا توجد خطوط إنتاج بعد</p>
            <p className="text-sm mt-1">
              {can("lines.create")
                ? 'اضغط "إضافة خط إنتاج" لإضافة أول خط'
                : 'لا توجد خطوط إنتاج لعرضها حالياً'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {sortedLines.map((line) => {
            const raw = _rawLines.find((l) => l.id === line.id);
            const activeWOs = workOrders.filter((w) => w.lineId === line.id && (w.status === 'pending' || w.status === 'in_progress'));
            const activeWO: WorkOrder | undefined = activeWOs.find((w) => w.status === 'in_progress') ?? activeWOs[0];
            const lastLineReport = latestReportByLine.get(line.id);
            const woProduct = activeWO ? _rawProducts.find((p) => p.id === activeWO.productId) : null;
            const woProgress = activeWO && activeWO.quantity > 0 ? Math.round((activeWO.producedQuantity / activeWO.quantity) * 100) : 0;
            const woRemaining = activeWO ? activeWO.quantity - (activeWO.producedQuantity ?? 0) : 0;
            const woSupervisor = activeWO ? _rawEmployees.find((e) => e.id === activeWO.supervisorId) : null;
            const woEstCostPerUnit = activeWO && activeWO.quantity > 0 ? activeWO.estimatedCost / activeWO.quantity : 0;
            const reportProduct = lastLineReport ? _rawProducts.find((p) => p.id === lastLineReport.productId) : null;
            const reportSupervisor = lastLineReport ? _rawEmployees.find((e) => e.id === lastLineReport.employeeId) : null;
            const allocated = lineAllocatedCosts.get(line.id);
            const supervisorDailyCost = todaySupervisorCostByLine.get(line.id) || 0;
            const totalDailyAllocatedWithSupervisor = (allocated?.totalDailyAllocated || 0) + supervisorDailyCost;

            return (
              <Card key={line.id} className="transition-all hover:ring-2 hover:ring-primary/10">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-bold text-lg text-[var(--color-text)]">{line.name}</h4>
                    <p className="text-[11px] font-bold text-primary/80 mt-0.5">كود الخط: {line.code || '—'}</p>
                    {activeWO && (
                      <span className="text-[11px] font-bold text-amber-600">أمر شغل #{activeWO.workOrderNumber}</span>
                    )}
                  </div>
                  <Badge variant={getVariant(line.status)} pulse={line.status === ProductionLineStatus.ACTIVE}>
                    {getStatusLabel(line.status)}
                  </Badge>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-[var(--color-text-muted)] text-sm">person</span>
                    <p className="text-xs text-[var(--color-text-muted)] font-bold">المشرف</p>
                    <p className="text-sm font-bold text-[var(--color-text)] mr-auto">{woSupervisor?.name ?? reportSupervisor?.name ?? line.currentName ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-[var(--color-text-muted)] text-sm">inventory_2</span>
                    <p className="text-xs text-[var(--color-text-muted)] font-bold">المنتج</p>
                    <p className="text-sm font-bold text-[var(--color-text)] mr-auto truncate max-w-[200px]">{woProduct?.name ?? reportProduct?.name ?? line.currentProduct ?? '—'}</p>
                  </div>
                  {can('costs.view') && woEstCostPerUnit > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-emerald-500 text-sm">payments</span>
                      <p className="text-xs text-[var(--color-text-muted)] font-bold">التكلفة المتوقعة</p>
                      <p className="text-sm font-bold text-emerald-600 mr-auto">{formatCost(woEstCostPerUnit)} <span className="text-[10px] text-[var(--color-text-muted)] font-medium">/قطعة</span></p>
                    </div>
                  )}
                </div>

                {can('costs.view') && allocated && (
                  <div className="mb-4 rounded-[var(--border-radius-lg)] border border-violet-200/70 dark:border-violet-800/60 bg-violet-50/70 dark:bg-violet-900/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-violet-700 dark:text-violet-300">التكاليف المتوزعة على الخط</p>
                      <span className="text-[10px] font-bold text-violet-500">{allocated.month}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                      <span className="material-icons-round text-sm text-violet-500">manage_accounts</span>
                      <span className="font-bold text-slate-500">المشرف:</span>
                      <span className="font-bold">{woSupervisor?.name ?? reportSupervisor?.name ?? line.currentName ?? '—'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-[var(--color-card)]/80 rounded-[var(--border-radius-base)] p-2">
                        <p className="text-[10px] text-[var(--color-text-muted)] mb-0.5">إجمالي شهري</p>
                        <p className="text-sm font-bold text-violet-700 dark:text-violet-300">
                          {allocated.totalMonthlyAllocated > 0 ? formatCost(allocated.totalMonthlyAllocated) : '—'}
                        </p>
                      </div>
                      <div className="bg-[var(--color-card)]/80 rounded-[var(--border-radius-base)] p-2">
                        <p className="text-[10px] text-[var(--color-text-muted)] mb-0.5">موزع يومي + المشرف</p>
                        <p className="text-sm font-bold text-violet-700 dark:text-violet-300">
                          {totalDailyAllocatedWithSupervisor > 0 ? formatCost(totalDailyAllocatedWithSupervisor) : '—'}
                        </p>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      تكلفة مشرف اليوم: {supervisorDailyCost > 0 ? formatCost(supervisorDailyCost) : '—'}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {allocated.centers.length > 0
                        ? `عدد مراكز التكلفة الموزعة: ${allocated.centers.length}`
                        : 'لا توجد توزيعات تكلفة مفعلة على هذا الخط في هذا الشهر.'}
                    </p>
                  </div>
                )}

                <div className="mb-4 rounded-[var(--border-radius-lg)] border border-primary/15 bg-primary/5 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-bold text-primary">آخر تقرير إنتاج</p>
                    <span className="text-[11px] font-bold text-slate-500">{lastLineReport?.date ?? 'لا يوجد تقرير'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-[var(--color-card)]/70 rounded-[var(--border-radius-base)] p-2">
                      <p className="text-[10px] text-[var(--color-text-muted)] mb-0.5">الإنتاج</p>
                      <p className="text-sm font-bold text-emerald-600">{lastLineReport ? formatNumber(lastLineReport.quantityProduced || 0) : '—'}</p>
                    </div>
                    <div className="bg-[var(--color-card)]/70 rounded-[var(--border-radius-base)] p-2">
                      <p className="text-[10px] text-[var(--color-text-muted)] mb-0.5">الهالك</p>
                      <p className="text-sm font-bold text-rose-500">{lastLineReport ? formatNumber(lastLineReport.quantityWaste || 0) : '—'}</p>
                    </div>
                    <div className="bg-[var(--color-card)]/70 rounded-[var(--border-radius-base)] p-2">
                      <p className="text-[10px] text-[var(--color-text-muted)] mb-0.5">عمالة التقرير</p>
                      <p className="text-sm font-bold text-[var(--color-text)]">{lastLineReport ? formatNumber(lastLineReport.workersCount || 0) : '—'}</p>
                    </div>
                    <div className="bg-[var(--color-card)]/70 rounded-[var(--border-radius-base)] p-2">
                      <p className="text-[10px] text-[var(--color-text-muted)] mb-0.5">ساعات التقرير</p>
                      <p className="text-sm font-bold text-primary">{lastLineReport ? formatNumber(lastLineReport.workHours || 0) : '—'}</p>
                    </div>
                  </div>
                </div>

                {/* <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                  <div className="bg-[#f8f9fa] rounded-[var(--border-radius-base)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)] mb-1">المطلوب</p>
                    <p className={`text-lg font-bold ${activeWO ? 'text-[var(--color-text)]' : 'text-slate-400'}`}>{activeWO ? formatNumber(activeWO.quantity) : '—'}</p>
                  </div>
                  <div className="bg-[#f8f9fa] rounded-[var(--border-radius-base)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)] mb-1">تم إنتاجه</p>
                    <p className={`text-lg font-bold ${(activeWO?.producedQuantity ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{activeWO ? formatNumber(activeWO.producedQuantity ?? 0) : '—'}</p>
                  </div>
                  <div className="bg-[#f8f9fa] rounded-[var(--border-radius-base)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)] mb-1">المتبقي</p>
                    <p className={`text-lg font-bold ${woRemaining > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{activeWO ? formatNumber(woRemaining) : '—'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                  <div className="bg-[#f8f9fa] rounded-[var(--border-radius-base)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)] mb-1">ساعات العمل</p>
                    <p className="text-lg font-bold text-primary">{raw?.dailyWorkingHours ?? 0}</p>
                  </div>
                  <div className="bg-[#f8f9fa] rounded-[var(--border-radius-base)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)] mb-1">عمالة اليوم</p>
                    {(() => {
                      const count = getTodayWorkersCount(line.id);
                      return (
                        <p className={`text-lg font-bold ${count > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {count > 0 ? count : '—'}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="bg-[#f8f9fa] rounded-[var(--border-radius-base)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)] mb-1">التاريخ المستهدف</p>
                    <p className="text-sm font-bold text-[var(--color-text-muted)]">{activeWO?.targetDate ?? '—'}</p>
                  </div>
                </div> */}

                <div className="space-y-3 mb-5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-[var(--color-text-muted)]">الإنجاز: {formatNumber(line.achievement)} / {formatNumber(line.target)}</span>
                    <span className={line.efficiency > 80 ? 'text-emerald-600' : 'text-amber-600'}>{line.efficiency}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-[#f0f2f5] rounded-full overflow-hidden shadow-inner">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${line.status === ProductionLineStatus.WARNING ? 'bg-amber-500' : 'bg-primary shadow-[0_0_10px_rgba(19,146,236,0.3)]'}`}
                      style={{ width: `${Math.min(line.efficiency, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {can("lineStatus.edit") && !activeWO && (
                  <button
                    onClick={() => openTargetModal(line.id, line.name)}
                    className="mb-4 w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-[var(--border-radius-base)] transition-all"
                  >
                    <span className="material-icons-round text-sm">flag</span>
                    {line.target > 0 ? `تعديل الهدف (${formatNumber(line.target)})` : 'تعيين هدف اليوم'}
                  </button>
                )}

                <div className="flex items-center gap-2 pt-4 border-t border-[var(--color-border)]">
                  <Button variant="primary" className="flex-1 text-xs py-2" onClick={() => navigate(`/lines/${line.id}`)}>
                    <span className="material-icons-round text-sm">visibility</span>
                    التفاصيل
                  </Button>
                  {can("lines.edit") && (
                    <Button variant="outline" className="flex-1 text-xs py-2" onClick={() => openEdit(line.id)}>
                      <span className="material-icons-round text-sm">edit</span>
                      تعديل
                    </Button>
                  )}
                  {can("lines.delete") && (
                    <button
                      onClick={() => setDeleteConfirmId(line.id)}
                      className="p-2 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-[var(--border-radius-base)] transition-all"
                    >
                      <span className="material-icons-round text-lg">delete</span>
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (can("lines.create") || can("lines.edit")) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); setSaveMsg(null); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-lg border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-lg font-bold">{editId ? 'تعديل خط الإنتاج' : 'إضافة خط إنتاج جديد'}</h3>
              <button onClick={() => { setShowModal(false); setSaveMsg(null); }} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              {saveMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  <span className="material-icons-round text-base">{saveMsg.type === 'success' ? 'check_circle' : 'error'}</span>
                  <p className="flex-1">{saveMsg.text}</p>
                  <button onClick={() => setSaveMsg(null)} className="text-current/70 hover:text-current transition-colors">
                    <span className="material-icons-round text-base">close</span>
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">كود الخط (اختياري)</label>
                <input
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.code ?? ''}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder={suggestedCode || 'مثال: LINE-01'}
                />
                {!form.code?.trim() && suggestedCode && (
                  <p className="text-[11px] font-bold text-slate-500">
                    سيتم توليد الكود تلقائيًا: <span className="text-primary">{suggestedCode}</span>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">اسم الخط *</label>
                <input
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: خط الإنتاج A - التعبئة"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">ساعات العمل اليومية</label>
                  <input
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={1}
                    max={24}
                    value={form.dailyWorkingHours}
                    onChange={(e) => setForm({ ...form, dailyWorkingHours: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">أقصى عدد عمال</label>
                  <input
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={1}
                    value={form.maxWorkers}
                    onChange={(e) => setForm({ ...form, maxWorkers: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">الحالة</label>
                <select
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as ProductionLineStatus })}
                >
                  {statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowModal(false); setSaveMsg(null); }}>إلغاء</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving || !form.name}>
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">{editId ? 'save' : 'add'}</span>
                {editId ? 'حفظ التعديلات' : 'إضافة الخط'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteConfirmId && can("lines.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">هل أنت متأكد من حذف هذا الخط؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20 transition-all flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">delete</span>
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Set Target Modal ── */}
      {targetModal && can("lineStatus.edit") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setTargetModal(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">تعيين هدف اليوم</h3>
                <p className="text-xs text-[var(--color-text-muted)] font-medium mt-0.5">{targetModal.lineName}</p>
              </div>
              <button onClick={() => setTargetModal(null)} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">المنتج الحالي *</label>
                <select
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={targetForm.currentProductId}
                  onChange={(e) => setTargetForm({ ...targetForm, currentProductId: e.target.value })}
                >
                  <option value="">اختر المنتج...</option>
                  {_rawProducts.map((p) => (
                    <option key={p.id} value={p.id!}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">الهدف اليومي (كمية) *</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={targetForm.targetTodayQty || ''}
                  onChange={(e) => setTargetForm({ ...targetForm, targetTodayQty: Number(e.target.value) })}
                  placeholder="مثال: 500"
                />
              </div>
              {targetForm.currentProductId && targetForm.targetTodayQty > 0 && (
                <div className="bg-primary/5 border border-primary/10 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
                  <span className="material-icons-round text-primary text-lg">info</span>
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    سيتم تعيين هدف <span className="font-bold text-primary">{formatNumber(targetForm.targetTodayQty)}</span> وحدة
                    من <span className="font-bold text-[var(--color-text)]">{_rawProducts.find(p => p.id === targetForm.currentProductId)?.name}</span> لهذا الخط
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setTargetModal(null)}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={handleSaveTarget}
                disabled={targetSaving || !targetForm.currentProductId || !targetForm.targetTodayQty}
              >
                {targetSaving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">flag</span>
                حفظ الهدف
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
