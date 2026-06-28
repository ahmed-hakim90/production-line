import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Badge, Button } from '../components/UI';
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

export const LineWorkerAssignment: React.FC = () => {
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const storeCurrentEmployee = useAppStore((s) => s.currentEmployee);
  const userRoleName = useAppStore((s) => s.userRoleName);

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
      return () => {
        mounted = false;
      };
    }
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
      })
      .catch(() => {
        if (!mounted) return;
        setAssignedLineIds(new Set());
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

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const [dailyRows, productionWorkers, permanentByLine] = await Promise.all([
        lineAssignmentService.getByDate(selectedDate),
        productionWorkerService.getAll(),
        Promise.all(
          visibleLineIdList.map(async (lineId) => ({
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
          visibleLineIdList
            .filter((lineId) => !linesWithPermanent.has(lineId))
            .map((lineId) => lineAssignmentService.getByLineAndDate(lineId, selectedDate)),
        )
      ).flat().map((row) => ({ ...row, source: 'legacy' as const }));

      const all = [...permanentDisplayRows, ...legacyRows];
      const scopedAssignments = isSupervisorReporter
        ? all.filter((a) => visibleLineIds.has(String(a.lineId || '').trim()))
        : all;
      setAllDayAssignments(scopedAssignments);
      if (selectedLineId) {
        setAssignments(scopedAssignments.filter((a) => a.lineId === selectedLineId));
      } else {
        setAssignments([]);
      }
    } catch (e) {
      console.error('Load assignments error:', e);
    } finally {
      setLoading(false);
    }
  }, [
    selectedDate,
    selectedLineId,
    isSupervisorReporter,
    visibleLineIds,
    visibleLineIdList,
    buildPermanentDisplayRows,
  ]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

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
    const actionId = assignment.id || assignment.permanentAssignmentId;
    if (!actionId) return;

    setUpdatingLaborRoleId(actionId);
    try {
      if (assignment.permanentAssignmentId) {
        await productionLineWorkerAssignmentService.update(assignment.permanentAssignmentId, { laborRole });
      }
      if (assignment.id) {
        await lineAssignmentService.updateLaborRole(assignment.id, laborRole);
      }
      await loadAssignments();
      showFeedback('success', 'تم تحديث نوع العامل');
    } catch {
      showFeedback('error', 'حدث خطأ أثناء تحديث نوع العامل');
    } finally {
      setUpdatingLaborRoleId(null);
    }
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
      });

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
      await loadAssignments();
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
  ]);

  const handleEndPermanentAssignment = async (assignment: DisplayLineWorkerAssignment) => {
    if (!assignment.permanentAssignmentId) {
      showFeedback('warning', 'هذا سجل يومي قديم فقط. لا يوجد ربط دائم لإلغائه من هنا.');
      return;
    }

    const confirmed = window.confirm(
      `إلغاء الربط الدائم لـ ${getAssignmentEmployeeName(assignment)} من خط ${getLineName(assignment.lineId)}؟`,
    );
    if (!confirmed) return;

    setEndingPermanentAssignmentId(assignment.permanentAssignmentId);
    try {
      await productionLineWorkerAssignmentService.update(assignment.permanentAssignmentId, {
        isActive: false,
        endDate: getTodayDateString(),
      });
      await loadAssignments();
      showFeedback('success', 'تم إلغاء الربط الدائم للعامل');
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
    if (cancellablePermanentAssignments.length === 0) {
      showFeedback('warning', selectedLineId ? 'لا يوجد عمال مربوطون دائماً على هذا الخط' : 'لا يوجد عمال مربوطون دائماً على الخطوط المعروضة');
      return;
    }

    const scopeLabel = selectedLineId ? `خط ${getLineName(selectedLineId)}` : 'كل الخطوط المعروضة';
    const confirmed = window.confirm(
      `سيتم إلغاء الربط الدائم لعدد ${cancellablePermanentAssignments.length} عامل من ${scopeLabel}. هل تريد المتابعة؟`,
    );
    if (!confirmed) return;

    setClearingPermanentAssignments(true);
    try {
      const endDate = getTodayDateString();
      await Promise.all(
        cancellablePermanentAssignments.map((assignment) => (
          productionLineWorkerAssignmentService.update(assignment.permanentAssignmentId!, {
            isActive: false,
            endDate,
          })
        )),
      );
      await loadAssignments();
      showFeedback('success', selectedLineId ? 'تم إلغاء ربط عمال الخط' : 'تم إلغاء ربط عمال كل الخطوط المعروضة');
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

  const sortedAssignments = useMemo(
    () => sortAssignmentsByEmployeeCode<DisplayLineWorkerAssignment>(assignments, getAssignmentEmployeeCode),
    [assignments, _rawEmployees],
  );

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
    () => new Set(allDayAssignments.map((a) => a.employeeId)),
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
    <div className="erp-ds-clean space-y-6">
      {/* Header */}
      <div className="erp-page-head">
        <div>
          <h2 className="page-title">ربط العمالة الدائم بالخط</h2>
          <p className="page-subtitle">إدارة الربط الدائم بين عمال الإنتاج وخطوط الإنتاج. التاريخ هنا لعرض حضور/حالة اليوم فقط ولا يُستخدم كربط يومي.</p>
        </div>
      </div>

      {/* Controls */}
      <Card>
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
          <Button
            variant="danger"
            onClick={() => void handleClearPermanentAssignments()}
            disabled={loading || clearingPermanentAssignments || cancellablePermanentAssignments.length === 0}
            className="h-[42px] shrink-0"
          >
            {clearingPermanentAssignments ? (
              <span className="material-icons-round animate-spin text-sm">refresh</span>
            ) : (
              <span className="material-icons-round text-sm">link_off</span>
            )}
            {selectedLineId ? 'إلغاء عمال الخط' : 'إلغاء عمال كل الخطوط'}
          </Button>
        </div>
        <p className="mt-3 text-xs font-bold text-amber-700 dark:text-amber-300">
          تم إيقاف النسخ اليومي. أي إضافة من هذه الصفحة تنشئ ربطاً دائماً في سجل عمال الإنتاج، وليس سجل حضور يومي.
        </p>
      </Card>

      {selectedLineId && (
        <Card className="relative z-20 !overflow-visible">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-icons-round text-primary text-xl">person_add</span>
              <h3 className="font-bold text-base">إضافة عامل للربط الدائم</h3>
            </div>
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
                              ? 'opacity-50 cursor-not-allowed bg-[#f8f9fa]/50'
                              : 'hover:bg-primary/5 cursor-pointer'
                          }`}
                        >
                          <div className="w-8 h-8 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
                            <span className="material-icons-round text-primary text-sm">person</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[var(--color-text)] truncate">{emp.name}</p>
                            <p className="text-xs text-slate-400">{emp.code} — {getPositionTitle(emp.jobPositionId)}</p>
                          </div>
                          {alreadyLinked && (
                            <span className="text-xs font-bold text-amber-500 shrink-0">
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
                {savingPermanentLink ? (
                  <span className="material-icons-round animate-spin text-sm">refresh</span>
                ) : (
                  <span className="material-icons-round text-sm">link</span>
                )}
                ربط دائم
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Current Line Workers */}
      {selectedLineId && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-primary">groups</span>
              <h3 className="font-bold text-base">
                عمالة {getLineName(selectedLineId)} المرتبطة دائماً
              </h3>
              <Badge variant="info">{assignments.length} عامل</Badge>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-[#f0f2f5] rounded-[var(--border-radius-base)] animate-pulse" />
              ))}
            </div>
          ) : assignments.length === 0 ? (
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
                        className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors"
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
                            <p className="mt-1 text-[10px] font-bold text-amber-600">
                              لا يوجد سجل حضور يومي بعد؛ يتم عرضه من الربط الدائم
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[var(--color-text-muted)] text-xs">{formatTime(a.assignedAt)}</td>
                        <td className="py-2.5 px-1">
                          <Button
                            variant="outline"
                            onClick={() => void handleEndPermanentAssignment(a)}
                            disabled={!a.permanentAssignmentId || ending}
                            className="text-xs"
                          >
                            {ending && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                            إلغاء الربط
                          </Button>
                          {a.source === 'legacy' && (
                            <p className="mt-1 text-[10px] font-bold text-amber-600">
                              سجل يومي قديم للقراءة فقط
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Daily Report - All Lines */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <span className="material-icons-round text-primary">summarize</span>
          <h3 className="font-bold text-base">ملخص الربط وحالة اليوم</h3>
          <Badge variant="info">{allDayAssignments.length} عامل إجمالي</Badge>
        </div>

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
                <p className="text-2xl font-bold text-primary">{allDayAssignments.length}</p>
                <p className="text-xs text-[var(--color-text-muted)] font-bold">إجمالي العمالة</p>
              </div>
              <div className="bg-emerald-50 rounded-[var(--border-radius-lg)] p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">{lineGroups.length}</p>
                <p className="text-xs text-[var(--color-text-muted)] font-bold">تاريخ اليوم</p>
              </div>
              {lineGroups.slice(0, 2).map((g) => (
                <div key={g.lineId} className="bg-[#f8f9fa]/50 rounded-[var(--border-radius-lg)] p-3 text-center">
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
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#f8f9fa] transition-colors"
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
                      <div className="divide-y divide-slate-50/50">
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
                              <span className="text-xs text-slate-400">{formatTime(w.assignedAt)}</span>
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
      </Card>
    </div>
  );
};
