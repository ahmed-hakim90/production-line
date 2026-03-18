import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Badge, Button } from '../components/UI';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import { supervisorLineAssignmentService } from '../services/supervisorLineAssignmentService';
import { getDocs } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef } from '../../hr/collections';
import { getTodayDateString } from '../../../utils/calculations';
import type { LineWorkerAssignment as LWA } from '../../../types';
import type { FirestoreDepartment, FirestoreJobPosition } from '../../hr/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const WORKER_POSITION_KEYWORDS = ['عامل انتاج', 'عامل إنتاج', 'عامل الانتاج', 'عامل الإنتاج'];

export const LineWorkerAssignment: React.FC = () => {
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);

  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [selectedLineId, setSelectedLineId] = useState('');
  const [assignments, setAssignments] = useState<LWA[]>([]);
  const [allDayAssignments, setAllDayAssignments] = useState<LWA[]>([]);
  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [jobPositions, setJobPositions] = useState<FirestoreJobPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [copying, setCopying] = useState(false);
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [assignedLineIds, setAssignedLineIds] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>();
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
    () => _rawEmployees.find((e) => e.userId === uid) ?? null,
    [_rawEmployees, uid],
  );
  const isSupervisorReporter = currentEmployee?.level === 2;

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

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const all = await lineAssignmentService.getByDate(selectedDate);
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
  }, [selectedDate, selectedLineId, isSupervisorReporter, visibleLineIds]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    if (!selectedLineId) return;
    if (visibleLineIds.has(selectedLineId)) return;
    setSelectedLineId('');
  }, [selectedLineId, visibleLineIds]);

  useEffect(() => {
    if (selectedLineId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedLineId, assignments]);

  const showFeedback = (type: 'success' | 'error' | 'warning', message: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ type, message });
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3500);
  };

  const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name ?? '';
  const getPositionTitle = (id: string) => jobPositions.find((j) => j.id === id)?.title ?? '';
  const getLineName = (id: string) => _rawLines.find((l) => l.id === id)?.name ?? id;

  const handleScan = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || !selectedLineId) return;

    const employee = _rawEmployees.find((e) => e.code === trimmed);
    if (!employee) {
      showFeedback('error', `كود "${trimmed}" غير معروف`);
      setScanInput('');
      inputRef.current?.focus();
      return;
    }

    if (employee.isActive === false) {
      showFeedback('error', `${employee.name} — موظف غير نشط`);
      setScanInput('');
      inputRef.current?.focus();
      return;
    }

    const existingOnLine = allDayAssignments.find(
      (a) => a.employeeId === employee.id && a.lineId === selectedLineId
    );
    if (existingOnLine) {
      showFeedback('warning', `${employee.name} مسجل بالفعل على هذا الخط`);
      setScanInput('');
      inputRef.current?.focus();
      return;
    }

    const existingOnOther = allDayAssignments.find(
      (a) => a.employeeId === employee.id && a.lineId !== selectedLineId
    );
    if (existingOnOther) {
      const otherLineName = getLineName(existingOnOther.lineId);
      showFeedback('warning', `${employee.name} مسجل على "${otherLineName}" — أزله من هناك أولاً أو انقله`);
      setScanInput('');
      inputRef.current?.focus();
      return;
    }

    try {
      await lineAssignmentService.create({
        lineId: selectedLineId,
        employeeId: employee.id!,
        employeeCode: employee.code || trimmed,
        employeeName: employee.name,
        date: selectedDate,
        assignedBy: uid || '',
      });
      showFeedback('success', `تمت إضافة ${employee.name}`);
      setScanInput('');
      await loadAssignments();
    } catch {
      showFeedback('error', 'حدث خطأ أثناء الحفظ');
    }
    inputRef.current?.focus();
  }, [selectedLineId, selectedDate, _rawEmployees, allDayAssignments, uid, loadAssignments]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setShowSuggestions(false);
      handleScan(scanInput);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleSelectWorker = (emp: typeof _rawEmployees[0]) => {
    setShowSuggestions(false);
    setScanInput('');
    handleScan(emp.code ?? '');
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

  const handleRemove = async (id: string) => {
    try {
      await lineAssignmentService.delete(id);
      await loadAssignments();
    } catch {
      showFeedback('error', 'حدث خطأ أثناء الحذف');
    }
  };

  const handleCopyFromLastAvailableDay = async () => {
    const existingToday = selectedLineId
      ? assignments
      : allDayAssignments;

    if (existingToday.length > 0) {
      setShowCopyConfirm(true);
      return;
    }
    await doCopy();
  };

  const doCopy = async () => {
    setCopying(true);
    setShowCopyConfirm(false);
    try {
      const sourceDate = await lineAssignmentService.getLatestSourceDateBefore(
        selectedDate,
        selectedLineId || undefined,
      );
      if (!sourceDate) {
        showFeedback('warning', 'لا يوجد يوم سابق مسجل فيه عمالة للنسخ');
        return;
      }
      const activeIds = new Set(
        _rawEmployees.filter((e) => e.isActive !== false).map((e) => e.id!)
      );
      const employeeDirectory = new Map(
        _rawEmployees
          .filter((e) => Boolean(e.id))
          .map((e) => [String(e.id), { name: e.name, code: e.code }])
      );
      const count = await lineAssignmentService.copyFromDate(
        sourceDate,
        selectedDate,
        selectedLineId || undefined,
        uid || '',
        activeIds,
        employeeDirectory,
      );
      if (count > 0) {
        showFeedback('success', `تم نسخ ${count} عامل من ${sourceDate}`);
      } else {
        showFeedback('warning', `لا يوجد عمالة جديدة لنسخها من ${sourceDate}`);
      }
      await loadAssignments();
    } catch {
      showFeedback('error', 'حدث خطأ أثناء النسخ');
    } finally {
      setCopying(false);
    }
  };

  const lineGroups = useMemo(() => {
    const map = new Map<string, LWA[]>();
    for (const a of allDayAssignments) {
      if (!map.has(a.lineId)) map.set(a.lineId, []);
      map.get(a.lineId)!.push(a);
    }
    return Array.from(map.entries()).map(([lineId, workers]) => ({
      lineId,
      lineName: getLineName(lineId),
      workers,
    }));
  }, [allDayAssignments, _rawLines]);

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

  const workerPositionIds = useMemo(() => {
    return new Set(
      jobPositions
        .filter((jp) => WORKER_POSITION_KEYWORDS.some((kw) => jp.title.includes(kw)))
        .map((jp) => jp.id!)
    );
  }, [jobPositions]);

  const productionWorkers = useMemo(() => {
    return _rawEmployees.filter(
      (e) => e.isActive !== false && workerPositionIds.has(e.jobPositionId)
    );
  }, [_rawEmployees, workerPositionIds]);

  const assignedEmployeeIds = useMemo(
    () => new Set(allDayAssignments.map((a) => a.employeeId)),
    [allDayAssignments]
  );

  const searchResults = useMemo(() => {
    const q = scanInput.trim().toLowerCase();
    if (!q) return [];
    return productionWorkers
      .filter((e) => {
        const nameMatch = e.name.toLowerCase().includes(q);
        const codeMatch = (e.code ?? '').toLowerCase().includes(q);
        return nameMatch || codeMatch;
      })
      .slice(0, 8);
  }, [scanInput, productionWorkers]);

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
          <h2 className="page-title">ربط العمالة بخطوط الإنتاج</h2>
          <p className="page-subtitle">تسجيل العمالة اليومية على خطوط الإنتاج بالباركود أو يدوياً</p>
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
            variant="outline"
            onClick={handleCopyFromLastAvailableDay}
            disabled={copying}
            className="shrink-0"
          >
            {copying ? (
              <span className="material-icons-round animate-spin text-sm">refresh</span>
            ) : (
              <span className="material-icons-round text-sm">content_copy</span>
            )}
            نسخ من آخر يوم
          </Button>
        </div>
      </Card>

      {/* Scanner Section */}
      {selectedLineId && (
        <Card className="relative z-20 !overflow-visible">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-icons-round text-primary text-xl">qr_code_scanner</span>
              <h3 className="font-bold text-base">اسم / إدخال كود الموظف</h3>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium pr-10 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
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
                      const alreadyAssigned = assignedEmployeeIds.has(emp.id!);
                      const onThisLine = assignments.some((a) => a.employeeId === emp.id);
                      return (
                        <button
                          key={emp.id}
                          onClick={() => !alreadyAssigned && handleSelectWorker(emp)}
                          disabled={alreadyAssigned}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-right transition-colors ${
                            alreadyAssigned
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
                          {alreadyAssigned && (
                            <span className="text-xs font-bold text-amber-500 shrink-0">
                              {onThisLine ? 'مسجل هنا' : 'مسجل على خط آخر'}
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
              <button
                onClick={() => handleScan(scanInput)}
                disabled={!scanInput.trim()}
                className="px-4 py-3 bg-primary text-white rounded-[var(--border-radius-lg)] hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <span className="material-icons-round text-xl">add_circle</span>
                <span className="text-sm font-bold hidden sm:inline">إضافة</span>
              </button>
            </div>

            {/* Feedback */}
            {feedback && (
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold animate-in fade-in duration-200 ${
                feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700' :
                feedback.type === 'error' ? 'bg-rose-50 text-rose-700' :
                'bg-amber-50 text-amber-700'
              }`}>
                <span className="material-icons-round text-lg">
                  {feedback.type === 'success' ? 'check_circle' : feedback.type === 'error' ? 'error' : 'warning'}
                </span>
                {feedback.message}
              </div>
            )}
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
                عمالة {getLineName(selectedLineId)}
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
              <span className="material-icons-round text-4xl text-[var(--color-text-muted)] dark:text-[var(--color-text)] mb-2 block">person_add</span>
              <p className="page-subtitle">لم يتم تسجيل عمالة على هذا الخط بعد</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">امسح باركود الموظف أو اكتب الكود يدوياً</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">الكود</th>
                    <th className="erp-th">الاسم</th>
                    <th className="erp-th hidden sm:table-cell">القسم</th>
                    <th className="erp-th hidden sm:table-cell">المنصب</th>
                    <th className="erp-th">وقت التسجيل</th>
                    <th className="erp-th w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => {
                    const emp = getEmployeeInfo(a.employeeId);
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--border-radius-base)] bg-primary/5 text-primary text-xs font-mono font-bold">
                            {getAssignmentEmployeeCode(a)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[var(--color-text)]">{getAssignmentEmployeeName(a)}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-muted)] hidden sm:table-cell">{emp ? getDeptName(emp.departmentId) : '—'}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-muted)] hidden sm:table-cell">{emp ? getPositionTitle(emp.jobPositionId) : '—'}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-muted)] text-xs">{formatTime(a.assignedAt)}</td>
                        <td className="py-2.5 px-1">
                          <button
                            onClick={() => handleRemove(a.id!)}
                            className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-[var(--border-radius-base)] transition-all"
                            title="إزالة"
                          >
                            <span className="material-icons-round text-base">close</span>
                          </button>
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
          <h3 className="font-bold text-base">تقرير اليوم</h3>
          <Badge variant="info">{allDayAssignments.length} عامل إجمالي</Badge>
        </div>

        {lineGroups.length === 0 ? (
          <div className="text-center py-8">
            <span className="material-icons-round text-4xl text-[var(--color-text-muted)] dark:text-[var(--color-text)] mb-2 block">assignment</span>
            <p className="page-subtitle">لا يوجد تسجيلات لهذا اليوم</p>
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
                <p className="text-xs text-[var(--color-text-muted)] font-bold">خطوط نشطة</p>
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
                            <div key={w.id} className="flex items-center justify-between py-2 text-sm">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--border-radius-base)] bg-primary/5 text-primary text-xs font-mono font-bold">
                                  {getAssignmentEmployeeCode(w)}
                                </span>
                                <span className="font-medium">{getAssignmentEmployeeName(w)}</span>
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

      {/* Copy Confirm Modal */}
      {showCopyConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCopyConfirm(false)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-amber-500 text-2xl">content_copy</span>
            </div>
            <h3 className="text-lg font-bold text-center mb-2">نسخ من آخر يوم</h3>
            <p className="text-sm text-[var(--color-text-muted)] text-center mb-6">
              يوجد عمالة مسجلة بالفعل لهذا اليوم. سيتم إضافة العمالة الناقصة فقط (بدون تكرار).
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setShowCopyConfirm(false)}>إلغاء</Button>
              <Button variant="primary" onClick={doCopy} disabled={copying}>
                {copying && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                إضافة الناقص
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
