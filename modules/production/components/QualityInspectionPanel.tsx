import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CycleAction, CycleOrder, CycleSlot, ReworkAttempt } from '../services/workOrderCycleService';
import { QualityReportForm } from './QualityReportForm';

export function QualityInspectionPanel({ order, slot, uid, canInspect, canManage, canPackage, disabled, act }: { order: CycleOrder; slot: CycleSlot; uid: string; canInspect: boolean; canManage: boolean; canPackage: boolean; disabled: boolean; act: (action: CycleAction, payload: Record<string, unknown>) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const claim = slot.qualityClaim;
  const remaining = Math.max(0, (slot.actualQuantity || 0) - (slot.inspectedQuantity || 0));
  const complete = remaining === 0 && !claim;
  if (slot.status === 'quality_accepted') return <QualityApprovedPanel slot={slot} canManage={canManage} canPackage={canPackage} disabled={disabled} act={act} />;
  if (slot.qualityResults !== undefined) return <p role="alert">توجد نتائج من النموذج التجريبي السابق. التسجيل متوقف لهذه الحاوية لحين مراجعتها؛ النتائج محفوظة ولم تُحوّل تلقائيًا.</p>;
  if (!order.qualityReportTemplate?.length) return <p>لم يتم تعريف نموذج الجودة بعد.</p>;
  return <section className="space-y-4" aria-label="فحص الحاوية">
    <p>المفحوص: {slot.inspectedQuantity || 0} • المقبول غير المعتمد: {slot.inspectedAcceptedQuantity || 0} • المرفوض: {slot.inspectedRejectedQuantity || 0} • المتبقي: {remaining}</p>
    {claim ? <p role="status">الفحص محجوز باسم {claim.name}. إغلاق المتصفح لا يفك الحجز.</p> : remaining > 0 ? <p>الحاوية متاحة لحجز الفحص.</p> : <p>اكتملت المشاركات؛ بانتظار اعتماد مدير الجودة، والكميات غير متاحة للتغليف بعد.</p>}
    {canInspect && order.inspectorUids.includes(uid) && !claim && remaining > 0 && <Button disabled={disabled} onClick={() => void act('claimQualityInspection', { slotId: slot.id })}>حجز الحاوية وبدء الفحص</Button>}
    {canInspect && order.inspectorUids.includes(uid) && claim?.uid === uid && <QualityReportForm key={claim.id} template={order.qualityReportTemplate} remainingQuantity={remaining} disabled={disabled} onSubmit={(results, amounts) => act('submitQualityReport', { slotId: slot.id, claimId: claim.id, qualityResults: results, ...amounts })} />}
    {canManage && claim && <div className="space-y-2"><label>سبب فك حجز الفحص<Input disabled={disabled} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label><Button variant="outline" disabled={disabled || !reason.trim()} onClick={() => void act('releaseQualityInspection', { slotId: slot.id, claimId: claim.id, reason })}>فك الحجز بسبب مسجل</Button></div>}
    {canManage && complete && (slot.inspectedQuantity || 0) > 0 && <div className="space-y-3 rounded-md border border-border p-4">
      <p className="font-semibold">اكتمل الفحص — مطلوب قرار مدير الجودة</p>
      <p className="text-sm text-muted-foreground">الاعتماد يحدّث المقبول المعتمد للهدف ويفتح الكمية للتغليف لاحقًا. الإرجاع يمسح المشاركات الحالية (محفوظة في سجل منفصل) ليعاد الفحص من جديد.</p>
      <Button disabled={disabled} onClick={() => void act('approveQualityReport', { slotId: slot.id })}>اعتماد نتيجة الفحص</Button>
      <div className="space-y-2 border-t border-border pt-3"><label>سبب الإرجاع<Input disabled={disabled} maxLength={2000} value={returnReason} onChange={e => setReturnReason(e.target.value)} /></label><Button variant="outline" disabled={disabled || !returnReason.trim()} onClick={() => void act('returnQualityReport', { slotId: slot.id, reason: returnReason })}>إرجاع بسبب لإعادة الفحص</Button></div>
    </div>}
    <h3 className="font-semibold">مشاركات الفحص المحفوظة</h3>
    {slot.contributionsTruncated && <p>آخر ١٠٠ مشاركة؛ الإجماليات تشمل كل المشاركات.</p>}
    {slot.qualityContributions?.length ? <ol className="space-y-3">{slot.qualityContributions.map(row => <li key={row.id} className="rounded-md border border-border p-3"><p>{row.inspectorName} — مفحوص {row.inspectedQuantity}، مقبول {row.acceptedQuantity}، مرفوض {row.rejectedQuantity}</p><time className="text-sm text-muted-foreground" dateTime={row.submittedAt}>{new Date(row.submittedAt).toLocaleString('ar-EG')}</time><ul className="text-sm">{row.results.map(result => <li key={result.checkId}>{result.label}: {result.value}{result.notes ? ` — ${result.notes}` : ''}</li>)}</ul></li>)}</ol> : <p className="text-sm text-muted-foreground">لا توجد مشاركات محفوظة بعد.</p>}
  </section>;
}

function QualityApprovedPanel({ slot, canManage, canPackage, disabled, act }: { slot: CycleSlot; canManage: boolean; canPackage: boolean; disabled: boolean; act: (action: CycleAction, payload: Record<string, unknown>) => Promise<void> }) {
  const [accepted, setAccepted] = useState(String(slot.qualityApprovedAcceptedQuantity ?? 0));
  const [rejected, setRejected] = useState(String(slot.qualityApprovedRejectedQuantity ?? 0));
  const [correctionReason, setCorrectionReason] = useState('');
  const total = (slot.qualityApprovedAcceptedQuantity ?? 0) + (slot.qualityApprovedRejectedQuantity ?? 0);
  const valid = accepted !== '' && rejected !== '' && Math.abs(Number(accepted) + Number(rejected) - total) < 0.000001;
  return <section className="space-y-4" aria-label="نتيجة الجودة المعتمدة">
    <p role="status">تم اعتماد الفحص: مقبول {slot.qualityApprovedAcceptedQuantity ?? 0}، مرفوض {slot.qualityApprovedRejectedQuantity ?? 0}
      {slot.qualityApprovedByName ? ` — بواسطة ${slot.qualityApprovedByName}` : ''}.</p>
    {canManage && <div className="space-y-3 rounded-md border border-border p-4">
      <p className="font-semibold">تصحيح تقرير معتمد</p>
      <p className="text-sm text-muted-foreground">لا يعدّل التاريخ الأصلي؛ يُضاف كسجل تصحيح منفصل موثّق بالسبب والمنفّذ والوقت. مجموع المقبول والمرفوض بعد التصحيح يجب أن يبقى {total}.</p>
      <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
        <label>المقبول بعد التصحيح<Input type="number" min="0" step="0.001" showZero value={accepted} onChange={e => setAccepted(e.target.value)} /></label>
        <label>المرفوض بعد التصحيح<Input type="number" min="0" step="0.001" showZero value={rejected} onChange={e => setRejected(e.target.value)} /></label>
        <label className="sm:col-span-2">سبب التصحيح<Input value={correctionReason} maxLength={2000} onChange={e => setCorrectionReason(e.target.value)} /></label>
      </fieldset>
      <Button disabled={disabled || !valid || !correctionReason.trim()} onClick={() => void act('correctQualityReport', { slotId: slot.id, acceptedQuantity: Number(accepted), rejectedQuantity: Number(rejected), reason: correctionReason })}>حفظ التصحيح</Button>
    </div>}
    {slot.qualityCorrections?.length ? <div className="space-y-2"><h3 className="font-semibold">سجل التصحيحات</h3><ol className="space-y-2">{slot.qualityCorrections.map(row => <li key={row.id} className="rounded-md border border-border p-3 text-sm"><p>{row.actorName}: من (مقبول {row.previousAcceptedQuantity}، مرفوض {row.previousRejectedQuantity}) إلى (مقبول {row.newAcceptedQuantity}، مرفوض {row.newRejectedQuantity})</p><p className="text-muted-foreground">السبب: {row.reason}</p><time className="text-muted-foreground" dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('ar-EG')}</time></li>)}</ol></div> : null}
    <RejectedDispositionPanel slotId={slot.id} rejectedQuantity={slot.qualityApprovedRejectedQuantity ?? 0} disposition={slot.rejectedDisposition} canManage={canManage} disabled={disabled} act={act} />
    <PackagingPanel slotId={slot.id} approved={slot.qualityApprovedAcceptedQuantity ?? 0} received={slot.packagingReceivedQuantity ?? 0} packaged={slot.packagingPackagedQuantity ?? 0} delivered={slot.packagingDeliveredQuantity ?? 0} events={slot.packagingEvents} eventsTruncated={slot.packagingEventsTruncated} canPackage={canPackage} disabled={disabled} act={act} />
  </section>;
}

function RejectedDispositionPanel({ slotId, attemptId, rejectedQuantity, disposition, canManage, disabled, act }: { slotId: string; attemptId?: string; rejectedQuantity: number; disposition?: { reworkQuantity: number; scrapQuantity: number; reason: string; actorName: string; decidedAt: string }; canManage: boolean; disabled: boolean; act: (action: CycleAction, payload: Record<string, unknown>) => Promise<void> }) {
  const [rework, setRework] = useState(String(rejectedQuantity));
  const [scrap, setScrap] = useState('0');
  const [decisionReason, setDecisionReason] = useState('');
  if (rejectedQuantity <= 0) return null;
  if (disposition) return <p className="text-sm rounded-md border border-border p-3">قرار المرفوض ({rejectedQuantity} وحدة): إعادة تشغيل {disposition.reworkQuantity}، هالك نهائي {disposition.scrapQuantity} — بواسطة {disposition.actorName}. السبب: {disposition.reason}</p>;
  if (!canManage) return <p className="text-sm text-muted-foreground">بانتظار قرار مدير الجودة بشأن {rejectedQuantity} وحدة مرفوضة (إعادة تشغيل أو هالك نهائي).</p>;
  const valid = rework !== '' && scrap !== '' && Math.abs(Number(rework) + Number(scrap) - rejectedQuantity) < 0.000001;
  return <fieldset disabled={disabled} className="space-y-3 rounded-md border border-border p-4">
    <legend className="px-2 font-semibold">قرار المرفوض ({rejectedQuantity} وحدة)</legend>
    <p className="text-sm text-muted-foreground">اقسم المرفوض بين إعادة التشغيل والهالك النهائي. المجموع يجب أن يساوي {rejectedQuantity}. إعادة التشغيل تُنشئ مهمة مستقلة للمشرف على نفس الحاوية.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label>كمية إعادة التشغيل<Input type="number" min="0" step="0.001" showZero value={rework} onChange={e => setRework(e.target.value)} /></label>
      <label>كمية الهالك النهائي<Input type="number" min="0" step="0.001" showZero value={scrap} onChange={e => setScrap(e.target.value)} /></label>
      <label className="sm:col-span-2">السبب<Input value={decisionReason} maxLength={2000} onChange={e => setDecisionReason(e.target.value)} /></label>
    </div>
    <Button disabled={disabled || !valid || !decisionReason.trim()} onClick={() => void act('decideRejectedDisposition', { slotId, attemptId, reworkQuantity: Number(rework), scrapQuantity: Number(scrap), reason: decisionReason })}>حفظ القرار</Button>
  </fieldset>;
}

function PackagingPanel({ slotId, attemptId, approved, received, packaged, delivered, events, eventsTruncated, canPackage, disabled, act }: { slotId: string; attemptId?: string; approved: number; received: number; packaged: number; delivered: number; events?: { id: string; action: 'receive' | 'package' | 'deliver'; quantity: number; note?: string; actorName: string; createdAt: string }[]; eventsTruncated?: boolean; canPackage: boolean; disabled: boolean; act: (action: CycleAction, payload: Record<string, unknown>) => Promise<void> }) {
  const approvedNotReceived = approved - received;
  const receivedNotPackaged = received - packaged;
  const packagedNotDelivered = packaged - delivered;
  const [receiveQty, setReceiveQty] = useState(String(approvedNotReceived));
  const [packageQty, setPackageQty] = useState(String(receivedNotPackaged));
  const [deliverQty, setDeliverQty] = useState(String(packagedNotDelivered));
  const [note, setNote] = useState('');
  const prevBalances = useRef({ approvedNotReceived, receivedNotPackaged, packagedNotDelivered });
  useEffect(() => {
    const prev = prevBalances.current;
    if (prev.approvedNotReceived !== approvedNotReceived) setReceiveQty(String(approvedNotReceived));
    if (prev.receivedNotPackaged !== receivedNotPackaged) setPackageQty(String(receivedNotPackaged));
    if (prev.packagedNotDelivered !== packagedNotDelivered) setDeliverQty(String(packagedNotDelivered));
    prevBalances.current = { approvedNotReceived, receivedNotPackaged, packagedNotDelivered };
  }, [approvedNotReceived, receivedNotPackaged, packagedNotDelivered]);
  if (approved <= 0) return null;
  const actionLabels: Record<string, string> = { receive: 'استلام', package: 'تغليف', deliver: 'تسليم للمخزن' };
  return <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="التغليف والتسليم">
    <h3 className="font-semibold">التغليف والتسليم</h3>
    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><p className="text-muted-foreground">معتمد لم يُستلم</p><strong>{approvedNotReceived}</strong></div>
      <div><p className="text-muted-foreground">مستلم لم يُغلف</p><strong>{receivedNotPackaged}</strong></div>
      <div><p className="text-muted-foreground">مغلف لم يُسلّم</p><strong>{packagedNotDelivered}</strong></div>
      <div><p className="text-muted-foreground">مسلّم للمخزن</p><strong>{delivered}</strong></div>
    </div>
    {!canPackage && (approvedNotReceived > 0 || receivedNotPackaged > 0 || packagedNotDelivered > 0) && <p className="text-sm text-muted-foreground">بانتظار مشرف التغليف.</p>}
    {canPackage && <fieldset disabled={disabled} className="space-y-3 border-t border-border pt-3">
      {approvedNotReceived > 0 && <div className="flex flex-wrap items-end gap-2"><label>كمية الاستلام<Input type="number" min="0" max={approvedNotReceived} step="0.001" showZero value={receiveQty} onChange={e => setReceiveQty(e.target.value)} /></label><Button disabled={disabled || receiveQty === '' || Number(receiveQty) <= 0 || Number(receiveQty) > approvedNotReceived} onClick={() => void act('receivePackaging', { slotId, attemptId, quantity: Number(receiveQty), note })}>تأكيد الاستلام من الإنتاج</Button></div>}
      {receivedNotPackaged > 0 && <div className="flex flex-wrap items-end gap-2"><label>كمية التغليف<Input type="number" min="0" max={receivedNotPackaged} step="0.001" showZero value={packageQty} onChange={e => setPackageQty(e.target.value)} /></label><Button disabled={disabled || packageQty === '' || Number(packageQty) <= 0 || Number(packageQty) > receivedNotPackaged} onClick={() => void act('packageContainer', { slotId, attemptId, quantity: Number(packageQty), note })}>تأكيد التغليف</Button></div>}
      {packagedNotDelivered > 0 && <div className="flex flex-wrap items-end gap-2"><label>كمية التسليم للمخزن<Input type="number" min="0" max={packagedNotDelivered} step="0.001" showZero value={deliverQty} onChange={e => setDeliverQty(e.target.value)} /></label><Button disabled={disabled || deliverQty === '' || Number(deliverQty) <= 0 || Number(deliverQty) > packagedNotDelivered} onClick={() => void act('deliverToWarehouse', { slotId, attemptId, quantity: Number(deliverQty), note })}>تأكيد التسليم للمخزن (نهائي)</Button></div>}
      {(approvedNotReceived > 0 || receivedNotPackaged > 0 || packagedNotDelivered > 0) && <label className="block">ملاحظة استثناء (فرق كمية أو تلف — اختياري، لا يخصم تلقائيًا)<Input value={note} maxLength={2000} onChange={e => setNote(e.target.value)} /></label>}
    </fieldset>}
    {events?.length ? <div className="space-y-2"><h4 className="font-semibold">سجل حركات التغليف</h4>
      {eventsTruncated && <p className="text-sm text-muted-foreground">آخر ١٠٠ حركة فقط.</p>}
      <ol className="space-y-2">{events.map(row => <li key={row.id} className="rounded-md border border-border p-3 text-sm"><p>{actionLabels[row.action] || row.action}: {row.quantity} — {row.actorName}{row.note ? ` — ${row.note}` : ''}</p><time className="text-muted-foreground" dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('ar-EG')}</time></li>)}</ol>
    </div> : null}
  </section>;
}

export function ReworkAttemptPanel({ order, slot, attempt, uid, canExecute, canInspect, canManage, canPackage, disabled, act }: { order: CycleOrder; slot: CycleSlot; attempt: ReworkAttempt; uid: string; canExecute: boolean; canInspect: boolean; canManage: boolean; canPackage: boolean; disabled: boolean; act: (action: CycleAction, payload: Record<string, unknown>) => Promise<void> }) {
  const [actual, setActual] = useState(''); const [notes, setNotes] = useState('');
  const claim = attempt.qualityClaim;
  const remaining = Math.max(0, (attempt.actualQuantity || 0) - (attempt.inspectedQuantity || 0));
  return <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label={`إعادة تشغيل رقم ${attempt.attemptNumber}`}>
    <header className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">إعادة تشغيل رقم {attempt.attemptNumber} — {attempt.requestedQuantity} وحدة</h3></header>
    <p className="text-sm text-muted-foreground">السبب: {attempt.reason} — بواسطة {attempt.createdByName}</p>
    {attempt.status === 'planned' && canExecute && <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (actual === '' || Number(actual) > attempt.requestedQuantity) return; void act('submitRework', { slotId: slot.id, attemptId: attempt.id, actualQuantity: Number(actual), notes }); }}>
      <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
        <label>الكمية الناتجة من إعادة التشغيل<Input required type="number" min="0" max={attempt.requestedQuantity} step="0.001" showZero value={actual} onChange={e => setActual(e.target.value)} /></label>
        <label className="sm:col-span-2">ملاحظات<Input maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      </fieldset>
      <p className="text-sm text-muted-foreground">لا تُحسب هذه الكمية إنتاجًا جديدًا؛ تذهب مباشرة لفحص الجودة.</p>
      <Button type="submit" disabled={disabled || actual === '' || Number(actual) > attempt.requestedQuantity}>تسجيل ناتج إعادة التشغيل</Button>
    </form>}
    {attempt.status === 'planned' && !canExecute && <p className="text-sm text-muted-foreground">بانتظار تسجيل مشرف الإنتاج لناتج إعادة التشغيل.</p>}
    {attempt.status === 'quality_pending' && <>
      <p>المفحوص: {attempt.inspectedQuantity || 0} • المقبول غير المعتمد: {attempt.inspectedAcceptedQuantity || 0} • المرفوض: {attempt.inspectedRejectedQuantity || 0} • المتبقي: {remaining}</p>
      {claim ? <p role="status">الفحص محجوز باسم {claim.name}.</p> : remaining > 0 ? <p>متاحة لحجز الفحص.</p> : <p>اكتملت المشاركات؛ بانتظار اعتماد مدير الجودة.</p>}
      {canInspect && order.inspectorUids.includes(uid) && !claim && remaining > 0 && <Button disabled={disabled} onClick={() => void act('claimReworkInspection', { slotId: slot.id, attemptId: attempt.id })}>حجز الحاوية وبدء الفحص</Button>}
      {canInspect && order.inspectorUids.includes(uid) && claim?.uid === uid && order.qualityReportTemplate?.length && <QualityReportForm key={claim.id} template={order.qualityReportTemplate} remainingQuantity={remaining} disabled={disabled} onSubmit={(results, amounts) => act('submitReworkQualityReport', { slotId: slot.id, attemptId: attempt.id, claimId: claim.id, qualityResults: results, ...amounts })} />}
      {canManage && remaining === 0 && !claim && (attempt.inspectedQuantity || 0) > 0 && <Button disabled={disabled} onClick={() => void act('approveReworkQualityReport', { slotId: slot.id, attemptId: attempt.id })}>اعتماد نتيجة فحص إعادة التشغيل</Button>}
      {attempt.qualityContributions?.length ? <ol className="space-y-2">{attempt.qualityContributions.map(row => <li key={row.id} className="rounded-md border border-border p-3 text-sm"><p>{row.inspectorName} — مفحوص {row.inspectedQuantity}، مقبول {row.acceptedQuantity}، مرفوض {row.rejectedQuantity}</p></li>)}</ol> : null}
    </>}
    {attempt.status === 'quality_accepted' && <div className="space-y-3">
      <p role="status">تم اعتماد إعادة التشغيل: مقبول {attempt.qualityApprovedAcceptedQuantity ?? 0}، مرفوض {attempt.qualityApprovedRejectedQuantity ?? 0}{attempt.qualityApprovedByName ? ` — بواسطة ${attempt.qualityApprovedByName}` : ''}.</p>
      <RejectedDispositionPanel slotId={slot.id} attemptId={attempt.id} rejectedQuantity={attempt.qualityApprovedRejectedQuantity ?? 0} disposition={attempt.rejectedDisposition} canManage={canManage} disabled={disabled} act={act} />
      <PackagingPanel slotId={slot.id} attemptId={attempt.id} approved={attempt.qualityApprovedAcceptedQuantity ?? 0} received={attempt.packagingReceivedQuantity ?? 0} packaged={attempt.packagingPackagedQuantity ?? 0} delivered={attempt.packagingDeliveredQuantity ?? 0} events={attempt.packagingEvents} eventsTruncated={attempt.packagingEventsTruncated} canPackage={canPackage} disabled={disabled} act={act} />
    </div>}
  </section>;
}
