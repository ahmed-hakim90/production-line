import { create } from 'zustand';
import { useAppStore } from '../../../store/useAppStore';
import { supervisorLineAssignmentService } from '../services/supervisorLineAssignmentService';
import {
  type HistoryPeriod,
  type SupervisorAssignmentLogItem,
  type SupervisorDistributionLine,
  type SupervisorDistributionSupervisor,
} from '../services/supervisorDistributionService';

type PendingChangesMap = Record<string, string | null>;

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

interface HistoryContext {
  lineId: string;
  lineName: string;
  period: HistoryPeriod;
  referenceDate: string;
}

export interface SupervisorStore {
  lines: SupervisorDistributionLine[];
  supervisors: SupervisorDistributionSupervisor[];
  pendingChanges: PendingChangesMap;
  isLoading: boolean;
  isSaving: boolean;
  toast: ToastState;
  history: SupervisorAssignmentLogItem[];
  historyLoading: boolean;
  historyContext: HistoryContext | null;
  fetchLines: () => Promise<void>;
  fetchSupervisors: () => Promise<void>;
  setPendingChange: (lineId: string, supervisorId: string | null) => void;
  saveChange: (lineId: string) => Promise<void>;
  saveAll: () => Promise<void>;
  unassign: (lineId: string) => Promise<void>;
  fetchHistory: (lineId: string, lineName: string, period: HistoryPeriod, referenceDate: string) => Promise<void>;
  clearToast: () => void;
  clearHistory: () => void;
}

const hasPendingKey = (pending: PendingChangesMap, lineId: string): boolean =>
  Object.prototype.hasOwnProperty.call(pending, lineId);

const getActor = (): string => {
  const app = useAppStore.getState();
  return String(app.userDisplayName || app.userEmail || app.uid || 'system');
};

const getTodayYmd = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toDateFromYmd = (value: string): Date => new Date(`${value}T00:00:00`);

const getPeriodRange = (period: HistoryPeriod, referenceDate: string): { start: string; end: string } => {
  const reference = toDateFromYmd(referenceDate);
  if (Number.isNaN(reference.getTime())) {
    return { start: referenceDate, end: referenceDate };
  }
  if (period === 'yesterday') {
    reference.setDate(reference.getDate() - 1);
  }
  const y = reference.getFullYear();
  const m = String(reference.getMonth() + 1).padStart(2, '0');
  const d = String(reference.getDate()).padStart(2, '0');
  const day = `${y}-${m}-${d}`;
  return { start: day, end: day };
};

const mapReasonToAction = (reason?: string): SupervisorAssignmentLogItem['action'] => {
  if (reason === 'remove') return 'unassign';
  if (reason === 'reassign') return 'change';
  return 'assign';
};

export const useSupervisorStore = create<SupervisorStore>((set, get) => ({
  lines: [],
  supervisors: [],
  pendingChanges: {},
  isLoading: false,
  isSaving: false,
  toast: null,
  history: [],
  historyLoading: false,
  historyContext: null,

  fetchLines: async () => {
    set({ isLoading: true });
    try {
      const rawLines = useAppStore.getState()._rawLines || [];
      const legacyAssignments = await supervisorLineAssignmentService
        .getActiveByDate(getTodayYmd())
        .catch(() => []);
      const legacyByLine = new Map(
        legacyAssignments
          .filter((row) => row.lineId && row.supervisorId)
          .map((row) => [String(row.lineId), row]),
      );
      const lines = rawLines
        .filter((line) => Boolean(line.id))
        .map((line) => ({
          id: String(line.id),
          name: String(line.name || ''),
          currentSupervisorId: String(legacyByLine.get(String(line.id))?.supervisorId || '').trim() || null,
          currentSupervisorName: String(legacyByLine.get(String(line.id))?.supervisorName || '').trim() || null,
        }));
      set({ lines });
    } catch (error) {
      set({
        toast: {
          type: 'error',
          message: (error as Error)?.message || 'تعذر تحميل خطوط الإنتاج.',
        },
      });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchSupervisors: async () => {
    set({ isLoading: true });
    try {
      const rawEmployees = useAppStore.getState()._rawEmployees || [];
      const supervisors = rawEmployees
        .filter((employee) => Boolean(employee.id) && employee.isActive && employee.level === 2)
        .map((employee) => ({
          id: String(employee.id),
          name: String(employee.name || ''),
          code: employee.code ?? null,
          isActive: true,
        }));
      set({ supervisors });
    } catch (error) {
      set({
        toast: {
          type: 'error',
          message: (error as Error)?.message || 'تعذر تحميل بيانات المشرفين.',
        },
      });
    } finally {
      set({ isLoading: false });
    }
  },

  setPendingChange: (lineId, supervisorId) => {
    const line = get().lines.find((item) => item.id === lineId);
    if (!line) return;
    const normalizedTarget = supervisorId ? String(supervisorId).trim() : null;
    const normalizedCurrent = line.currentSupervisorId ? String(line.currentSupervisorId).trim() : null;
    set((state) => {
      const nextPending = { ...state.pendingChanges };
      if (normalizedTarget === normalizedCurrent) {
        delete nextPending[lineId];
      } else {
        nextPending[lineId] = normalizedTarget;
      }
      return { pendingChanges: nextPending };
    });
  },

  saveChange: async (lineId) => {
    const state = get();
    if (!hasPendingKey(state.pendingChanges, lineId)) return;
    const line = state.lines.find((item) => item.id === lineId);
    if (!line) return;

    const nextSupervisorId = state.pendingChanges[lineId];
    const supervisorName = nextSupervisorId
      ? state.supervisors.find((sup) => sup.id === nextSupervisorId)?.name || null
      : null;

    const previousLine = { ...line };
    const previousPending = { ...state.pendingChanges };

    set((current) => ({
      isSaving: true,
      lines: current.lines.map((item) => (
        item.id === lineId
          ? {
              ...item,
              currentSupervisorId: nextSupervisorId,
              currentSupervisorName: supervisorName,
            }
          : item
      )),
    }));

    try {
      if (nextSupervisorId) {
        await supervisorLineAssignmentService.assignOrReassign({
          lineId,
          supervisorId: nextSupervisorId,
          effectiveFrom: getTodayYmd(),
          changedBy: getActor(),
          lineName: line.name,
          supervisorName: supervisorName || undefined,
          reason: line.currentSupervisorId ? 'reassign' : 'assign',
        });
      } else {
        await supervisorLineAssignmentService.removeAssignment(lineId, getTodayYmd(), getActor());
      }
      set((current) => {
        const nextPending = { ...current.pendingChanges };
        delete nextPending[lineId];
        return {
          isSaving: false,
          pendingChanges: nextPending,
          toast: { type: 'success', message: 'تم الحفظ بنجاح' },
        };
      });
    } catch (error) {
      set((current) => ({
        isSaving: false,
        lines: current.lines.map((item) => (item.id === lineId ? previousLine : item)),
        pendingChanges: previousPending,
        toast: {
          type: 'error',
          message: (error as Error)?.message || 'تعذر حفظ التغيير.',
        },
      }));
    }
  },

  saveAll: async () => {
    const state = get();
    const entries = Object.entries(state.pendingChanges);
    if (entries.length === 0) return;

    const previousLines = state.lines.map((item) => ({ ...item }));
    const previousPending = { ...state.pendingChanges };

    const supervisorsById = Object.fromEntries(
      state.supervisors.map((item) => [item.id, item]),
    ) as Record<string, SupervisorDistributionSupervisor>;

    set((current) => ({
      isSaving: true,
      lines: current.lines.map((line) => {
        if (!hasPendingKey(current.pendingChanges, line.id)) return line;
        const nextSupervisorId = current.pendingChanges[line.id];
        const nextSupervisorName = nextSupervisorId
          ? supervisorsById[nextSupervisorId]?.name || null
          : null;
        return {
          ...line,
          currentSupervisorId: nextSupervisorId,
          currentSupervisorName: nextSupervisorName,
        };
      }),
    }));

    try {
      const actor = getActor();
      const effectiveFrom = getTodayYmd();
      for (const [lineId, desiredSupervisorId] of entries) {
        const line = state.lines.find((item) => item.id === lineId);
        if (!line) continue;
        const nextSupervisorId = desiredSupervisorId ? String(desiredSupervisorId).trim() : '';
        if (!nextSupervisorId) {
          await supervisorLineAssignmentService.removeAssignment(lineId, effectiveFrom, actor);
          continue;
        }
        await supervisorLineAssignmentService.assignOrReassign({
          lineId,
          supervisorId: nextSupervisorId,
          effectiveFrom,
          changedBy: actor,
          lineName: line.name,
          supervisorName: supervisorsById[nextSupervisorId]?.name || undefined,
          reason: line.currentSupervisorId ? 'reassign' : 'assign',
        });
      }
      set({
        isSaving: false,
        pendingChanges: {},
        toast: { type: 'success', message: 'تم الحفظ بنجاح' },
      });
    } catch (error) {
      set({
        isSaving: false,
        lines: previousLines,
        pendingChanges: previousPending,
        toast: {
          type: 'error',
          message: (error as Error)?.message || 'تعذر حفظ كل التغييرات.',
        },
      });
    }
  },

  unassign: async (lineId) => {
    const line = get().lines.find((item) => item.id === lineId);
    if (!line) return;
    const previousLine = { ...line };
    const previousPending = { ...get().pendingChanges };

    set((state) => ({
      isSaving: true,
      lines: state.lines.map((item) => (
        item.id === lineId
          ? {
              ...item,
              currentSupervisorId: null,
              currentSupervisorName: null,
            }
          : item
      )),
      pendingChanges: {
        ...state.pendingChanges,
        [lineId]: null,
      },
    }));

    try {
      await supervisorLineAssignmentService.removeAssignment(lineId, getTodayYmd(), getActor());
      set((state) => {
        const nextPending = { ...state.pendingChanges };
        delete nextPending[lineId];
        return {
          isSaving: false,
          pendingChanges: nextPending,
          toast: { type: 'success', message: 'تم الحفظ بنجاح' },
        };
      });
    } catch (error) {
      set((state) => ({
        isSaving: false,
        lines: state.lines.map((item) => (item.id === lineId ? previousLine : item)),
        pendingChanges: previousPending,
        toast: {
          type: 'error',
          message: (error as Error)?.message || 'تعذر فك التعيين.',
        },
      }));
    }
  },

  fetchHistory: async (lineId, lineName, period, referenceDate) => {
    set({
      historyLoading: true,
      historyContext: { lineId, lineName, period, referenceDate },
    });
    try {
      const { start, end } = getPeriodRange(period, referenceDate);
      const rows = await supervisorLineAssignmentService.getHistoryByLine(lineId);
      const history = rows
        .filter((row) => {
          const from = String(row.effectiveFrom || '').trim();
          return Boolean(from) && from >= start && from <= end;
        })
        .sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')))
        .map((row) => ({
          id: String(row.id || `${row.lineId}-${row.effectiveFrom}-${row.supervisorId}`),
          lineId: String(row.lineId || lineId),
          lineName: String(row.lineName || lineName || ''),
          supervisorId: String(row.supervisorId || '').trim() || null,
          supervisorName: String(row.supervisorName || '').trim() || null,
          assignedBy: String(row.changedBy || 'system'),
          assignedAt: row.changedAt,
          action: mapReasonToAction(row.reason),
        }));
      set({ history, historyLoading: false });
    } catch (error) {
      set({
        history: [],
        historyLoading: false,
        toast: {
          type: 'error',
          message: (error as Error)?.message || 'تعذر تحميل سجل التعيينات.',
        },
      });
    }
  },

  clearToast: () => set({ toast: null }),
  clearHistory: () => set({ history: [], historyLoading: false, historyContext: null }),
}));
