import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Badge, Button, SearchableSelect } from '../components/UI';
import { getTodayDateString } from '../../../utils/calculations';
import { supervisorLineAssignmentService } from '../services/supervisorLineAssignmentService';
import type { SupervisorLineAssignment as SupervisorLineAssignmentRecord } from '../../../types';
import { PageHeader } from '../../../components/PageHeader';

const isActiveForDate = (item: SupervisorLineAssignmentRecord, date: string): boolean => {
  const from = String(item.effectiveFrom || '');
  const to = String(item.effectiveTo || '');
  if (!item.isActive) return false;
  if (!from || from > date) return false;
  if (to && to < from) return false;
  if (to && to < date) return false;
  return true;
};

export const SupervisorLineAssignment: React.FC = () => {
  const lines = useAppStore((s) => s._rawLines);
  const employees = useAppStore((s) => s._rawEmployees);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);

  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [allAssignments, setAllAssignments] = useState<SupervisorLineAssignmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingLineId, setSavingLineId] = useState('');
  const [draftByLine, setDraftByLine] = useState<Record<string, string>>({});
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lineSearch, setLineSearch] = useState('');

  const supervisors = useMemo(
    () => employees.filter((e) => e.level === 2 && e.isActive !== false && e.id),
    [employees],
  );
  const supervisorOptions = useMemo(
    () => supervisors.map((s) => ({ value: s.id!, label: s.code ? `${s.name} (${s.code})` : s.name })),
    [supervisors],
  );

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const rows = await supervisorLineAssignmentService.getAll();
      setAllAssignments(rows);
    } catch (error) {
      setFeedback({ type: 'error', text: (error as Error)?.message || 'تعذر تحميل توزيعات المشرفين.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const historyByLine = useMemo(() => {
    const map = new Map<string, SupervisorLineAssignmentRecord[]>();
    for (const row of allAssignments) {
      const lineId = String(row.lineId || '').trim();
      if (!lineId) continue;
      const list = map.get(lineId) || [];
      list.push(row);
      map.set(lineId, list);
    }
    map.forEach((list) => list.sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || ''))));
    return map;
  }, [allAssignments]);

  const currentByLine = useMemo(() => {
    const map = new Map<string, SupervisorLineAssignmentRecord>();
    historyByLine.forEach((rows, lineId) => {
      const active = rows.find((row) => isActiveForDate(row, selectedDate));
      if (active) map.set(lineId, active);
    });
    return map;
  }, [historyByLine, selectedDate]);

  useEffect(() => {
    const next: Record<string, string> = {};
    lines.forEach((line) => {
      if (!line.id) return;
      next[line.id] = currentByLine.get(line.id)?.supervisorId || '';
    });
    setDraftByLine(next);
  }, [lines, currentByLine]);

  const getSupervisorName = useCallback((supervisorId: string): string => {
    return supervisors.find((s) => s.id === supervisorId)?.name || supervisorId || '—';
  }, [supervisors]);

  const actorName = String(userDisplayName || userEmail || 'system').trim();
  const today = getTodayDateString();
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const filteredLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((line) => {
      const lineName = String(line.name || '').toLowerCase();
      const currentSupervisor = line.id ? getSupervisorName(currentByLine.get(line.id)?.supervisorId || '') : '';
      return lineName.includes(q) || currentSupervisor.toLowerCase().includes(q);
    });
  }, [lineSearch, lines, currentByLine, getSupervisorName]);

  const assignedCount = useMemo(
    () => lines.filter((line) => line.id && currentByLine.has(line.id)).length,
    [lines, currentByLine],
  );
  const totalLines = lines.length;
  const unassignedCount = Math.max(totalLines - assignedCount, 0);

  const handleAssign = async (lineId: string) => {
    const supervisorId = String(draftByLine[lineId] || '').trim();
    if (!lineId || !supervisorId) {
      setFeedback({ type: 'error', text: 'اختر مشرفًا أولاً.' });
      return;
    }
    const lineName = lines.find((line) => line.id === lineId)?.name || lineId;
    const supervisorName = getSupervisorName(supervisorId);
    setSavingLineId(lineId);
    setFeedback(null);
    try {
      await supervisorLineAssignmentService.assignOrReassign({
        lineId,
        supervisorId,
        effectiveFrom: selectedDate,
        changedBy: actorName,
        lineName,
        supervisorName,
      });
      setFeedback({ type: 'success', text: `تم حفظ تكليف ${supervisorName} على ${lineName}.` });
      await loadAssignments();
    } catch (error) {
      setFeedback({ type: 'error', text: (error as Error)?.message || 'تعذر حفظ التوزيع.' });
    } finally {
      setSavingLineId('');
    }
  };

  const handleRemove = async (lineId: string) => {
    setSavingLineId(lineId);
    setFeedback(null);
    try {
      await supervisorLineAssignmentService.removeAssignment(lineId, selectedDate, actorName);
      setFeedback({ type: 'success', text: 'تم فك التعيين مع الاحتفاظ بالسجل التاريخي.' });
      await loadAssignments();
    } catch (error) {
      setFeedback({ type: 'error', text: (error as Error)?.message || 'تعذر فك التعيين.' });
    } finally {
      setSavingLineId('');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="توزيع المشرفين على الخطوط"
        subtitle="تكليف ثابت مع تاريخ سريان وسجل تغييرات محفوظ لكل خط."
        icon="assignment_ind"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">إجمالي الخطوط</p>
          <p className="text-2xl font-extrabold text-[var(--color-text)] tabular-nums">{totalLines}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">تم تعيين مشرف</p>
          <p className="text-2xl font-extrabold text-emerald-600 tabular-nums">{assignedCount}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">بدون مشرف</p>
          <p className="text-2xl font-extrabold text-amber-600 tabular-nums">{unassignedCount}</p>
        </Card>
      </div>

      {feedback && (
        <div
          className={`rounded-[var(--border-radius-lg)] border px-4 py-3 text-sm font-bold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="erp-filter-bar">
          <div className="erp-date-seg">
            <button
              className={`erp-date-seg-btn${selectedDate === today ? ' active' : ''}`}
              onClick={() => setSelectedDate(today)}
            >
              اليوم
            </button>
            <button
              className={`erp-date-seg-btn${selectedDate === yesterday ? ' active' : ''}`}
              onClick={() => setSelectedDate(yesterday)}
            >
              أمس
            </button>
          </div>

          <div className="erp-filter-date">
            <span className="erp-filter-label">تاريخ السريان</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <button className="erp-filter-apply" onClick={() => void loadAssignments()} disabled={loading}>
            <span className={`material-icons-round text-sm ${loading ? 'animate-spin' : ''}`}>refresh</span>
            تحديث
          </button>

          <div className="erp-search-input erp-search-input--table flex-1 min-w-0">
            <span className="material-icons-round text-[16px] text-[var(--color-text-muted)]">search</span>
            <input
              type="text"
              placeholder="بحث بالخط أو المشرف الحالي"
              value={lineSearch}
              onChange={(e) => setLineSearch(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredLines.map((line) => {
          if (!line.id) return null;
          const current = currentByLine.get(line.id);
          const history = historyByLine.get(line.id) || [];
          const expanded = expandedLines.has(line.id);
          const busy = savingLineId === line.id;
          return (
            <Card key={line.id}>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-[var(--color-text)]">{line.name}</h3>
                  <Badge variant={current ? 'success' : 'neutral'}>
                    {current ? `الحالي: ${getSupervisorName(current.supervisorId)}` : 'بدون مشرف'}
                  </Badge>
                </div>
                <SearchableSelect
                  placeholder="اختر المشرف"
                  options={supervisorOptions}
                  value={draftByLine[line.id] || ''}
                  onChange={(value) => setDraftByLine((prev) => ({ ...prev, [line.id!]: value }))}
                />
                <div className="flex items-center gap-2">
                  <Button variant="primary" onClick={() => void handleAssign(line.id!)} disabled={busy || !draftByLine[line.id]}>
                    {busy && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                    حفظ/تغيير
                  </Button>
                  <Button variant="outline" onClick={() => void handleRemove(line.id!)} disabled={busy || !current}>
                    فك التعيين
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setExpandedLines((prev) => {
                        const next = new Set(prev);
                        if (next.has(line.id!)) next.delete(line.id!);
                        else next.add(line.id!);
                        return next;
                      });
                    }}
                  >
                    {expanded ? 'إخفاء السجل' : 'عرض السجل'}
                  </Button>
                </div>

                {expanded && (
                  <div className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] overflow-hidden">
                    <div className="px-3 py-2 bg-[#f8f9fa] text-xs font-bold text-[var(--color-text-muted)]">سجل التغييرات</div>
                    <div className="max-h-52 overflow-y-auto divide-y divide-[var(--color-border)]">
                      {history.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-[var(--color-text-muted)]">لا يوجد سجل حتى الآن.</p>
                      ) : history.map((item) => (
                        <div key={item.id || `${item.lineId}-${item.supervisorId}-${item.effectiveFrom}`} className="px-3 py-2 text-xs space-y-1">
                          <p className="font-bold text-[var(--color-text)]">{getSupervisorName(item.supervisorId)}</p>
                          <p className="text-[var(--color-text-muted)]">
                            من {item.effectiveFrom} إلى {item.effectiveTo || 'مستمر'}
                          </p>
                          <p className="text-[var(--color-text-muted)]">الإجراء: {item.reason || 'assign'} - بواسطة: {item.changedBy || '—'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        {filteredLines.length === 0 && (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)] text-center py-8">لا توجد خطوط مطابقة لنتيجة البحث الحالية.</p>
          </Card>
        )}
      </div>
    </div>
  );
};
