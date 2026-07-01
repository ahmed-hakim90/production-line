import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  BellRing,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Gauge,
  History,
  Info,
  ListChecks,
  Loader2,
  NotebookText,
  Package,
  PlayCircle,
  Save,
  Share2,
  SquareCheckBig,
  Trash2,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Card, Badge, LoadingSkeleton } from './UI';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppStore, useShallowStore, getProductionReportsRangeCacheKey } from '../store/useAppStore';
import {
  formatNumber,
  calculateWasteRatio,
  calculatePlanProgress,
  getReportWaste,
  countUniqueDays,
  getTodayDateString,
} from '../utils/calculations';
import type { FirestoreProduct, FirestoreProductionLine, ProductionReport, ProductionPlan, ProductionShiftWorkerSnapshot } from '../types';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';
import { supervisorLineAssignmentService } from '@/modules/production/services/supervisorLineAssignmentService';
import { lineAssignmentService } from '@/modules/production/services/lineAssignmentService';
import {
  productionShiftService,
} from '@/modules/production/services/productionShiftService';
import {
  mapReportsToPrintRows,
  type ReportPrintRow,
} from '@/modules/production/components/ProductionReportPrint';
import { ProductionReportShareCardTarget } from '@/modules/production/components/ProductionReportShareCardTarget';
import {
  buildProductionReportShareRow,
  shareProductionReportCardToWhatsApp,
} from '@/modules/production/utils/productionReportShare';
import {
  findOpenGeneralShifts,
  findOpenProductionShift,
  mapLineAssignmentsToShiftWorkers,
} from '@/modules/production/utils/productionShiftLifecycle';
import {
  LINE_WORKER_LABOR_ROLES,
  LINE_WORKER_LABOR_ROLE_LABELS,
  resolveLineWorkerLaborRole,
} from '@/modules/production/utils/lineWorkerLaborRoles';
import {
  getShareResultFeedbackMessage,
  type ShareResult,
} from '@/utils/reportExport';

// ─── Period Filter ───────────────────────────────────────────────────────────

type Period = 'daily' | 'yesterday' | 'weekly' | 'monthly';

const DASHBOARD_ICON_MAP: Record<string, LucideIcon> = {
  today: CalendarDays,
  history: History,
  date_range: CalendarRange,
  calendar_month: Calendar,
  refresh: Loader2,
  inventory: Package,
  task_alt: CheckCircle2,
  pending_actions: ListChecks,
  delete_sweep: Trash2,
  speed: Gauge,
  event_note: NotebookText,
  notifications_active: BellRing,
  warning: AlertTriangle,
  schedule: Clock3,
  person: User,
  description: FileText,
  info: Info,
  checklist: ClipboardList,
  calendar_today: CalendarClock,
};

const renderDashboardIcon = (icon: string, size = 16, className = '') => {
  const Icon = DASHBOARD_ICON_MAP[icon];
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
};

const PERIOD_OPTIONS: { value: Period; label: string; icon: string }[] = [
  { value: 'daily',     label: 'اليوم',   icon: 'today' },
  { value: 'yesterday', label: 'أمس',     icon: 'history' },
  { value: 'weekly',    label: 'أسبوعي',  icon: 'date_range' },
  { value: 'monthly',   label: 'شهري',    icon: 'calendar_month' },
];

const DashboardPeriodFilter: React.FC<{ value: Period; onChange: (p: Period) => void }> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center bg-[#f0f2f5] rounded-[var(--border-radius-lg)] p-1 gap-1">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-[var(--border-radius-base)] text-sm font-bold transition-all ${
            value === opt.value
              ? 'bg-white text-primary'
              : 'text-slate-500 hover:text-[var(--color-text)] dark:hover:text-[var(--color-text-muted)]'
          }`}
        >
          {renderDashboardIcon(opt.icon, 14)}
          {t(`dashboard.period.${opt.value}`)}
        </button>
      ))}
    </div>
  );
};

// ─── Date helpers ────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return fmtDate(d);
}

function getWeekDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return { start: fmtDate(start), end: fmtDate(end) };
}

const formatShiftTime = (value?: string): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
};

const toDatetimeLocalValue = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const datetimeLocalToIso = (value: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

type ShiftPanelContext =
  | { type: 'plan'; plan: ProductionPlan; label: string }
  | { type: 'general'; label: string };

type ShiftLifecyclePanelProps = {
  context: ShiftPanelContext;
  employeeId: string;
  employeeName: string;
  uid?: string | null;
  today: string;
  products: FirestoreProduct[];
  lines: FirestoreProductionLine[];
  assignedLines: FirestoreProductionLine[];
  openShift: ProductionReport | null;
  reports: ProductionReport[];
  onStarted: () => Promise<void>;
  onClosed: () => Promise<void>;
  updateReport: (id: string, data: Partial<ProductionReport>) => Promise<void>;
};

export const ShiftLifecyclePanel: React.FC<ShiftLifecyclePanelProps> = ({
  context,
  employeeId,
  employeeName,
  uid,
  today,
  products,
  lines,
  assignedLines,
  openShift,
  reports,
  onStarted,
  onClosed,
  updateReport,
}) => {
  const fixedPlan = context.type === 'plan' ? context.plan : null;
  const isGeneralContext = context.type === 'general';
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const routingVarianceBasisSecondsByProduct = useAppStore((s) => s.routingVarianceBasisSecondsByProduct);
  const routingPlanTargetUnitSecondsByProduct = useAppStore((s) => s.routingTargetUnitSecondsByProduct);
  const routingProductTargetUnitSecondsByProduct = useAppStore((s) => s.routingProductTargetUnitSecondsByProduct);
  const [startLineId, setStartLineId] = useState('');
  const [startProductId, setStartProductId] = useState('');
  const [workers, setWorkers] = useState<ProductionShiftWorkerSnapshot[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [activeCloseShiftId, setActiveCloseShiftId] = useState<string | null>(null);
  const [startStep, setStartStep] = useState(0);
  const [closeQuantity, setCloseQuantity] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeAt, setCloseAt] = useState('');
  const [closedReport, setClosedReport] = useState<ProductionReport | null>(null);
  const [shareCardRow, setShareCardRow] = useState<ReportPrintRow | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const workerLineId = fixedPlan?.lineId || startLineId;
  const startProductSelectionId = fixedPlan?.productId || startProductId;
  const presentCount = workers.filter((worker) => worker.isPresent !== false).length;

  const assignedLineIdSet = useMemo(
    () => new Set(assignedLines.map((line) => String(line.id || '').trim()).filter(Boolean)),
    [assignedLines],
  );

  const openGeneralShifts = useMemo(
    () => (
      isGeneralContext
        ? findOpenGeneralShifts(reports, { employeeId, lineIds: assignedLineIdSet })
        : []
    ),
    [assignedLineIdSet, employeeId, isGeneralContext, reports],
  );

  const planOpenShift = useMemo(
    () => (
      fixedPlan
        ? openShift || findOpenProductionShift(reports, {
          lineId: fixedPlan.lineId,
          planId: fixedPlan.id,
          productId: fixedPlan.productId,
        })
        : null
    ),
    [fixedPlan, openShift, reports],
  );

  const activeCloseShift = useMemo(
    () => reports.find((report) => report.id === activeCloseShiftId) ?? null,
    [activeCloseShiftId, reports],
  );

  const closeFlowReport = closedReport || activeCloseShift;
  const closeSucceeded = Boolean(closedReport);

  const getLineName = (id?: string) => lines.find((line) => line.id === id)?.name ?? '—';
  const getProductName = (id?: string) => products.find((product) => product.id === id)?.name ?? '—';
  const closeLineName = getLineName(closeFlowReport?.lineId);
  const closeProductName = getProductName(closeFlowReport?.productId);
  const startLineName = getLineName(workerLineId);
  const startProductName = getProductName(startProductSelectionId);

  const linesAvailableForStart = useMemo(
    () => assignedLines.filter((line) => (
      !openGeneralShifts.some((shift) => shift.lineId === line.id)
    )),
    [assignedLines, openGeneralShifts],
  );

  const showStartSection = isGeneralContext || !planOpenShift;
  const startSteps = ['السياق', 'حضور العمال', 'تأكيد البدء'];
  const reportLookups = useMemo(() => ({
    getLineName: (id: string) => lines.find((line) => line.id === id)?.name ?? '—',
    getProductName: (id: string) => products.find((product) => product.id === id)?.name ?? '—',
    getEmployeeName: (id: string) => id === employeeId ? employeeName : '—',
    getUnitsPerCarton: (id: string) => products.find((product) => product.id === id)?.unitsPerCarton,
  }), [employeeId, employeeName, lines, products]);

  const showShareFeedback = useCallback((result: ShareResult) => {
    const message = getShareResultFeedbackMessage(result, { downloadEntityLabel: 'التقرير' });
    if (message) showAppToast('success', message, { duration: 8000 });
  }, []);

  const buildClosedReportShareRow = useCallback((report: ProductionReport): ReportPrintRow => {
    const [baseRow] = mapReportsToPrintRows([report], reportLookups);
    return buildProductionReportShareRow(report, baseRow, {
      lineProductConfigs,
      routingVarianceBasisSecondsByProduct,
      routingPlanTargetUnitSecondsByProduct,
      routingProductTargetUnitSecondsByProduct,
    });
  }, [
    lineProductConfigs,
    reportLookups,
    routingPlanTargetUnitSecondsByProduct,
    routingProductTargetUnitSecondsByProduct,
    routingVarianceBasisSecondsByProduct,
  ]);

  useEffect(() => {
    if (!workerLineId) {
      setWorkers([]);
      return;
    }

    let cancelled = false;
    setLoadingWorkers(true);
    lineAssignmentService.getByLineAndDate(workerLineId, today)
      .then((rows) => {
        if (!cancelled) setWorkers(mapLineAssignmentsToShiftWorkers(rows));
      })
      .catch(() => {
        if (!cancelled) {
          setWorkers([]);
          showAppToast('error', 'تعذر تحميل عمال الخط لهذا اليوم.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingWorkers(false);
      });

    return () => { cancelled = true; };
  }, [workerLineId, today]);

  const updateWorker = (employeeId: string, patch: Partial<ProductionShiftWorkerSnapshot>) => {
    setWorkers((current) => current.map((worker) => (
      worker.employeeId === employeeId
        ? { ...worker, ...patch, laborRole: resolveLineWorkerLaborRole(patch.laborRole ?? worker.laborRole) }
        : worker
    )));
  };

  const handleStart = async () => {
    if (!workerLineId || !startProductSelectionId) {
      showAppToast('error', 'اختر الخط والمنتج قبل بدء الوردية.');
      return;
    }
    if (findOpenProductionShift(reports, { lineId: workerLineId })) {
      showAppToast('error', 'يوجد وردية مفتوحة على هذا الخط. تابعها أو أغلقها أولاً.');
      return;
    }
    if (workers.length === 0) {
      showAppToast('error', 'لا توجد قائمة عمال لهذا الخط. راجع ربط العمال بالخط أولاً.');
      return;
    }

    setSaving(true);
    try {
      const id = await productionShiftService.startShift({
        employeeId,
        lineId: workerLineId,
        productId: startProductSelectionId,
        date: today,
        context: context.type,
        planId: fixedPlan?.id,
        userId: uid,
        workers,
      });
      if (!id) {
        showAppToast('error', 'تعذر بدء الوردية الآن.');
        return;
      }
      showAppToast('success', 'تم بدء الوردية وتسجيل وقت البداية تلقائياً.');
      setStartDialogOpen(false);
      setStartStep(0);
      setStartLineId('');
      setStartProductId('');
      await onStarted();
    } catch (error) {
      showAppToast('error', (error as Error).message || 'تعذر بدء الوردية.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (!activeCloseShift?.id) return;
    const produced = Number(closeQuantity || 0);
    if (produced <= 0) {
      showAppToast('error', 'أدخل كمية الإنتاج الفعلية قبل إغلاق الوردية.');
      return;
    }
    const closedAtIso = datetimeLocalToIso(closeAt);
    if (!closedAtIso) {
      showAppToast('error', 'أدخل وقت إغلاق صالح للوردية.');
      return;
    }

    setSaving(true);
    try {
      const closePayload = productionShiftService.buildClosePayload(activeCloseShift, {
        quantityProduced: produced,
        notes: closeNotes,
        closedByUid: uid,
        closedAtIso,
      });
      await updateReport(activeCloseShift.id, closePayload);
      setClosedReport({ ...activeCloseShift, ...closePayload, id: activeCloseShift.id });
      showAppToast('success', 'تم إغلاق الوردية وحفظ الإنتاج الفعلي.');
      setCloseQuantity('');
      setCloseNotes('');
      await onClosed();
    } catch (error) {
      showAppToast('error', (error as Error).message || 'تعذر إغلاق الوردية.');
    } finally {
      setSaving(false);
    }
  };

  const handleShareClosedReport = async () => {
    if (!closedReport || sharing) return;
    setSharing(true);
    const row = buildClosedReportShareRow(closedReport);
    flushSync(() => {
      setShareCardRow(row);
    });
    try {
      if (!shareCardRef.current) {
        showAppToast('error', 'تعذر تجهيز صورة التقرير للمشاركة. حاول مرة أخرى.');
        return;
      }
      const result = await shareProductionReportCardToWhatsApp({
        node: shareCardRef.current,
        row,
        printSettings: printTemplate,
      });
      showShareFeedback(result);
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string };
      if (err?.name !== 'AbortError') {
        showAppToast(
          'error',
          err?.message === 'capture_timeout'
            ? 'استغرق تجهيز الصورة وقتاً طويلاً. حاول مرة أخرى.'
            : 'تعذر تجهيز صورة التقرير للمشاركة. حاول مرة أخرى.',
        );
      }
    } finally {
      setSharing(false);
      setShareCardRow(null);
    }
  };

  const openStartDialog = () => {
    setStartStep(0);
    setStartLineId('');
    setStartProductId('');
    setStartDialogOpen(true);
  };

  const openCloseDialog = (shift: ProductionReport) => {
    if (!shift.id) return;
    setActiveCloseShiftId(shift.id);
    setClosedReport(null);
    setCloseQuantity('');
    setCloseNotes('');
    setCloseAt(toDatetimeLocalValue(new Date()));
    setCloseDialogOpen(true);
  };

  const handleCloseDialogOpenChange = (open: boolean) => {
    if (saving || sharing) return;
    setCloseDialogOpen(open);
    if (!open) {
      setClosedReport(null);
      setShareCardRow(null);
      setActiveCloseShiftId(null);
    }
  };

  const workerAttendanceSection = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
          <Users size={16} className="text-primary" />
          <span>عمال الخط ({presentCount} حاضر / {workers.length} إجمالي)</span>
        </div>
        {loadingWorkers && <Loader2 size={16} className="animate-spin text-slate-400" />}
      </div>

      {!workerLineId ? (
        <p className="text-xs text-[var(--color-text-muted)] bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-base)] p-3">
          اختر الخط أولاً لتحميل عمال اليوم.
        </p>
      ) : workers.length === 0 && !loadingWorkers ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-[var(--border-radius-base)] p-3">
          لا توجد قائمة عمال محفوظة لهذا الخط اليوم.
        </p>
      ) : (
        <div className="space-y-2 max-h-[45vh] overflow-auto pr-1">
          {workers.map((worker) => (
            <div key={worker.employeeId} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_150px] gap-2 items-center bg-white dark:bg-slate-900/30 border border-[var(--color-border)] rounded-[var(--border-radius-base)] p-2.5">
              <div>
                <p className="text-sm font-bold text-[var(--color-text)]">{worker.employeeName}</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">{worker.employeeCode || worker.employeeId}</p>
              </div>
              <div className="flex rounded-[var(--border-radius-base)] bg-[#f0f2f5] p-1">
                <button
                  type="button"
                  onClick={() => updateWorker(worker.employeeId, { isPresent: true })}
                  className={`px-3 py-1 text-xs font-bold rounded ${worker.isPresent !== false ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500'}`}
                >
                  حاضر
                </button>
                <button
                  type="button"
                  onClick={() => updateWorker(worker.employeeId, { isPresent: false })}
                  className={`px-3 py-1 text-xs font-bold rounded ${worker.isPresent === false ? 'bg-rose-100 text-rose-700' : 'text-slate-500'}`}
                >
                  غائب
                </button>
              </div>
              <select
                className="erp-input text-xs py-2"
                value={resolveLineWorkerLaborRole(worker.laborRole)}
                onChange={(event) => updateWorker(worker.employeeId, { laborRole: event.target.value as ProductionShiftWorkerSnapshot['laborRole'] })}
              >
                {LINE_WORKER_LABOR_ROLES.map((role) => (
                  <option key={role} value={role}>{LINE_WORKER_LABOR_ROLE_LABELS[role]}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const startDialog = (
    <Dialog open={startDialogOpen} onOpenChange={(open) => !saving && setStartDialogOpen(open)}>
      <DialogContent className="max-w-3xl w-[min(100vw-1.5rem,48rem)] border-0 p-0 rounded-[var(--border-radius-xl)] gap-0" dir="rtl">
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center">
            <PlayCircle size={20} className="text-primary" />
          </div>
          <div className="pl-8">
            <DialogTitle className="text-lg font-bold text-[var(--color-text)]">بدء الوردية</DialogTitle>
            <p className="text-xs text-[var(--color-text-muted)] font-medium">
              راجع الخط والمنتج، سجل حضور العمال وأدوارهم، ثم أكد البدء.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {startSteps.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setStartStep(index)}
                className={`rounded-[var(--border-radius-base)] border px-3 py-2 text-xs font-bold transition-colors ${
                  startStep === index
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-[var(--color-border)] bg-[#f8f9fa] text-[var(--color-text-muted)]'
                }`}
              >
                {index + 1}. {label}
              </button>
            ))}
          </div>

          {startStep === 0 && (
            <div className="space-y-4">
              <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[#f8f9fa] p-4">
                <p className="text-sm font-extrabold text-[var(--color-text)]">{context.label}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {fixedPlan
                    ? 'سيتم استخدام بيانات الخطة مباشرة في الوردية.'
                    : 'اختر خطاً من الخطوط المرتبطة بك ثم المنتج قبل الانتقال لحضور العمال.'}
                </p>
              </div>

              {fixedPlan ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-white p-3">
                    <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">خط الإنتاج</p>
                    <p className="text-sm font-bold text-[var(--color-text)]">{startLineName}</p>
                  </div>
                  <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-white p-3">
                    <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">المنتج</p>
                    <p className="text-sm font-bold text-[var(--color-text)]">{startProductName}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select className="erp-input" value={startLineId} onChange={(event) => setStartLineId(event.target.value)}>
                    <option value="">اختر الخط</option>
                    {linesAvailableForStart.map((line) => (
                      <option key={line.id} value={line.id}>{line.name}</option>
                    ))}
                  </select>
                  <select className="erp-input" value={startProductId} onChange={(event) => setStartProductId(event.target.value)}>
                    <option value="">اختر المنتج</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {startStep === 1 && workerAttendanceSection}

          {startStep === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] p-3">
                  <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">خط الإنتاج</p>
                  <p className="text-sm font-bold text-[var(--color-text)]">{startLineName}</p>
                </div>
                <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] p-3">
                  <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">المنتج</p>
                  <p className="text-sm font-bold text-[var(--color-text)]">{startProductName}</p>
                </div>
                <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] p-3">
                  <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">حضور العمال</p>
                  <p className="text-sm font-bold text-emerald-600">{presentCount} حاضر / {workers.length} إجمالي</p>
                </div>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] bg-blue-50 border border-blue-100 rounded-[var(--border-radius-base)] p-3">
                سيتم تسجيل وقت بداية الوردية تلقائياً وحفظ لقطة حضور العمال والأدوار الحالية.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-[var(--color-border)] flex-col-reverse sm:flex-row gap-3 sm:space-x-0">
          <button
            type="button"
            onClick={() => setStartDialogOpen(false)}
            disabled={saving}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-sm font-bold text-[var(--color-text-muted)] disabled:opacity-60"
          >
            إلغاء
          </button>
          {startStep > 0 && (
            <button
              type="button"
              onClick={() => setStartStep((step) => Math.max(step - 1, 0))}
              disabled={saving}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-sm font-bold text-[var(--color-text)] disabled:opacity-60"
            >
              السابق
            </button>
          )}
          {startStep < 2 ? (
            <button
              type="button"
              onClick={() => setStartStep((step) => Math.min(step + 1, 2))}
              disabled={saving || loadingWorkers || !workerLineId || !startProductSelectionId || (startStep === 1 && workers.length === 0)}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-[var(--border-radius-base)] bg-primary text-white text-sm font-bold disabled:opacity-60"
            >
              التالي
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={saving || loadingWorkers || !workerLineId || !startProductSelectionId || workers.length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--border-radius-base)] bg-primary text-white text-sm font-bold disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
              بدء الوردية الآن
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderOpenShiftCard = (shift: ProductionReport) => {
    const cardLineName = getLineName(shift.lineId);
    const cardProductName = getProductName(shift.productId);
    return (
      <div
        key={shift.id}
        className="rounded-[var(--border-radius-lg)] border border-emerald-200 bg-emerald-50/70 dark:bg-emerald-900/10 dark:border-emerald-900/30 p-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-extrabold">
              <SquareCheckBig size={18} />
              <span>وردية مفتوحة</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              بدأت الساعة {formatShiftTime(shift.shiftStartedAt)} على خط {cardLineName} لمنتج {cardProductName}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Badge variant="success">مستمرة</Badge>
            <button
              type="button"
              onClick={() => openCloseDialog(shift)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--border-radius-base)] bg-emerald-600 text-white text-sm font-bold"
            >
              <Save size={16} />
              متابعة / إغلاق
            </button>
          </div>
        </div>
      </div>
    );
  };

  const closeShiftDialog = closeFlowReport ? (
    <Dialog open={closeDialogOpen} onOpenChange={handleCloseDialogOpenChange}>
      <DialogContent className="max-w-2xl w-[min(100vw-1.5rem,42rem)] border-0 p-0 rounded-[var(--border-radius-xl)] gap-0" dir="rtl">
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
            <SquareCheckBig size={20} className="text-emerald-600" />
          </div>
          <div className="pl-8">
            <DialogTitle className="text-lg font-bold text-[var(--color-text)]">
              {closeSucceeded ? 'تم حفظ تقرير الإنتاج' : 'إغلاق الوردية'}
            </DialogTitle>
            <p className="text-xs text-[var(--color-text-muted)] font-medium">
              {closeSucceeded
                ? 'يمكنك مشاركة التقرير بنفس قالب تقارير الإنتاج.'
                : 'أدخل الإنتاج الفعلي ووقت الإغلاق وأي ملاحظات قبل حفظ الإغلاق.'}
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] p-3">
              <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">وقت البدء</p>
              <p className="text-sm font-bold text-[var(--color-text)]">{formatShiftTime(closeFlowReport.shiftStartedAt)}</p>
            </div>
            <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] p-3">
              <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">خط الإنتاج</p>
              <p className="text-sm font-bold text-[var(--color-text)]">{closeLineName}</p>
            </div>
            <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] p-3">
              <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">المنتج</p>
              <p className="text-sm font-bold text-[var(--color-text)]">{closeProductName}</p>
            </div>
          </div>

          {closeSucceeded ? (
            <div className="rounded-[var(--border-radius-lg)] border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-emerald-700">تم تسجيل الإنتاج بنجاح</p>
                  <p className="text-xs text-emerald-700/80 mt-1">
                    الكمية: {formatNumber(closeFlowReport.quantityProduced || 0)} وحدة
                  </p>
                  <p className="text-xs text-emerald-700/80 mt-1">
                    وقت الإغلاق: {formatShiftTime(closeFlowReport.shiftClosedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleShareClosedReport()}
                  disabled={sharing}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--border-radius-base)] bg-emerald-600 text-white text-sm font-bold disabled:opacity-60"
                >
                  {sharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                  مشاركة واتساب
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">وقت الإغلاق</label>
                <input
                  type="datetime-local"
                  value={closeAt}
                  onChange={(event) => setCloseAt(event.target.value)}
                  className="erp-input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="number"
                  min="0"
                  value={closeQuantity}
                  onChange={(event) => setCloseQuantity(event.target.value)}
                  placeholder="الإنتاج الفعلي"
                  className="erp-input"
                />
                <input
                  value={closeNotes}
                  onChange={(event) => setCloseNotes(event.target.value)}
                  placeholder="ملاحظات وتفاصيل الإغلاق"
                  className="erp-input sm:col-span-2"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-[var(--color-border)] flex-col-reverse sm:flex-row gap-3 sm:space-x-0">
          <button
            type="button"
            onClick={() => handleCloseDialogOpenChange(false)}
            disabled={saving || sharing}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-sm font-bold text-[var(--color-text-muted)] disabled:opacity-60"
          >
            {closeSucceeded ? 'إغلاق' : 'إلغاء'}
          </button>
          {!closeSucceeded && (
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--border-radius-base)] bg-emerald-600 text-white text-sm font-bold disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              إغلاق الوردية
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <div className="mt-5 space-y-3">
      {isGeneralContext && openGeneralShifts.map(renderOpenShiftCard)}
      {!isGeneralContext && planOpenShift && renderOpenShiftCard(planOpenShift)}

      {showStartSection && (
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[#f8f9fa] p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-extrabold text-[var(--color-text)]">
                <PlayCircle size={18} className="text-primary" />
                <span>{context.label}</span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {fixedPlan
                  ? `سيتم استخدام خط ${startLineName} ومنتج ${startProductName} من الخطة مباشرة.`
                  : isGeneralContext && openGeneralShifts.length > 0
                    ? 'يمكنك بدء وردية جديدة على خط آخر غير المفتوح حالياً.'
                    : 'اختر خطاً من الخطوط المرتبطة بك ثم المنتج قبل تسجيل العمال.'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Badge variant="info">جاهزة للبدء</Badge>
              <button
                type="button"
                onClick={openStartDialog}
                disabled={isGeneralContext && linesAvailableForStart.length === 0}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--border-radius-base)] bg-primary text-white text-sm font-bold disabled:opacity-60"
              >
                <PlayCircle size={16} />
                بدء الوردية
              </button>
            </div>
          </div>
          {startDialog}
        </div>
      )}

      {closeShiftDialog}
      <ProductionReportShareCardTarget
        row={shareCardRow}
        targetRef={shareCardRef}
        printSettings={printTemplate}
      />
    </div>
  );
};

// ─── Employee Dashboard Widget ───────────────────────────────────────────────

interface Props {
  employeeId: string;
  employeeName: string;
}

export const EmployeeDashboardWidget: React.FC<Props> = ({ employeeId, employeeName }) => {
  const { t } = useTranslation();
  const {
    todayReports, monthlyReports, productionPlans, planReports,
    _rawProducts, _rawLines, loading,
  } = useShallowStore((s) => ({
    todayReports: s.todayReports,
    monthlyReports: s.monthlyReports,
    productionPlans: s.productionPlans,
    planReports: s.planReports,
    _rawProducts: s._rawProducts,
    _rawLines: s._rawLines,
    loading: s.loading,
  }));
  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);
  const updateReport = useAppStore((s) => s.updateReport);
  const uid = useAppStore((s) => s.uid);

  const [period, setPeriod] = useState<Period>('daily');
  const [yesterdayReports, setYesterdayReports] = useState<ProductionReport[]>([]);
  const [yesterdayLoading, setYesterdayLoading] = useState(false);
  const [weeklyReports, setWeeklyReports] = useState<ProductionReport[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [assignedLineIds, setAssignedLineIds] = useState<Set<string>>(new Set());
  const today = getTodayDateString();

  useEffect(() => {
    let cancelled = false;
    supervisorLineAssignmentService.getActiveByDate(today)
      .then((rows) => {
        if (cancelled) return;
        setAssignedLineIds(new Set(
          rows
            .filter((row) => row.supervisorId === employeeId)
            .map((row) => row.lineId)
            .filter(Boolean),
        ));
      })
      .catch(() => {
        if (!cancelled) setAssignedLineIds(new Set());
      });
    return () => { cancelled = true; };
  }, [employeeId, today]);

  useEffect(() => {
    if (period !== 'yesterday') return;
    let cancelled = false;
    const date = getYesterdayDate();
    const maxAgeMs = 5 * 60 * 1000;
    const ck = getProductionReportsRangeCacheKey(date, date);
    const cached = useAppStore.getState().productionReportsRangeCache[ck];
    if (cached) {
      setYesterdayReports(cached.rows);
      setYesterdayLoading(false);
    } else {
      setYesterdayLoading(true);
    }
    ensureProductionReportsForRange(date, date, { maxAgeMs })
      .then((reports) => {
        if (!cancelled) {
          setYesterdayReports(reports);
          setYesterdayLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setYesterdayLoading(false);
      });
    return () => { cancelled = true; };
  }, [period, ensureProductionReportsForRange]);

  useEffect(() => {
    if (period !== 'weekly') return;
    let cancelled = false;
    const { start, end } = getWeekDateRange();
    const maxAgeMs = 5 * 60 * 1000;
    const ck = getProductionReportsRangeCacheKey(start, end);
    const cached = useAppStore.getState().productionReportsRangeCache[ck];
    if (cached) {
      setWeeklyReports(cached.rows);
      setWeeklyLoading(false);
    } else {
      setWeeklyLoading(true);
    }
    ensureProductionReportsForRange(start, end, { maxAgeMs })
      .then((reports) => {
        if (!cancelled) {
          setWeeklyReports(reports);
          setWeeklyLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setWeeklyLoading(false);
      });
    return () => { cancelled = true; };
  }, [period, ensureProductionReportsForRange]);

  const allPeriodReports = useMemo((): ProductionReport[] => {
    switch (period) {
      case 'daily':     return todayReports;
      case 'yesterday': return yesterdayReports;
      case 'weekly':    return weeklyReports;
      case 'monthly':   return monthlyReports;
    }
  }, [period, todayReports, yesterdayReports, weeklyReports, monthlyReports]);

  const myReports = useMemo(
    () => allPeriodReports.filter((r) => r.employeeId === employeeId),
    [allPeriodReports, employeeId]
  );

  // ── KPIs ──
  const kpis = useMemo(() => {
    const totalProduction = myReports.reduce((s, r) => s + (r.quantityProduced || 0), 0);
    const totalWaste = myReports.reduce((s, r) => s + getReportWaste(r), 0);
    const wasteRatio = calculateWasteRatio(totalWaste, totalProduction + totalWaste);
    const totalHours = myReports.reduce((s, r) => s + (r.workHours || 0), 0);
    const uniqueDays = countUniqueDays(myReports);
    const avgPerDay = uniqueDays > 0 ? Math.round(totalProduction / uniqueDays) : 0;
    const avgPerHour = totalHours > 0 ? Number((totalProduction / totalHours).toFixed(1)) : 0;

    return { totalProduction, totalWaste, wasteRatio, totalHours, uniqueDays, avgPerDay, avgPerHour, reportsCount: myReports.length };
  }, [myReports]);

  // ── Active plan (find plans on lines where this supervisor works) ──
  const activePlan = useMemo((): { plan: ProductionPlan; actualProduced: number; progress: number; remaining: number } | null => {
    const myLineIds = [...new Set(myReports.map((r) => r.lineId))];

    const allMyLineReports = [...todayReports, ...monthlyReports].filter(
      (r) => r.employeeId === employeeId
    );
    const allLineIds = [...new Set([...myLineIds, ...allMyLineReports.map((r) => r.lineId)])];

    const plan = productionPlans.find(
      (p) => allLineIds.includes(p.lineId) && (p.status === 'in_progress' || p.status === 'planned')
    );
    if (!plan) return null;

    const key = `${plan.lineId}_${plan.productId}`;
    const historical = planReports[key] || [];
    const todayForPlan = todayReports.filter(
      (r) => r.lineId === plan.lineId && r.productId === plan.productId
    );
    const historicalIds = new Set(historical.map((r) => r.id));
    const merged = [...historical, ...todayForPlan.filter((r) => !historicalIds.has(r.id))];
    const actualProduced = merged.reduce((s, r) => s + (r.quantityProduced || 0), 0);
    const progress = calculatePlanProgress(actualProduced, plan.plannedQuantity);
    const remaining = Math.max(plan.plannedQuantity - actualProduced, 0);

    return { plan, actualProduced, progress, remaining };
  }, [myReports, todayReports, monthlyReports, productionPlans, planReports, employeeId]);

  // ── Period-scoped plan production (only this supervisor's contribution in selected period) ──
  const periodPlanProduced = useMemo(() => {
    if (!activePlan) return 0;
    const periodMy = myReports.filter(
      (r) => r.lineId === activePlan.plan.lineId && r.productId === activePlan.plan.productId
    );
    return periodMy.reduce((s, r) => s + (r.quantityProduced || 0), 0);
  }, [activePlan, myReports]);

  const assignedLines = useMemo(
    () => _rawLines.filter((line) => line.id && assignedLineIds.has(line.id)),
    [_rawLines, assignedLineIds],
  );

  const planOpenShift = useMemo(
    () => activePlan
      ? findOpenProductionShift(todayReports, {
        lineId: activePlan.plan.lineId,
        planId: activePlan.plan.id,
        productId: activePlan.plan.productId,
      })
      : null,
    [activePlan, todayReports],
  );

  const refreshTodayReports = useCallback(async () => {
    await ensureProductionReportsForRange(today, today, { force: true });
  }, [ensureProductionReportsForRange, today]);

  // ── Alerts ──
  const alerts = useMemo(() => {
    const items: { type: 'warning' | 'danger'; icon: string; text: string }[] = [];

    if (activePlan && activePlan.progress < 100) {
      const startDate = new Date(activePlan.plan.startDate);
      const now = new Date();
      const elapsedDays = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const totalDaysEstimate = activePlan.plan.plannedQuantity > 0
        ? Math.ceil(activePlan.plan.plannedQuantity / Math.max(kpis.avgPerDay || 1, 1))
        : elapsedDays;
      const expectedProgress = Math.min(Math.round((elapsedDays / Math.max(totalDaysEstimate, 1)) * 100), 100);
      if (activePlan.progress < expectedProgress - 10) {
        items.push({
          type: 'warning',
          icon: 'schedule',
          text: t('dashboard.alerts.progressBehind', { expected: expectedProgress, actual: activePlan.progress }),
        });
      }
    }

    if (kpis.wasteRatio > 5) {
      items.push({
        type: 'danger',
        icon: 'warning',
        text: t('dashboard.alerts.highWasteRatio', { ratio: kpis.wasteRatio }),
      });
    }

    return items;
  }, [activePlan, kpis]);

  const periodLabel = period === 'daily'
    ? t('dashboard.period.today')
    : period === 'weekly'
      ? t('dashboard.period.thisWeek')
      : t('dashboard.period.thisMonth');
  const isLoadingData = (period === 'yesterday' && yesterdayLoading) || (period === 'weekly' && weeklyLoading);

  if (loading) {
    return (
      <div className="space-y-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">{t('dashboard.supervisorTitle')}</h2>
        <LoadingSkeleton type="card" rows={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header + Period Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">{t('dashboard.supervisorTitle')}</h2>
          <p className="text-[var(--color-text-muted)] mt-1 font-medium text-sm">
            {t('dashboard.welcomeEmployee', { name: employeeName })}
          </p>
        </div>
        <DashboardPeriodFilter value={period} onChange={setPeriod} />
      </div>

      {isLoadingData && (
        <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm font-bold">{t('dashboard.loadingData')}</span>
        </div>
      )}

      <Card className="border-primary/20">
        <ShiftLifecyclePanel
          context={{ type: 'general', label: 'بدء وردية عامة' }}
          employeeId={employeeId}
          employeeName={employeeName}
          uid={uid}
          today={today}
          products={_rawProducts}
          lines={_rawLines}
          assignedLines={assignedLines}
          openShift={null}
          reports={todayReports}
          onStarted={refreshTodayReports}
          onClosed={refreshTodayReports}
          updateReport={updateReport}
        />
      </Card>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-[var(--color-card)] p-4 sm:p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-[var(--border-radius-base)] flex items-center justify-center">
              <Package size={20} className="text-blue-600" />
            </div>
            <p className="text-[11px] font-bold text-slate-400">{t('dashboard.kpi.totalProduction')}</p>
          </div>
          <h3 className="text-2xl font-bold text-blue-600">{formatNumber(kpis.totalProduction)}</h3>
          <p className="text-[10px] text-[var(--color-text-muted)] font-medium mt-0.5">{t('dashboard.unitWithPeriod', { period: periodLabel })}</p>
        </div>

        {activePlan && (
          <div className="bg-[var(--color-card)] p-4 sm:p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
                <CheckCircle2 size={20} className="text-emerald-600" />
              </div>
              <p className="text-[11px] font-bold text-slate-400">{t('dashboard.kpi.planAchievement')}</p>
            </div>
            <h3 className={`text-2xl font-bold ${activePlan.progress >= 80 ? 'text-emerald-600' : activePlan.progress >= 50 ? 'text-blue-600' : 'text-amber-600'}`}>
              {activePlan.progress}%
            </h3>
            <p className="text-[10px] text-[var(--color-text-muted)] font-medium mt-0.5">{t('dashboard.kpi.fromCurrentPlan')}</p>
          </div>
        )}

        {activePlan && (
          <div className="bg-[var(--color-card)] p-4 sm:p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-[var(--border-radius-base)] flex items-center justify-center">
                <ListChecks size={20} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <p className="text-[11px] font-bold text-slate-400">{t('dashboard.kpi.remainingQty')}</p>
            </div>
            <h3 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatNumber(activePlan.remaining)}</h3>
            <p className="text-[10px] text-[var(--color-text-muted)] font-medium mt-0.5">{t('dashboard.kpi.remainingUnits')}</p>
          </div>
        )}

        <div className="bg-[var(--color-card)] p-4 sm:p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 bg-rose-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
              <Trash2 size={20} className="text-rose-600" />
            </div>
            <p className="text-[11px] font-bold text-slate-400">{t('dashboard.kpi.wasteRatio')}</p>
          </div>
          <h3 className={`text-2xl font-bold ${kpis.wasteRatio > 5 ? 'text-rose-600' : 'text-[var(--color-text)]'}`}>
            {kpis.wasteRatio}%
          </h3>
          <p className="text-[10px] text-[var(--color-text-muted)] font-medium mt-0.5">{t('dashboard.wasteUnits', { count: formatNumber(kpis.totalWaste) })}</p>
        </div>

        {period !== 'daily' && (
          <div className="bg-[var(--color-card)] p-4 sm:p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 bg-amber-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
                <Gauge size={20} className="text-amber-600" />
              </div>
              <p className="text-[11px] font-bold text-slate-400">{t('dashboard.kpi.dailyAverage')}</p>
            </div>
            <h3 className="text-2xl font-bold text-amber-600">{formatNumber(kpis.avgPerDay)}</h3>
            <p className="text-[10px] text-[var(--color-text-muted)] font-medium mt-0.5">{t('dashboard.unitsPerDay', { days: kpis.uniqueDays })}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Active Plan Card (takes 2 cols) ── */}
        <div className="lg:col-span-2 space-y-6">
          {activePlan ? (
            <Card className="border-primary/20 shadow-primary/5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center">
                  <NotebookText size={18} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--color-text)]">{t('dashboard.activePlan.title')}</h3>
                  <p className="text-xs text-[var(--color-text-muted)] font-medium">{t('dashboard.activePlan.subtitle')}</p>
                </div>
                <div className="mr-auto">
                  <Badge variant={activePlan.plan.status === 'in_progress' ? 'warning' : 'info'}>
                    {activePlan.plan.status === 'in_progress' ? t('dashboard.status.inProgress') : t('dashboard.status.planned')}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3.5 text-center border border-[var(--color-border)]">
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">{t('dashboard.activePlan.product')}</p>
                  <p className="text-sm font-bold text-[var(--color-text)]">
                    {_rawProducts.find((p) => p.id === activePlan.plan.productId)?.name ?? '—'}
                  </p>
                </div>
                <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3.5 text-center border border-[var(--color-border)]">
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">{t('dashboard.activePlan.plannedQty')}</p>
                  <p className="text-sm font-bold text-primary">{formatNumber(activePlan.plan.plannedQuantity)}</p>
                </div>
                <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3.5 text-center border border-[var(--color-border)]">
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">{t('dashboard.activePlan.producedInPeriod', { period: periodLabel })}</p>
                  <p className="text-sm font-bold text-blue-600">{formatNumber(periodPlanProduced)}</p>
                </div>
                <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3.5 text-center border border-[var(--color-border)]">
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">{t('dashboard.activePlan.remainingTotal')}</p>
                  <p className="text-sm font-bold text-indigo-600">{formatNumber(activePlan.remaining)}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-[var(--color-text-muted)]">{t('dashboard.activePlan.totalProgress')}</span>
                  <span className={activePlan.progress >= 80 ? 'text-emerald-600' : activePlan.progress >= 50 ? 'text-blue-600' : 'text-amber-600'}>
                    {activePlan.progress}%
                  </span>
                </div>
                <div className="w-full h-3 bg-[#f0f2f5] rounded-full overflow-hidden shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      activePlan.progress >= 80 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' :
                      activePlan.progress >= 50 ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' :
                      'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                    }`}
                    style={{ width: `${Math.min(activePlan.progress, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-[var(--color-text-muted)] font-medium">
                  <span>{t('dashboard.activePlan.producedFromPlanned', { produced: formatNumber(activePlan.actualProduced), planned: formatNumber(activePlan.plan.plannedQuantity) })}</span>
                  <span>{t('dashboard.activePlan.lineName', { line: _rawLines.find((l) => l.id === activePlan.plan.lineId)?.name ?? '—' })}</span>
                </div>
              </div>
              <ShiftLifecyclePanel
                context={{ type: 'plan', plan: activePlan.plan, label: 'بدء وردية من هذه الخطة' }}
                employeeId={employeeId}
                employeeName={employeeName}
                uid={uid}
                today={today}
                products={_rawProducts}
                lines={_rawLines}
                assignedLines={assignedLines}
                openShift={planOpenShift}
                reports={todayReports}
                onStarted={refreshTodayReports}
                onClosed={refreshTodayReports}
                updateReport={updateReport}
              />
            </Card>
          ) : (
            <Card>
              <div className="text-center py-8 text-slate-400">
                <NotebookText size={32} className="mb-2 block opacity-30 mx-auto" />
                <p className="font-bold">{t('dashboard.noActivePlan')}</p>
                <p className="text-sm mt-1">{t('dashboard.noActivePlanHint')}</p>
              </div>
            </Card>
          )}

          {/* ── Alerts ── */}
          {alerts.length > 0 && (
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
                  <BellRing size={18} className="text-amber-600" />
                </div>
                <h3 className="text-base font-bold text-[var(--color-text)]">{t('dashboard.alerts.title')}</h3>
              </div>
              <div className="space-y-3">
                {alerts.map((alert, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-3.5 rounded-[var(--border-radius-lg)] border ${
                      alert.type === 'danger'
                        ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-900/20'
                        : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/20'
                    }`}
                  >
                    {renderDashboardIcon(
                      alert.icon,
                      18,
                      `mt-0.5 ${alert.type === 'danger' ? 'text-rose-500' : 'text-amber-500'}`
                    )}
                    <p className="text-sm font-medium text-[var(--color-text)] leading-relaxed">{alert.text}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ── Personal Performance (right sidebar) ── */}
        <div className="lg:col-span-1">
          <Card className="sticky top-24 border-emerald-500/20 shadow-emerald-500/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-emerald-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
                <User size={18} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)]">{t('dashboard.personalPerformance')}</h3>
                <p className="text-[11px] text-[var(--color-text-muted)] font-medium">{periodLabel}</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Reports count */}
              <div className="flex items-center justify-between p-3.5 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-2.5">
                  <FileText size={18} className="text-blue-500" />
                  <span className="text-sm font-bold text-[var(--color-text-muted)]">{t('dashboard.kpi.reportsCount')}</span>
                </div>
                <span className="text-lg font-bold text-blue-600">{kpis.reportsCount}</span>
              </div>

              {/* Avg production per hour */}
              <div className="flex items-center justify-between p-3.5 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-2.5">
                  <Gauge size={18} className="text-emerald-500" />
                  <span className="text-sm font-bold text-[var(--color-text-muted)]">{t('dashboard.kpi.avgPerHour')}</span>
                </div>
                <span className="text-lg font-bold text-emerald-600">{kpis.avgPerHour > 0 ? formatNumber(kpis.avgPerHour) : '—'}</span>
              </div>

              {/* Total work hours */}
              <div className="flex items-center justify-between p-3.5 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-2.5">
                  <Clock3 size={18} className="text-amber-500" />
                  <span className="text-sm font-bold text-[var(--color-text-muted)]">{t('dashboard.kpi.workHours')}</span>
                </div>
                <span className="text-lg font-bold text-amber-600">{kpis.totalHours > 0 ? t('dashboard.hoursValue', { value: kpis.totalHours }) : '—'}</span>
              </div>

              {/* Total production */}
              <div className="flex items-center justify-between p-3.5 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-2.5">
                  <Package size={18} className="text-primary" />
                  <span className="text-sm font-bold text-[var(--color-text-muted)]">{t('dashboard.kpi.totalProduction')}</span>
                </div>
                <span className="text-lg font-bold text-primary">{formatNumber(kpis.totalProduction)}</span>
              </div>

              {/* Waste */}
              <div className="flex items-center justify-between p-3.5 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-2.5">
                  <Trash2 size={18} className="text-rose-500" />
                  <span className="text-sm font-bold text-[var(--color-text-muted)]">{t('dashboard.kpi.waste')}</span>
                </div>
                <div className="text-left">
                  <span className={`text-lg font-bold ${kpis.wasteRatio > 5 ? 'text-rose-600' : 'text-[var(--color-text-muted)]'}`}>
                    {formatNumber(kpis.totalWaste)}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)] font-medium mr-1">({kpis.wasteRatio}%)</span>
                </div>
              </div>
            </div>

            {/* No data state */}
            {kpis.reportsCount === 0 && !isLoadingData && (
              <div className="mt-6 text-center py-4 text-slate-400">
                <Info size={22} className="mb-1 block opacity-40 mx-auto" />
                <p className="text-xs font-bold">{t('dashboard.noReportsForPeriod', { period: periodLabel })}</p>
              </div>
            )}

            {/* Alerts summary at bottom */}
            {alerts.length === 0 && kpis.reportsCount > 0 && (
              <div className="mt-6 pt-4 border-t border-[var(--color-border)]">
                <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-[var(--border-radius-base)] border border-emerald-100 dark:border-emerald-900/20">
                  <CheckCircle2 size={14} className="text-emerald-500 mt-0.5" />
                  <p className="text-xs text-[var(--color-text-muted)] dark:text-emerald-200/80 leading-relaxed font-medium">
                    {t('dashboard.goodPerformance')}
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};


