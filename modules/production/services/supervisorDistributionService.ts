import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';

export type SupervisorAssignmentAction = 'assign' | 'unassign' | 'change';
export type HistoryPeriod = 'today' | 'yesterday';

export interface SupervisorDistributionLine {
  id: string;
  name: string;
  currentSupervisorId: string | null;
  currentSupervisorName: string | null;
  updatedAt?: unknown;
}

export interface SupervisorDistributionSupervisor {
  id: string;
  name: string;
  code: number | string | null;
  isActive: boolean;
}

export interface SupervisorAssignmentLogItem {
  id: string;
  lineId: string;
  lineName: string;
  supervisorId: string | null;
  supervisorName: string | null;
  assignedBy: string;
  assignedAt?: unknown;
  action: SupervisorAssignmentAction;
}

const LINES_COLLECTION = 'productionLines';
const LINES_COLLECTION_LEGACY = 'production_lines';
const SUPERVISORS_COLLECTION = 'supervisors';
const LOG_COLLECTION = 'supervisorAssignmentLog';
const LEGACY_ASSIGNMENTS_COLLECTION = 'supervisor_line_assignments';

const normalizeNullableId = (value: string | null | undefined): string | null => {
  const cleaned = String(value ?? '').trim();
  return cleaned ? cleaned : null;
};

const toStartOfDay = (dateYmd: string): Date => new Date(`${dateYmd}T00:00:00`);
const toEndOfDay = (dateYmd: string): Date => new Date(`${dateYmd}T23:59:59.999`);
const todayYmd = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDate = (dateYmd: string, days: number): string => {
  const date = toStartOfDay(dateYmd);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const resolveAction = (currentSupervisorId: string | null, nextSupervisorId: string | null): SupervisorAssignmentAction | null => {
  if (currentSupervisorId === nextSupervisorId) return null;
  if (!currentSupervisorId && nextSupervisorId) return 'assign';
  if (currentSupervisorId && !nextSupervisorId) return 'unassign';
  return 'change';
};

interface LegacyAssignment {
  lineId: string;
  supervisorId: string;
  supervisorName?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
}

const isLegacyActiveForDate = (row: LegacyAssignment, dateYmd: string): boolean => {
  if (row.isActive === false) return false;
  const from = String(row.effectiveFrom || '').trim();
  const to = String(row.effectiveTo || '').trim();
  if (!from || from > dateYmd) return false;
  if (to && to < from) return false;
  if (to && to < dateYmd) return false;
  return true;
};

const pickLatestLegacyByLine = (
  items: LegacyAssignment[],
  dateYmd: string,
): Map<string, LegacyAssignment> => {
  const byLine = new Map<string, LegacyAssignment>();
  for (const row of items) {
    const lineId = String(row.lineId || '').trim();
    const supervisorId = String(row.supervisorId || '').trim();
    if (!lineId || !supervisorId) continue;
    if (!isLegacyActiveForDate(row, dateYmd)) continue;
    const prev = byLine.get(lineId);
    if (!prev) {
      byLine.set(lineId, row);
      continue;
    }
    if (String(row.effectiveFrom || '') > String(prev.effectiveFrom || '')) {
      byLine.set(lineId, row);
    }
  }
  return byLine;
};

const toLineModel = (id: string, data: Record<string, unknown>): SupervisorDistributionLine => ({
  id,
  name: String(data.name || ''),
  currentSupervisorId: normalizeNullableId(data.currentSupervisorId as string | null | undefined),
  currentSupervisorName: normalizeNullableId(data.currentSupervisorName as string | null | undefined),
  updatedAt: data.updatedAt,
});

const toSupervisorModel = (id: string, data: Record<string, unknown>): SupervisorDistributionSupervisor => ({
  id,
  name: String(data.name || ''),
  code: (data.code as number | string | null | undefined) ?? null,
  isActive: data.isActive !== false,
});

const toLogModel = (id: string, data: Record<string, unknown>): SupervisorAssignmentLogItem => ({
  id,
  lineId: String(data.lineId || ''),
  lineName: String(data.lineName || ''),
  supervisorId: normalizeNullableId(data.supervisorId as string | null | undefined),
  supervisorName: normalizeNullableId(data.supervisorName as string | null | undefined),
  assignedBy: String(data.assignedBy || ''),
  assignedAt: data.assignedAt,
  action: (String(data.action || 'assign') as SupervisorAssignmentAction),
});

const buildDateRange = (period: HistoryPeriod, referenceDate: string): { from: Timestamp; to: Timestamp } => {
  const targetDate = period === 'yesterday' ? shiftDate(referenceDate, -1) : referenceDate;
  return {
    from: Timestamp.fromDate(toStartOfDay(targetDate)),
    to: Timestamp.fromDate(toEndOfDay(targetDate)),
  };
};

const getLineRef = async (lineId: string): Promise<ReturnType<typeof doc> | null> => {
  const primaryRef = doc(db, LINES_COLLECTION, lineId);
  const primarySnap = await getDoc(primaryRef);
  if (primarySnap.exists()) return primaryRef;

  const legacyRef = doc(db, LINES_COLLECTION_LEGACY, lineId);
  const legacySnap = await getDoc(legacyRef);
  if (legacySnap.exists()) return legacyRef;

  return null;
};

export const supervisorDistributionService = {
  async fetchLines(): Promise<SupervisorDistributionLine[]> {
    if (!isConfigured) return [];
    let snap = await getDocs(collection(db, LINES_COLLECTION));
    if (snap.empty) {
      snap = await getDocs(collection(db, LINES_COLLECTION_LEGACY));
    }
    const lines = snap.docs
      .map((item) => toLineModel(item.id, item.data() as Record<string, unknown>))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const missingAssignments = lines.some((line) => !line.currentSupervisorId);
    if (!missingAssignments || lines.length === 0) return lines;

    const legacySnap = await getDocs(collection(db, LEGACY_ASSIGNMENTS_COLLECTION));
    if (legacySnap.empty) return lines;

    const today = todayYmd();
    const legacyRows = legacySnap.docs.map((item) => item.data() as LegacyAssignment);
    const latestLegacyByLine = pickLatestLegacyByLine(legacyRows, today);
    if (latestLegacyByLine.size === 0) return lines;

    return lines.map((line) => {
      const fallback = latestLegacyByLine.get(line.id);
      if (!fallback) return line;
      if (line.currentSupervisorId) {
        if (!line.currentSupervisorName && fallback.supervisorId === line.currentSupervisorId) {
          return {
            ...line,
            currentSupervisorName: normalizeNullableId(fallback.supervisorName || null),
          };
        }
        return line;
      }
      return {
        ...line,
        currentSupervisorId: normalizeNullableId(fallback.supervisorId),
        currentSupervisorName: normalizeNullableId(fallback.supervisorName || null),
      };
    });
  },

  async fetchSupervisors(): Promise<SupervisorDistributionSupervisor[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(
      query(collection(db, SUPERVISORS_COLLECTION), where('isActive', '==', true)),
    );
    return snap.docs
      .map((item) => toSupervisorModel(item.id, item.data() as Record<string, unknown>))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  },

  async saveLineAssignment(input: {
    lineId: string;
    nextSupervisorId: string | null;
    assignedBy: string;
    lineName?: string;
    nextSupervisorName?: string | null;
  }): Promise<void> {
    if (!isConfigured) return;
    const lineId = String(input.lineId || '').trim();
    if (!lineId) return;

    const lineRef = await getLineRef(lineId);
    if (!lineRef) return;
    const lineSnap = await getDoc(lineRef);

    const lineData = lineSnap.data() as Record<string, unknown>;
    const currentSupervisorId = normalizeNullableId(lineData.currentSupervisorId as string | null | undefined);
    const nextSupervisorId = normalizeNullableId(input.nextSupervisorId);
    const action = resolveAction(currentSupervisorId, nextSupervisorId);
    if (!action) return;

    const nextSupervisorName = normalizeNullableId(input.nextSupervisorName ?? null);
    const lineName = String(input.lineName || lineData.name || lineId);

    const batch = writeBatch(db);
    batch.update(lineRef, {
      currentSupervisorId: nextSupervisorId,
      currentSupervisorName: nextSupervisorName,
      updatedAt: serverTimestamp(),
    });

    const logRef = doc(collection(db, LOG_COLLECTION));
    batch.set(logRef, {
      lineId,
      lineName,
      supervisorId: nextSupervisorId,
      supervisorName: nextSupervisorName,
      assignedBy: String(input.assignedBy || '').trim() || 'system',
      assignedAt: serverTimestamp(),
      action,
    });
    await batch.commit();
  },

  async saveAllAssignments(input: {
    changes: Record<string, string | null>;
    linesById: Record<string, SupervisorDistributionLine>;
    supervisorsById: Record<string, SupervisorDistributionSupervisor>;
    assignedBy: string;
  }): Promise<void> {
    if (!isConfigured) return;
    const entries = Object.entries(input.changes);
    if (entries.length === 0) return;

    const batch = writeBatch(db);
    let changedCount = 0;

    for (const [lineId, desiredSupervisorId] of entries) {
      const line = input.linesById[lineId];
      if (!line) continue;
      const nextSupervisorId = normalizeNullableId(desiredSupervisorId);
      const action = resolveAction(normalizeNullableId(line.currentSupervisorId), nextSupervisorId);
      if (!action) continue;

      const lineRef = await getLineRef(lineId);
      if (!lineRef) continue;
      const nextSupervisorName = nextSupervisorId
        ? String(input.supervisorsById[nextSupervisorId]?.name || '')
        : null;

      batch.update(lineRef, {
        currentSupervisorId: nextSupervisorId,
        currentSupervisorName: normalizeNullableId(nextSupervisorName),
        updatedAt: serverTimestamp(),
      });

      const logRef = doc(collection(db, LOG_COLLECTION));
      batch.set(logRef, {
        lineId,
        lineName: line.name,
        supervisorId: nextSupervisorId,
        supervisorName: normalizeNullableId(nextSupervisorName),
        assignedBy: String(input.assignedBy || '').trim() || 'system',
        assignedAt: serverTimestamp(),
        action,
      });
      changedCount += 1;
    }

    if (changedCount === 0) return;
    await batch.commit();
  },

  async unassignLine(input: {
    lineId: string;
    assignedBy: string;
    lineName?: string;
  }): Promise<void> {
    await this.saveLineAssignment({
      lineId: input.lineId,
      nextSupervisorId: null,
      assignedBy: input.assignedBy,
      lineName: input.lineName,
      nextSupervisorName: null,
    });
  },

  async fetchHistory(input: {
    lineId: string;
    period: HistoryPeriod;
    referenceDate: string;
  }): Promise<SupervisorAssignmentLogItem[]> {
    if (!isConfigured) return [];
    const lineId = String(input.lineId || '').trim();
    if (!lineId) return [];

    const { from, to } = buildDateRange(input.period, input.referenceDate);
    const snap = await getDocs(
      query(
        collection(db, LOG_COLLECTION),
        where('lineId', '==', lineId),
        where('assignedAt', '>=', from),
        where('assignedAt', '<=', to),
        orderBy('assignedAt', 'desc'),
        limit(20),
      ),
    );
    return snap.docs.map((item) => toLogModel(item.id, item.data() as Record<string, unknown>));
  },

  async appendHistoryLog(input: Omit<SupervisorAssignmentLogItem, 'id' | 'assignedAt'>): Promise<void> {
    if (!isConfigured) return;
    await addDoc(collection(db, LOG_COLLECTION), {
      ...input,
      assignedAt: serverTimestamp(),
    });
  },
};
