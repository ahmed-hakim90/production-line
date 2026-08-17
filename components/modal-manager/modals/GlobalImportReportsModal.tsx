import React, { useMemo, useRef, useState } from 'react';
import { Download, FileUp, Loader2, Save, X } from 'lucide-react';
import { Button } from '../../../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { ImportResult, parseExcelFile, toReportData } from '../../../utils/importExcel';
import { downloadReportsTemplate } from '../../../utils/downloadTemplates';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import { getReportDuplicateMessage, isReportDuplicateError } from '../../../modules/production/utils/reportDuplicateError';
import { useTranslation } from 'react-i18next';
import {
  PRODUCTION_REPORT_CREATE_PATHS,
  PRODUCTION_REPORT_OPERATION_KEYS,
  isOperationPathEnabled,
} from '../../../modules/system/lib/operationPathSettings';
import { useJobsStore } from '../../background-jobs/useJobsStore';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';

export const GlobalImportReportsModal: React.FC = () => {
  const { t } = useTranslation();
  const futureDateErrorToken = t('modalManager.importReports.futureDateErrorToken');
  const listSeparator = t('modalManager.shared.listSeparator');
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.REPORTS_IMPORT);
  const { can } = usePermission();
  const queueReportCreate = useAppStore((s) => s.queueReportCreate);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const products = useAppStore((s) => s._rawProducts);
  const lines = useAppStore((s) => s._rawLines);
  const employees = useAppStore((s) => s._rawEmployees);
  const reports = useAppStore((s) => s.productionReports);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const validRows = useMemo(
    () => (result?.rows || []).filter((row) => row.errors.length === 0 && !row.isDuplicate),
    [result],
  );
  const futureDateErrorRowsCount = useMemo(
    () =>
      (result?.rows || []).filter((row) =>
        row.errors.some((error) => error.includes(futureDateErrorToken))
      ).length,
    [result],
  );
  const futureDateErrorRowIndexes = useMemo(
    () =>
      (result?.rows || [])
        .filter((row) => row.errors.some((error) => error.includes(futureDateErrorToken)))
        .map((row) => row.rowIndex),
    [result],
  );

  if (!isOpen) return null;
  if (!can('import')) return null;
  if (!isOperationPathEnabled(
    systemSettings,
    PRODUCTION_REPORT_OPERATION_KEYS.create,
    PRODUCTION_REPORT_CREATE_PATHS.globalImport,
  )) return null;

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
      const parsed = await parseExcelFile(file, {
        products,
        lines,
        employees,
        existingReports: reports,
      });
      setResult(parsed);
      if (parsed.rows.length === 0) {
        setMessage(t('modalManager.importReports.noValidDataInFile'));
      } else {
        const futureRows = parsed.rows
          .filter((row) => row.errors.some((error) => error.includes(futureDateErrorToken)))
          .map((row) => row.rowIndex);
        const hasFutureDates = futureRows.length > 0;
        if (hasFutureDates) {
          setMessage(
            t('modalManager.importReports.futureDatesFoundAllCancelled', { rows: futureRows.join(listSeparator) })
          );
        }
      }
    } catch {
      setMessage(t('modalManager.importReports.readFileError'));
    } finally {
      setParsing(false);
    }
  };

  const handleSave = () => {
    if (futureDateErrorRowsCount > 0) {
      setMessage(
        t('modalManager.importReports.cannotSaveFutureDateRows', { rows: futureDateErrorRowIndexes.join(listSeparator) })
      );
      return;
    }
    if (validRows.length === 0) return;

    const rowsToImport = [...validRows];
    const jobId = addJob({
      fileName: 'reports-import.xlsx',
      jobType: 'Reports Import',
      totalRows: rowsToImport.length,
      startedBy: userDisplayName || 'Current User',
    });
    startJob(jobId, 'Saving to database...');
    setResult(null);
    setMessage(null);
    close();
    showAppToast('success', 'بدأ استيراد التقارير في الخلفية.');

    void (async () => {
      let done = 0;
      let failed = 0;
      let duplicate = 0;
      for (const row of rowsToImport) {
        try {
          const queued = queueReportCreate(toReportData(row), {
            path: PRODUCTION_REPORT_CREATE_PATHS.globalImport,
          });
          const created = await queued.completion;
          if (!created) {
            const storeErr = useAppStore.getState().error;
            if (isReportDuplicateError(storeErr)) duplicate += 1;
            failed += 1;
          }
        } catch (error) {
          if (isReportDuplicateError(error)) duplicate += 1;
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
        const failedMsg =
          duplicate > 0
            ? t('modalManager.importReports.importPartialWithDuplicates', { success: 0, failed, duplicate })
            : t('modalManager.importReports.importPartial', { success: 0, failed });
        failJob(jobId, getReportDuplicateMessage(null, failedMsg), 'Failed');
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
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:w-[95vw] sm:rounded-[var(--border-radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[rgb(var(--color-success)/0.1)] rounded-[var(--border-radius-base)] flex items-center justify-center">
              <FileUp size={20} className="text-[rgb(var(--color-success))]" />
            </div>
            <div>
              <h3 className="text-lg font-bold">{t('modalManager.importReports.title')}</h3>
              {result && (
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {t('modalManager.importReports.headerStats', { total: result.totalRows, valid: result.validCount, errors: result.errorCount })}
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
              {t('modalManager.importReports.chooseFile')}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadReportsTemplate({
                  products,
                  lines,
                  employees: employees.map((employee) => ({
                    name: String(employee.name || ''),
                    code: String(employee.code || ''),
                  })),
                })
              }
              disabled={parsing}
            >
              <Download size={14} />
              {t('modalManager.importReports.downloadTemplate')}
            </Button>
          </div>

          {result && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
              <div className="rounded-[var(--border-radius-base)] bg-[rgb(var(--color-primary)/0.1)] dark:bg-[rgb(var(--color-primary)/0.15)] px-3 py-2 text-[rgb(var(--color-primary))] dark:text-[rgb(var(--color-primary))]">{t('modalManager.importReports.totalLabel', { total: result.totalRows })}</div>
              <div className="rounded-[var(--border-radius-base)] bg-[rgb(var(--color-success)/0.1)] px-3 py-2 text-[rgb(var(--color-success))]">{t('modalManager.importReports.validLabel', { valid: result.validCount })}</div>
              <div className="rounded-[var(--border-radius-base)] bg-[rgb(var(--color-danger)/0.1)] px-3 py-2 text-[rgb(var(--color-danger))]">{t('modalManager.importReports.errorsLabel', { errors: result.errorCount })}</div>
              <div className="rounded-[var(--border-radius-base)] bg-[rgb(var(--color-warning)/0.1)] dark:bg-[rgb(var(--color-warning)/0.15)] px-3 py-2 text-[rgb(var(--color-warning))] dark:text-[rgb(var(--color-warning))]">{t('modalManager.importReports.duplicateLabel', { duplicate: result.duplicateCount })}</div>
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
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={validRows.length === 0 || futureDateErrorRowsCount > 0}
          >
            <Save size={14} />
            {t('modalManager.importReports.saveReports', { count: validRows.length })}
          </Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
