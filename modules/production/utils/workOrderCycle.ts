import { generateWorkOrderHourlySlots, type GenerateWorkOrderHourlySlotsInput } from './workOrderHourlySlots';
import type { CycleOrder, CycleSlot } from '../services/workOrderCycleService';

export function buildCyclePlan(input: Omit<GenerateWorkOrderHourlySlotsInput, 'dailyTarget'> & { quantity: number }) {
  const start = Date.parse(input.startDate + 'T00:00:00Z');
  const end = Date.parse(input.targetDate + 'T00:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 239 * 86400000) throw new Error('حدد فترة صحيحة لا تتجاوز ٢٤٠ يومًا.');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('الكمية المطلوبة يجب أن تكون أكبر من صفر.');
  if (Boolean(input.breakStartTime) !== Boolean(input.breakEndTime)) throw new Error('حدد بداية ونهاية الراحة.');
  if (input.breakStartTime && (input.breakStartTime < input.workdayStartTime || input.breakEndTime! > input.workdayEndTime || input.breakStartTime >= input.breakEndTime!)) throw new Error('الراحة يجب أن تكون داخل وقت العمل.');
  const slots = generateWorkOrderHourlySlots({ ...input, dailyTarget: 0 });
  if (!slots.length) throw new Error('لا توجد ساعات تشغيل في الفترة.');
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const durations = slots.map(slot => minutes(slot.endTime) - minutes(slot.startTime));
  const total = durations.reduce((a, b) => a + b, 0);
  let allocated = 0;
  return slots.map((slot, index) => {
    const cumulative = index === slots.length - 1 ? input.quantity : Math.round(input.quantity * durations.slice(0, index + 1).reduce((a, b) => a + b, 0) / total * 100) / 100;
    const targetQuantity = Math.round((cumulative - allocated) * 1000) / 1000;
    allocated = cumulative;
    return { date: slot.date, startTime: slot.startTime, endTime: slot.endTime, targetQuantity };
  });
}

export const cycleSlotLabels: Record<CycleSlot['status'], string> = { planned: 'لم تبدأ', open: 'قيد الإنتاج', paused: 'متوقفة', quality_pending: 'بانتظار الجودة', quality_accepted: 'معتمد من الجودة', cancelled: 'أُلغيت' };
export const cycleOrderLabels: Record<CycleOrder['productionStatus'], string> = { draft: 'بانتظار اعتماد الإنتاج', approved: 'معتمد — جاهز للتشغيل', in_progress: 'قيد التنفيذ', closed: 'إنتاج مُقفل' };
export function planningSummary(order: CycleOrder) {
  const target = order.quantity;
  const achieved = order.approvedAcceptedQuantity || 0;
  const pendingQuality = order.slots.filter(slot => slot.status === 'quality_pending').reduce((sum, slot) => sum + (slot.actualQuantity || 0), 0);
  const pendingRework = order.slots.flatMap(slot => slot.reworkAttempts || []).reduce((sum, attempt) => sum + (attempt.status === 'planned' ? (attempt.requestedQuantity || 0) : attempt.status === 'quality_pending' ? (attempt.actualQuantity || 0) : 0), 0);
  const remainingToTarget = Math.max(0, target - achieved - pendingQuality - pendingRework);
  return { target, achieved, pendingQuality, pendingRework, remainingToTarget };
}
export const planBasisLabels: Record<import('../services/workOrderCycleService').PlanRevision['basis']['rateSource'], string> = {
  this_order: 'بناءً على أداء هذا الأمر نفسه',
  product_line_history: 'بناءً على أداء أوامر سابقة لنفس المنتج والخط',
  original_plan_fallback: 'لا تتوفر بيانات أداء كافية؛ اعتُمدت الخطة الأصلية كما هي (تقدير محدود الدقة)',
};
export function productionCardPath(order: CycleOrder, slot: CycleSlot) {
  return `/work-orders/${encodeURIComponent(order.id)}?cycle=2&slot=${encodeURIComponent(slot.id)}&document=${encodeURIComponent(slot.productionDocumentId || '')}`;
}
export function cycleTasks(order: CycleOrder, uid: string, permissions: Record<string, boolean>) {
  if (order.productionStatus === 'draft') return permissions['workOrders.approve'] ? [{ title: 'مراجعة واعتماد الأمر', slot: order.slots[0] }] : [];
  if (order.supervisorUid === uid && permissions['workOrders.execute']) {
    const slot = order.slots.find(row => row.id === order.activeSlotId) || order.slots.find(row => row.status === 'planned');
    return slot ? [{ title: order.qualityHold ? 'متوقف بقرار الجودة' : slot.status === 'paused' ? 'مراجعة التوقف واستئناف الساعة' : slot.status === 'open' ? 'تسجيل إنتاج الساعة' : order.workerIds.length ? 'بدء الساعة التالية' : 'ربط العمالة وبدء الساعة', slot }] : [];
  }
  if (permissions['workOrders.inspect'] || permissions['workOrders.assignInspectors']) {
    return order.slots.filter(slot => slot.status === 'quality_pending').flatMap(slot => {
      const remaining = Math.max(0, (slot.actualQuantity || 0) - (slot.inspectedQuantity || 0));
      if (permissions['workOrders.assignInspectors'] && remaining === 0 && !slot.qualityClaim) return [{ title: 'اعتماد نتيجة فحص الحاوية', slot }];
      if (permissions['workOrders.inspect'] && remaining > 0 && !slot.qualityClaim) return [{ title: 'فحص حاوية متاحة', slot }];
      return [];
    });
  }
  if (permissions['productionHandover.approve']) {
    return order.slots.filter(slot => slot.status === 'quality_accepted').flatMap(slot => {
      const approved = slot.qualityApprovedAcceptedQuantity ?? 0;
      const received = slot.packagingReceivedQuantity ?? 0;
      const packaged = slot.packagingPackagedQuantity ?? 0;
      const delivered = slot.packagingDeliveredQuantity ?? 0;
      if (approved - received > 0) return [{ title: 'استلام من الإنتاج للتغليف', slot }];
      if (received - packaged > 0) return [{ title: 'تغليف الكمية المستلمة', slot }];
      if (packaged - delivered > 0) return [{ title: 'تسليم للمخزن', slot }];
      return [];
    });
  }
  return [];
}
