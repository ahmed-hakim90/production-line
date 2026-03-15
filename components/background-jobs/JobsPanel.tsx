import React from 'react';
import { CheckCheck, X } from 'lucide-react';
import { JobCard } from './JobCard';
import { useJobsStore } from './useJobsStore';

const activeStatuses = new Set(['pending', 'uploading', 'processing']);

export const TasksNavButton: React.FC = () => {
  const jobs = useJobsStore((s) => s.jobs);
  const setHistoryOpen = useJobsStore((s) => s.setHistoryOpen);
  const setPanelHidden = useJobsStore((s) => s.setPanelHidden);
  const setPanelMinimized = useJobsStore((s) => s.setPanelMinimized);
  const activeCount = jobs.filter((j) => activeStatuses.has(j.status)).length;

  return (
    <button
      onClick={() => {
        setHistoryOpen(true);
        setPanelHidden(false);
        setPanelMinimized(true);
      }}
      className="relative p-2 text-[var(--color-text-muted)] hover:bg-[#f0f2f5] rounded-full transition-colors"
      title="Tasks"
    >
      <CheckCheck size={20} />
      {activeCount > 0 && (
        <span className="absolute top-1 left-1 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-white text-[10px] font-bold rounded-full border-2 border-[var(--color-card)] px-1">
          {activeCount > 99 ? '99+' : activeCount}
        </span>
      )}
    </button>
  );
};

export const JobsPanel: React.FC = () => {
  const jobs = useJobsStore((s) => s.jobs);
  const panelMinimized = useJobsStore((s) => s.panelMinimized);
  const panelHidden = useJobsStore((s) => s.panelHidden);
  const setPanelHidden = useJobsStore((s) => s.setPanelHidden);
  const cancelJob = useJobsStore((s) => s.cancelJob);
  const retryJob = useJobsStore((s) => s.retryJob);
  const viewJobReport = useJobsStore((s) => s.viewJobReport);
  const removeJob = useJobsStore((s) => s.removeJob);
  const activeCount = jobs.filter((j) => activeStatuses.has(j.status)).length;

  if (jobs.length === 0) return null;

  if (panelHidden || panelMinimized) {
    return null;
  }

  return (
    <div className="fixed bottom-5 left-5 z-50 w-[340px] sm:w-[380px] max-w-[calc(100vw-1.5rem)] erp-jobs-panel">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between bg-[#f8f9fa]">
        <div>
          <p className="text-[13px] font-bold text-[var(--color-text)]">العمليات الجارية</p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
            {activeCount > 0 ? `${activeCount} عملية نشطة` : 'جميع العمليات منتهية'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPanelHidden(true)}
            className="p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[#e8eaed] transition-colors"
            title="إغلاق"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="max-h-[55vh] overflow-y-auto p-3 space-y-2">
        {jobs.map((job) => (
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
    </div>
  );
};
