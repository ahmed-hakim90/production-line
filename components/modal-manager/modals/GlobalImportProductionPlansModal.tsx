import React, { useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, Save, X } from 'lucide-react';
import { Button } from '../../../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { addDaysToDate, calculateEstimatedDays } from '../../../utils/calculations';
import { calculateOperationalPeriodDailyTarget } from '../../../modules/production/lib/operationalPeriod';
import { parseProductionPlansExcel, type ProductionPlanImportResult } from '../../../utils/importProductionPlans';
import { DEFAULT_PLAN_SETTINGS } from '../../../utils/dashboardConfig';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import { useTranslation } from 'react-i18next';
import {
  PRODUCTION_PLAN_CREATE_PATHS,
  PRODUCTION_PLAN_OPERATION_KEYS,
  isOperationPathEnabled,
} from '../../../modules/system/lib/operationPathSettings';
import { useJobsStore } from '../../background-jobs/useJobsStore';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';

export const GlobalImportProductionPlansModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.PRODUCTION_PLANS_IMPORT);
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const createProductionPlan = useAppStore((s) => s.createProductionPlan);
  const products = useAppStore((s) => s._rawProducts);
  const lines = useAppStore((s) => s._rawLines);
  const planSettings = useAppStore((s) => s.systemSettings.planSettings ?? DEFAULT_PLAN_SETTINGS);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);
  const importPathEnabled = isOperationPathEnabled(
    systemSettings,
    PRODUCTION_PLAN_OPERATION_KEYS.create,
    PRODUCTION_PLAN_CREATE_PATHS.globalImport,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ProductionPlanImportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const validRows = useMemo(
    () => (result?.rows || []).filter((row) => row.errors.length === 0),
    [result]
  );

  if (!isOpen) return null;
  if (!can('import') || !can('plans.create') || !importPathEnabled) return null;

  const handleClose = () => {
    setResult(null);
    setMessage(null);
    close();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setParsing(true);
    setMessage(null);
    try {
      const parsed = await parseProductionPlansExcel(file, { products, lines });
      setResult(parsed);
      if (parsed.rows.length === 0) setMessage(t('modalManager.importProductionPlans.noValidDataInFile'));
    } catch {
      setMessage(t('modalManager.importProductionPlans.readImportFileError'));
    } finally {
      setParsing(false);
    }
  };

  const handleSave = () => {
    if (!uid) {
      setMessage(t('modalManager.importProductionPlans.cannotImportWithoutActiveUser'));
      return;
    }
    if (validRows.length === 0) return;

    const rowsToImport = [...validRows];
    const actorUid = uid;
    const jobId = addJob({
      fileName: 'production-plans-import.xlsx',
      jobType: 'Production Plans Import',
      totalRows: rowsToImport.length,
      startedBy: userDisplayName || 'Current User',
    });
    startJob(jobId, 'Saving to database...');
    setResult(null);
    setMessage(null);
    close();
    showAppToast('success', 'بدأ استيراد خطط الإنتاج في الخلفية.');

    void (async () => {
      let done = 0;
      let failed = 0;
      for (const row of rowsToImport) {
        try {
          const product = products.find((p) => p.id === row.productId);
          const productDailyRate = Number(product?.avgDailyProduction || 0);
          const useOperationalPeriod = planSettings.useOperationalPeriodDailyTarget !== false;
          const operationalCalc = useOperationalPeriod
            ? calculateOperationalPeriodDailyTarget({
                plannedQuantity: row.plannedQuantity,
                anchorDate: row.startDate,
                startDay: planSettings.operationalMonthStartDay,
              })
            : { dailyTarget: 0, workingDays: 0, period: null as null };
          const dailyRate = operationalCalc.dailyTarget > 0
            ? operationalCalc.dailyTarget
            : productDailyRate;
          const estimatedDays = operationalCalc.dailyTarget > 0
            ? operationalCalc.workingDays
            : calculateEstimatedDays(row.plannedQuantity, dailyRate);
          const plannedEndDate = operationalCalc.period
            ? operationalCalc.period.endDateInclusive
            : estimatedDays > 0
              ? addDaysToDate(row.startDate, estimatedDays)
              : '';
          const avgDailyTarget = dailyRate > 0 ? Math.ceil(dailyRate) : 0;

          const created = await createProductionPlan({
            productId: row.productId,
            ...(row.lineId ? { lineId: row.lineId } : {}),
            plannedQuantity: row.plannedQuantity,
            producedQuantity: 0,
            startDate: row.startDate,
            plannedStartDate: row.startDate,
            plannedEndDate,
            estimatedDurationDays: estimatedDays,
            avgDailyTarget,
            priority: row.priority,
            estimatedCost: 0,
            actualCost: 0,
            status: 'planned',
            createdBy: actorUid,
          }, { path: PRODUCTION_PLAN_CREATE_PATHS.globalImport });
          if (!created) failed += 1;
        } catch {
          failed += 1;
        } finally {
          done += 1;
          setJobProgress(jobId, {
            processedRows: done,
            totalRows: rowsToImport.length,
            statusText: 'Saving to database...',
            status: 'processing',
          });
        }
      }

      const addedRows = Math.max(0, done - failed);
      if (addedRows === 0 && failed > 0) {
        failJob(
          jobId,
          t('modalManager.importProductionPlans.importPartial', { success: 0, failed }),
          'Failed',
        );
      } else {
        completeJob(jobId, {
          addedRows,
          failedRows: failed,
          statusText: 'Completed',
        });
      }
    })();
  };

  return (
    <ManagedModalPortal>
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={handleClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:w-[95vw] sm:rounded-[var(--border-radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[rgb(var(--color-success)/0.1)] rounded-[var(--border-radius-base)] flex items-center justify-center">
              <FileUp size={20} className="text-[rgb(var(--color-success))]" />
            </div>
            <div>
              <h3 className="text-lg font-bold">{t('modalManager.importProductionPlans.title')}</h3>
              {result && (
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {t('modalManager.importProductionPlans.headerStats', { total: result.totalRows, valid: result.validCount, errors: result.errorCount })}
                </p>
              )}
            </div>
          </div>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
              {parsing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
              {t('modalManager.importProductionPlans.chooseFile')}
            </Button>
          </div>

          {result && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-bold">
              <div className="rounded-[var(--border-radius-base)] bg-[rgb(var(--color-primary)/0.1)] dark:bg-[rgb(var(--color-primary)/0.15)] px-3 py-2 text-[rgb(var(--color-primary))] dark:text-[rgb(var(--color-primary))]">{t('modalManager.importProductionPlans.totalLabel', { total: result.totalRows })}</div>
              <div className="rounded-[var(--border-radius-base)] bg-[rgb(var(--color-success)/0.1)] px-3 py-2 text-[rgb(var(--color-success))]">{t('modalManager.importProductionPlans.validLabel', { valid: result.validCount })}</div>
              <div className="rounded-[var(--border-radius-base)] bg-[rgb(var(--color-danger)/0.1)] px-3 py-2 text-[rgb(var(--color-danger))]">{t('modalManager.importProductionPlans.errorsLabel', { errors: result.errorCount })}</div>
            </div>
          )}

          {result && (
            <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <table className="erp-table w-full text-right border-collapse">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">#</th>
                    <th className="erp-th">{t('modalManager.importProductionPlans.table.product')}</th>
                    <th className="erp-th">{t('modalManager.importProductionPlans.table.line')}</th>
                    <th className="erp-th">{t('modalManager.importProductionPlans.table.quantity')}</th>
                    <th className="erp-th">{t('modalManager.importProductionPlans.table.startDate')}</th>
                    <th className="erp-th">{t('modalManager.importProductionPlans.table.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {result.rows.map((row) => {
                    const productName = products.find((p) => p.id === row.productId)?.name || '—';
                    const lineName = lines.find((l) => l.id === row.lineId)?.name || '—';
                    return (
                      <tr key={`${row.rowIndex}-${row.productId}-${row.lineId}`}>
                        <td className="px-3 py-2 text-sm">{row.rowIndex}</td>
                        <td className="px-3 py-2 text-sm">{productName}</td>
                        <td className="px-3 py-2 text-sm">{lineName}</td>
                        <td className="px-3 py-2 text-sm">{row.plannedQuantity}</td>
                        <td className="px-3 py-2 text-sm">{row.startDate || '—'}</td>
                        <td className="px-3 py-2 text-sm">
                          {row.errors.length === 0 ? (
                            <span className="text-[rgb(var(--color-success))] font-bold">{t('modalManager.importProductionPlans.valid')}</span>
                          ) : (
                            <span className="text-[rgb(var(--color-danger))] font-bold">{row.errors.join(' | ')}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {message && (
            <div className="rounded-[var(--border-radius-base)] border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)]/80 px-3 py-2 text-xs font-bold text-[rgb(var(--color-warning))]">
              {message}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={handleClose} iconName="close" tone="neutral">{t('ui.close')}</Button>
          <Button variant="primary" onClick={handleSave} disabled={validRows.length === 0}>
            <Save size={14} />
            {t('modalManager.importProductionPlans.savePlans', { count: validRows.length })}
          </Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
