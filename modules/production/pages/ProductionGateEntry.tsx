import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { productionGateService, type GateActionResult, type GateEmployeePreview, type ProductionGateSession } from '../services/productionGateService';
import { formatDuration, gateDate, gateTime, liveDuration, sortGateRows } from '../utils/productionGate';

const statusLabel = (status: ProductionGateSession['status']) => ({
  open: 'خارج حاليًا', completed: 'عاد', auto_closed: 'لم يسجل دخول', cancelled: 'ملغاة',
}[status]);

export const ProductionGateEntry: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRequestIdRef = useRef(0);
  const [code, setCode] = useState('');
  const [rows, setRows] = useState<ProductionGateSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<GateEmployeePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [lastResult, setLastResult] = useState<GateActionResult | null>(null);
  const [, tick] = useState(0);
  const today = gateDate();
  const normalizedCode = code.trim();
  const debouncedCode = useDebouncedValue(normalizedCode, 100);

  const load = useCallback(async () => {
    try { setRows(await productionGateService.list(today, today)); }
    catch (error) { showAppToast('error', (error as Error).message || 'تعذر تحميل حركات اليوم.'); }
    finally { setLoading(false); }
  }, [today]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => tick((v) => v + 1), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => { inputRef.current?.focus(); }, [saving]);

  useEffect(() => {
    let active = true;
    if (!debouncedCode) {
      setPreview(null);
      setPreviewError('');
      setPreviewLoading(false);
      return () => { active = false; };
    }
    const requestId = ++previewRequestIdRef.current;
    setPreviewLoading(true);
    setPreviewError('');
    void productionGateService.preview(debouncedCode)
      .then((result) => {
        if (!active || requestId !== previewRequestIdRef.current) return;
        setPreview(result);
      })
      .catch((error: Error) => {
        if (!active || requestId !== previewRequestIdRef.current) return;
        setPreview(null);
        setPreviewError(error.message || 'تعذر تحميل بيانات الموظف.');
      })
      .finally(() => {
        if (active && requestId === previewRequestIdRef.current) setPreviewLoading(false);
      });
    return () => { active = false; };
  }, [debouncedCode]);

  const handleCodeChange = useCallback((value: string) => {
    previewRequestIdRef.current += 1;
    setCode(value);
    setPreview(null);
    setPreviewError('');
    setPreviewLoading(false);
    setLastResult(null);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!normalizedCode || saving || previewLoading) return;
    if (!preview || preview.employeeCode !== normalizedCode) {
      showAppToast('error', 'انتظر ظهور بيانات الموظف أولًا.');
      return;
    }
    if (!preview.registrationAllowed) {
      showAppToast('error', 'غير مصرح بالإدخال خارج الفترة من 8 صباحًا إلى 4 مساءً.');
      return;
    }
    setSaving(true);
    try {
      const result = await productionGateService.register(code);
      setLastResult(result);
      setCode('');
      setPreview(null);
      showAppToast('success', result.action === 'exit' ? `تم تسجيل خروج ${result.employeeName}` : `تم تسجيل دخول ${result.employeeName}`);
      await load();
    } catch (error) { showAppToast('error', (error as Error).message); }
    finally { setSaving(false); }
  };

  const visibleRows = useMemo(() => sortGateRows(rows.filter((row) => row.status !== 'cancelled')), [rows]);
  const openCount = visibleRows.filter((row) => row.status === 'open').length;
  const employeeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    visibleRows.forEach((row) => counts.set(row.employeeId, (counts.get(row.employeeId) || 0) + 1));
    return counts;
  }, [visibleRows]);

  return (
    <ModuleOpsPageShell
      eyebrow="بوابة الإنتاج"
      rangeLabel="تسجيل خروج ودخول الموظفين من 8 صباحًا إلى 4 مساءً"
      hero={[
        { key: 'outside', label: 'خارج حاليًا', value: openCount },
        { key: 'movements', label: 'مرات الخروج اليوم', value: visibleRows.length },
        { key: 'employees', label: 'موظفون خرجوا', value: new Set(visibleRows.map((row) => row.employeeId)).size },
      ]}
      onRefresh={() => void load()}
      refreshing={loading}
    >
      <OpsDashPanel title="تسجيل الحركة" accent="production" bodyClassName="p-5">
        <form onSubmit={submit} className="mx-auto max-w-2xl">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="production-gate-employee-code" className="text-sm font-bold">كود الموظف</label>
            <span className="rounded-full bg-[var(--color-surface-soft)] px-2.5 py-1 text-[10px] font-bold text-[var(--color-text-muted)]">يدعم قارئ الباركود USB</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              id="production-gate-employee-code"
              ref={inputRef}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              disabled={saving}
              autoComplete="off"
              inputMode="numeric"
              placeholder="اكتب الكود أو امسح الباركود"
              className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-center text-xl font-black outline-none focus:border-primary sm:text-2xl"
            />
            <button disabled={saving || previewLoading || !preview || preview.employeeCode !== normalizedCode || !preview.registrationAllowed} className="min-h-12 rounded-xl bg-primary px-6 font-bold text-white disabled:opacity-50">
              {saving ? 'جاري التسجيل...' : preview?.nextAction === 'entry' ? 'تسجيل دخول' : 'تسجيل خروج'}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] font-bold text-[var(--color-text-muted)]">قارئ USB يقرأ نفس كود الموظف المطبوع — بعد ظهور البيانات اضغط تسجيل</p>
        </form>
        {previewLoading && <div className="mx-auto mt-4 max-w-2xl rounded-xl bg-[var(--color-surface-soft)] p-4 text-center font-bold text-[var(--color-text-muted)]">جاري تحميل بيانات الموظف...</div>}
        {!previewLoading && previewError && <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-red-200 bg-red-50 p-4 text-center font-bold text-red-700">{previewError}</div>}
        {!previewLoading && preview && preview.employeeCode === normalizedCode && (
          <div className={`mx-auto mt-4 max-w-2xl rounded-xl border p-4 ${preview.currentStatus === 'outside' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xl font-black">{preview.employeeName}</p><p className="text-sm font-bold">كود {preview.employeeCode}</p></div>
              <div className="text-end"><p className="text-lg font-black">{preview.currentStatus === 'outside' ? 'خارج حاليًا' : 'داخل حاليًا'}</p><p className="text-sm font-bold">سيتم تسجيل {preview.nextAction === 'entry' ? 'دخول' : 'خروج'}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 border-t border-current/15 pt-3 text-sm font-bold">
              <span>مرات الخروج اليوم: {preview.todayExitCount}</span>
              {preview.exitAt && <span>وقت الخروج: {new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(new Date(preview.exitAt))}</span>}
              {preview.currentStatus === 'outside' && <span>المدة الحالية: {formatDuration(preview.exitAt ? Math.max(0, Math.floor((Date.now() - new Date(preview.exitAt).getTime()) / 60_000)) : preview.currentDurationMinutes)}</span>}
            </div>
            {!preview.registrationAllowed && <p className="mt-3 rounded-lg bg-red-100 p-2 text-center font-black text-red-700">غير مصرح بالإدخال الآن — التسجيل متاح من 8 صباحًا إلى 4 مساءً</p>}
          </div>
        )}
        {lastResult && (
          <div className={`mx-auto mt-5 max-w-2xl rounded-xl border p-4 text-center ${lastResult.action === 'exit' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
            <p className="text-xl font-black">{lastResult.employeeName} — {lastResult.action === 'exit' ? 'خروج' : 'دخول'}</p>
            <p className="mt-1">{new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(new Date(lastResult.actionAt))}</p>
          </div>
        )}
      </OpsDashPanel>

      <OpsDashPanel title="حركات اليوم — غير المسجل لهم دخول أولًا" accent="production" bodyClassName="p-0">
        <table className="hidden w-full table-fixed text-sm lg:table">
          <thead className="bg-[var(--color-surface-soft)] text-[var(--color-text-muted)]"><tr>
            <th className="w-[30%] p-3 text-start">الموظف</th><th className="p-3">الخروج</th><th className="p-3">الدخول</th>
            <th className="p-3">المدة</th><th className="p-3">الحالة</th><th className="p-3">مرات اليوم</th>
          </tr></thead>
          <tbody>
            {visibleRows.map((row) => <tr key={row.id} className={`border-t border-[var(--color-border)] ${row.status === 'open' ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''}`}>
              <td className="p-3"><p className="font-bold">{row.employeeName}</p><p className="text-xs text-[var(--color-text-muted)]">{row.employeeCode}</p></td>
              <td className="p-3 text-center">{gateTime(row.exitAt)}</td><td className="p-3 text-center">{gateTime(row.entryAt)}</td>
              <td className="p-3 text-center font-bold">{formatDuration(liveDuration(row))}</td>
              <td className="p-3 text-center"><span className={`rounded-full px-3 py-1 text-xs font-bold ${row.status === 'open' ? 'bg-amber-100 text-amber-800' : row.status === 'auto_closed' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{statusLabel(row.status)}</span></td>
              <td className="p-3 text-center font-bold">{employeeCounts.get(row.employeeId)}</td>
            </tr>)}
            {!loading && visibleRows.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-[var(--color-text-muted)]">لا توجد حركات مسجلة اليوم.</td></tr>}
          </tbody>
        </table>
        <div className="divide-y divide-[var(--color-border)] lg:hidden">
          {visibleRows.map((row) => <article key={row.id} className={`p-3 sm:p-4 ${row.status === 'open' ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''}`}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-black text-[var(--color-text)]">{row.employeeName}</p>
                <p className="mt-0.5 text-xs font-bold text-[var(--color-text-muted)]">كود {row.employeeCode}</p>
              </div>
              <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold ${row.status === 'open' ? 'bg-amber-100 text-amber-800' : row.status === 'auto_closed' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{statusLabel(row.status)}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 divide-x divide-x-reverse divide-[var(--color-border)] rounded-lg bg-[var(--color-surface-soft)] py-2 text-center">
              <div className="px-2"><p className="text-[10px] font-bold text-[var(--color-text-muted)]">الخروج</p><p className="mt-1 whitespace-nowrap font-black tabular-nums">{gateTime(row.exitAt)}</p></div>
              <div className="px-2"><p className="text-[10px] font-bold text-[var(--color-text-muted)]">الدخول</p><p className="mt-1 whitespace-nowrap font-black tabular-nums">{gateTime(row.entryAt)}</p></div>
              <div className="px-2"><p className="text-[10px] font-bold text-[var(--color-text-muted)]">المدة</p><p className="mt-1 whitespace-nowrap font-black tabular-nums text-primary">{formatDuration(liveDuration(row))}</p></div>
            </div>
            <p className="mt-2 text-xs font-bold text-[var(--color-text-muted)]">مرات الخروج اليوم: <span className="text-[var(--color-text)]">{employeeCounts.get(row.employeeId)}</span></p>
          </article>)}
          {!loading && visibleRows.length === 0 && <p className="p-8 text-center text-sm text-[var(--color-text-muted)]">لا توجد حركات مسجلة اليوم.</p>}
        </div>
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
