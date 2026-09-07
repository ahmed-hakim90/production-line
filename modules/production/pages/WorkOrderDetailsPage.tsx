import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Check, ChevronLeft, Clock3, Factory, PackageCheck, Pause, Play, ShieldCheck, Users } from 'lucide-react';

import type { WorkOrder, WorkOrderHourlySlot } from '../../../types';
import { useTenantNavigate } from '../../../lib/useTenantNavigate';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { Button } from '../components/UI';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { isOperationPathEnabled, WORK_ORDER_OPERATION_KEYS, WORK_ORDER_UPDATE_PATHS } from '../../system/lib/operationPathSettings';
import { employeeService } from '../../hr/employeeService';
import { lineService } from '../services/lineService';
import { productService } from '../services/productService';
import { workOrderService } from '../services/workOrderService';
import { canCompleteHourlyWorkOrder, summarizeHourlySlotsByDay } from '../utils/workOrderHourlySlots';
import { cn } from '@/lib/utils';

const numbers = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const statusLabel: Record<WorkOrderHourlySlot['status'], string> = {
  planned: 'لم تبدأ', open: 'الإنتاج مفتوح', paused: 'متوقفة مؤقتًا', production_submitted: 'تم تسليم الإنتاج',
  quality_pending: 'بانتظار الجودة', quality_accepted: 'مقبولة من الجودة',
  quality_rejected: 'مرفوضة من الجودة', packaging: 'قيد التغليف', finished: 'مكتملة',
};
const workOrderStatusLabel: Record<WorkOrder['status'], string> = {
  pending: 'لم يبدأ', in_progress: 'قيد التنفيذ', paused: 'متوقف', completed: 'مكتمل', cancelled: 'ملغي',
};

export function WorkOrderDetailsPage() {
  const { id = '' } = useParams();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const systemSettings = useAppStore((state) => state.systemSettings);
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [names, setNames] = useState({ product: '—', line: '—', supervisor: '—' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState('');
  const [productionDraft, setProductionDraft] = useState({ actual: '', rejected: '0', notes: '' });
  const [qualityDraft, setQualityDraft] = useState({ accepted: '', rejected: '', notes: '' });
  const [packagingDraft, setPackagingDraft] = useState({ packed: '', rejected: '0', notes: '' });
  const [pauseReason, setPauseReason] = useState('');

  const applyLoadedOrder = (row: WorkOrder) => {
    setOrder(row);
    setSelectedSlotId((current) => current || row.hourlySlots?.find((slot) => !['finished', 'quality_rejected'].includes(slot.status))?.id || row.hourlySlots?.[0]?.id || '');
  };
  const reloadOrder = async () => {
    const row = await workOrderService.getById(id);
    if (!row) throw new Error('أمر الشغل غير موجود أو لا تملك صلاحية عرضه.');
    applyLoadedOrder(row);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void workOrderService.getById(id).then(async (row) => {
      if (!row) throw new Error('أمر الشغل غير موجود أو لا تملك صلاحية عرضه.');
      const [product, line, supervisor] = await Promise.all([productService.getById(row.productId), lineService.getById(row.lineId), employeeService.getById(row.supervisorId)]);
      if (!active) return;
      applyLoadedOrder(row);
      setNames({ product: product?.name || '—', line: line?.name || '—', supervisor: supervisor?.name || '—' });
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'تعذر تحميل أمر الشغل.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const slots = order?.hourlySlots || [];
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) || slots[0];
  const firstPlannedSlotId = slots.find((slot) => slot.status === 'planned')?.id;
  const produced = useMemo(() => slots.reduce((sum, slot) => sum + Number(slot.actualQuantity || 0), 0), [slots]);
  const accepted = useMemo(() => slots.reduce((sum, slot) => sum + Number(slot.qualityAcceptedQuantity || 0), 0), [slots]);
  const rejected = useMemo(() => slots.reduce((sum, slot) => sum + Number(slot.qualityRejectedQuantity ?? slot.rejectedQuantity ?? 0) + Number(slot.packagingRejectedQuantity ?? 0), 0), [slots]);
  const dailySummaries = useMemo(() => summarizeHourlySlotsByDay(slots), [slots]);
  const readyToComplete = canCompleteHourlyWorkOrder(slots);
  const progress = order?.quantity ? Math.min(100, Math.round((accepted / order.quantity) * 100)) : 0;
  const canExecute = can('workOrders.edit') && isOperationPathEnabled(systemSettings, WORK_ORDER_OPERATION_KEYS.update, WORK_ORDER_UPDATE_PATHS.workOrdersPageStatus);
  const canReviewQuality = can('quality.finalInspection.inspect') && isOperationPathEnabled(systemSettings, WORK_ORDER_OPERATION_KEYS.update, WORK_ORDER_UPDATE_PATHS.qualityFinalInspection);
  const canHandlePackaging = can('productionHandover.approve');

  const runAction = async (action: () => Promise<void>) => {
    setUpdating(true); setActionError('');
    try { await action(); await reloadOrder(); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'تعذر تنفيذ الإجراء.'); }
    finally { setUpdating(false); }
  };

  if (loading) return <PageContentSkeleton variant="dashboard" />;
  if (error || !order) return <div className="mx-auto max-w-3xl space-y-4 p-8 text-center"><h1 className="text-lg font-semibold">تعذر عرض تفاصيل أمر الشغل</h1><p className="text-sm text-[var(--color-text-2)]">{error}</p><Button onClick={() => navigate('/work-orders')}>العودة لأوامر الشغل</Button></div>;

  const stageIndex = !selectedSlot ? 0 : selectedSlot.status === 'planned' || selectedSlot.status === 'open' || selectedSlot.status === 'paused' ? 0 : selectedSlot.status === 'quality_pending' || selectedSlot.status === 'quality_accepted' || selectedSlot.status === 'quality_rejected' ? 1 : selectedSlot.status === 'packaging' ? 2 : 3;

  return <main className="mx-auto max-w-[1500px] space-y-4 p-3 sm:p-5" aria-label="تفاصيل أمر الشغل الكاملة">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => navigate('/work-orders')} aria-label="العودة لأوامر الشغل"><ChevronLeft className="h-5 w-5" /></Button><div><h1 className="text-xl font-semibold text-[var(--color-text-1)]">خط زمني تشغيلي</h1><p className="text-sm text-[var(--color-text-2)]">متابعة تقدم أمر الشغل على مدار الساعات</p></div></div>
      <div className="text-end"><p className="text-xs text-[var(--color-text-2)]">أمر شغل</p><p className="text-xl font-semibold" dir="ltr">{order.workOrderNumber}</p></div>
    </header>

    <section className="grid gap-x-8 gap-y-3 border-y border-[var(--color-border-ui)] py-4 sm:grid-cols-3 xl:grid-cols-6">
      {[['الصنف', names.product], ['خط الإنتاج', names.line], ['المشرف', names.supervisor], ['تاريخ البدء', order.startDate || '—'], ['الانتهاء المخطط', order.targetDate || '—'], ['حالة أمر الشغل', workOrderStatusLabel[order.status]]].map(([label, value]) => <div key={label}><p className="text-xs text-[var(--color-text-2)]">{label}</p><p className="mt-1 text-sm font-medium text-[var(--color-text-1)]">{value}</p></div>)}
    </section>

    <section className="grid grid-cols-2 items-center gap-5 rounded-md border border-[var(--color-border-ui)] px-4 py-3 xl:grid-cols-4">
      <div><div className="mb-2 flex items-center justify-between text-sm"><span>التقدم الكلي</span><strong className="text-[var(--color-primary)]">{numbers.format(progress)}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-[var(--color-page-bg)]"><div className="h-full bg-[var(--color-primary)]" style={{ width: `${progress}%` }} /></div></div>
      {[['المنتج حتى الآن', produced], ['المقبول', accepted], ['الكمية المطلوبة', order.quantity]].map(([label, value]) => <div key={String(label)} className="min-w-28 border-s border-[var(--color-border-ui)] ps-5"><p className="text-xs text-[var(--color-text-2)]">{label}</p><p className="text-lg font-semibold">{numbers.format(Number(value))}</p></div>)}
    </section>

    {!slots.length ? <section className="rounded-md border border-dashed border-[var(--color-border-ui)] p-10 text-center text-sm text-[var(--color-text-2)]">هذا أمر قديم ولا يحتوي على خطة ساعات. افتح تعديل الأمر واحفظه لإنشاء الخطة.</section> : <section className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <aside className="order-2 overflow-hidden rounded-md border border-[var(--color-border-ui)] bg-[var(--color-card-bg)]" aria-label="ساعات أمر الشغل">
        <div className="flex items-center justify-between border-b border-[var(--color-border-ui)] px-4 py-3"><h2 className="font-medium">الساعات</h2><span className="text-xs text-[var(--color-text-2)]">{slots.length} دفعات</span></div>
        <div className="max-h-[620px] overflow-y-auto">{slots.map((slot, index) => { const done = slot.status === 'finished'; return <button key={slot.id} type="button" onClick={() => { setSelectedSlotId(slot.id); setActionError(''); }} className={cn('grid w-full grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-[var(--color-border-ui)] px-3 py-3 text-start transition-colors', selectedSlot?.id === slot.id ? 'bg-[hsl(var(--primary)/0.07)] ring-1 ring-inset ring-[var(--color-primary)]' : 'hover:bg-[var(--color-page-bg)]')}><span className={cn('grid h-7 w-7 place-items-center rounded-full border text-xs', done ? 'border-[var(--color-success)] bg-[var(--color-success)] text-white' : selectedSlot?.id === slot.id ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-[var(--color-border-ui)] text-[var(--color-text-2)]')}>{done ? <Check className="h-4 w-4" /> : index + 1}</span><span><strong className="block text-sm" dir="ltr">{slot.startTime} – {slot.endTime}</strong><span className="text-xs text-[var(--color-text-2)]">{slot.date}</span></span><span className={cn('text-xs', done ? 'text-[var(--color-success)]' : selectedSlot?.id === slot.id ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-2)]')}>{statusLabel[slot.status]}</span></button>; })}</div>
      </aside>

      {selectedSlot ? <article className="order-1 overflow-hidden rounded-md border border-[var(--color-border-ui)] bg-[var(--color-card-bg)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border-ui)] px-5 py-4"><div><p className="text-xs text-[var(--color-text-2)]">الساعة المحددة</p><h2 className="mt-1 text-2xl font-semibold" dir="ltr">{selectedSlot.startTime} – {selectedSlot.endTime}</h2></div><div className="text-end"><p className="text-sm font-medium text-[var(--color-primary)]">{statusLabel[selectedSlot.status]}</p><p className="text-xs text-[var(--color-text-2)]">هدف الساعة {numbers.format(selectedSlot.targetQuantity)} وحدة</p></div></div>
        <div className="grid grid-cols-4 border-b border-[var(--color-border-ui)] px-4 py-5">{[{ label: 'الإنتاج', icon: Factory }, { label: 'الجودة', icon: ShieldCheck }, { label: 'التغليف', icon: Box }, { label: 'إكمال', icon: PackageCheck }].map((stage, index) => <div key={stage.label} className="relative flex flex-col items-center gap-2 text-center"><span className={cn('relative z-10 grid h-10 w-10 place-items-center rounded-full border', index <= stageIndex ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'border-[var(--color-border-ui)] bg-[var(--color-card-bg)] text-[var(--color-text-2)]')}><stage.icon className="h-5 w-5" /></span><span className={cn('text-xs font-medium', index <= stageIndex ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-2)]')}>{stage.label}</span>{index < 3 ? <span className="absolute start-[60%] top-5 h-px w-[80%] bg-[var(--color-border-ui)]" aria-hidden /> : null}</div>)}</div>
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-4">{[['تم إنتاجه', selectedSlot.actualQuantity || 0], ['المقبول', selectedSlot.qualityAcceptedQuantity || 0], ['المرفوض', selectedSlot.qualityRejectedQuantity ?? selectedSlot.rejectedQuantity ?? 0], ['المتبقي من الهدف', Math.max(0, selectedSlot.targetQuantity - Number(selectedSlot.actualQuantity || 0))]].map(([label, value]) => <div key={String(label)} className="border-b border-[var(--color-border-ui)] pb-2"><p className="text-xs text-[var(--color-text-2)]">{label}</p><p className="mt-1 text-xl font-semibold">{numbers.format(Number(value))}</p></div>)}</div>
          {selectedSlot.workersSnapshotCount ? <p className="flex items-center gap-2 text-sm text-[var(--color-text-2)]"><Users className="h-4 w-4" /> لقطة العمالة: {numbers.format(selectedSlot.workersSnapshotCount)} عمال</p> : null}
          {actionError ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-[var(--color-danger)]">{actionError}</p> : null}
          {selectedSlot.status === 'planned' && canExecute ? <div className="space-y-3"><h3 className="font-medium">بدء تنفيذ الساعة</h3><p className="text-sm text-[var(--color-text-2)]">سيتم تثبيت عدد العمال الحالي وبدء الساعة. لا يمكن فتح أكثر من ساعة في نفس الوقت.</p><Button disabled={updating || selectedSlot.id !== firstPlannedSlotId} onClick={() => void runAction(() => workOrderService.openHourlySlot(order.id!, selectedSlot.id, Math.max(1, order.maxWorkers)))}><Clock3 className="h-4 w-4" />{updating ? 'جاري الفتح...' : `فتح الساعة بـ ${Math.max(1, order.maxWorkers)} عمال`}</Button></div> : null}
          {selectedSlot.status === 'open' && canExecute ? <ProductionForm draft={productionDraft} setDraft={setProductionDraft} updating={updating} onSubmit={() => void runAction(async () => { await workOrderService.submitHourlyProduction(order.id!, selectedSlot.id, { actualQuantity: Number(productionDraft.actual), rejectedQuantity: Number(productionDraft.rejected || 0), executionNotes: productionDraft.notes }); setProductionDraft({ actual: '', rejected: '0', notes: '' }); })} /> : null}
          {selectedSlot.status === 'open' && canExecute ? <div className="flex flex-wrap items-end gap-3 border-t border-[var(--color-border-ui)] pt-4"><label className="min-w-52 flex-1 space-y-1 text-sm">سبب التوقف<input className="h-10 w-full rounded-md border border-[var(--color-border-ui)] bg-transparent px-3" value={pauseReason} placeholder="مثال: ضبط الماكينة" onChange={(event) => setPauseReason(event.target.value)} /></label><Button variant="outline" disabled={updating} onClick={() => void runAction(async () => { await workOrderService.pauseHourlySlot(order.id!, selectedSlot.id, pauseReason); setPauseReason(''); })}><Pause className="h-4 w-4" /> تسجيل توقف</Button></div> : null}
          {selectedSlot.status === 'paused' && canExecute ? <div className="space-y-3 rounded-md border border-[var(--color-border-ui)] p-4"><h3 className="font-medium">الساعة متوقفة مؤقتًا</h3><p className="text-sm text-[var(--color-text-2)]">{selectedSlot.pauseReason || 'لم يُسجل سبب للتوقف.'}</p>{selectedSlot.totalPausedSeconds ? <p className="text-xs text-[var(--color-text-2)]">إجمالي التوقف السابق: {numbers.format(Math.ceil(selectedSlot.totalPausedSeconds / 60))} دقيقة</p> : null}<Button disabled={updating} onClick={() => void runAction(() => workOrderService.resumeHourlySlot(order.id!, selectedSlot.id))}><Play className="h-4 w-4" />{updating ? 'جاري الاستئناف...' : 'استئناف الإنتاج'}</Button></div> : null}
          {selectedSlot.status === 'quality_pending' && canReviewQuality ? <QualityForm slot={selectedSlot} draft={qualityDraft} setDraft={setQualityDraft} updating={updating} onSubmit={() => void runAction(() => workOrderService.reviewHourlyQuality(order.id!, selectedSlot.id, { acceptedQuantity: Number(qualityDraft.accepted || Math.max(0, Number(selectedSlot.actualQuantity || 0) - Number(selectedSlot.rejectedQuantity || 0))), rejectedQuantity: Number(qualityDraft.rejected || selectedSlot.rejectedQuantity || 0), qualityNotes: qualityDraft.notes }))} /> : null}
          {selectedSlot.status === 'quality_accepted' && canHandlePackaging ? <div className="space-y-3"><h3 className="font-medium">تسليم الدفعة للتغليف</h3><p className="text-sm text-[var(--color-text-2)]">المتاح للتغليف: {numbers.format(selectedSlot.qualityAcceptedQuantity || 0)} وحدة.</p><Button disabled={updating} onClick={() => void runAction(() => workOrderService.startHourlyPackaging(order.id!, selectedSlot.id))}>{updating ? 'جاري التسليم...' : 'بدء التغليف'}</Button></div> : null}
          {selectedSlot.status === 'packaging' && canHandlePackaging ? <PackagingForm slot={selectedSlot} draft={packagingDraft} setDraft={setPackagingDraft} updating={updating} onSubmit={() => void runAction(async () => { await workOrderService.finishHourlyPackaging(order.id!, selectedSlot.id, { packagingQuantity: Number(packagingDraft.packed || selectedSlot.qualityAcceptedQuantity || 0), rejectedQuantity: Number(packagingDraft.rejected || 0), notes: packagingDraft.notes }); setPackagingDraft({ packed: '', rejected: '0', notes: '' }); })} /> : null}
          {['quality_rejected', 'finished'].includes(selectedSlot.status) ? <div className="space-y-2"><h3 className="font-medium">ملاحظات الدفعة</h3><p className="min-h-20 rounded-md bg-[var(--color-page-bg)] p-3 text-sm text-[var(--color-text-2)]">{selectedSlot.packagingNotes || selectedSlot.qualityNotes || selectedSlot.executionNotes || 'لا توجد ملاحظات مسجلة.'}</p>{selectedSlot.status === 'finished' ? <p className="text-sm text-[var(--color-success)]">تم تغليف {numbers.format(selectedSlot.packagingQuantity || 0)} وحدة وإكمال الدفعة.</p> : null}</div> : null}
        </div>
      </article> : null}
    </section>}
    {slots.length ? <section className="overflow-hidden rounded-md border border-[var(--color-border-ui)] bg-[var(--color-card-bg)]" aria-labelledby="daily-review-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-ui)] px-4 py-3"><div><h2 id="daily-review-heading" className="font-medium">المراجعة اليومية والإقفال النهائي</h2><p className="mt-1 text-xs text-[var(--color-text-2)]">أمر الشغل يظل قيد التنفيذ بين الأيام، ويُقفل بعد اكتمال جميع الساعات.</p></div><span className={cn('text-xs font-medium', readyToComplete ? 'text-[var(--color-success)]' : 'text-[var(--color-text-2)]')}>{readyToComplete ? 'جاهز للإقفال' : `${slots.filter((slot) => !['finished', 'quality_rejected'].includes(slot.status)).length} ساعة غير مكتملة`}</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[var(--color-page-bg)] text-xs text-[var(--color-text-2)]"><tr>{['اليوم', 'الساعات', 'الهدف', 'المنتج', 'المقبول', 'المرفوض', 'المغلف', 'التوقف'].map((label) => <th key={label} className="px-4 py-3 text-start font-medium">{label}</th>)}</tr></thead><tbody>{dailySummaries.map((day) => <tr key={day.date} className="border-t border-[var(--color-border-ui)]"><td className="px-4 py-3 font-medium" dir="ltr">{day.date}</td><td className="px-4 py-3">{numbers.format(day.completedSlots)}/{numbers.format(day.totalSlots)}</td><td className="px-4 py-3">{numbers.format(day.targetQuantity)}</td><td className="px-4 py-3">{numbers.format(day.producedQuantity)}</td><td className="px-4 py-3">{numbers.format(day.acceptedQuantity)}</td><td className="px-4 py-3">{numbers.format(day.rejectedQuantity)}</td><td className="px-4 py-3">{numbers.format(day.packagedQuantity)}</td><td className="px-4 py-3">{numbers.format(Math.ceil(day.pausedSeconds / 60))} د</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-ui)] px-4 py-4"><p className="max-w-2xl text-xs text-[var(--color-text-2)]">الإقفال يحفظ ملخص الأيام ويُنهي أمر الشغل فقط؛ لا يرحّل مخزونًا ولا ينشئ تقرير إنتاج في هذه المرحلة المحلية.</p>{order.status === 'completed' ? <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-success)]"><Check className="h-4 w-4" /> أمر الشغل مكتمل</span> : canExecute ? <Button disabled={updating || !readyToComplete} onClick={() => void runAction(() => workOrderService.completeHourlyWorkOrder(order.id!))}><PackageCheck className="h-4 w-4" />{updating ? 'جاري الإقفال...' : 'مراجعة وإقفال أمر الشغل'}</Button> : null}</div>
    </section> : null}
    <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-2)]"><span>المرفوض الكلي: {numbers.format(rejected)} وحدة</span><span>جميع الأوقات حسب إعدادات أمر الشغل</span></footer>
  </main>;
}

function ProductionForm({ draft, setDraft, updating, onSubmit }: { draft: { actual: string; rejected: string; notes: string }; setDraft: React.Dispatch<React.SetStateAction<{ actual: string; rejected: string; notes: string }>>; updating: boolean; onSubmit: () => void }) {
  return <div className="space-y-3"><h3 className="font-medium">تسجيل إنتاج الساعة</h3><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">الإنتاج الفعلي<input type="number" min="0" className="h-10 w-full rounded-md border border-[var(--color-border-ui)] bg-transparent px-3" value={draft.actual} onChange={(e) => setDraft((value) => ({ ...value, actual: e.target.value }))} /></label><label className="space-y-1 text-sm">المرفوض مبدئيًا<input type="number" min="0" className="h-10 w-full rounded-md border border-[var(--color-border-ui)] bg-transparent px-3" value={draft.rejected} onChange={(e) => setDraft((value) => ({ ...value, rejected: e.target.value }))} /></label><label className="space-y-1 text-sm sm:col-span-2">ملاحظات التشغيل<textarea className="min-h-24 w-full rounded-md border border-[var(--color-border-ui)] bg-transparent px-3 py-2" value={draft.notes} onChange={(e) => setDraft((value) => ({ ...value, notes: e.target.value }))} /></label></div><Button disabled={updating || draft.actual === ''} onClick={onSubmit}>{updating ? 'جاري التسليم...' : 'تسليم الساعة للجودة'}</Button></div>;
}

function QualityForm({ slot, draft, setDraft, updating, onSubmit }: { slot: WorkOrderHourlySlot; draft: { accepted: string; rejected: string; notes: string }; setDraft: React.Dispatch<React.SetStateAction<{ accepted: string; rejected: string; notes: string }>>; updating: boolean; onSubmit: () => void }) {
  return <div className="space-y-3"><h3 className="font-medium">فحص جودة الساعة</h3><p className="text-sm text-[var(--color-text-2)]">المجموع يجب أن يساوي {numbers.format(slot.actualQuantity || 0)} وحدة.</p><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">المقبول<input type="number" min="0" className="h-10 w-full rounded-md border border-[var(--color-border-ui)] bg-transparent px-3" value={draft.accepted} placeholder={String(Math.max(0, Number(slot.actualQuantity || 0) - Number(slot.rejectedQuantity || 0)))} onChange={(e) => setDraft((value) => ({ ...value, accepted: e.target.value }))} /></label><label className="space-y-1 text-sm">المرفوض من الجودة<input type="number" min="0" className="h-10 w-full rounded-md border border-[var(--color-border-ui)] bg-transparent px-3" value={draft.rejected} placeholder={String(slot.rejectedQuantity || 0)} onChange={(e) => setDraft((value) => ({ ...value, rejected: e.target.value }))} /></label><label className="space-y-1 text-sm sm:col-span-2">ملاحظة الجودة<textarea className="min-h-24 w-full rounded-md border border-[var(--color-border-ui)] bg-transparent px-3 py-2" value={draft.notes} onChange={(e) => setDraft((value) => ({ ...value, notes: e.target.value }))} /></label></div><Button disabled={updating} onClick={onSubmit}>{updating ? 'جاري الاعتماد...' : 'اعتماد نتيجة الجودة'}</Button></div>;
}

function PackagingForm({ slot, draft, setDraft, updating, onSubmit }: { slot: WorkOrderHourlySlot; draft: { packed: string; rejected: string; notes: string }; setDraft: React.Dispatch<React.SetStateAction<{ packed: string; rejected: string; notes: string }>>; updating: boolean; onSubmit: () => void }) {
  return <div className="space-y-3"><h3 className="font-medium">إقفال التغليف</h3><p className="text-sm text-[var(--color-text-2)]">المجموع يجب أن يساوي {numbers.format(slot.qualityAcceptedQuantity || 0)} وحدة مقبولة.</p><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">تم تغليفه<input type="number" min="0" className="h-10 w-full rounded-md border border-[var(--color-border-ui)] bg-transparent px-3" value={draft.packed} placeholder={String(slot.qualityAcceptedQuantity || 0)} onChange={(e) => setDraft((value) => ({ ...value, packed: e.target.value }))} /></label><label className="space-y-1 text-sm">مرفوض بالتغليف<input type="number" min="0" className="h-10 w-full rounded-md border border-[var(--color-border-ui)] bg-transparent px-3" value={draft.rejected} onChange={(e) => setDraft((value) => ({ ...value, rejected: e.target.value }))} /></label><label className="space-y-1 text-sm sm:col-span-2">ملاحظات التغليف<textarea className="min-h-24 w-full rounded-md border border-[var(--color-border-ui)] bg-transparent px-3 py-2" value={draft.notes} onChange={(e) => setDraft((value) => ({ ...value, notes: e.target.value }))} /></label></div><Button disabled={updating} onClick={onSubmit}>{updating ? 'جاري الإقفال...' : 'إكمال الدفعة'}</Button></div>;
}
