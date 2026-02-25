import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Badge, Button } from '../components/UI';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import { getDocs } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef } from '../../hr/collections';
import { getTodayDateString } from '../../../utils/calculations';
import type { LineWorkerAssignment as LWA } from '../../../types';
import type { FirestoreDepartment, FirestoreJobPosition } from '../../hr/types';

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

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const all = await lineAssignmentService.getByDate(selectedDate);
      setAllDayAssignments(all);
      if (selectedLineId) {
        setAssignments(all.filter((a) => a.lineId === selectedLineId));
      } else {
        setAssignments([]);
      }
    } catch (e) {
      console.error('Load assignments error:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedLineId]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

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

  const getYesterday = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const handleCopyFromYesterday = async () => {
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
      const yesterday = getYesterday(selectedDate);
      const activeIds = new Set(
        _rawEmployees.filter((e) => e.isActive !== false).map((e) => e.id!)
      );
      const count = await lineAssignmentService.copyFromDate(
        yesterday,
        selectedDate,
        selectedLineId || undefined,
        uid || '',
        activeIds
      );
      if (count > 0) {
        showFeedback('success', `تم نسخ ${count} عامل من أمس`);
      } else {
        showFeedback('warning', 'لا يوجد عمالة جديدة لنسخها من أمس');
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">ربط العمالة بخطوط الإنتاج</h2>
          <p className="text-sm text-slate-500 font-medium">تسجيل العمالة اليومية على خطوط الإنتاج بالباركود أو يدوياً</p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
          <div className="w-full sm:w-44">
            <label className="block text-xs font-bold text-slate-500 mb-1">التاريخ</label>
            <input
              type="date"
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2 text-sm font-medium"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-slate-500 mb-1">خط الإنتاج</label>
            <select
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2 text-sm font-medium"
              value={selectedLineId}
              onChange={(e) => setSelectedLineId(e.target.value)}
            >
              <option value="">— كل الخطوط —</option>
              {_rawLines.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            onClick={handleCopyFromYesterday}
            disabled={copying}
            className="shrink-0"
          >
            {copying ? (
              <span className="material-icons-round animate-spin text-sm">refresh</span>
            ) : (
              <span className="material-icons-round text-sm">content_copy</span>
            )}
            نسخ من أمس
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
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm font-medium pr-10 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  placeholder="ابحث باسم / كود العامل..."
                  value={scanInput}
                  onChange={(e) => { setScanInput(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                />
                <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>

                {showSuggestions && scanInput.trim() && searchResults.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-64 overflow-y-auto"
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
                              ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50'
                              : 'hover:bg-primary/5 cursor-pointer'
                          }`}
                        >
                          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                            <span className="material-icons-round text-primary text-sm">person</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 dark:text-white truncate">{emp.name}</p>
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
                    className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4 text-center"
                  >
                    <span className="material-icons-round text-slate-300 text-2xl block mb-1">search_off</span>
                    <p className="text-xs text-slate-400 font-medium">لا يوجد عامل إنتاج بهذا الاسم أو الكود</p>
                  </div>
                )}
              </div>
              <button
                onClick={() => handleScan(scanInput)}
                disabled={!scanInput.trim()}
                className="px-4 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <span className="material-icons-round text-xl">add_circle</span>
                <span className="text-sm font-bold hidden sm:inline">إضافة</span>
              </button>
            </div>

            {/* Feedback */}
            {feedback && (
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold animate-in fade-in duration-200 ${
                feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                feedback.type === 'error' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400' :
                'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
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
                <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-10">
              <span className="material-icons-round text-4xl text-slate-300 dark:text-slate-700 mb-2 block">person_add</span>
              <p className="text-sm text-slate-500 font-medium">لم يتم تسجيل عمالة على هذا الخط بعد</p>
              <p className="text-xs text-slate-400 mt-1">امسح باركود الموظف أو اكتب الكود يدوياً</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="text-right py-2.5 px-3 font-bold text-slate-500 text-xs">الكود</th>
                    <th className="text-right py-2.5 px-3 font-bold text-slate-500 text-xs">الاسم</th>
                    <th className="text-right py-2.5 px-3 font-bold text-slate-500 text-xs hidden sm:table-cell">القسم</th>
                    <th className="text-right py-2.5 px-3 font-bold text-slate-500 text-xs hidden sm:table-cell">المنصب</th>
                    <th className="text-right py-2.5 px-3 font-bold text-slate-500 text-xs">وقت التسجيل</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => {
                    const emp = getEmployeeInfo(a.employeeId);
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-xs font-mono font-bold">
                            {a.employeeCode}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-white">{a.employeeName}</td>
                        <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell">{emp ? getDeptName(emp.departmentId) : '—'}</td>
                        <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell">{emp ? getPositionTitle(emp.jobPositionId) : '—'}</td>
                        <td className="py-2.5 px-3 text-slate-500 text-xs">{formatTime(a.assignedAt)}</td>
                        <td className="py-2.5 px-1">
                          <button
                            onClick={() => handleRemove(a.id!)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
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
            <span className="material-icons-round text-4xl text-slate-300 dark:text-slate-700 mb-2 block">assignment</span>
            <p className="text-sm text-slate-500 font-medium">لا يوجد تسجيلات لهذا اليوم</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-primary/5 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-primary">{allDayAssignments.length}</p>
                <p className="text-xs text-slate-500 font-bold">إجمالي العمالة</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-emerald-600">{lineGroups.length}</p>
                <p className="text-xs text-slate-500 font-bold">خطوط نشطة</p>
              </div>
              {lineGroups.slice(0, 2).map((g) => (
                <div key={g.lineId} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-slate-700 dark:text-slate-300">{g.workers.length}</p>
                  <p className="text-xs text-slate-500 font-bold truncate">{g.lineName}</p>
                </div>
              ))}
            </div>

            {/* Expandable per-line */}
            <div className="space-y-2">
              {lineGroups.map((g) => (
                <div key={g.lineId} className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleExpand(g.lineId)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
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
                    <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2">
                      <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                        {g.workers.map((w) => {
                          const emp = getEmployeeInfo(w.employeeId);
                          return (
                            <div key={w.id} className="flex items-center justify-between py-2 text-sm">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-xs font-mono font-bold">
                                  {w.employeeCode}
                                </span>
                                <span className="font-medium">{w.employeeName}</span>
                                {emp && (
                                  <span className="text-xs text-slate-400 hidden sm:inline">
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-amber-500 text-2xl">content_copy</span>
            </div>
            <h3 className="text-lg font-bold text-center mb-2">نسخ من أمس</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
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
