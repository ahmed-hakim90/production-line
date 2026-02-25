import React from 'react';
import { JobCard } from './JobCard';
import { useJobsStore } from './useJobsStore';

const activeStatuses = new Set(['pending', 'uploading', 'processing']);
const floatingVisibleStatuses = new Set(['pending', 'uploading', 'processing', 'failed']);

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
        setPanelMinimized(false);
      }}
      className="relative p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
      title="Tasks"
    >
      <span className="material-icons-round">task_alt</span>
      {activeCount > 0 && (
        <span className="absolute top-1 left-1 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-white text-[10px] font-black rounded-full border-2 border-white dark:border-slate-900 px-1">
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
  const togglePanelMinimized = useJobsStore((s) => s.togglePanelMinimized);
  const setPanelHidden = useJobsStore((s) => s.setPanelHidden);
  const setPanelMinimized = useJobsStore((s) => s.setPanelMinimized);
  const cancelJob = useJobsStore((s) => s.cancelJob);
  const retryJob = useJobsStore((s) => s.retryJob);
  const viewJobReport = useJobsStore((s) => s.viewJobReport);
  const activeCount = jobs.filter((j) => activeStatuses.has(j.status)).length;
  const floatingCount = jobs.filter((j) => floatingVisibleStatuses.has(j.status)).length;

  if (jobs.length === 0) return null;

  if (panelHidden || panelMinimized) {
    if (floatingCount === 0) return null;

    return (
      <button
        onClick={() => {
          setPanelHidden(false);
          setPanelMinimized(false);
        }}
        className="fixed bottom-5 left-5 z-50 w-14 h-14 rounded-full shadow-xl bg-primary text-white flex items-center justify-center hover:opacity-95 transition-opacity"
        title="Background Imports"
      >
        <span className="material-icons-round">upload_file</span>
        <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white dark:border-slate-900">
          {floatingCount}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 left-5 z-50 w-[340px] sm:w-[380px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
      <div className="px-3.5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-slate-800 dark:text-white">Background Imports</p>
          <p className="text-[11px] font-medium text-slate-400">{activeCount} running jobs</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={togglePanelMinimized}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Minimize"
          >
            <span className="material-icons-round text-base">remove</span>
          </button>
          <button
            onClick={() => setPanelHidden(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <span className="material-icons-round text-base">close</span>
          </button>
        </div>
      </div>

      <div className="max-h-[55vh] overflow-y-auto p-3 space-y-2.5">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onCancel={cancelJob}
            onRetry={retryJob}
            onViewReport={viewJobReport}
          />
        ))}
      </div>
    </div>
  );
};
