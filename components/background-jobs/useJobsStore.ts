import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type BackgroundJobStatus = 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';

export interface BackgroundJob {
  id: string;
  fileName: string;
  jobType: string;
  status: BackgroundJobStatus;
  statusText: string;
  progress: number;
  processedRows: number;
  totalRows: number;
  createdAt: number;
  updatedAt: number;
  startedBy: string;
  addedRows: number;
  failedRows: number;
  errorMessage?: string;
}

interface NewJobInput {
  fileName: string;
  jobType: string;
  totalRows: number;
  startedBy?: string;
}

interface JobsStore {
  jobs: BackgroundJob[];
  panelMinimized: boolean;
  panelHidden: boolean;
  historyOpen: boolean;
  selectedJobId: string | null;

  addJob: (input: NewJobInput) => string;
  updateJob: (id: string, patch: Partial<BackgroundJob>) => void;
  startJob: (id: string, statusText?: string) => void;
  setJobProgress: (id: string, input: { processedRows: number; totalRows?: number; statusText?: string; status?: BackgroundJobStatus }) => void;
  completeJob: (id: string, input: { addedRows: number; failedRows: number; statusText?: string }) => void;
  failJob: (id: string, errorMessage: string, statusText?: string) => void;
  setJobStatus: (id: string, status: BackgroundJobStatus, statusText?: string) => void;
  cancelJob: (id: string) => void;
  retryJob: (id: string) => void;
  viewJobReport: (id: string) => void;

  setPanelMinimized: (value: boolean) => void;
  togglePanelMinimized: () => void;
  setPanelHidden: (value: boolean) => void;
  setHistoryOpen: (value: boolean) => void;
}

const STORAGE_KEY = 'global-background-import-jobs-v1';

const makeJobId = () => `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const now = () => Date.now();

export const useJobsStore = create<JobsStore>()(
  persist(
    (set) => ({
      jobs: [],
      panelMinimized: false,
      panelHidden: false,
      historyOpen: false,
      selectedJobId: null,

      addJob: (input) => {
        const id = makeJobId();
        const created: BackgroundJob = {
          id,
          fileName: input.fileName,
          jobType: input.jobType,
          status: 'pending',
          statusText: 'Uploading file...',
          progress: 0,
          processedRows: 0,
          totalRows: Math.max(1, input.totalRows || 1),
          createdAt: now(),
          updatedAt: now(),
          startedBy: input.startedBy || 'Current User',
          addedRows: 0,
          failedRows: 0,
        };
        set((state) => ({
          jobs: [created, ...state.jobs].slice(0, 120),
          panelHidden: false,
          panelMinimized: false,
        }));
        return id;
      },

      updateJob: (id, patch) => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id ? { ...job, ...patch, updatedAt: now() } : job
          ),
        }));
      },

      startJob: (id, statusText = 'Uploading file...') => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'uploading',
                  statusText,
                  progress: 0,
                  processedRows: 0,
                  errorMessage: '',
                  updatedAt: now(),
                }
              : job
          ),
          panelHidden: false,
          panelMinimized: false,
        }));
      },

      setJobProgress: (id, input) => {
        set((state) => ({
          jobs: state.jobs.map((job) => {
            if (job.id !== id) return job;
            const totalRows = Math.max(1, input.totalRows ?? job.totalRows);
            const processedRows = Math.max(0, Math.min(input.processedRows, totalRows));
            const progress = Math.round((processedRows / totalRows) * 100);
            return {
              ...job,
              totalRows,
              processedRows,
              progress,
              status: input.status ?? 'processing',
              statusText: input.statusText ?? job.statusText,
              updatedAt: now(),
            };
          }),
        }));
      },

      completeJob: (id, input) => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'completed',
                  statusText: input.statusText ?? 'Completed',
                  progress: 100,
                  processedRows: job.totalRows,
                  addedRows: input.addedRows,
                  failedRows: input.failedRows,
                  errorMessage: '',
                  updatedAt: now(),
                }
              : job
          ),
        }));
      },

      failJob: (id, errorMessage, statusText = 'Failed') => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'failed',
                  statusText,
                  errorMessage,
                  updatedAt: now(),
                }
              : job
          ),
        }));
      },

      setJobStatus: (id, status, statusText) => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status,
                  statusText: statusText ?? job.statusText,
                  updatedAt: now(),
                }
              : job
          ),
        }));
      },

      cancelJob: (id) => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'failed',
                  statusText: 'Failed',
                  errorMessage: 'Cancelled by user',
                  updatedAt: now(),
                }
              : job
          ),
        }));
      },

      retryJob: (id) => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'pending',
                  statusText: 'Retry from import screen',
                  progress: 0,
                  processedRows: 0,
                  addedRows: 0,
                  failedRows: 0,
                  errorMessage: '',
                  updatedAt: now(),
                }
              : job
          ),
          panelHidden: false,
          panelMinimized: false,
        }));
      },

      viewJobReport: (id) => {
        set({ historyOpen: true, selectedJobId: id, panelHidden: false, panelMinimized: false });
      },

      setPanelMinimized: (value) => set({ panelMinimized: value, panelHidden: false }),
      togglePanelMinimized: () =>
        set((state) => ({ panelMinimized: !state.panelMinimized, panelHidden: false })),
      setPanelHidden: (value) => set({ panelHidden: value }),
      setHistoryOpen: (value) => set({ historyOpen: value }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        jobs: state.jobs,
        panelMinimized: state.panelMinimized,
        panelHidden: state.panelHidden,
      }),
    }
  )
);
