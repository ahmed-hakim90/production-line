import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { productionGateService, type GateActionResult, type GateEmployeePreview, type ProductionGateSession } from '../services/productionGateService';
import { productionGateOfflineStore, type QueuedGateEvent } from '../services/productionGateOfflineStore';
import { formatDuration, gateDate, gateTime, liveDuration, sortGateRows } from '../utils/productionGate';

const statusLabel = (status: ProductionGateSession['status']) => ({
  open: 'خارج حاليًا', completed: 'عاد', auto_closed: 'لم يسجل دخول', cancelled: 'ملغاة',
}[status]);

const registrationAllowedNow = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts();
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  return hour >= 8 && hour < 16;
};

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
  const scope = productionGateService.cacheScope();
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [queue, setQueue] = useState<QueuedGateEvent[]>(() => productionGateOfflineStore.snapshot(scope).queue);
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState(() => productionGateOfflineStore.snapshot(scope).updatedAt);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [reviewOpen, setReviewOpen] = useState(false);
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

  const refreshLocalState = useCallback(() => {
    const snapshot = productionGateOfflineStore.snapshot(scope);
    setQueue(snapshot.queue);
    setCacheUpdatedAt(snapshot.updatedAt);
  }, [scope]);

  const syncQueue = useCallback(async () => {
    if (syncingRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    syncingRef.current = true;
    setSyncing(true);
    const pending = productionGateOfflineStore.snapshot(scope).queue
      .filter((event) => event.status === 'pending' || event.status === 'syncing')
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    for (const event of pending) {
      productionGateOfflineStore.update(scope, event.eventId, { status: 'syncing', attempts: event.attempts + 1 });
      refreshLocalState();
      try {
        const result = await productionGateService.register(event.employeeCode, event.employeeId, {
          eventId: event.eventId, occurredAt: event.occurredAt, expectedAction: event.expectedAction,
        });
        productionGateOfflineStore.remove(scope, event.eventId);
        const cached = productionGateOfflineStore.preview(scope, event.employeeCode);
        if (cached) productionGateOfflineStore.cacheEmployee(scope, {
          ...cached, currentStatus: result.action === 'exit' ? 'outside' : 'inside',
          nextAction: result.action === 'exit' ? 'entry' : 'exit',
          exitAt: result.action === 'exit' ? result.actionAt : null,
          currentDurationMinutes: 0,
        });
        setLastResult(result);
      } catch (error) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          productionGateOfflineStore.update(scope, event.eventId, { status: 'pending' });
          break;
        }
        productionGateOfflineStore.update(scope, event.eventId, { status: 'failed', error: (error as Error).message || 'تعذر مزامنة الحركة.' });
        refreshLocalState();
        break;
      }
      refreshLocalState();
    }
    syncingRef.current = false;
    setSyncing(false);
    refreshLocalState();
    if (navigator.onLine) void load();
  }, [load, refreshLocalState, scope]);

  useEffect(() => {
    const handleOnline = () => { setOnline(true); window.setTimeout(() => void syncQueue(), 500); };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [syncQueue]);

  useEffect(() => {
    if (!online) return;
    void productionGateService.syncEmployeeCache()
      .then(({ employees }) => { productionGateOfflineStore.replaceEmployees(scope, employees); refreshLocalState(); })
      .catch(() => { /* existing cache remains available */ });
    void syncQueue();
  }, [online, refreshLocalState, scope]);

  useEffect(() => {
    let active = true;
    if (!debouncedCode) {
      setPreview(null);
      setPreviewError('');
      setPreviewLoading(false);
      return () => { active = false; };
    }
    const cached = productionGateOfflineStore.preview(scope, debouncedCode);
    if (cached) setPreview({ ...cached, registrationAllowed: registrationAllowedNow() });
    const requestId = ++previewRequestIdRef.current;
    setPreviewLoading(!cached && online);
    setPreviewError('');
    if (!online) {
      if (!cached) setPreviewError('العامل غير موجود في الكاش المحلي. يلزم الاتصال لتحديث قائمة العمال.');
      return () => { active = false; };
    }
    void productionGateService.preview(debouncedCode)
      .then((result) => {
        if (!active || requestId !== previewRequestIdRef.current) return;
        setPreview(result);
        productionGateOfflineStore.cacheEmployee(scope, result);
        refreshLocalState();
      })
      .catch((error: Error) => {
        if (!active || requestId !== previewRequestIdRef.current) return;
        if (!cached) { setPreview(null); setPreviewError(error.message || 'تعذر تحميل بيانات الموظف.'); }
      })
      .finally(() => {
        if (active && requestId === previewRequestIdRef.current) setPreviewLoading(false);
      });
    return () => { active = false; };
  }, [debouncedCode, online, refreshLocalState, scope]);

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
      const cachedPreview = { ...preview, cachedAt: new Date().toISOString() };
      const queued = productionGateOfflineStore.enqueue(scope, cachedPreview);
      refreshLocalState();
      if (!online) {
        setLastResult({ action: queued.expectedAction, sessionId: `local:${queued.eventId}`, tenantId: '', employeeId: queued.employeeId, employeeName: queued.employeeName, employeeCode: queued.employeeCode, actionAt: queued.occurredAt, durationMinutes: null });
        setCode(''); setPreview(null);
        showAppToast('success', `تم حفظ ${queued.expectedAction === 'exit' ? 'خروج' : 'دخول'} ${queued.employeeName} محليًا.`);
        return;
      }
      await syncQueue();
      const remaining = productionGateOfflineStore.snapshot(scope).queue.find((event) => event.eventId === queued.eventId);
      if (remaining?.status === 'failed') throw new Error(remaining.error || 'تعذر مزامنة الحركة.');
      const result = productionGateOfflineStore.snapshot(scope).queue.find((event) => event.eventId === queued.eventId)?.result || {
        action: queued.expectedAction, sessionId: `queued:${queued.eventId}`, tenantId: '', employeeId: queued.employeeId,
        employeeName: queued.employeeName, employeeCode: queued.employeeCode, actionAt: queued.occurredAt, durationMinutes: null,
      };
      setRows((current) => {
        if (result.action === 'entry') {
          return current.map((row) => row.id === result.sessionId ? {
            ...row,
            entryAt: result.actionAt,
            durationMinutes: result.durationMinutes,
            status: 'completed',
          } : row);
        }
        return [{
          id: result.sessionId,
          tenantId: result.tenantId,
          employeeId: result.employeeId,
          employeeName: result.employeeName,
          employeeCode: result.employeeCode,
          date: today,
          exitAt: result.actionAt,
          entryAt: null,
          durationMinutes: null,
          status: 'open',
        }, ...current];
      });
      setLastResult(result);
      setCode('');
      setPreview(null);
      showAppToast('success', `تم تسجيل ${result.action === 'exit' ? 'خروج' : 'دخول'} ${result.employeeName}`);
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
      <div role="status" className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${online ? 'border-[rgb(var(--color-success)/0.3)] bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]' : 'border-[rgb(var(--color-warning)/0.3)] bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]'}`}>
        <span>{online ? (syncing ? 'متصل — جاري مزامنة الحركات' : 'متصل بالإنترنت') : 'غير متصل — الحركات تُحفظ على هذا الجهاز'}</span>
        <button type="button" onClick={() => setReviewOpen((value) => !value)} className="min-h-10 rounded-lg border border-current/25 px-3">
          الحركات المنتظرة: {queue.filter((event) => event.status !== 'failed').length} · تحتاج مراجعة: {queue.filter((event) => event.status === 'failed').length}
        </button>
      </div>

      {reviewOpen && (
        <OpsDashPanel title="مراجعة الحركات المحلية" accent="production" bodyClassName="p-4">
          <p className="mb-3 text-xs font-bold text-[var(--color-text-muted)]">آخر تحديث لكاش العمال: {cacheUpdatedAt ? new Date(cacheUpdatedAt).toLocaleString('ar-EG') : 'لم يتم بعد'}</p>
          <div className="space-y-2">
            {queue.map((event) => (
              <article key={event.eventId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] p-3">
                <div><p className="font-black">{event.employeeName} — {event.expectedAction === 'exit' ? 'خروج' : 'دخول'}</p><p className="text-xs text-[var(--color-text-muted)]">{new Date(event.occurredAt).toLocaleString('ar-EG')} · {event.status === 'failed' ? event.error : event.status === 'syncing' ? 'جاري الإرسال' : 'بانتظار المزامنة'}</p></div>
                {event.status === 'failed' && <button type="button" disabled={!online || syncing} onClick={() => { productionGateOfflineStore.retry(scope, event.eventId); refreshLocalState(); window.setTimeout(() => void syncQueue(), 0); }} className="min-h-10 rounded-lg bg-primary px-4 font-bold text-white disabled:opacity-50">إعادة المحاولة</button>}
              </article>
            ))}
            {!queue.length && <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">لا توجد حركات محلية معلقة.</p>}
          </div>
        </OpsDashPanel>
      )}
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
        {!previewLoading && previewError && <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-[rgb(var(--color-danger)/0.3)] bg-[rgb(var(--color-danger)/0.1)] p-4 text-center font-bold text-[rgb(var(--color-danger))]">{previewError}</div>}
        {!previewLoading && preview && preview.employeeCode === normalizedCode && (
          <div className={`mx-auto mt-4 max-w-2xl rounded-xl border p-4 ${preview.currentStatus === 'outside' ? 'border-[rgb(var(--color-warning)/0.3)] bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]' : 'border-[rgb(var(--color-success)/0.3)] bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xl font-black">{preview.employeeName}</p><p className="text-sm font-bold">كود {preview.employeeCode}</p></div>
              <div className="text-end"><p className="text-lg font-black">{preview.currentStatus === 'outside' ? 'خارج حاليًا' : 'داخل حاليًا'}</p><p className="text-sm font-bold">سيتم تسجيل {preview.nextAction === 'entry' ? 'دخول' : 'خروج'}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 border-t border-current/15 pt-3 text-sm font-bold">
              <span>مرات الخروج اليوم: {preview.todayExitCount}</span>
              {preview.exitAt && <span>وقت الخروج: {new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(new Date(preview.exitAt))}</span>}
              {preview.currentStatus === 'outside' && <span>المدة الحالية: {formatDuration(preview.exitAt ? Math.max(0, Math.floor((Date.now() - new Date(preview.exitAt).getTime()) / 60_000)) : preview.currentDurationMinutes)}</span>}
            </div>
            {!preview.registrationAllowed && <p className="mt-3 rounded-lg bg-[rgb(var(--color-danger)/0.1)] p-2 text-center font-black text-[rgb(var(--color-danger))]">غير مصرح بالإدخال الآن — التسجيل متاح من 8 صباحًا إلى 4 مساءً</p>}
          </div>
        )}
        {lastResult && (
          <div className={`mx-auto mt-5 max-w-2xl rounded-xl border p-4 text-center ${lastResult.action === 'exit' ? 'border-[rgb(var(--color-warning)/0.3)] bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]' : 'border-[rgb(var(--color-success)/0.3)] bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]'}`}>
            <p className="text-xl font-black">{lastResult.employeeName} — {lastResult.action === 'exit' ? 'خروج' : 'دخول'}</p>
            <p className="mt-1">{new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(new Date(lastResult.actionAt))}</p>
          </div>
        )}
      </OpsDashPanel>

      <OpsDashPanel title="حركات اليوم — غير المسجل لهم دخول أولًا" accent="production" bodyClassName="p-0">
        <table className="hidden w-full table-fixed text-sm lg:table">
          <thead className="bg-[var(--color-surface-soft)] text-[var(--color-text-muted)]"><tr>
            <th className="w-[30%] p-2 text-start">الموظف</th><th className="p-2">الخروج</th><th className="p-2">الدخول</th>
            <th className="p-2">المدة</th><th className="p-2">الحالة</th><th className="p-2">مرات اليوم</th>
          </tr></thead>
          <tbody>
            {visibleRows.map((row) => <tr key={row.id} className={`border-t border-[var(--color-border)] ${row.status === 'open' ? 'bg-[rgb(var(--color-warning)/0.08)]' : ''}`}>
              <td className="p-2"><p className="font-bold">{row.employeeName}</p><p className="text-[10px] text-[var(--color-text-muted)]">{row.employeeCode}</p></td>
              <td className="p-2 text-center">{gateTime(row.exitAt)}</td><td className="p-2 text-center">{gateTime(row.entryAt)}</td>
              <td className="p-2 text-center font-bold">{formatDuration(liveDuration(row))}</td>
              <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${row.status === 'open' ? 'bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]' : row.status === 'auto_closed' ? 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]' : 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]'}`}>{statusLabel(row.status)}</span></td>
              <td className="p-2 text-center font-bold">{employeeCounts.get(row.employeeId)}</td>
            </tr>)}
            {!loading && visibleRows.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-[var(--color-text-muted)]">لا توجد حركات مسجلة اليوم.</td></tr>}
          </tbody>
        </table>
        <div className="divide-y divide-[var(--color-border)] lg:hidden">
          {visibleRows.map((row) => <article key={row.id} className={`px-3 py-2.5 ${row.status === 'open' ? 'bg-[rgb(var(--color-warning)/0.08)]' : ''}`}>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-black text-[var(--color-text)] sm:text-base">{row.employeeName}</p>
              <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold ${row.status === 'open' ? 'bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]' : row.status === 'auto_closed' ? 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]' : 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]'}`}>{statusLabel(row.status)}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] font-bold text-[var(--color-text-muted)] sm:text-[11px]">
              <span>كود {row.employeeCode}</span>
              <span>مرات اليوم: <b className="text-[var(--color-text)]">{employeeCounts.get(row.employeeId)}</b></span>
            </div>
            <div className="mt-2 grid grid-cols-3 divide-x divide-x-reverse divide-[var(--color-border)] rounded-md bg-[var(--color-surface-soft)] py-1.5 text-center">
              <div className="px-1.5"><p className="text-[9px] font-bold text-[var(--color-text-muted)]">الخروج</p><p className="mt-0.5 whitespace-nowrap text-sm font-black tabular-nums">{gateTime(row.exitAt)}</p></div>
              <div className="px-1.5"><p className="text-[9px] font-bold text-[var(--color-text-muted)]">الدخول</p><p className="mt-0.5 whitespace-nowrap text-sm font-black tabular-nums">{gateTime(row.entryAt)}</p></div>
              <div className="px-1.5"><p className="text-[9px] font-bold text-[var(--color-text-muted)]">المدة</p><p className="mt-0.5 whitespace-nowrap text-sm font-black tabular-nums text-primary">{formatDuration(liveDuration(row))}</p></div>
            </div>
          </article>)}
          {!loading && visibleRows.length === 0 && <p className="p-8 text-center text-sm text-[var(--color-text-muted)]">لا توجد حركات مسجلة اليوم.</p>}
        </div>
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
