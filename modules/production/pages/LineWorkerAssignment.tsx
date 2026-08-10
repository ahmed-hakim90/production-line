import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Badge, Button } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import { supervisorLineAssignmentService } from '../services/supervisorLineAssignmentService';
import { productionLineWorkerAssignmentService } from '../services/productionLineWorkerAssignmentService';
import { productionWorkerService } from '../services/productionWorkerService';
import { getDocs } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef } from '../../hr/collections';
import { getTodayDateString } from '../../../utils/calculations';
import type {
  LineWorkerAssignment as LWA,
  LineWorkerLaborRole,
  ProductionLineWorkerAssignment,
  ProductionWorker,
} from '../../../types';
import type { FirestoreDepartment, FirestoreJobPosition } from '../../hr/types';
import {
  LINE_WORKER_LABOR_ROLE_LABELS,
  LINE_WORKER_LABOR_ROLES,
  resolveLineWorkerLaborRole,
} from '../utils/lineWorkerLaborRoles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';
import {
  DAILY_WORKER_ASSIGNMENT_PATHS,
  PERMANENT_WORKER_ASSIGNMENT_PATHS,
  WORKER_ASSIGNMENT_OPERATION_KEYS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

const WORKER_POSITION_KEYWORDS = ['عامل انتاج', 'عامل إنتاج', 'عامل الانتاج', 'عامل الإنتاج'];

type DisplayLineWorkerAssignment = LWA & {
  permanentAssignmentId?: string;
  permanentWorkerId?: string;
  source: 'permanent' | 'legacy';
};

const getEmployeeCodeSortValue = (code: string): { kind: 'numeric' | 'text' | 'empty'; text: string; numberValue: number } => {
  const text = String(code || '').trim();
  if (!text || text === '—') return { kind: 'empty', text: '', numberValue: Number.POSITIVE_INFINITY };

  const numberValue = Number(text);
  if (Number.isFinite(numberValue) && /^-?\d+(?:\.\d+)?$/.test(text)) {
    return { kind: 'numeric', text, numberValue };
  }

  return { kind: 'text', text, numberValue: Number.POSITIVE_INFINITY };
};

const compareEmployeeCodes = (leftCode: string, rightCode: string): number => {
  const left = getEmployeeCodeSortValue(leftCode);
  const right = getEmployeeCodeSortValue(rightCode);

  if (left.kind === 'numeric' && right.kind === 'numeric') {
    return left.numberValue - right.numberValue || left.text.localeCompare(right.text, 'ar', { numeric: true });
  }

  if (left.kind !== right.kind) {
    const rank = { numeric: 0, text: 1, empty: 2 };
    return rank[left.kind] - rank[right.kind];
  }

  return left.text.localeCompare(right.text, 'ar', { numeric: true });
};

const sortAssignmentsByEmployeeCode = <T,>(rows: T[], getCode: (row: T) => string): T[] => (
  rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => compareEmployeeCodes(getCode(left.row), getCode(right.row)) || left.index - right.index)
    .map(({ row }) => row)
);

const isPermanentAssignmentActiveOnDate = (row: ProductionLineWorkerAssignment, date: string): boolean => {
  if (!row.isActive) return false;
  if (row.startDate > date) return false;
  if (row.endDate && row.endDate < date) return false;
  return true;
};

const getPreviousDateString = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const [, year, month, day] = match;
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export const LineWorkerAssignment: React.FC = () => {
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const storeCurrentEmployee = useAppStore((s) => s.currentEmployee);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const permanentAssignmentPathEnabled = isOperationPathEnabled(
    systemSettings,
    WORKER_ASSIGNMENT_OPERATION_KEYS.permanent,
    PERMANENT_WORKER_ASSIGNMENT_PATHS.lineWorkersPage,
  );
  const dailyAssignmentPathEnabled = isOperationPathEnabled(
    systemSettings,
    WORKER_ASSIGNMENT_OPERATION_KEYS.daily,
    DAILY_WORKER_ASSIGNMENT_PATHS.lineWorkersPage,
  );

  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [selectedLineId, setSelectedLineId] = useState('');
  const [assignments, setAssignments] = useState<DisplayLineWorkerAssignment[]>([]);
  const [allDayAssignments, setAllDayAssignments] = useState<DisplayLineWorkerAssignment[]>([]);
  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [jobPositions, setJobPositions] = useState<FirestoreJobPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [savingPermanentLink, setSavingPermanentLink] = useState(false);
  const [endingPermanentAssignmentId, setEndingPermanentAssignmentId] = useState<string | null>(null);
  const [clearingPermanentAssignments, setClearingPermanentAssignments] = useState(false);
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [updatingLaborRoleId, setUpdatingLaborRoleId] = useState<string | null>(null);
  const [assignedLineIds, setAssignedLineIds] = useState<Set<string>>(new Set());
  /** Avoid caching an empty roster before supervisor line scope (or store lines) is ready. */
  const [supervisorLinesLoaded, setSupervisorLinesLoaded] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [deptSnap, posSnap] = await Promise.all([getDocs(departmentsRef()), getDocs(jobPositionsRef())]);
        setDepartments(deptSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreDepartment)));
        setJobPositions(posSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreJobPosition)));
      } catch (e) {
        console.error('Load ref data error:', e);
      }
    })();
  }, []);

  const currentEmployee = useMemo(
    () => (storeCurrentEmployee?.id ? storeCurrentEmployee : _rawEmployees.find((e) => e.userId === uid)) ?? null,
    [storeCurrentEmployee, _rawEmployees, uid],
  );
  const isSupervisorReporter = useMemo(
    () => String(userRoleName || '').trim().includes('مشرف') || currentEmployee?.level === 2,
    [userRoleName, currentEmployee?.level],
  );

  useEffect(() => {
    let mounted = true;
    if (!isSupervisorReporter || !currentEmployee?.id) {
      setAssignedLineIds(new Set());
      setSupervisorLinesLoaded(true);
      return () => {
        mounted = false;
      };
    }
    setSupervisorLinesLoaded(false);
    supervisorLineAssignmentService
      .getActiveByDate(selectedDate)
      .then((rows) => {
        if (!mounted) return;
        const ids = new Set(
          rows
            .filter((row) => String(row.supervisorId || '').trim() === currentEmployee.id)
            .map((row) => String(row.lineId || '').trim())
            .filter(Boolean),
        );
        setAssignedLineIds(ids);
        setSupervisorLinesLoaded(true);
      })
      .catch(() => {
        if (!mounted) return;
        setAssignedLineIds(new Set());
        setSupervisorLinesLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, [isSupervisorReporter, currentEmployee?.id, selectedDate]);

  const visibleLines = useMemo(
    () => (
      isSupervisorReporter
        ? _rawLines.filter((line) => Boolean(line.id) && assignedLineIds.has(String(line.id)))
        : _rawLines
    ),
    [_rawLines, isSupervisorReporter, assignedLineIds],
  );

  const visibleLineIds = useMemo(
    () => new Set(visibleLines.map((line) => String(line.id || '')).filter(Boolean)),
    [visibleLines],
  );
  const visibleLineIdList = useMemo(
    () => visibleLines.map((line) => String(line.id || '')).filter(Boolean),
    [visibleLines],
  );
  const visibleLinesScopeKey = useMemo(
    () => visibleLineIdList.slice().sort().join(',') || 'none',
    [visibleLineIdList],
  );
  const assignmentScopeReady = supervisorLinesLoaded && (!isSupervisorReporter || Boolean(currentEmployee?.id));

  const buildPermanentDisplayRows = useCallback((
    permanentRows: ProductionLineWorkerAssignment[],
    workersById: Map<string, ProductionWorker>,
    dailyRows: LWA[],
  ): DisplayLineWorkerAssignment[] => {
    const dailyByLineEmployee = new Map(
      dailyRows
        .filter((row) => row.lineId && row.employeeId)
        .map((row) => [`${row.lineId}_${row.employeeId}`, row]),
    );

    return permanentRows
      .map((row): DisplayLineWorkerAssignment | null => {
        const worker = workersById.get(row.workerId);
        if (!worker || worker.isActive === false) return null;
        const employeeId = String(worker.employeeId || row.workerId).trim();
        const daily = dailyByLineEmployee.get(`${row.lineId}_${employeeId}`);
        return {
          id: daily?.id,
          permanentAssignmentId: row.id,
          permanentWorkerId: row.workerId,
          source: 'permanent' as const,
          lineId: row.lineId,
          employeeId,
          employeeCode: String(daily?.employeeCode || worker.code || '').trim(),
          employeeName: String(daily?.employeeName || worker.name || employeeId).trim(),
          date: selectedDate,
          laborRole: daily?.laborRole || row.laborRole,
          isPresent: daily?.isPresent ?? true,
          assignedAt: daily?.assignedAt,
          assignedBy: daily?.assignedBy,
        };
      })
      .filter((row): row is DisplayLineWorkerAssignment => Boolean(row));
  }, [selectedDate]);

  // Scope must be part of the key: an early fetch with empty visible lines must not
  // poison the 45s cache / in-flight dedupe used after supervisor lines resolve.
  const assignmentCacheKey = `production:lineWorkerAssign:${selectedDate}:${selectedLineId || 'all'}:${visibleLinesScopeKey}`;

  const loadAssignments = useCallback(async (opts?: { force?: boolean }) => {
    if (!assignmentScopeReady) return;

    const cached = peekPageDataCache<{ allDay: DisplayLineWorkerAssignment[]; assignments: DisplayLineWorkerAssignment[] }>(assignmentCacheKey);
    if (cached) {
      setAllDayAssignments(cached.allDay);
      setAssignments(cached.assignments);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        assignmentCacheKey,
        async () => {
          const lineIds = visibleLineIdList;
          const [dailyRows, productionWorkers, permanentByLine] = await Promise.all([
            lineAssignmentService.getByDate(selectedDate),
            productionWorkerService.getAll(),
            Promise.all(
              lineIds.map(async (lineId) => ({
                lineId,
                rows: await productionLineWorkerAssignmentService.getActiveByLineAndDate(lineId, selectedDate),
              })),
            ),
          ]);

          const workersById = new Map(productionWorkers.map((worker) => [String(worker.id || ''), worker]));
          const permanentRows = permanentByLine.flatMap(({ rows }) => rows);
          const linesWithPermanent = new Set(permanentByLine.filter(({ rows }) => rows.length > 0).map(({ lineId }) => lineId));
          const permanentDisplayRows = buildPermanentDisplayRows(permanentRows, workersById, dailyRows);
          const legacyRows = (
            await Promise.all(
              lineIds
                .filter((lineId) => !linesWithPermanent.has(lineId))
                .map((lineId) => lineAssignmentService.getByLineAndDate(lineId, selectedDate)),
            )
          ).flat().map((row) => ({ ...row, source: 'legacy' as const }));

          const all = [...permanentDisplayRows, ...legacyRows];
          const scopedAssignments = isSupervisorReporter
            ? all.filter((a) => visibleLineIds.has(String(a.lineId || '').trim()))
            : all;
          const lineAssignments = selectedLineId
            ? scopedAssignments.filter((a) => a.lineId === selectedLineId)
            : [];
          return { allDay: scopedAssignments, assignments: lineAssignments };
        },
        { force: opts?.force === true, maxAgeMs: 45_000 },
      );
      setAllDayAssignments(data.allDay);
      setAssignments(data.assignments);
    } catch (e) {
      console.error('Load assignments error:', e);
    } finally {
      setLoading(false);
    }
  }, [
    assignmentCacheKey,
    assignmentScopeReady,
    selectedDate,
    selectedLineId,
    isSupervisorReporter,
    visibleLineIds,
    visibleLineIdList,
    buildPermanentDisplayRows,
  ]);

  const reloadAssignments = useCallback(async () => {
    invalidatePageDataCache(assignmentCacheKey);
    await loadAssignments({ force: true });
  }, [assignmentCacheKey, loadAssignments]);

  useEffect(() => {
    if (!assignmentScopeReady) return;
    void loadAssignments();
  }, [assignmentScopeReady, loadAssignments]);

  useEffect(() => {
    if (!selectedLineId) return;
    if (visibleLineIds.has(selectedLineId)) return;
    setSelectedLineId('');
  }, [selectedLineId, visibleLineIds]);

  const showFeedback = (type: 'success' | 'error' | 'warning', message: string) => {
    showAppToast(type, message);
  };

  const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name ?? '';
  const getPositionTitle = (id: string) => jobPositions.find((j) => j.id === id)?.title ?? '';
  const getLineName = (id: string) => _rawLines.find((l) => l.id === id)?.name ?? id;

  const handleLaborRoleChange = async (assignment: DisplayLineWorkerAssignment, laborRole: LineWorkerLaborRole) => {
    if (
      (assignment.permanentAssignmentId && !permanentAssignmentPathEnabled)
      || (assignment.id && !dailyAssignmentPathEnabled)
    ) {
      showFeedback('error', 'أحد مسارات تعيين العامل المطلوبة متوقف من إعدادات النظام');
      return;
    }
    const actionId = assignment.id || assignment.permanentAssignmentId;
    if (!actionId) return;

    setUpdatingLaborRoleId(actionId);
    try {
      if (assignment.permanentAssignmentId) {
        await productionLineWorkerAssignmentService.update(
          assignment.permanentAssignmentId,
          { laborRole },
          { path: PERMANENT_WORKER_ASSIGNMENT_PATHS.lineWorkersPage },
        );
      }
      if (assignment.id) {
        await lineAssignmentService.updateLaborRole(
          assignment.id,
          laborRole,
          { path: DAILY_WORKER_ASSIGNMENT_PATHS.lineWorkersPage },
        );
      }
      await reloadAssignments();
      showFeedback('success', 'تم تحديث نوع العامل');
    } catch {
      showFeedback('error', 'حدث خطأ أثناء تحديث نوع العامل');
    } finally {
      setUpdatingLaborRoleId(null);
    }
  };

  const syncWorkerLineSnapshot = async (workerId?: string) => {
    if (!workerId) return;
    const [worker, workerAssignments] = await Promise.all([
      productionWorkerService.getById(workerId),
      productionLineWorkerAssignmentService.getByWorker(workerId),
    ]);
    if (!worker?.id) return;

    const activeLineIds = Array.from(new Set(
      workerAssignments
        .filter((row) => isPermanentAssignmentActiveOnDate(row, getTodayDateString()))
        .map((row) => String(row.lineId || '').trim())
        .filter(Boolean),
    ));
    const defaultLineId = activeLineIds.includes(String(worker.defaultLineId || '').trim())
      ? worker.defaultLineId
      : activeLineIds[0] || '';

    await productionWorkerService.update(worker.id, {
      lineIds: activeLineIds,
      defaultLineId,
    });
  };

  const deleteCancellationDateDailyRows = async (rowsToCancel: DisplayLineWorkerAssignment[]) => {
    const cancellationDate = getTodayDateString();
    const keys = new Set(
      rowsToCancel.map((assignment) => `${assignment.lineId}_${assignment.employeeId}`),
    );
    if (keys.size === 0) return;

    const dailyRows = await lineAssignmentService.getByDate(cancellationDate);
    const idsToDelete = dailyRows
      .filter((row) => keys.has(`${row.lineId}_${row.employeeId}`))
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id));

    await Promise.all(idsToDelete.map((id) => lineAssignmentService.delete(
      id,
      { path: DAILY_WORKER_ASSIGNMENT_PATHS.lineWorkersPage },
    )));
  };

  const renderLaborRoleSelect = (
    assignment: DisplayLineWorkerAssignment,
    compact = false,
  ) => (
    <Select
      value={resolveLineWorkerLaborRole(assignment.laborRole)}
      disabled={(!assignment.id && !assignment.permanentAssignmentId) || updatingLaborRoleId === (assignment.id || assignment.permanentAssignmentId)}
      onValueChange={(value) => {
        void handleLaborRoleChange(assignment, value as LineWorkerLaborRole);
      }}
    >
      <SelectTrigger className={`${compact ? 'h-8 min-w-[96px] text-xs' : 'h-9 min-w-[120px] text-sm'} border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-2`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LINE_WORKER_LABOR_ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {LINE_WORKER_LABOR_ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const handlePermanentAdd = useCallback(async (selectedEmployee?: typeof _rawEmployees[number]) => {
    if (!permanentAssignmentPathEnabled) {
      showFeedback('error', 'مسار الربط الدائم متوقف من إعدادات النظام');
      return;
    }
    if (!selectedLineId) {
      showFeedback('warning', 'اختر خط الإنتاج أولاً');
      return;
    }
    if (isSupervisorReporter && !visibleLineIds.has(selectedLineId)) {
      showFeedback('error', 'لا يمكنك ربط عامل على خط غير مربوط بك');
      return;
    }

    const trimmed = scanInput.trim();
    const employee = selectedEmployee ?? _rawEmployees.find((e) => e.code === trimmed || e.id === trimmed);
    if (!employee?.id) {
      showFeedback('error', trimmed ? `كود "${trimmed}" غير معروف` : 'اختر عامل للإضافة');
      inputRef.current?.focus();
      return;
    }
    if (employee.isActive === false) {
      showFeedback('error', `${employee.name} — السجل غير نشط`);
      inputRef.current?.focus();
      return;
    }

    setSavingPermanentLink(true);
    try {
      const linkStartDate = getTodayDateString();
      const workerId = await productionWorkerService.linkEmployee({
        employeeId: employee.id,
        name: employee.name,
        code: employee.code,
        defaultLineId: selectedLineId,
        isActive: true,
      });
      if (!workerId) {
        showFeedback('error', 'تعذر إنشاء/تحديد ملف عامل الإنتاج');
        return;
      }

      const workerAssignments = await productionLineWorkerAssignmentService.getByWorker(workerId);
      const activeAssignment = workerAssignments.find((row) => isPermanentAssignmentActiveOnDate(row, linkStartDate));
      if (activeAssignment) {
        const lineName = getLineName(activeAssignment.lineId);
        showFeedback(
          'warning',
          activeAssignment.lineId === selectedLineId
            ? `${employee.name} مربوط بالفعل بهذا الخط`
            : `${employee.name} مربوط حالياً على "${lineName}" — أنهِ الربط الحالي أولاً`,
        );
        return;
      }

      await productionLineWorkerAssignmentService.create({
        workerId,
        lineId: selectedLineId,
        startDate: linkStartDate,
        laborRole: resolveLineWorkerLaborRole(undefined),
        isActive: true,
      }, { path: PERMANENT_WORKER_ASSIGNMENT_PATHS.lineWorkersPage });

      const worker = await productionWorkerService.getById(workerId);
      if (worker) {
        const lineIds = Array.from(new Set([...(worker.lineIds || []), selectedLineId]));
        await productionWorkerService.update(workerId, {
          lineIds,
          defaultLineId: worker.defaultLineId || selectedLineId,
        });
      }

      setScanInput('');
      setShowSuggestions(false);
      await reloadAssignments();
      showFeedback('success', `تم ربط ${employee.name} بالخط ربطاً دائماً`);
    } catch {
      showFeedback('error', 'حدث خطأ أثناء حفظ الربط الدائم');
    } finally {
      setSavingPermanentLink(false);
      inputRef.current?.focus();
    }
  }, [
    selectedLineId,
    isSupervisorReporter,
    visibleLineIds,
    scanInput,
    _rawEmployees,
    getLineName,
    loadAssignments,
    permanentAssignmentPathEnabled,
  ]);

  const handleEndPermanentAssignment = async (assignment: DisplayLineWorkerAssignment) => {
    if (!permanentAssignmentPathEnabled || !dailyAssignmentPathEnabled) {
      showFeedback('error', 'أحد مسارات تعيين العامل المطلوبة متوقف من إعدادات النظام');
      return;
    }
    if (!assignment.permanentAssignmentId) {
      showFeedback('warning', 'هذا سجل يومي قديم فقط. لا يوجد ربط دائم لإلغائه من هنا.');
      return;
    }

    const confirmed = window.confirm(
      `إلغاء الربط الدائم لـ ${getAssignmentEmployeeName(assignment)} من خط ${getLineName(assignment.lineId)} من اليوم؟\nسيتم حذف سجل اليوم فقط إن وجد، مع الحفاظ على كل السجلات القديمة.`,
    );
    if (!confirmed) return;

    setEndingPermanentAssignmentId(assignment.permanentAssignmentId);
    try {
      const cancellationDate = getTodayDateString();
      await productionLineWorkerAssignmentService.update(assignment.permanentAssignmentId, {
        isActive: false,
        endDate: getPreviousDateString(cancellationDate),
      }, { path: PERMANENT_WORKER_ASSIGNMENT_PATHS.lineWorkersPage });
      await deleteCancellationDateDailyRows([assignment]);
      await syncWorkerLineSnapshot(assignment.permanentWorkerId);
      await reloadAssignments();
      showFeedback('success', 'تم إلغاء الربط من اليوم مع الحفاظ على السجلات القديمة');
    } catch {
      showFeedback('error', 'حدث خطأ أثناء إلغاء الربط الدائم');
    } finally {
      setEndingPermanentAssignmentId(null);
    }
  };

  const cancellablePermanentAssignments = useMemo(() => {
    const targetLineIds = selectedLineId ? new Set([selectedLineId]) : visibleLineIds;
    const uniqueByPermanentId = new Map<string, DisplayLineWorkerAssignment>();

    for (const assignment of allDayAssignments) {
      if (!assignment.permanentAssignmentId || !targetLineIds.has(String(assignment.lineId || '').trim())) continue;
      uniqueByPermanentId.set(assignment.permanentAssignmentId, assignment);
    }

    return Array.from(uniqueByPermanentId.values());
  }, [allDayAssignments, selectedLineId, visibleLineIds]);

  const handleClearPermanentAssignments = async () => {
    if (!permanentAssignmentPathEnabled || !dailyAssignmentPathEnabled) {
      showFeedback('error', 'أحد مسارات تعيين العامل المطلوبة متوقف من إعدادات النظام');
      return;
    }
    if (cancellablePermanentAssignments.length === 0) {
      showFeedback('warning', selectedLineId ? 'لا يوجد عمال مربوطون دائماً على هذا الخط' : 'لا يوجد عمال مربوطون دائماً على الخطوط المعروضة');
      return;
    }

    const scopeLabel = selectedLineId ? `خط ${getLineName(selectedLineId)}` : 'كل الخطوط المعروضة';
    const confirmed = window.confirm(
      `سيتم إلغاء الربط الدائم لعدد ${cancellablePermanentAssignments.length} عامل من ${scopeLabel} من اليوم.\nسيتم حذف سجلات اليوم فقط إن وجدت، مع الحفاظ على كل السجلات القديمة. هل تريد المتابعة؟`,
    );
    if (!confirmed) return;

    setClearingPermanentAssignments(true);
    try {
      const cancellationDate = getTodayDateString();
      const endDate = getPreviousDateString(cancellationDate);
      await Promise.all(
        cancellablePermanentAssignments.map((assignment) => (
          productionLineWorkerAssignmentService.update(assignment.permanentAssignmentId!, {
            isActive: false,
            endDate,
          }, { path: PERMANENT_WORKER_ASSIGNMENT_PATHS.lineWorkersPage })
        )),
      );
      await deleteCancellationDateDailyRows(cancellablePermanentAssignments);
      const workerIds = Array.from(new Set(
        cancellablePermanentAssignments
          .map((assignment) => assignment.permanentWorkerId)
          .filter((workerId): workerId is string => Boolean(workerId)),
      ));
      await Promise.all(workerIds.map((workerId) => syncWorkerLineSnapshot(workerId)));
      await reloadAssignments();
      showFeedback('success', selectedLineId ? 'تم إلغاء ربط عمال الخط من اليوم' : 'تم إلغاء ربط عمال كل الخطوط المعروضة من اليوم');
    } catch {
      showFeedback('error', 'حدث خطأ أثناء إلغاء ربط العمال');
    } finally {
      setClearingPermanentAssignments(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setShowSuggestions(false);
      void handlePermanentAdd();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleSelectWorker = (emp: typeof _rawEmployees[number]) => {
    setShowSuggestions(false);
    setScanInput('');
    void handlePermanentAdd(emp);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleExpand = (lineId: string) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const getEmployeeInfo = (employeeId: string) => {
    return _rawEmployees.find((e) => e.id === employeeId);
  };

  const getAssignmentEmployeeName = (assignment: LWA): string => {
    const fromAssignment = String(assignment.employeeName || '').trim();
    if (fromAssignment) return fromAssignment;
    const employee = getEmployeeInfo(assignment.employeeId);
    return String(employee?.name || '').trim() || assignment.employeeId || '—';
  };

  const getAssignmentEmployeeCode = (assignment: LWA): string => {
    const fromAssignment = String(assignment.employeeCode || '').trim();
    if (fromAssignment) return fromAssignment;
    const employee = getEmployeeInfo(assignment.employeeId);
    return String(employee?.code || '').trim() || '—';
  };

  const currentLinePermanentAssignments = useMemo(
    () => assignments.filter((assignment) => Boolean(assignment.permanentAssignmentId)),
    [assignments],
  );

  const currentLineLegacyAssignments = useMemo(
    () => assignments.filter((assignment) => !assignment.permanentAssignmentId),
    [assignments],
  );

  const sortedAssignments = useMemo(
    () => sortAssignmentsByEmployeeCode<DisplayLineWorkerAssignment>(currentLinePermanentAssignments, getAssignmentEmployeeCode),
    [currentLinePermanentAssignments, _rawEmployees],
  );

  const permanentAssignmentsCount = useMemo(
    () => allDayAssignments.filter((assignment) => Boolean(assignment.permanentAssignmentId)).length,
    [allDayAssignments],
  );
  const legacyAssignmentsCount = Math.max(allDayAssignments.length - permanentAssignmentsCount, 0);

  const lineGroups = useMemo(() => {
    const map = new Map<string, DisplayLineWorkerAssignment[]>();
    for (const a of allDayAssignments) {
      if (!map.has(a.lineId)) map.set(a.lineId, []);
      map.get(a.lineId)!.push(a);
    }
    return Array.from(map.entries()).map(([lineId, workers]) => ({
      lineId,
      lineName: getLineName(lineId),
      workers: sortAssignmentsByEmployeeCode<DisplayLineWorkerAssignment>(workers, getAssignmentEmployeeCode),
    }));
  }, [allDayAssignments, _rawLines, _rawEmployees]);

  const workerPositionIds = useMemo(() => {
    return new Set(
      jobPositions
        .filter((jp) => WORKER_POSITION_KEYWORDS.some((kw) => jp.title.includes(kw)))
        .map((jp) => jp.id!)
    );
  }, [jobPositions]);

  const productionEmployees = useMemo(() => {
    return _rawEmployees.filter(
      (e) => e.isActive !== false && (workerPositionIds.size === 0 || workerPositionIds.has(e.jobPositionId))
    );
  }, [_rawEmployees, workerPositionIds]);

  const linkedEmployeeIds = useMemo(
    () => new Set(
      allDayAssignments
        .filter((assignment) => Boolean(assignment.permanentAssignmentId))
        .map((a) => a.employeeId),
    ),
    [allDayAssignments]
  );

  const searchResults = useMemo(() => {
    const q = scanInput.trim().toLowerCase();
    if (!q) return [];
    return productionEmployees
      .filter((e) => {
        const nameMatch = e.name.toLowerCase().includes(q);
        const codeMatch = (e.code ?? '').toLowerCase().includes(q);
        return nameMatch || codeMatch;
      })
      .slice(0, 8);
  }, [scanInput, productionEmployees]);

  const formatTime = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ModuleOpsPageShell
      eyebrow="الإنتاج"
      rangeLabel="إدارة الربط الدائم بين عمال الإنتاج وخطوط الإنتاج. التاريخ هنا لعرض حضور/حالة اليوم فقط ولا يُستخدم كربط يومي."
      actions={(
        <Button
          onClick={() => void handleClearPermanentAssignments()}
          disabled={loading || clearingPermanentAssignments || cancellablePermanentAssignments.length === 0}
        >
          {clearingPermanentAssignments
            ? 'جاري الإلغاء...'
            : (selectedLineId ? 'إلغاء عمال الخط' : 'إلغاء عمال كل الخطوط')}
        </Button>
      )}
    >
      <OpsDashPanel title="الفلاتر والتحكم" accent="production">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
          <div className="w-full sm:w-44">
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">التاريخ</label>
            <input
              type="date"
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-3 py-2 text-sm font-medium"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">خط الإنتاج</label>
            <Select value={selectedLineId || 'all'} onValueChange={(value) => setSelectedLineId(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-3 py-2 text-sm">
                <SelectValue placeholder="— كل الخطوط —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">— كل الخطوط —</SelectItem>
                {visibleLines.map((l) => (
                  <SelectItem key={l.id} value={l.id!}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs font-bold text-[rgb(var(--color-warning))] dark:text-[rgb(var(--color-warning))]">
          تم إيقاف النسخ اليومي. أي إضافة من هذه الصفحة تنشئ ربطاً دائماً في سجل عمال الإنتاج، وليس سجل حضور يومي.
        </p>
      </OpsDashPanel>

      {selectedLineId && (
        <OpsDashPanel title="إضافة عامل للربط الدائم" accent="production" className="relative z-20 !overflow-visible">
          <div className="space-y-3">
            <p className="text-xs text-[var(--color-text-muted)] font-medium">
              يتم إنشاء الربط الدائم من اليوم. لا يتم إنشاء سجل حضور يومي إلا من مسارات الحضور/التقرير.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  className="w-full h-[46px] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 text-sm font-medium pr-10 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  placeholder="ابحث باسم / كود العامل..."
                  value={scanInput}
                  onChange={(e) => { setScanInput(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                />
                <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-lg">search</span>

                {showSuggestions && scanInput.trim() && searchResults.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute z-50 top-full mt-1 w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] max-h-64 overflow-y-auto"
                  >
                    {searchResults.map((emp) => {
                      const alreadyLinked = linkedEmployeeIds.has(emp.id!);
                      return (
                        <button
                          key={emp.id}
                          onClick={() => !alreadyLinked && handleSelectWorker(emp)}
                          disabled={alreadyLinked || savingPermanentLink}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-right transition-colors ${
                            alreadyLinked
                              ? 'opacity-50 cursor-not-allowed bg-[var(--color-bg)]/50'
                              : 'hover:bg-primary/5 cursor-pointer'
                          }`}
                        >
                          <div className="w-8 h-8 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
                            <span className="material-icons-round text-primary text-sm">person</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[var(--color-text)] truncate">{emp.name}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{emp.code} — {getPositionTitle(emp.jobPositionId)}</p>
                          </div>
                          {alreadyLinked && (
                            <span className="text-xs font-bold text-[rgb(var(--color-warning))] shrink-0">
                              مربوط حالياً
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {showSuggestions && scanInput.trim().length >= 2 && searchResults.length === 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute z-50 top-full mt-1 w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 text-center"
                  >
                    <span className="material-icons-round text-[var(--color-text-muted)] text-2xl block mb-1">search_off</span>
                    <p className="text-xs text-[var(--color-text-muted)] font-medium">لا يوجد عامل إنتاج بهذا الاسم أو الكود</p>
                  </div>
                )}
              </div>
              <Button
                onClick={() => void handlePermanentAdd()}
                disabled={!scanInput.trim() || savingPermanentLink}
                className="h-[46px] shrink-0"
              >
                {savingPermanentLink ? 'جاري...' : 'ربط دائم'}
              </Button>
            </div>
          </div>
        </OpsDashPanel>
      )}

      {selectedLineId && (
        <OpsDashPanel
          title={`عمالة ${getLineName(selectedLineId)} المرتبطة دائماً`}
          accent="production"
          action={<Badge variant="info">{currentLinePermanentAssignments.length} عامل</Badge>}
        >
          {currentLineLegacyAssignments.length > 0 && (
            <div className="mb-4 rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] px-3 py-2 text-xs font-bold text-[rgb(var(--color-warning))]">
              يوجد {currentLineLegacyAssignments.length} سجل يومي قديم لهذا الخط. هذه السجلات تظهر في الملخص فقط ولا تعتبر ربطاً دائماً للإلغاء.
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-[var(--color-surface-hover)] rounded-[var(--border-radius-base)] animate-pulse" />
              ))}
            </div>
          ) : currentLinePermanentAssignments.length === 0 ? (
            <div className="text-center py-10">
              <span className="material-icons-round text-4xl text-[var(--color-text-muted)] dark:text-[var(--color-text)] mb-2 block">groups</span>
              <p className="page-subtitle">لا يوجد عمال مربوطون دائماً على هذا الخط</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">استخدم البحث بالأعلى لإضافة ربط دائم جديد.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="erp-table w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">الكود</th>
                    <th className="erp-th">الاسم</th>
                    <th className="erp-th">النوع</th>
                    <th className="erp-th hidden sm:table-cell">القسم</th>
                    <th className="erp-th hidden sm:table-cell">المنصب</th>
                    <th className="erp-th">حالة اليوم</th>
                    <th className="erp-th">وقت تحديث اليوم</th>
                    <th className="erp-th w-28">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAssignments.map((a) => {
                    const emp = getEmployeeInfo(a.employeeId);
                    const canUpdateDailyStatus = Boolean(a.id);
                    const ending = endingPermanentAssignmentId === a.permanentAssignmentId;
                    return (
                      <tr
                        key={a.id || `${a.lineId}_${a.employeeId}`}
                        className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--border-radius-base)] bg-primary/5 text-primary text-xs font-mono font-bold">
                            {getAssignmentEmployeeCode(a)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[var(--color-text)]">{getAssignmentEmployeeName(a)}</td>
                        <td className="py-2.5 px-3">{renderLaborRoleSelect(a, true)}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-muted)] hidden sm:table-cell">{emp ? getDeptName(emp.departmentId) : '—'}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-muted)] hidden sm:table-cell">{emp ? getPositionTitle(emp.jobPositionId) : '—'}</td>
                        <td className="py-2.5 px-3">
                          <Badge variant={a.isPresent === false ? 'danger' : 'success'}>
                            {a.isPresent === false ? 'غائب' : 'حاضر'}
                          </Badge>
                          {!canUpdateDailyStatus && (
                            <p className="mt-1 text-[10px] font-bold text-[rgb(var(--color-warning))]">
                              لا يوجد سجل حضور يومي بعد؛ يتم عرضه من الربط الدائم
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[var(--color-text-muted)] text-xs">{formatTime(a.assignedAt)}</td>
                        <td className="py-2.5 px-1">
                          <Button
                            onClick={() => void handleEndPermanentAssignment(a)}
                            disabled={ending}
                            className="text-xs"
                          >
                            {ending ? 'جاري الإلغاء...' : 'إلغاء الربط'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </OpsDashPanel>
      )}

      <OpsDashPanel
        title="ملخص الربط وحالة اليوم"
        accent="production"
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">{permanentAssignmentsCount} ربط دائم</Badge>
            {legacyAssignmentsCount > 0 && <Badge variant="warning">{legacyAssignmentsCount} سجل يومي قديم</Badge>}
          </div>
        )}
      >

        {lineGroups.length === 0 ? (
          <div className="text-center py-8">
            <span className="material-icons-round text-4xl text-[var(--color-text-muted)] dark:text-[var(--color-text)] mb-2 block">assignment</span>
            <p className="page-subtitle">لا يوجد ربط دائم أو بيانات يومية قديمة لهذا العرض</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-primary/5 rounded-[var(--border-radius-lg)] p-3 text-center">
                <p className="text-2xl font-bold text-primary">{permanentAssignmentsCount}</p>
                <p className="text-xs text-[var(--color-text-muted)] font-bold">ربط دائم</p>
              </div>
              <div className="bg-[rgb(var(--color-warning)/0.1)] rounded-[var(--border-radius-lg)] p-3 text-center">
                <p className="text-2xl font-bold text-[rgb(var(--color-warning))]">{legacyAssignmentsCount}</p>
                <p className="text-xs text-[var(--color-text-muted)] font-bold">سجلات يومية قديمة</p>
              </div>
              <div className="bg-[rgb(var(--color-success)/0.1)] rounded-[var(--border-radius-lg)] p-3 text-center">
                <p className="text-2xl font-bold text-[rgb(var(--color-success))]">{lineGroups.length}</p>
                <p className="text-xs text-[var(--color-text-muted)] font-bold">تاريخ اليوم</p>
              </div>
              {lineGroups.slice(0, 1).map((g) => (
                <div key={g.lineId} className="bg-[var(--color-bg)]/50 rounded-[var(--border-radius-lg)] p-3 text-center">
                  <p className="text-2xl font-bold text-[var(--color-text)]">{g.workers.length}</p>
                  <p className="text-xs text-[var(--color-text-muted)] font-bold truncate">{g.lineName}</p>
                </div>
              ))}
            </div>

            {/* Expandable per-line */}
            <div className="space-y-2">
              {lineGroups.map((g) => (
                <div key={g.lineId} className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] overflow-hidden">
                  <button
                    onClick={() => toggleExpand(g.lineId)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-bg)] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-primary text-lg">
                        {expandedLines.has(g.lineId) ? 'expand_more' : 'chevron_left'}
                      </span>
                      <span className="font-bold text-sm">{g.lineName}</span>
                      <Badge variant="neutral">{g.workers.length} عامل</Badge>
                    </div>
                  </button>
                  {expandedLines.has(g.lineId) && (
                    <div className="border-t border-[var(--color-border)] px-4 py-2">
                      <div className="divide-y divide-[var(--color-border)]">
                        {g.workers.map((w) => {
                          const emp = getEmployeeInfo(w.employeeId);
                          return (
                            <div key={w.permanentAssignmentId || w.id || `${w.lineId}_${w.employeeId}`} className="flex items-center justify-between py-2 text-sm">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--border-radius-base)] bg-primary/5 text-primary text-xs font-mono font-bold">
                                  {getAssignmentEmployeeCode(w)}
                                </span>
                                <span className="font-medium">{getAssignmentEmployeeName(w)}</span>
                                {renderLaborRoleSelect(w, true)}
                                {emp && (
                                  <span className="text-xs text-[var(--color-text-muted)] hidden sm:inline">
                                    {getDeptName(emp.departmentId)}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-[var(--color-text-muted)]">{formatTime(w.assignedAt)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
