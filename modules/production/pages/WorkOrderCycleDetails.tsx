import { useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { withTenantPath } from '@/lib/tenantPaths';
import { useAppStore } from '@/store/useAppStore';
import { usePrintEngine } from '@/utils/printManager';
import { useWorkOrderCycle } from '../hooks/useWorkOrderCycle';
import { workOrderCycleService, type CycleAction, type CycleOption, type CycleOrder, type CycleSlot } from '../services/workOrderCycleService';
import { cycleOrderLabels, cycleSlotLabels, productionCardPath } from '../utils/workOrderCycle';
import { WorkOrderContainerCard } from '../components/WorkOrderContainerCard';
import { QualityReportTemplateEditor, QualityReportTemplateView } from '../components/QualityReportTemplateEditor';
import { QualityInspectionPanel, ReworkAttemptPanel } from '../components/QualityInspectionPanel';
import { CycleAudit, CycleDraftEditor, CycleSupervisorReassignment } from '../components/WorkOrderCycleManagement';
import { ClosingPanel, PlanningPanel } from '../components/PlanningClosingPanel';

export function WorkOrderCycleDetails() {
  const { id = '', tenantSlug = 'lab' } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useTenantNavigate();
  const { data, error, loading, refresh } = useWorkOrderCycle(id, true);
  const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState(''); const [success, setSuccess] = useState('');
  const inFlight = useRef(false);
  const order = data?.orders[0];
  const selectedId = search.get('slot');
  const slot = order?.slots.find(row => row.id === (selectedId || order.activeSlotId)) || (!selectedId ? order?.slots[0] : undefined);
  async function act(action: CycleAction, payload: Record<string, unknown> = {}) {
    if (inFlight.current || error) return;
    inFlight.current = true; setBusy(true); setActionError(''); setSuccess('');
    try { await workOrderCycleService.mutate(id, action, payload); await refresh(); setSuccess('تم حفظ الإجراء.'); }
    catch (reason) { setActionError((reason as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (loading) return <p role="status" className="p-6">جاري تحميل تفاصيل أمر الشغل…</p>;
  if (!data || !order) return <div className="space-y-4 p-6"><p role="alert">{error || 'الأمر غير متاح في نطاقك.'}</p><Button onClick={() => void refresh()}>إعادة المحاولة</Button></div>;
  const canExecute = data.permissions['workOrders.execute'] && order.supervisorUid === data.uid;
  const canSeeQualityPanel = Boolean(canExecute || data.permissions['workOrders.inspect'] || data.permissions['workOrders.assignInspectors'] || data.permissions['productionHandover.approve']);
  const canSeeAudit = Boolean(data.permissions['workOrders.approve'] || data.permissions['workOrders.assignInspectors']);
  const docId = search.get('document');
  const badDocument = Boolean(docId && (!slot || docId !== slot.productionDocumentId));
  const selectedValid = slot && !badDocument;
  return <main dir="rtl" className="space-y-5 p-4 text-foreground sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><Button variant="ghost" onClick={() => navigate('/work-orders')}>العودة لأوامر الشغل</Button><h1 className="mt-2 text-2xl font-semibold">{order.workOrderNumber}</h1><p className="mt-2 text-muted-foreground">{order.productName} • {order.lineName} • المشرف: {order.supervisorName}</p></div><Button variant="outline" disabled={busy} onClick={() => void refresh()}>تحديث الحالة</Button></header>
    <section className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 lg:grid-cols-4" aria-label="ملخص أمر الشغل">
      <div><p className="text-sm text-muted-foreground">حالة الإنتاج</p><strong>{cycleOrderLabels[order.productionStatus]}</strong></div>
      <div><p className="text-sm text-muted-foreground">الكمية المطلوبة</p><strong>{order.quantity}</strong></div>
      <div><p className="text-sm text-muted-foreground">المنتج المسجل</p><strong>{order.producedQuantity}</strong></div>
      <div><p className="text-sm text-muted-foreground">المقبول المعتمد المحقق للهدف</p><strong>{order.approvedAcceptedQuantity}</strong></div>
    </section>
    {error && <p role="alert" className="text-destructive">{error} الإجراءات معطلة حتى تحديث البيانات.</p>}
    {actionError && <p role="alert" className="text-destructive">{actionError} يمكن إعادة المحاولة بنفس البيانات بأمان.</p>}
    {success && <p role="status" className="text-sm">{success}</p>}
    <PlanningPanel order={order} canManage={Boolean(data.permissions['workOrders.approve'])} disabled={busy || Boolean(error)} act={act} />
    <ClosingPanel order={order} canClose={Boolean(data.permissions['workOrders.approve'])} disabled={busy || Boolean(error)} act={act} />
    <QualityLockPanel order={order} canManage={Boolean(data.permissions['workOrders.assignInspectors'])} disabled={busy || Boolean(error)} act={act} />
    {order.productionStatus === 'draft' && <section className="space-y-3 rounded-lg border border-border bg-card p-4"><h2 className="font-semibold">مراجعة واعتماد مدير الإنتاج</h2><p className="text-sm text-muted-foreground">راجع المنتج والخط والمشرف والكمية وجدول الساعات بالأسفل. لن يبدأ المشرف قبل الاعتماد.</p>{data.permissions['workOrders.approve'] ? <Button disabled={busy || Boolean(error)} onClick={() => void act('approve')}>اعتماد أمر الشغل</Button> : <p>بانتظار اعتماد مدير الإنتاج.</p>}</section>}
    {data.permissions['workOrders.assignInspectors'] && <Assignment key={`inspectors-${id}`} title="توزيع مراقبي الجودة على الخط" options={data.directory.inspectors} initial={order.inspectorUids} disabled={busy || Boolean(error)} onSave={ids => act('assignInspectors', { inspectorUids: ids })} />}
    {data.permissions['workOrders.assignInspectors'] && (order.productionStatus === 'draft' || order.productionStatus === 'approved')
      ? <QualityReportTemplateEditor key={`quality-${id}`} initialTemplate={order.qualityReportTemplate} disabled={busy || Boolean(error)} onSave={template => act('defineQualityReport', { qualityReportTemplate: template })} productId={order.productId} lineId={order.lineId} productName={order.productName} lineName={order.lineName} />
      : Boolean(order.qualityReportTemplate?.length) && <QualityReportTemplateView key={`quality-view-${id}`} template={order.qualityReportTemplate!} />}
    {order.productionStatus === 'draft' && data.permissions['workOrders.create'] && <CycleDraftEditor key={id} order={order} directory={data.directory} disabled={busy || Boolean(error)} act={act} />}
    {data.permissions['workOrders.approve'] && <CycleSupervisorReassignment key={`${id}-${order.supervisorUid}`} order={order} directory={data.directory} disabled={busy || Boolean(error)} act={act} />}
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <article className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6">
        {!selectedValid ? <p role="alert">الساعة أو مستند QR غير صالح. اختر ساعة من الجدول.</p> : <>
          <header className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">{slot.date} • <bdi>{slot.startTime}–{slot.endTime}</bdi></h2><span>{cycleSlotLabels[slot.status]}</span></header>
          <p className="break-all text-sm text-muted-foreground">الحاوية: {slot.containerId} • الهدف المخطط: {slot.targetQuantity} وحدة</p>
          {Boolean(slot.workersSnapshot?.length) && <p className="text-sm">العمالة الفعلية عند البداية ({slot.workersSnapshotCount}): {slot.workersSnapshot!.map(worker => worker.name).join('، ')}</p>}
          {!slot.workersSnapshot?.length && Boolean(slot.workersSnapshotCount) && <p className="text-sm">عدد العمالة عند البداية: {slot.workersSnapshotCount} (بدون أسماء).</p>}
          {slot.status === 'planned' && canExecute && order.productionStatus !== 'draft' && <>
            {data.directory.workers.length > 0
              ? <Assignment key={`workers-${id}`} title="العمالة الفعلية على الخط" options={data.directory.workers} initial={order.workerIds} disabled={busy || Boolean(error)} onSave={ids => act('assignWorkers', { workerIds: ids })} />
              : <WorkerCountInput key={`worker-count-${id}`} initial={order.workerCount} disabled={busy || Boolean(error)} onSave={count => act('assignWorkers', { workerCount: count })} />}
            <p className="text-sm text-muted-foreground">
              {order.workerIds.length
                ? `المحفوظ حاليًا: ${order.workerIds.length} عامل. تُحفظ أسماؤهم تاريخيًا عند بدء الساعة.`
                : order.workerCount
                  ? `المحفوظ حاليًا: ${order.workerCount} عامل (بدون أسماء — الخط غير مربوط بعمالة دائمة في "ربط العمالة الدائم").`
                  : 'لا يوجد تكليف عمالة محفوظ بعد.'}
            </p>
            <Button disabled={busy || Boolean(error) || Boolean(order.qualityHold) || Boolean(order.activeSlotId) || !(order.workerIds.length || order.workerCount) || order.slots.find(row => row.status === 'planned')?.id !== slot.id} onClick={() => void act('start', { slotId: slot.id })}>بدء هذه الساعة</Button>
            {order.activeSlotId && <p className="text-sm">يجب حسم الساعة الجارية أولًا.</p>}
          </>}
          {canExecute && (slot.status === 'open' || slot.status === 'paused') && <ProductionActions key={`${id}-${slot.id}-${slot.status}`} slot={slot} disabled={busy || Boolean(error) || Boolean(order.qualityHold)} act={act} />}
          {(slot.status === 'quality_pending' || slot.status === 'quality_accepted') && canSeeQualityPanel && <>
            <p className="text-sm">تم تسجيل {slot.actualQuantity} وحدة، منها {slot.rejectedQuantity} مرفوض مبدئي. {slot.status === 'quality_pending' ? 'الكمية لا تُحسب مقبولًا معتمدًا ولا تتاح للتغليف بعد.' : 'اعتمد مدير الجودة نتيجة الفحص لهذه الحاوية.'}</p>
            {slot.productionNotes && <p className="text-sm">ملاحظات الإنتاج: {slot.productionNotes}</p>}
            <QualityInspectionPanel key={`${id}-${slot.id}`} order={order} slot={slot} uid={data.uid} canInspect={Boolean(data.permissions['workOrders.inspect'])} canManage={Boolean(data.permissions['workOrders.assignInspectors'])} canPackage={Boolean(data.permissions['productionHandover.approve'])} disabled={busy || Boolean(error)} act={act} />
            {slot.productionDocumentId && <ContainerPrint order={order} slot={slot} tenantSlug={tenantSlug} canPrint={Boolean(canExecute)} disabled={busy || Boolean(error)} />}
          </>}
          {canSeeQualityPanel && slot.reworkAttempts?.map(attempt => (
            <ReworkAttemptPanel
              key={`${id}-${slot.id}-${attempt.id}`}
              order={order}
              slot={slot}
              attempt={attempt}
              uid={data.uid}
              canExecute={canExecute}
              canInspect={Boolean(data.permissions['workOrders.inspect'])}
              canManage={Boolean(data.permissions['workOrders.assignInspectors'])}
              canPackage={Boolean(data.permissions['productionHandover.approve'])}
              disabled={busy || Boolean(error) || Boolean(order.qualityHold)}
              act={act}
            />
          ))}
        </>}
      </article>
      <aside className="min-w-0 rounded-lg border border-border bg-card p-4" aria-label="جدول الساعات"><h2 className="mb-3 font-semibold">خطة الأيام والساعات</h2><ol className="max-h-[70vh] space-y-2 overflow-auto">{order.slots.map(row => <li key={row.id}><button type="button" aria-current={slot?.id === row.id ? 'step' : undefined} disabled={busy} onClick={() => { setActionError(''); setSuccess(''); setSearch({ cycle: '2', slot: row.id }); }} className={`min-h-11 w-full rounded-md border p-3 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${slot?.id === row.id ? 'border-primary bg-muted' : 'border-border'}`}><span className="block text-sm">{row.date} • <bdi>{row.startTime}–{row.endTime}</bdi></span><span className="mt-1 block text-sm text-muted-foreground">{cycleSlotLabels[row.status]} • {row.actualQuantity ?? row.targetQuantity} وحدة</span></button></li>)}</ol></aside>
    </div>
    {canSeeAudit && <CycleAudit order={order} />}
  </main>;
}

function QualityLockPanel({ order, canManage, disabled, act }: { order: CycleOrder; canManage: boolean; disabled: boolean; act: (action: CycleAction, payload?: Record<string, unknown>) => Promise<void> }) {
  const [lockReason, setLockReason] = useState('');
  const [unlockReason, setUnlockReason] = useState('');
  if (!order.qualityHold) {
    if (!canManage) return null;
    return <fieldset disabled={disabled} className="space-y-2 rounded-md border border-border p-4"><legend className="px-2 font-semibold">قفل الجودة</legend><label>سبب القفل<Input value={lockReason} maxLength={2000} onChange={e => setLockReason(e.target.value)} /></label><Button variant="outline" disabled={disabled || !lockReason.trim()} onClick={() => void act('lockQuality', { reason: lockReason }).then(() => setLockReason(''))}>قفل تشغيل الأمر</Button><p className="text-xs text-muted-foreground">يوقف الساعة الجارية فورًا (إن وجدت) ويمنع بدء التالية حتى فك القفل.</p></fieldset>;
  }
  return <div role="alert" className="space-y-3 rounded-md border border-destructive p-4">
    <p className="font-semibold">التشغيل مقفول بقرار الجودة{order.qualityHoldByName ? ` — بواسطة ${order.qualityHoldByName}` : ''}.</p>
    <p className="text-sm">السبب: {order.qualityHoldReason}</p>
    <p className="text-sm">لا يمكن بدء ساعة أو إرسال إنتاج أو استئناف حتى فك القفل.</p>
    {canManage && <div className="space-y-2 border-t border-destructive/40 pt-3"><label>ملاحظة فك القفل (اختياري)<Input disabled={disabled} value={unlockReason} maxLength={2000} onChange={e => setUnlockReason(e.target.value)} /></label><Button disabled={disabled} onClick={() => void act('unlockQuality', { reason: unlockReason }).then(() => setUnlockReason(''))}>فك القفل</Button><p className="text-xs text-muted-foreground">يستأنف الساعة تلقائيًا فقط إذا لم يوجد توقف مستقل عنها.</p></div>}
  </div>;
}

function WorkerCountInput({ initial, disabled, onSave }: { initial?: number; disabled: boolean; onSave: (count: number) => Promise<void> }) {
  const [value, setValue] = useState(initial ? String(initial) : '');
  const count = Number(value);
  const valid = value !== '' && Number.isInteger(count) && count > 0;
  return <fieldset disabled={disabled} className="space-y-3 rounded-md border border-border p-4">
    <legend className="px-2 font-semibold">عدد العمالة على الخط</legend>
    <p className="text-sm">هذا الخط غير مربوط بعمالة دائمة في "ربط العمالة الدائم"؛ أدخل عدد العمالة بدلًا من الأسماء.</p>
    <label>عدد العمالة<Input type="number" min="1" step="1" value={value} onChange={e => setValue(e.target.value)} /></label>
    <Button variant="outline" disabled={disabled || !valid} onClick={() => void onSave(count)}>حفظ عدد العمالة</Button>
  </fieldset>;
}

function Assignment({ title, options, initial, disabled, onSave }: { title: string; options: CycleOption[]; initial: string[]; disabled: boolean; onSave: (ids: string[]) => Promise<void> }) {
  const [selected, setSelected] = useState(initial);
  const available = new Set(options.map(option => option.id));
  const validSelected = selected.filter(id => available.has(id));
  return <fieldset disabled={disabled} className="space-y-3 rounded-md border border-border p-4"><legend className="px-2 font-semibold">{title}</legend>{options.length ? <div className="grid max-h-60 gap-2 overflow-auto sm:grid-cols-2">{options.map(option => <label key={option.id} className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3"><input type="checkbox" checked={selected.includes(option.id)} onChange={e => setSelected(current => e.target.checked ? [...current, option.id] : current.filter(id => id !== option.id))} /><span>{option.name}</span></label>)}</div> : <p className="text-sm">لا توجد أسماء متاحة للتكليف؛ راجع المستخدمين والصلاحيات.</p>}{validSelected.length !== selected.length && <p className="text-sm">هناك أسماء لم تعد متاحة للتكليف؛ حفظ الاختيار يستبعدها من التكليف الجديد دون تغيير الساعات السابقة.</p>}<Button variant="outline" disabled={disabled || !validSelected.length} onClick={() => void onSave(validSelected)}>حفظ التكليف</Button></fieldset>;
}

function ProductionActions({ slot, disabled, act }: { slot: CycleSlot; disabled: boolean; act: (action: CycleAction, payload: Record<string, unknown>) => Promise<void> }) {
  const [actual, setActual] = useState(''); const [rejected, setRejected] = useState('0'); const [notes, setNotes] = useState(''); const [reason, setReason] = useState('');
  if (slot.status === 'paused') return <div className="space-y-3"><p>سبب التوقف: {slot.pauseReason}</p><Button disabled={disabled} onClick={() => void act('resume', { slotId: slot.id })}>استئناف الساعة</Button></div>;
  return <div className="space-y-5"><form className="space-y-3" onSubmit={e => { e.preventDefault(); if (actual === '' || rejected === '' || Number(rejected) > Number(actual)) return; void act('submit', { slotId: slot.id, actualQuantity: Number(actual), rejectedQuantity: Number(rejected), notes }); }}>
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2"><label>الكمية المنتجة<Input required type="number" min="0" step="0.001" showZero value={actual} onChange={e => setActual(e.target.value)} /></label><label>المرفوض المبدئي<Input required type="number" min="0" max={actual || undefined} step="0.001" showZero value={rejected} onChange={e => setRejected(e.target.value)} /></label><label className="sm:col-span-2">ملاحظات الإنتاج<Input maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label></fieldset>
    <p className="text-sm text-muted-foreground">بتأكيد التسجيل تُسلّم الحاوية لفحص الجودة، ويمكن بدء الساعة التالية ما لم يوجد قفل.</p><Button type="submit" disabled={disabled || actual === '' || rejected === '' || Number(rejected) > Number(actual)}>تأكيد تسجيل إنتاج الساعة</Button>
  </form><div className="space-y-3 border-t border-border pt-4"><label>سبب التوقف<Input disabled={disabled} value={reason} maxLength={2000} onChange={e => setReason(e.target.value)} /></label><Button variant="outline" disabled={disabled || !reason.trim()} onClick={() => void act('pause', { slotId: slot.id, reason })}>تسجيل توقف</Button></div></div>;
}

function ContainerPrint({ order, slot, tenantSlug, canPrint, disabled }: { order: CycleOrder; slot: CycleSlot; tenantSlug: string; canPrint: boolean; disabled: boolean }) {
  const print = usePrintEngine();
  const settings = useAppStore(state => state.systemSettings);
  const [preview, setPreview] = useState(false);
  const url = new URL(withTenantPath(tenantSlug, productionCardPath(order, slot)), window.location.origin).href;
  const card = <WorkOrderContainerCard order={order} slot={slot} url={url} companyName={settings?.branding?.factoryName || 'المصنع'} timezone={settings?.branding?.timezone || 'Africa/Cairo'} />;
  return <div className="space-y-3"><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled} onClick={() => setPreview(value => !value)}>معاينة بطاقة الحاوية</Button>{canPrint && <Button disabled={disabled} onClick={() => print.printDocument({ documentTitle: slot.productionDocumentId, render: ref => <div ref={ref}>{card}</div> })}>طباعة بطاقة الإنتاج</Button>}</div>{preview && <div className="overflow-hidden rounded-md border border-border">{card}</div>}<p className="text-xs text-muted-foreground">بطاقة إنتاج، وليست تقرير جودة معتمدًا. في المختبر يُفتح QR من نفس جهاز التشغيل؛ رابط localhost لا يعمل من هاتف آخر.</p></div>;
}
