import React from 'react';
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

          <aside className="fixed top-0 left-0 h-full w-full sm:w-[680px] max-w-[95vw] z-50 bg-white dark:bg-slate-900 shadow-2xl border-r border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800 dark:text-white">Tasks History</h3>
                <p className="text-xs text-slate-400 font-medium">Background import jobs across the ERP</p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="p-4 overflow-auto">
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="text-right px-3 py-2 text-xs font-black text-slate-500">Date</th>
                      <th className="text-right px-3 py-2 text-xs font-black text-slate-500">Type</th>
                      <th className="text-right px-3 py-2 text-xs font-black text-slate-500">User</th>
                      <th className="text-right px-3 py-2 text-xs font-black text-slate-500">Status</th>
                      <th className="text-right px-3 py-2 text-xs font-black text-slate-500">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {historyJobs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-10 text-slate-400 font-medium">
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
                        <td className="px-3 py-2.5 font-bold text-slate-700 dark:text-slate-300">{job.jobType}</td>
                        <td className="px-3 py-2.5 text-slate-500">{job.startedBy}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              job.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
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
