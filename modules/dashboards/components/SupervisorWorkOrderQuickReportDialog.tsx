import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';
import { useAppStore } from '@/store/useAppStore';
import { lineAssignmentService } from '@/services/lineAssignmentService';
import { getOperationalDateString } from '@/utils/calculations';
import { resolveReportBehaviorSettings } from '@/modules/production/lib/reportBehaviorSettings';
import {
  buildWorkersCountAutoFill,
  buildWorkersCountAutoFillFromAssignments,
  countOperatorsFromAssignments,
  sumWorkersCountPatch,
} from '@/modules/production/utils/lineAssignmentWorkersCount';
import {
  buildReportPrefillFromWorkOrder,
  hasDistributedLineLabor,
} from '@/modules/production/utils/workOrderReportPrefill';
import { isPackagingLineId } from '@/modules/production/utils/packagingLine';
import { getReportDuplicateMessage } from '@/modules/production/utils/reportDuplicateError';
import {
  PRODUCTION_REPORT_CREATE_PATHS,
  PRODUCTION_REPORT_OPERATION_KEYS,
  isOperationPathEnabled,
} from '@/modules/system/lib/operationPathSettings';
import {
  INJECTION_SHIFT_OPTIONS,
  isInjectionShiftSelected,
} from '@/modules/production/utils/injectionReportShift';
import type { ProductionReport, ProductionReportShift, WorkOrder } from '@/types';

type Props = {
  open: boolean;
  workOrder: WorkOrder | null;
  reportSupervisorEmployeeId: string;
  supervisorName?: string;
  productName?: string;
  lineName?: string;
  onClose: () => void;
  onSaved?: () => void;
};

const INPUT_CLASS =
  'w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-3 py-2.5 text-sm font-medium bg-[var(--color-bg)] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none';

export const SupervisorWorkOrderQuickReportDialog: React.FC<Props> = ({
  open,
  workOrder,
  reportSupervisorEmployeeId,
  supervisorName,
  productName,
  lineName,
  onClose,
  onSaved,
}) => {
  const queueReportCreate = useAppStore((s) => s.queueReportCreate);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const lines = useAppStore((s) => s._rawLines);
  const reportBehavior = useMemo(() => resolveReportBehaviorSettings(systemSettings), [systemSettings]);

  const [quantity, setQuantity] = useState('');
  const [hours, setHours] = useState('');
  const [workers, setWorkers] = useState('');
  const [shift, setShift] = useState<ProductionReportShift | ''>('');
  const [distributed, setDistributed] = useState(false);
  const [distributedCount, setDistributedCount] = useState(0);
  const [distributedAssignments, setDistributedAssignments] = useState<
    Awaited<ReturnType<typeof lineAssignmentService.getByLineAndDate>>
  >([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [saving, setSaving] = useState(false);

  const isInjection = workOrder?.workOrderType === 'component_injection';

  const reportDate = useMemo(
    () => getOperationalDateString(reportBehavior.operationalDayStartHour),
    [reportBehavior.operationalDayStartHour],
  );

  const pathEnabled = isOperationPathEnabled(
    systemSettings,
    PRODUCTION_REPORT_OPERATION_KEYS.create,
    PRODUCTION_REPORT_CREATE_PATHS.supervisorDashboard,
  );

  const resetFromWorkOrder = useCallback(async (wo: WorkOrder) => {
    const prefill = buildReportPrefillFromWorkOrder(wo, {
      isPackagingLine: isPackagingLineId(wo.lineId, lines),
    });
    setQuantity('');
    setHours(prefill?.workHours != null ? String(prefill.workHours) : '');
    setWorkers(prefill?.workersCount != null ? String(prefill.workersCount) : '');
    setShift('');
    setDistributed(false);
    setDistributedCount(0);
    setDistributedAssignments([]);
    setLoadingWorkers(true);
    try {
      const assignments = await lineAssignmentService.getByLineAndDate(wo.lineId, reportDate);
      if (hasDistributedLineLabor(assignments.length)) {
        const count = countOperatorsFromAssignments(assignments, reportSupervisorEmployeeId);
        setDistributed(true);
        setDistributedCount(count);
        setDistributedAssignments(assignments);
        setWorkers(String(count));
      }
    } catch {
      // Keep WO seed when assignment lookup fails.
    } finally {
      setLoadingWorkers(false);
    }
  }, [lines, reportDate, reportSupervisorEmployeeId]);

  useEffect(() => {
    if (!open || !workOrder) return;
    void resetFromWorkOrder(workOrder);
  }, [open, workOrder, resetFromWorkOrder]);

  const handleSave = async () => {
    if (saving || !workOrder?.id) return;
    if (!pathEnabled) {
      showAppToast('error', 'مسار إنشاء التقرير من لوحة المشرف متوقف من إعدادات النظام.');
      return;
    }
    const qty = Number(quantity || 0);
    const workHours = Number(hours || 0);
    const workersCount = Number(workers || 0);
    if (reportBehavior.requirePositiveQuantityOnReports && qty <= 0) {
      showAppToast('error', 'أدخل الكمية المنتجة.');
      return;
    }
    if (reportBehavior.requireWorkHoursOnReports && workHours <= 0) {
      showAppToast('error', 'أدخل ساعات العمل.');
      return;
    }
    if (reportBehavior.requireLaborForFinishedReports && workersCount <= 0) {
      showAppToast('error', 'أدخل عدد العمالة.');
      return;
    }
    if (isInjection && reportBehavior.requireInjectionShift && !isInjectionShiftSelected(shift)) {
      showAppToast('error', 'اختر الوردية قبل حفظ تقرير الحقن.');
      return;
    }

    const reportType = isInjection ? 'component_injection' : 'finished_product';
    const isPackagingLine = isPackagingLineId(workOrder.lineId, lines);
    let workersPatch = buildWorkersCountAutoFill(workersCount, {
      reportType,
      isPackagingLine,
    });

    // Prefer role breakdown from line distribution only when the supervisor kept the auto-filled count.
    // If they edited the number, persist the manual headcount instead.
    if (distributed && workersCount === distributedCount) {
      const fromAssignments = buildWorkersCountAutoFillFromAssignments(
        distributedAssignments,
        { reportType, isPackagingLine },
        reportSupervisorEmployeeId,
      );
      if (sumWorkersCountPatch(fromAssignments) > 0) {
        workersPatch = fromAssignments;
      }
    }

    const payload: Omit<ProductionReport, 'id' | 'createdAt'> = {
      employeeId: reportSupervisorEmployeeId || workOrder.supervisorId,
      productId: workOrder.productId,
      lineId: workOrder.lineId,
      date: reportDate,
      quantityProduced: qty,
      workersCount: Number(workersPatch.workersCount ?? (
        reportType === 'finished_product' && !isPackagingLine
          ? sumWorkersCountPatch(workersPatch)
          : workersCount
      )),
      workersProductionCount: workersPatch.workersProductionCount,
      workersPackagingCount: workersPatch.workersPackagingCount,
      workersQualityCount: workersPatch.workersQualityCount,
      workersMaintenanceCount: workersPatch.workersMaintenanceCount,
      workersExternalCount: workersPatch.workersExternalCount,
      presentAssignments: workersPatch.presentAssignments,
      absentAssignments: workersPatch.absentAssignments,
      workHours,
      workOrderId: workOrder.id,
      productionPlanId: workOrder.planId || undefined,
      productionPlanLinkMode: workOrder.planId ? 'manual' : undefined,
      reportType,
      ...(isInjection && isInjectionShiftSelected(shift) ? { shift } : {}),
      notes: `تقرير سريع من لوحة المشرف — أمر ${workOrder.workOrderNumber}`,
    };

    setSaving(true);
    const queued = queueReportCreate(payload, {
      path: PRODUCTION_REPORT_CREATE_PATHS.supervisorDashboard,
    });
    showAppToast('success', 'تمت إضافة التقرير للجدول وجارٍ تأكيد حفظه.');
    onClose();
    setSaving(false);
    void queued.completion.then((createdId) => {
      if (!createdId) {
        const storeError = useAppStore.getState().error;
        showAppToast('error', getReportDuplicateMessage(storeError, 'تعذر حفظ التقرير. استخدم إعادة المحاولة من الجدول.'));
        return;
      }
      showAppToast('success', 'تم تأكيد حفظ التقرير، والترحيل مستمر في الخلفية.');
      onSaved?.();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader className="space-y-2 text-start sm:text-start">
          <DialogTitle>تقرير أمر شغل</DialogTitle>
          {workOrder ? (
            <DialogDescription asChild>
              <div className="space-y-1.5 text-start">
                <p className="font-mono text-xs font-bold text-[rgb(var(--color-warning))]">
                  #{workOrder.workOrderNumber}
                </p>
                <p className="text-sm font-medium leading-snug text-[var(--color-text)]">
                  {productName || '—'}
                </p>
                <dl className="grid gap-1 text-xs text-[var(--color-text-muted)]">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <dt className="shrink-0 font-bold text-[var(--color-text)]">الخط</dt>
                    <dd className="min-w-0">{lineName || '—'}</dd>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <dt className="shrink-0 font-bold text-[var(--color-text)]">المشرف</dt>
                    <dd className="min-w-0">{supervisorName || '—'}</dd>
                  </div>
                </dl>
              </div>
            </DialogDescription>
          ) : (
            <DialogDescription>
              أدخل كمية اليوم وساعات العمل وعدد العمالة.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-1">
          {isInjection ? (
            <div>
              <label className="mb-1.5 block text-sm font-bold text-[var(--color-text-muted)]">الوردية *</label>
              <select
                className={INPUT_CLASS}
                value={shift}
                onChange={(e) => setShift(e.target.value as ProductionReportShift | '')}
              >
                <option value="">اختر الوردية</option>
                {INJECTION_SHIFT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="mb-1.5 block text-sm font-bold text-[var(--color-text-muted)]">الكمية المنتجة *</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              className={INPUT_CLASS}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-[var(--color-text-muted)]">ساعات العمل *</label>
            <input
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              className={INPUT_CLASS}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-[var(--color-text-muted)]">
              عدد العمالة {distributed ? '(من توزيع الخط)' : '*'}
            </label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              className={INPUT_CLASS}
              value={workers}
              onChange={(e) => setWorkers(e.target.value)}
              placeholder="0"
              disabled={loadingWorkers}
            />
            {loadingWorkers ? (
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">جاري التحقق من توزيع العمالة…</p>
            ) : distributed ? (
              <p className="mt-1 text-[11px] font-medium text-[rgb(var(--color-primary))]">
                المصدر الافتراضي: توزيع الخط اليوم ({distributedCount}) — ويمكنك التعديل يدويًا.
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                لا يوجد توزيع عمالة على الخط — أدخل العدد يدوياً.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <GhostButton type="button" onClick={onClose} disabled={saving}>إلغاء</GhostButton>
          <PrimaryButton type="button" tone="execute" onClick={() => { void handleSave(); }} disabled={saving || !workOrder}>
            {saving ? 'جاري الحفظ…' : 'حفظ التقرير'}
          </PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
