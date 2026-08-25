import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';
import { usePermission } from '@/utils/permissions';
import { productionGateService, type ProductionGateSession } from '../services/productionGateService';
import { formatDuration, gateDate, gateTime, gateTimestampDate, liveDuration } from '../utils/productionGate';

type Period = 'today' | 'week' | 'month' | 'custom';
const rangeFor = (period: Period) => {
  const today = new Date(`${gateDate()}T12:00:00`);
  const end = gateDate(today);
  if (period === 'today') return { start: end, end };
  if (period === 'month') return { start: `${end.slice(0, 7)}-01`, end };
  const day = today.getDay();
  const sinceSaturday = (day + 1) % 7;
  today.setDate(today.getDate() - sinceSaturday);
  return { start: gateDate(today), end };
};

const statusText = (status: ProductionGateSession['status']) => ({ open: 'خارج حاليًا', completed: 'عاد', auto_closed: 'دخول غير مسجل', cancelled: 'ملغاة' }[status]);

const statusClass = (status: ProductionGateSession['status']) => ({
  open: 'border-amber-200 bg-amber-50 text-amber-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  auto_closed: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
}[status]);

const displayGateDate = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

export const ProductionGateAnalytics: React.FC = () => {
  const { can } = usePermission();
  const canCorrect = can('production.gate.correct');
  const [period, setPeriod] = useState<Period>('today');
  const initial = rangeFor('today');
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProductionGateSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await productionGateService.list(startDate, endDate)); }
    catch (error) { showAppToast('error', (error as Error).message || 'تعذر تحميل التحليل.'); }
    finally { setLoading(false); }
  }, [startDate, endDate]);
  useEffect(() => { void load(); }, [load]);

  const activeRows = useMemo(() => rows.filter((row) => row.status !== 'cancelled'), [rows]);
  const summaries = useMemo(() => {
    const map = new Map<string, { employeeId: string; name: string; code: string; count: number; total: number; longest: number; open: boolean; sessions: ProductionGateSession[] }>();
    activeRows.forEach((row) => {
      const item = map.get(row.employeeId) || { employeeId: row.employeeId, name: row.employeeName, code: row.employeeCode, count: 0, total: 0, longest: 0, open: false, sessions: [] };
      const duration = liveDuration(row);
      item.count += 1; item.total += duration; item.longest = Math.max(item.longest, duration); item.open ||= row.status === 'open'; item.sessions.push(row);
      map.set(row.employeeId, item);
    });
    const needle = search.trim().toLowerCase();
    return [...map.values()].map((item) => ({
      ...item,
      sessions: [...item.sessions].sort((a, b) => (gateTimestampDate(b.exitAt)?.getTime() || 0) - (gateTimestampDate(a.exitAt)?.getTime() || 0)),
    })).filter((item) => !needle || item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle)).sort((a, b) => b.total - a.total);
  }, [activeRows, search]);
  const totalMinutes = summaries.reduce((sum, item) => sum + item.total, 0);

  const choosePeriod = (next: Period) => {
    setPeriod(next);
    if (next !== 'custom') { const range = rangeFor(next); setStartDate(range.start); setEndDate(range.end); }
  };

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaries.map((item, index) => ({
      '#': index + 1, 'كود الموظف': item.code, 'اسم الموظف': item.name, 'عدد مرات الخروج': item.count,
      'إجمالي الدقائق': item.total, 'إجمالي الوقت': formatDuration(item.total), 'متوسط المرة بالدقائق': Math.round(item.total / item.count),
      'أطول مرة بالدقائق': item.longest, 'خارج حاليًا': item.open ? 'نعم' : 'لا',
    }))), 'ملخص الموظفين');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(activeRows.map((row) => ({
      'التاريخ': row.date, 'كود الموظف': row.employeeCode, 'اسم الموظف': row.employeeName, 'وقت الخروج': gateTime(row.exitAt),
      'وقت الدخول': gateTime(row.entryAt), 'المدة بالدقائق': liveDuration(row), 'الحالة': statusText(row.status),
    }))), 'تفاصيل الحركات');
    XLSX.writeFile(workbook, `تحليل-خروج-العمال-${startDate}-${endDate}.xlsx`);
  };

  const correctSession = async (row: ProductionGateSession) => {
    const exitDefault = row.exitAt?.toDate?.()?.toISOString().slice(0, 16) || '';
    const entryDefault = row.entryAt?.toDate?.()?.toISOString().slice(0, 16) || '';
    const exitAt = window.prompt('وقت الخروج بصيغة YYYY-MM-DDTHH:mm', exitDefault);
    if (exitAt == null) return;
    const entryAt = window.prompt('وقت الدخول بنفس الصيغة (اتركه فارغًا لو الموظف ما زال خارجًا)', entryDefault);
    if (entryAt == null) return;
    const reason = window.prompt('سبب التصحيح (إجباري)')?.trim();
    if (!reason) return;
    try {
      await productionGateService.correct({ sessionId: row.id, exitAt: new Date(exitAt).toISOString(), entryAt: entryAt ? new Date(entryAt).toISOString() : null, reason });
      showAppToast('success', 'تم تصحيح الحركة وحفظها في سجل التدقيق.');
      await load();
    } catch (error) { showAppToast('error', (error as Error).message); }
  };

  const cancelSession = async (row: ProductionGateSession) => {
    const reason = window.prompt('سبب إلغاء الحركة (إجباري)')?.trim();
    if (!reason) return;
    try {
      await productionGateService.correct({ sessionId: row.id, reason, cancel: true });
      showAppToast('success', 'تم إلغاء الحركة وحفظها في سجل التدقيق.');
      await load();
    } catch (error) { showAppToast('error', (error as Error).message); }
  };

  return (
    <ModuleOpsPageShell eyebrow="تحليل خروج العمال" rangeLabel={`${startDate} — ${endDate}`} hero={[
      { key: 'employees', label: 'الموظفون', value: summaries.length, meta: 'خرجوا خلال الفترة', toneClassName: '!min-h-[96px] !p-4' },
      { key: 'count', label: 'مرات الخروج', value: activeRows.length, meta: 'إجمالي الحركات', toneClassName: '!min-h-[96px] !p-4' },
      { key: 'duration', label: 'إجمالي وقت الخروج', value: formatDuration(totalMinutes), meta: 'لكل الموظفين', toneClassName: '!min-h-[96px] !p-4' },
      { key: 'top', label: 'الأعلى وقتًا', value: summaries[0] ? formatDuration(summaries[0].total) : '—', meta: summaries[0]?.name || 'لا توجد بيانات', toneClassName: '!min-h-[96px] !p-4' },
    ]} denseHero={false} onRefresh={() => void load()} refreshing={loading}>
      <OpsDashPanel title="الفترة والبحث" accent="production" bodyClassName="p-4">
        <div className="flex flex-wrap items-end gap-3">
          {(['today', 'week', 'month', 'custom'] as Period[]).map((key) => <button key={key} onClick={() => choosePeriod(key)} className={`rounded-lg px-4 py-2 text-sm font-bold ${period === key ? 'bg-primary text-white' : 'bg-[var(--color-surface-soft)]'}`}>{{ today: 'اليوم', week: 'هذا الأسبوع', month: 'هذا الشهر', custom: 'فترة مخصصة' }[key]}</button>)}
          {period === 'custom' && <><label className="text-xs">من<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block rounded-lg border p-2" /></label><label className="text-xs">إلى<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block rounded-lg border p-2" /></label></>}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الكود" className="min-w-[220px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2" />
          <button onClick={exportExcel} disabled={!summaries.length} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50">تصدير Excel</button>
        </div>
      </OpsDashPanel>
      <OpsDashPanel title="ترتيب الموظفين حسب إجمالي وقت الخروج" accent="production" bodyClassName="p-0 overflow-x-auto">
        <table className="w-full min-w-[980px] text-xs"><thead className="bg-[var(--color-surface-soft)]"><tr>
          <th className="p-2">#</th><th className="p-2 text-start">الموظف</th><th className="p-2">المرات</th><th className="p-2">الإجمالي</th><th className="p-2">المتوسط</th><th className="p-2">الأطول</th><th className="p-2">الحالة</th><th className="min-w-[500px] p-2 text-start">تفاصيل الحركات</th>
        </tr></thead><tbody>{summaries.map((item, index) => <tr key={item.employeeId} className="border-t border-[var(--color-border)] align-top">
          <td className="p-2 text-center font-bold">{index + 1}</td><td className="p-2"><p className="whitespace-nowrap font-bold">{item.name}</p><p className="text-[10px] text-[var(--color-text-muted)]">{item.code}</p></td>
          <td className="p-2 text-center font-bold">{item.count}</td><td className="whitespace-nowrap p-2 text-center font-black text-primary">{formatDuration(item.total)}</td><td className="whitespace-nowrap p-2 text-center">{formatDuration(item.total / item.count)}</td><td className="whitespace-nowrap p-2 text-center">{formatDuration(item.longest)}</td>
          <td className="p-2 text-center">{item.open ? <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">خارج حاليًا</span> : <span className="text-emerald-700">داخل</span>}</td>
          <td className="p-2">
            <div className={`grid items-center gap-x-2 border-b border-[var(--color-border)] px-1 pb-1 text-[9px] font-bold text-[var(--color-text-muted)] ${canCorrect ? 'grid-cols-[1.2fr_.8fr_.8fr_.9fr_1fr_auto]' : 'grid-cols-[1.2fr_.8fr_.8fr_.9fr_1fr]'}`}>
              <span>التاريخ</span><span>خروج</span><span>دخول</span><span>المدة</span><span>الحالة</span>{canCorrect && <span>الإجراء</span>}
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {item.sessions.map((row) => <div key={row.id} className={`grid items-center gap-x-2 px-1 py-1.5 ${canCorrect ? 'grid-cols-[1.2fr_.8fr_.8fr_.9fr_1fr_auto]' : 'grid-cols-[1.2fr_.8fr_.8fr_.9fr_1fr]'}`}>
                <span className="whitespace-nowrap font-bold">{displayGateDate(row.date)}</span>
                <span className="whitespace-nowrap tabular-nums">{gateTime(row.exitAt)}</span>
                <span className="whitespace-nowrap tabular-nums">{gateTime(row.entryAt)}</span>
                <span className="whitespace-nowrap font-bold tabular-nums text-primary">{formatDuration(liveDuration(row))}</span>
                <span className={`w-fit whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${statusClass(row.status)}`}>{statusText(row.status)}</span>
                {canCorrect && <div className="flex whitespace-nowrap">
                  <button type="button" onClick={() => void correctSession(row)} className="rounded px-1.5 py-1 font-bold text-primary hover:bg-primary/10">تعديل</button>
                  <button type="button" onClick={() => void cancelSession(row)} className="rounded px-1.5 py-1 font-bold text-red-600 hover:bg-red-50">إلغاء</button>
                </div>}
              </div>)}
            </div>
          </td>
        </tr>)}{!loading && !summaries.length && <tr><td colSpan={8} className="p-8 text-center text-[var(--color-text-muted)]">لا توجد حركات خروج في الفترة المحددة.</td></tr>}</tbody></table>
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
