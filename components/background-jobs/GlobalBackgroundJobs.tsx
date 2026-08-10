import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { JobCard } from './JobCard';
import { JobsPanel } from './JobsPanel';
import { BackgroundJob, useJobsStore } from './useJobsStore';

const ACTIVE_STATUSES = new Set(['pending', 'uploading', 'processing']);

const formatDate = (ms: number, locale: string) =>
  new Date(ms).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const resultText = (job: BackgroundJob, t: (key: string, opts?: Record<string, unknown>) => string) => {
  if (ACTIVE_STATUSES.has(job.status)) {
    return job.statusText || `${job.progress}%`;
  }
  if (job.errorMessage) return job.errorMessage;
  return t('jobs.resultSummary', {
    added: job.addedRows.toLocaleString(),
    skipped: (job.skippedRows ?? 0).toLocaleString(),
    failed: job.failedRows.toLocaleString(),
  });
};

const STATUS_BADGE: Record<BackgroundJob['status'], string> = {
  pending: 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]',
  uploading: 'bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))]',
  processing: 'bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]',
  completed: 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]',
  failed: 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]',
};

export const GlobalBackgroundJobs: React.FC = () => {
  const { t, i18n } = useTranslation();
  const jobs = useJobsStore((s) => s.jobs);
  const historyOpen = useJobsStore((s) => s.historyOpen);
  const selectedJobId = useJobsStore((s) => s.selectedJobId);
  const setHistoryOpen = useJobsStore((s) => s.setHistoryOpen);
  const cancelJob = useJobsStore((s) => s.cancelJob);
  const retryJob = useJobsStore((s) => s.retryJob);
  const viewJobReport = useJobsStore((s) => s.viewJobReport);
  const removeJob = useJobsStore((s) => s.removeJob);

  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'ar-EG';
  const activeJobs = jobs.filter((j) => ACTIVE_STATUSES.has(j.status));
  const finishedJobs = jobs.filter((j) => j.status === 'completed' || j.status === 'failed');

  return (
    <>
      <JobsPanel />

      {historyOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setHistoryOpen(false)}
          />

          <aside className="fixed top-0 left-0 h-full w-full sm:w-[680px] max-w-[95vw] z-50 bg-[var(--color-card)] shadow-2xl border-r border-[var(--color-border)] flex flex-col">
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)]">{t('jobs.historyTitle')}</h3>
                <p className="text-xs text-[var(--color-text-muted)] font-medium">{t('jobs.historySubtitle')}</p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="p-2 rounded-[var(--border-radius-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
                title={t('ui.close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-auto space-y-6">
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-[var(--color-text)]">{t('jobs.runningOperations')}</h4>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {activeJobs.length > 0
                      ? t('jobs.activeOperations', { count: activeJobs.length })
                      : t('jobs.noActiveJobs')}
                  </span>
                </div>
                {activeJobs.length === 0 ? (
                  <div className="rounded-[var(--border-radius-lg)] border border-dashed border-[var(--color-border)] px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    {t('jobs.noActiveJobs')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onCancel={cancelJob}
                        onRetry={retryJob}
                        onViewReport={viewJobReport}
                        onRemove={removeJob}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-[var(--color-text)]">{t('jobs.finishedOperations')}</h4>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {t('jobs.finishedCount', { count: finishedJobs.length })}
                  </span>
                </div>
                <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <table className="erp-table w-full text-sm">
                    <thead className="erp-thead">
                      <tr>
                        <th className="erp-th">{t('jobs.columns.date')}</th>
                        <th className="erp-th">{t('jobs.columns.type')}</th>
                        <th className="erp-th">{t('jobs.columns.user')}</th>
                        <th className="erp-th">{t('jobs.columns.status')}</th>
                        <th className="erp-th">{t('jobs.columns.result')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {finishedJobs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-10 text-[var(--color-text-muted)] font-medium">
                            {t('jobs.noFinishedJobs')}
                          </td>
                        </tr>
                      )}
                      {finishedJobs.map((job) => (
                        <tr
                          key={job.id}
                          className={`${job.id === selectedJobId ? 'bg-primary/5' : ''}`}
                        >
                          <td className="px-3 py-2.5 text-xs font-mono text-[var(--color-text-muted)]">
                            {formatDate(job.createdAt, locale)}
                          </td>
                          <td className="px-3 py-2.5 font-bold text-[var(--color-text)]">{job.jobType}</td>
                          <td className="px-3 py-2.5 text-[var(--color-text-muted)]">{job.startedBy}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[job.status]}`}
                            >
                              {t(`jobs.status.${job.status}`)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">{resultText(job, t)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </aside>
        </>
      )}
    </>
  );
};
