import React from 'react';
import { X } from 'lucide-react';
import { JobsPanel } from './JobsPanel';
import { useJobsStore } from './useJobsStore';

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const resultText = (addedRows: number, failedRows: number, errorMessage?: string) => {
  if (errorMessage) return errorMessage;
  return `${addedRows.toLocaleString('en-US')} added / ${failedRows.toLocaleString('en-US')} failed`;
};

export const GlobalBackgroundJobs: React.FC = () => {
  const jobs = useJobsStore((s) => s.jobs);
  const historyOpen = useJobsStore((s) => s.historyOpen);
  const selectedJobId = useJobsStore((s) => s.selectedJobId);
  const setHistoryOpen = useJobsStore((s) => s.setHistoryOpen);
  const historyJobs = jobs.filter((j) => j.status === 'completed' || j.status === 'failed');

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
                <h3 className="text-base font-bold text-[var(--color-text)]">Tasks History</h3>
                <p className="text-xs text-[var(--color-text-muted)] font-medium">Background import jobs across the ERP</p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="p-2 rounded-[var(--border-radius-base)] text-[var(--color-text-muted)] hover:text-slate-600 hover:bg-[#f0f2f5] transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-auto">
              <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <table className="erp-table w-full text-sm">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">Date</th>
                      <th className="erp-th">Type</th>
                      <th className="erp-th">User</th>
                      <th className="erp-th">Status</th>
                      <th className="erp-th">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {historyJobs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-10 text-[var(--color-text-muted)] font-medium">
                          No finished jobs yet.
                        </td>
                      </tr>
                    )}
                    {historyJobs.map((job) => (
                      <tr
                        key={job.id}
                        className={`${job.id === selectedJobId ? 'bg-primary/5' : ''}`}
                      >
                        <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{formatDate(job.createdAt)}</td>
                        <td className="px-3 py-2.5 font-bold text-[var(--color-text)]">{job.jobType}</td>
                        <td className="px-3 py-2.5 text-slate-500">{job.startedBy}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              job.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {resultText(job.addedRows, job.failedRows, job.errorMessage)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
};
