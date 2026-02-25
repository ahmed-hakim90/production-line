import React from 'react';
import { BackgroundJob } from './useJobsStore';

interface JobCardProps {
  job: BackgroundJob;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  onViewReport: (jobId: string) => void;
}

const statusPillClass: Record<BackgroundJob['status'], string> = {
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  uploading: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  processing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
};

export const JobCard: React.FC<JobCardProps> = ({ job, onCancel, onRetry, onViewReport }) => {
  const isProcessing = job.status === 'pending' || job.status === 'uploading' || job.status === 'processing';
  const isDone = job.status === 'completed' || job.status === 'failed';
  const progressWidth = Math.max(2, Math.min(100, job.progress));
  const accentClass =
    job.status === 'completed'
      ? 'border-emerald-200 dark:border-emerald-800'
      : job.status === 'failed'
        ? 'border-rose-200 dark:border-rose-800'
        : 'border-slate-200 dark:border-slate-800';

  return (
    <div className={`rounded-xl border ${accentClass} bg-white dark:bg-slate-900 shadow-sm p-3.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-800 dark:text-white truncate">{job.fileName}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] font-bold text-slate-500">{job.jobType}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${statusPillClass[job.status]}`}>
              {job.status}
            </span>
          </div>
        </div>
        <div className="shrink-0">
          {job.status === 'completed' ? (
            <span className="material-icons-round text-emerald-500 animate-bounce text-lg">check_circle</span>
          ) : job.status === 'failed' ? (
            <span className="material-icons-round text-rose-500 text-lg">error</span>
          ) : (
            <span className="material-icons-round text-primary animate-spin text-lg">sync</span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              job.status === 'completed'
                ? 'bg-emerald-500'
                : job.status === 'failed'
                  ? 'bg-rose-500'
                  : 'bg-primary'
            }`}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-500">{job.statusText}</span>
          <span className="font-black text-slate-700 dark:text-slate-300">{job.progress}%</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400 font-medium">
          {job.processedRows.toLocaleString('en-US')} / {job.totalRows.toLocaleString('en-US')} rows
        </div>
      </div>

      {job.status === 'completed' && (
        <div className="mt-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-2.5 space-y-0.5">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">✔ {job.addedRows.toLocaleString('en-US')} rows added</p>
          <p className="text-xs font-bold text-amber-700 dark:text-amber-400">⚠ {job.failedRows.toLocaleString('en-US')} rows failed</p>
        </div>
      )}

      {job.status === 'failed' && job.errorMessage && (
        <p className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400">{job.errorMessage}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {isProcessing && (
          <button
            onClick={() => onCancel(job.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
        )}

        {isDone && (
          <button
            onClick={() => onViewReport(job.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
          >
            View Report
          </button>
        )}

        {job.status === 'failed' && (
          <button
            onClick={() => onRetry(job.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
};
