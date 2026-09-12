import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CycleAction, CycleOrder, CycleWorkspace } from '../services/workOrderCycleService';

type Props = { order: CycleOrder; directory: CycleWorkspace['directory']; disabled: boolean; act: (action: CycleAction, payload: Record<string, unknown>) => Promise<void> };

export function CycleDraftEditor(props: Props) {
  const [editing, setEditing] = useState(false);
  return <section className="space-y-3 rounded-lg border border-border bg-card p-4"><Button variant="outline" disabled={props.disabled} onClick={() => setEditing(value => !value)}>{editing ? 'إغلاق تعديل المسودة' : 'تعديل المسودة وخطة الساعات'}</Button>{editing && <DraftForm {...props} />}</section>;
}

function DraftForm({ order, directory, disabled, act }: Props) {
  const [revision] = useState(order.cycleRevision);
  const [form, setForm] = useState({ workOrderNumber: order.workOrderNumber, productId: order.productId, lineId: order.lineId, supervisorUid: order.supervisorUid, quantity: String(order.quantity) });
  const [slots, setSlots] = useState(() => order.slots.map(({ date, startTime, endTime, targetQuantity }) => ({ date, startTime, endTime, targetQuantity: String(targetQuantity) })));
  const stale = revision !== order.cycleRevision;
  const total = slots.reduce((sum, slot) => sum + Number(slot.targetQuantity), 0);
  const invalid = !slots.length || !Number.isFinite(total) || Math.abs(total - Number(form.quantity)) > 0.001;
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (disabled || stale || invalid) return; void act('editDraft', { ...form, quantity: Number(form.quantity), expectedRevision: revision, slots: slots.map(slot => ({ ...slot, targetQuantity: Number(slot.targetQuantity) })) }); }}>
    <p className="text-sm text-muted-foreground">تُحفظ المسودة والساعات معًا مع نسخة من الخطة السابقة. تغيير الخط يلغي تكليف العمالة للأمر، وتغيير المنتج يستلزم تعريف نموذج الجودة مجددًا.</p>
    {stale && <p role="alert">تغير الأمر منذ فتح النموذج. أغلق التعديل وافتحه مجددًا لمراجعة النسخة الحالية.</p>}
    <fieldset disabled={disabled || stale} className="grid gap-3 sm:grid-cols-2">
      <label>رقم الأمر<Input required maxLength={2000} value={form.workOrderNumber} onChange={e => setForm({ ...form, workOrderNumber: e.target.value })} /></label>
      <label>الكمية المطلوبة<Input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label>
      {(['productId', 'lineId', 'supervisorUid'] as const).map((key, index) => <label key={key}>{['المنتج', 'الخط', 'المشرف'][index]}<select required className="block min-h-11 w-full rounded-md border border-input bg-background px-3" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}><option value="">اختر…</option>{directory[(['products', 'lines', 'supervisors'] as const)[index]].map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>)}
    </fieldset>
    <fieldset disabled={disabled || stale} className="space-y-3"><legend className="font-semibold">الساعات — إجمالي الأهداف: {total}</legend>
      {slots.map((slot, index) => <div key={index} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2 lg:grid-cols-5">
        {(['date', 'startTime', 'endTime', 'targetQuantity'] as const).map((key, field) => <label key={key}>{['اليوم', 'البداية', 'النهاية', 'هدف الفترة'][field]}<Input required aria-label={`${['اليوم', 'البداية', 'النهاية', 'هدف الفترة'][field]} للفترة ${index + 1}`} type={field === 0 ? 'date' : field === 3 ? 'number' : 'time'} min={field === 3 ? '0' : undefined} step={field === 3 ? '0.001' : undefined} value={slot[key]} onChange={e => setSlots(current => current.map((row, position) => position === index ? { ...row, [key]: e.target.value } : row))} /></label>)}
        <Button type="button" variant="outline" onClick={() => setSlots(current => current.filter((_, position) => position !== index))}>حذف الفترة {index + 1}</Button>
      </div>)}
      <Button type="button" variant="outline" disabled={slots.length >= 240} onClick={() => setSlots(current => [...current, { date: current.at(-1)?.date || '', startTime: '', endTime: '', targetQuantity: '0' }])}>إضافة فترة</Button>
    </fieldset>
    {invalid && <p role="status">أضف فترات واجعل مجموع أهدافها مساويًا للكمية المطلوبة.</p>}
    <Button type="submit" disabled={disabled || stale || invalid}>حفظ المسودة والخطة معًا</Button>
  </form>;
}

export function CycleSupervisorReassignment({ order, directory, disabled, act }: Props) {
  const [supervisorUid, setSupervisor] = useState(''); const [reason, setReason] = useState('');
  const [revision, setRevision] = useState(order.cycleRevision);
  const stale = revision !== order.cycleRevision;
  return <form className="space-y-3 rounded-lg border border-border bg-card p-4" onSubmit={e => { e.preventDefault(); if (disabled || stale || !reason.trim() || !supervisorUid) return; void act('reassignSupervisor', { supervisorUid, reason, expectedRevision: revision }); }}>
    <h2 className="font-semibold">إعادة إسناد مشرف الإنتاج</h2><p className="text-sm text-muted-foreground">ينتقل التعامل مع الأمر للمشرف الجديد، مع بقاء العمالة وسجل منفذي الساعات السابقة كما هو.</p>
    <fieldset disabled={disabled || stale} className="grid gap-3 sm:grid-cols-2"><label>المشرف الجديد<select required className="block min-h-11 w-full rounded-md border border-input bg-background px-3" value={supervisorUid} onChange={e => setSupervisor(e.target.value)}><option value="">اختر مشرفًا مختلفًا…</option>{directory.supervisors.filter(person => person.id !== order.supervisorUid).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>سبب إعادة الإسناد<Input required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label></fieldset>
    {stale && <div className="space-y-2"><p role="alert">تغير الأمر؛ راجع التكليف الحالي قبل إعادة الإسناد.</p><Button type="button" variant="outline" disabled={disabled} onClick={() => { setRevision(order.cycleRevision); setSupervisor(''); setReason(''); }}>مراجعة النسخة الحالية وإعادة الاختيار</Button></div>}
    <Button type="submit" disabled={disabled || stale || !supervisorUid || !reason.trim()}>تأكيد إعادة الإسناد</Button>
  </form>;
}

const actionLabels: Record<string, string> = { prepare: 'تجهيز الأمر', editDraft: 'تعديل المسودة والخطة', approve: 'اعتماد الأمر', reassignSupervisor: 'إعادة إسناد المشرف', assignInspectors: 'تكليف مراقبي الجودة', assignWorkers: 'ربط العمالة', start: 'بدء الساعة', submit: 'تسجيل الإنتاج', pause: 'تسجيل توقف', resume: 'استئناف التشغيل', defineQualityReport: 'تعريف نموذج الجودة', submitQualityReport: 'تسجيل نتائج الجودة' };
export function CycleAudit({ order }: { order: CycleOrder }) {
  return <section className="space-y-3 rounded-lg border border-border bg-card p-4"><h2 className="font-semibold">سجل إجراءات أمر الشغل</h2>{order.auditTruncated && <p role="status">يعرض آخر ١٠٠ إجراء فقط؛ السجل الأقدم محفوظ.</p>}{order.audit?.length ? <ol className="max-h-96 space-y-3 overflow-auto">{order.audit.map(event => <li key={event.id} className="space-y-1 border-b border-border pb-3"><p>{actionLabels[event.action] || event.action} — {event.actorName}</p><p className="text-sm text-muted-foreground"><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('ar-EG')}</time> • إصدار {event.revision}</p>{event.reason && <p className="text-sm">السبب: {event.reason}</p>}{event.supervisorUid && <p className="break-all text-sm">المشرف السابق: {event.previousSupervisorUid} ← الجديد: {event.supervisorUid}</p>}</li>)}</ol> : <p>لا توجد إجراءات مسجلة.</p>}</section>;
}
