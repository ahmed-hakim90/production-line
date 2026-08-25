import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';
import { productionGateService, type GateActionResult, type ProductionGateSession } from '../services/productionGateService';
import { formatDuration, gateDate, gateTime, liveDuration, sortGateRows } from '../utils/productionGate';

const statusLabel = (status: ProductionGateSession['status']) => ({
  open: 'خارج حاليًا', completed: 'عاد', auto_closed: 'لم يسجل دخول', cancelled: 'ملغاة',
}[status]);

export const ProductionGateEntry: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [rows, setRows] = useState<ProductionGateSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<GateActionResult | null>(null);
  const [, tick] = useState(0);
  const today = gateDate();

  const load = useCallback(async () => {
    try { setRows(await productionGateService.list(today, today)); }
    catch (error) { showAppToast('error', (error as Error).message || 'تعذر تحميل حركات اليوم.'); }
    finally { setLoading(false); }
  }, [today]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => tick((v) => v + 1), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => { inputRef.current?.focus(); }, [saving]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || saving) return;
    setSaving(true);
    try {
      const result = await productionGateService.register(code);
      setLastResult(result);
      setCode('');
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
          <label className="mb-2 block text-sm font-bold">كود الموظف</label>
          <div className="flex gap-3">
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={saving}
              autoComplete="off"
              inputMode="numeric"
              placeholder="اكتب الكود واضغط Enter"
              className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4 text-center text-2xl font-black outline-none focus:border-primary"
            />
            <button disabled={saving || !code.trim()} className="rounded-xl bg-primary px-7 font-bold text-white disabled:opacity-50">
              {saving ? 'جاري التسجيل...' : 'تسجيل'}
            </button>
          </div>
        </form>
        {lastResult && (
          <div className={`mx-auto mt-5 max-w-2xl rounded-xl border p-4 text-center ${lastResult.action === 'exit' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
            <p className="text-xl font-black">{lastResult.employeeName} — {lastResult.action === 'exit' ? 'خروج' : 'دخول'}</p>
            <p className="mt-1">{new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(new Date(lastResult.actionAt))}</p>
          </div>
        )}
      </OpsDashPanel>

      <OpsDashPanel title="حركات اليوم — غير المسجل لهم دخول أولًا" accent="production" bodyClassName="p-0 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--color-surface-soft)] text-[var(--color-text-muted)]"><tr>
            <th className="p-3 text-start">الموظف</th><th className="p-3">الخروج</th><th className="p-3">الدخول</th>
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
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
