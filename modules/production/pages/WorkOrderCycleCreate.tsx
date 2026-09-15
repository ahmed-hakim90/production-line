import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { useWorkOrderCycle } from '../hooks/useWorkOrderCycle';
import { buildCyclePlan } from '../utils/workOrderCycle';
import { workOrderCycleService } from '../services/workOrderCycleService';
import { auth } from '../../auth/services/firebase';

export function WorkOrderCycleCreate() {
  return <CreateForm />;
}
function CreateForm() {
  const navigate = useTenantNavigate();
  const { data, loading, error, refresh } = useWorkOrderCycle(undefined, true);
  const [form, setForm] = useState({ workOrderNumber: '', productId: '', lineId: '', supervisorUid: '', quantity: '', startDate: new Date().toISOString().slice(0, 10), targetDate: new Date().toISOString().slice(0, 10), workdayStartTime: '08:00', workdayEndTime: '16:00', breakStartTime: '', breakEndTime: '' });
  const [saving, setSaving] = useState(false); const [actionError, setActionError] = useState('');
  const locked = useRef(false);
  const [orderId] = useState(() => {
    const key = `cycle-draft:${auth.currentUser?.uid}`;
    const stored = sessionStorage.getItem(key) || crypto.randomUUID();
    sessionStorage.setItem(key, stored); return stored;
  });
  const plan = useMemo(() => { try { return { slots: buildCyclePlan({ ...form, quantity: Number(form.quantity) }), error: '' }; } catch (e) { return { slots: [], error: (e as Error).message }; } }, [form]);
  const change = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  if (loading) return <p role="status">جاري تجهيز بيانات الأمر…</p>;
  if (!data || !data.permissions['workOrders.create']) return <div role="alert">{error || 'ليست لديك صلاحية تجهيز أمر الشغل.'}<Button variant="outline" onClick={() => void refresh()}>إعادة المحاولة</Button></div>;
  return <main dir="rtl" className="mx-auto max-w-5xl space-y-6 p-4 text-foreground sm:p-6">
    <header><Button variant="ghost" onClick={() => navigate('/work-orders')}>العودة لأوامر الشغل</Button><h1 className="mt-3 text-2xl font-semibold">تجهيز أمر شغل</h1><p className="mt-2 text-muted-foreground">راجع خطة الأيام والساعات قبل الحفظ. الاعتماد خطوة مستقلة بعد التجهيز.</p></header>
    <form className="space-y-6" onSubmit={async e => {
      e.preventDefault(); if (locked.current || plan.error || error) return;
      locked.current = true; setSaving(true); setActionError('');
      try {
        await workOrderCycleService.mutate(orderId, 'prepare', { workOrderNumber: form.workOrderNumber, productId: form.productId, lineId: form.lineId, supervisorUid: form.supervisorUid, quantity: Number(form.quantity), slots: plan.slots });
        sessionStorage.removeItem(`cycle-draft:${auth.currentUser?.uid}`);
        navigate(`/work-orders/${orderId}?cycle=2`);
      } catch (reason) { setActionError((reason as Error).message); } finally { locked.current = false; setSaving(false); }
    }}>
      <fieldset disabled={saving} className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        <label className="space-y-2">رقم أمر الشغل<Input required value={form.workOrderNumber} onChange={e => change('workOrderNumber', e.target.value)} /></label>
        <label className="space-y-2">الكمية المطلوبة<Input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={e => change('quantity', e.target.value)} /></label>
        {(['productId', 'lineId', 'supervisorUid'] as const).map((key, i) => <label className="space-y-2" key={key}>{['المنتج', 'خط الإنتاج', 'مشرف الإنتاج'][i]}<select required className="block min-h-11 w-full rounded-md border border-input bg-background px-3" value={form[key]} onChange={e => change(key, e.target.value)}><option value="">اختر…</option>{data.directory[(['products', 'lines', 'supervisors'] as const)[i]].map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>)}
        {(['startDate', 'targetDate', 'workdayStartTime', 'workdayEndTime', 'breakStartTime', 'breakEndTime'] as const).map((key, i) => <label className="space-y-2" key={key}>{['تاريخ البداية', 'تاريخ النهاية', 'بداية العمل', 'نهاية العمل', 'بداية الراحة — اختياري', 'نهاية الراحة — اختياري'][i]}<Input required={i < 4} type={i < 2 ? 'date' : 'time'} value={form[key]} onChange={e => change(key, e.target.value)} /></label>)}
      </fieldset>
      {plan.error ? <p role="status" className="text-muted-foreground">{plan.error}</p> : <section className="rounded-lg border border-border bg-card p-4"><h2 className="font-semibold">معاينة خطة التشغيل — {plan.slots.length} فترة</h2><div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-start text-sm"><thead><tr className="border-b border-border"><th className="p-2 text-start">اليوم</th><th className="p-2 text-start">الفترة</th><th className="p-2 text-start">الهدف</th></tr></thead><tbody>{plan.slots.map(slot => <tr key={`${slot.date}-${slot.startTime}`} className="border-b border-border"><td className="p-2">{slot.date}</td><td className="p-2"><bdi>{slot.startTime}–{slot.endTime}</bdi></td><td className="p-2">{slot.targetQuantity}</td></tr>)}</tbody></table></div></section>}
      {(error || actionError) && <p role="alert" className="text-destructive">{error || actionError}</p>}
      <Button type="submit" disabled={saving || Boolean(plan.error) || Boolean(error)}>{saving ? 'جاري حفظ الأمر…' : 'حفظ التجهيز ومراجعة الاعتماد'}</Button>
    </form>
  </main>;
}
