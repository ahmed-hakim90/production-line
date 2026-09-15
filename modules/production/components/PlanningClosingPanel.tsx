import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CycleAction, CycleOrder } from '../services/workOrderCycleService';
import { planBasisLabels, planningSummary } from '../utils/workOrderCycle';

export function PlanningPanel({ order, canManage, disabled, act }: { order: CycleOrder; canManage: boolean; disabled: boolean; act: (action: CycleAction, payload?: Record<string, unknown>) => Promise<void> }) {
  if (!canManage || !['approved', 'in_progress'].includes(order.productionStatus)) return null;
  const summary = planningSummary(order);
  const latest = order.planRevisions?.[0];
  return <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="التخطيط">
    <h2 className="font-semibold">التخطيط</h2>
    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><p className="text-muted-foreground">الهدف</p><strong>{summary.target}</strong></div>
      <div><p className="text-muted-foreground">المقبول المعتمد (تحقيق الهدف)</p><strong>{summary.achieved}</strong></div>
      <div><p className="text-muted-foreground">بانتظار الجودة</p><strong>{summary.pendingQuality}</strong></div>
      <div><p className="text-muted-foreground">بانتظار إعادة التشغيل</p><strong>{summary.pendingRework}</strong></div>
    </div>
    <p className="text-sm text-muted-foreground">المتبقي لتوزيعه على الساعات المستقبلية: {summary.remainingToTarget}</p>
    <Button variant="outline" disabled={disabled} onClick={() => void act('proposePlanRevision')}>اقتراح توزيع جديد للساعات المستقبلية</Button>
    {latest?.status === 'proposed' && <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm">اقتراح بواسطة {latest.proposedByName} — {new Date(latest.proposedAt).toLocaleString('ar-EG')}</p>
      <p className="text-sm">{planBasisLabels[latest.basis.rateSource]}{latest.basis.ratePerHour ? ` — معدل ${Math.round(latest.basis.ratePerHour * 1000) / 1000} وحدة/ساعة (${Math.round(latest.basis.sampleHours * 100) / 100} ساعة عينة)` : ''}</p>
      <ul className="space-y-1 text-sm">{latest.slots.map(row => { const slot = order.slots.find(s => s.id === row.slotId); return <li key={row.slotId}>{slot ? `${slot.date} ${slot.startTime}–${slot.endTime}` : row.slotId}: كان {row.previousTargetQuantity}، يصبح {row.proposedTargetQuantity}</li>; })}</ul>
      <Button disabled={disabled} onClick={() => void act('applyPlanRevision', { revisionId: latest.id })}>اعتماد هذا التوزيع</Button>
    </div>}
    {latest?.status === 'approved' && <p className="text-sm text-muted-foreground">آخر توزيع مُعتمد بواسطة {latest.approvedByName}{latest.approvedAt ? ` — ${new Date(latest.approvedAt).toLocaleString('ar-EG')}` : ''}.</p>}
  </section>;
}

export function ClosingPanel({ order, canClose, disabled, act }: { order: CycleOrder; canClose: boolean; disabled: boolean; act: (action: CycleAction, payload?: Record<string, unknown>) => Promise<void> }) {
  const [closeReason, setCloseReason] = useState('');
  if (order.productionStatus === 'closed') {
    return <section className="space-y-2 rounded-lg border border-border bg-card p-4" aria-label="إقفال الإنتاج">
      <h2 className="font-semibold">الإنتاج مُقفل</h2>
      <p className="text-sm">بواسطة {order.productionClosedByName}{order.productionClosedAt ? ` — ${new Date(order.productionClosedAt).toLocaleString('ar-EG')}` : ''}</p>
      {order.productionCloseReason && <p className="text-sm">السبب: {order.productionCloseReason}</p>}
      {order.productionClosedWithDeficit && <p className="text-sm">أُقفل بعجز عن الهدف المطلوب.</p>}
      {Boolean(order.productionClosedCancelledSlotCount) && <p className="text-sm">أُلغيت {order.productionClosedCancelledSlotCount} ساعة لم تبدأ عند الإقفال.</p>}
      <p className="text-sm text-muted-foreground">التغليف والتسليم يبقيان متاحين بعد إقفال الإنتاج.</p>
    </section>;
  }
  if (!canClose || !['approved', 'in_progress'].includes(order.productionStatus)) return null;
  const blockers: string[] = [];
  if (order.slots.some(s => ['open', 'paused'].includes(s.status))) blockers.push('توجد ساعة جارية أو متوقفة لم تُحسم.');
  if (order.slots.some(s => s.status === 'quality_pending')) blockers.push('توجد ساعة بانتظار اعتماد تقرير الجودة.');
  if (order.slots.some(s => (s.qualityApprovedRejectedQuantity || 0) > 0 && !s.rejectedDisposition)) blockers.push('توجد كمية مرفوضة لم يُتخذ قرار بشأنها.');
  const reworkAttempts = order.slots.flatMap(s => s.reworkAttempts || []);
  if (reworkAttempts.some(a => ['planned', 'quality_pending'].includes(a.status))) blockers.push('توجد محاولة إعادة تشغيل قيد التنفيذ أو بانتظار الفحص.');
  if (reworkAttempts.some(a => (a.qualityApprovedRejectedQuantity || 0) > 0 && !a.rejectedDisposition)) blockers.push('توجد كمية مرفوضة من إعادة التشغيل لم يُتخذ قرار بشأنها.');
  const deficit = order.approvedAcceptedQuantity < order.quantity;
  const plannedCount = order.slots.filter(s => s.status === 'planned').length;
  const reasonRequired = deficit || plannedCount > 0;
  return <fieldset disabled={disabled || blockers.length > 0} className="space-y-3 rounded-lg border border-border bg-card p-4">
    <legend className="px-2 font-semibold">إقفال الإنتاج</legend>
    {blockers.length > 0 && <ul className="space-y-1 text-sm text-destructive">{blockers.map(b => <li key={b}>{b}</li>)}</ul>}
    {deficit && <p className="text-sm">يوجد عجز عن الهدف ({order.approvedAcceptedQuantity} من {order.quantity}).</p>}
    {plannedCount > 0 && <p className="text-sm">سيُلغى {plannedCount} ساعة لم تبدأ عند الإقفال.</p>}
    <label className="block">سبب الإقفال{reasonRequired ? ' (مطلوب)' : ' (اختياري)'}<Input value={closeReason} maxLength={2000} onChange={e => setCloseReason(e.target.value)} /></label>
    <Button variant="destructive" disabled={disabled || blockers.length > 0 || (reasonRequired && !closeReason.trim())} onClick={() => void act('closeProduction', { reason: closeReason }).then(() => setCloseReason(''))}>إقفال الإنتاج</Button>
    <p className="text-xs text-muted-foreground">إقفال الإنتاج مستقل عن حالة التغليف والتسليم؛ يمكن إقفال الإنتاج مع بقاء التغليف مفتوحًا.</p>
  </fieldset>;
}
