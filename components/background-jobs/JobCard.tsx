import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { BackgroundJob } from './useJobsStore';

interface JobCardProps {
  job: BackgroundJob;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  onViewReport: (jobId: string) => void;
  onRemove: (jobId: string) => void;
}

const STATUS_BADGE: Record<BackgroundJob['status'], string> = {
  pending:    'bg-[#f0f2f5] text-[var(--color-text-muted)] border border-[var(--color-border)]',
  uploading:  'bg-blue-50 text-blue-700 border border-blue-200',
  processing: 'bg-amber-50 text-amber-700 border border-amber-200',
  completed:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
  failed:     'bg-rose-50 text-rose-700 border border-rose-200',
};

const STATUS_LABEL: Record<BackgroundJob['status'], string> = {
  pending:    'في الانتظار',
  uploading:  'جاري الرفع',
  processing: 'جاري المعالجة',
  completed:  'مكتمل',
  failed:     'فشل',
};

export const JobCard: React.FC<JobCardProps> = ({ job, onCancel, onRetry, onViewReport, onRemove }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isProcessing = job.status === 'pending' || job.status === 'uploading' || job.status === 'processing';
  const isDone = job.status === 'completed' || job.status === 'failed';
  const progressWidth = Math.max(2, Math.min(100, job.progress));

  const cardBorder =
    job.status === 'completed' ? 'completed' :
    job.status === 'failed'    ? 'failed' :
    isProcessing               ? 'running' : '';

  return (
    <div className={`erp-job-card ${cardBorder}`}>
      {/* Top row: file name + status icon */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--color-text)] truncate">{job.fileName}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[11px] text-[var(--color-text-muted)]">{job.jobType}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${STATUS_BADGE[job.status]}`}>
              {STATUS_LABEL[job.status]}
            </span>
          </div>
        </div>
        <div className="shrink-0 mt-0.5">
          {job.status === 'completed' ? (
            <CheckCircle2 size={20} className="text-emerald-500" />
          ) : job.status === 'failed' ? (
            <AlertCircle size={20} className="text-rose-500" />
          ) : (
            <Loader2 size={20} className="text-[rgb(var(--color-primary))] animate-spin" />
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="erp-progress-wrap">
          <div
            className={`erp-progress-bar${job.status === 'completed' ? ' success' : job.status === 'failed' ? ' error' : isProcessing ? ' striped' : ''}`}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
          <span className="text-[var(--color-text-muted)]">{job.statusText}</span>
          <span className="font-semibold text-[var(--color-text)]">{job.progress}%</span>
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
          {job.processedRows.toLocaleString('ar-EG')} / {job.totalRows.toLocaleString('ar-EG')} صف
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between text-[11.5px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <span>{isExpanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}</span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {isExpanded && (
        <>
          {/* Completion summary */}
          {job.status === 'completed' && (
            <div className="mt-3 rounded-[var(--border-radius-sm)] bg-emerald-50 border border-emerald-200 p-2.5 space-y-0.5">
              <p className="text-[11.5px] font-semibold text-emerald-700">✔ {job.addedRows.toLocaleString('ar-EG')} صف مضاف</p>
              <p className="text-[11.5px] font-semibold text-amber-700">⚠ {job.failedRows.toLocaleString('ar-EG')} صف فشل</p>
            </div>
          )}

          {/* Error message */}
          {job.status === 'failed' && job.errorMessage && (
            <p className="mt-2.5 text-[11.5px] text-rose-600">{job.errorMessage}</p>
          )}

          {/* Action buttons */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {isProcessing && (
              <button
                onClick={() => onCancel(job.id)}
                className="px-3 py-1.5 rounded-[var(--border-radius-sm)] text-[12px] font-medium bg-[#f0f2f5] text-[var(--color-text)] hover:bg-[#e8eaed] transition-colors border border-[var(--color-border)]"
              >
                إلغاء
              </button>
            )}
            {isDone && (
              <button
                onClick={() => onViewReport(job.id)}
                className="px-3 py-1.5 rounded-[var(--border-radius-sm)] text-[12px] font-medium bg-[rgb(var(--color-primary)/0.08)] text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary)/0.14)] transition-colors border border-[rgb(var(--color-primary)/0.2)]"
              >
                عرض التقرير
              </button>
            )}
            {job.status === 'failed' && (
              <button
                onClick={() => onRetry(job.id)}
                className="px-3 py-1.5 rounded-[var(--border-radius-sm)] text-[12px] font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors border border-rose-200"
              >
                إعادة المحاولة
              </button>
            )}
            {isDone && (
              <button
                onClick={() => onRemove(job.id)}
                className="px-3 py-1.5 rounded-[var(--border-radius-sm)] text-[12px] font-medium bg-[#f0f2f5] text-[var(--color-text-muted)] hover:bg-[#e8eaed] transition-colors border border-[var(--color-border)]"
              >
                حذف
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
